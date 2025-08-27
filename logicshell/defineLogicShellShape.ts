import axios, { AxiosRequestConfig } from "axios"
import pLimit from "p-limit"
import { z } from "zod"

/**
 * Configuration schema for LogicShell orchestrator
 * - Supports per-module defaults for timeout, retries, headers
 * - Validates endpoints and method names
 */
const httpMethodSchema = z
  .string()
  .transform(s => s.toUpperCase())
  .refine(s => ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(s), "invalid HTTP method")

export const logicShellConfigSchema = z.object({
  /** Base URL for the orchestrator itself (health checks, status) */
  orchestratorUrl: z.string().url(),
  /** Definitions of modules this shell can invoke */
  modules: z
    .array(
      z.object({
        name: z.string().min(1),
        endpoint: z.string().url(),
        /** Supported methods on this module */
        methods: z.array(z.string().min(1)).min(1),
        /** Optional default request headers applied to all tasks targeting this module */
        defaultHeaders: z.record(z.string()).optional(),
        /** Optional defaults for network behavior */
        timeoutMs: z.number().int().positive().optional(),
        retryAttempts: z.number().int().nonnegative().optional(),
        retryDelayMs: z.number().int().nonnegative().optional(),
      })
    )
    .min(1),
  /** Maximum number of concurrent tasks */
  concurrency: z.number().int().positive().default(1),
})

export type LogicShellConfig = z.infer<typeof logicShellConfigSchema>

/**
 * Parameters for a single task in the workflow
 */
export const taskParamsSchema = z.object({
  /** Name of the module to call */
  module: z.string().min(1),
  /** Method on the module (will be appended to endpoint) */
  method: z.string().min(1),
  /** Arbitrary payload object to send */
  payload: z.record(z.unknown()).default({}),
  /** Optional HTTP verb override (default POST) */
  httpMethod: httpMethodSchema.optional(),
  /** Per-task overrides */
  headers: z.record(z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),
  retryAttempts: z.number().int().nonnegative().optional(),
  retryDelayMs: z.number().int().nonnegative().optional(),
})

export type TaskParams = z.infer<typeof taskParamsSchema>

/**
 * Workflow definition: ordered list of tasks
 */
export const workflowSchema = z.object({
  tasks: z.array(taskParamsSchema).min(1),
})

export type Workflow = z.infer<typeof workflowSchema>

/**
 * Result of executing a single task
 */
export interface TaskResult {
  module: string
  method: string
  status?: number
  response?: unknown
  success: boolean
  errorMessage?: string
  startedAt: number
  durationMs: number
}

/**
 * Final result of executing the workflow
 */
export interface WorkflowResult {
  results: TaskResult[]
  startedAt: number
  completedAt: number
  durationMs: number
}

/**
 * Validates config and workflow definitions.
 * Throws ZodError if invalid, or Error for cross-reference violations
 */
export function validateInputs(
  config: unknown,
  workflow: unknown
): { config: LogicShellConfig; workflow: Workflow } {
  const parsedConfig = logicShellConfigSchema.parse(config)
  const parsedWorkflow = workflowSchema.parse(workflow)

  // Verify each task references a known module and method
  const moduleMap = new Map(parsedConfig.modules.map(m => [m.name, m]))
  for (const task of parsedWorkflow.tasks) {
    const mod = moduleMap.get(task.module)
    if (!mod) {
      throw new Error(`Unknown module "${task.module}" in workflow`)
    }
    if (!mod.methods.includes(task.method)) {
      throw new Error(`Module "${task.module}" does not support method "${task.method}"`)
    }
  }

  // Optional: ensure module names are unique
  if (new Set(parsedConfig.modules.map(m => m.name)).size !== parsedConfig.modules.length) {
    throw new Error("Duplicate module names are not allowed")
  }

  return { config: parsedConfig, workflow: parsedWorkflow }
}

/** Deterministic linear backoff delay */
function delay(ms: number): Promise<void> {
  return new Promise(res => setTimeout(res, ms))
}

/** Join base and segment without double slashes */
function joinUrl(base: string, segment: string): string {
  const b = base.replace(/\/+$/, "")
  const s = segment.replace(/^\/+/, "")
  return `${b}/${s}`
}

/** Build Axios request config for a task with layered overrides */
function buildRequestConfig(
  moduleDef: LogicShellConfig["modules"][number],
  task: TaskParams,
  globalConcurrency: number
): { url: string; config: AxiosRequestConfig; method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" } {
  const url = joinUrl(moduleDef.endpoint, task.method)
  const method = (task.httpMethod ?? "POST") as "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

  const timeoutMs =
    task.timeoutMs ??
    moduleDef.timeoutMs ??
    Math.max(1000, globalConcurrency * 1000) // at least 1s

  const headers = {
    ...(moduleDef.defaultHeaders ?? {}),
    ...(task.headers ?? {}),
    "content-type": "application/json",
  }

  const config: AxiosRequestConfig = {
    url,
    method,
    headers,
    timeout: timeoutMs,
    // For GET, send payload as query params, else send JSON body
    ...(method === "GET" ? { params: task.payload } : { data: task.payload }),
    // No retries in axios itself; we'll implement manual deterministic retries
    validateStatus: () => true,
  }

  return { url, config, method }
}

/**
 * Executes the workflow honoring configured concurrency
 * - Launches tasks with p-limit and preserves original order in results
 * - Deterministic retry with linear backoff
 * - Captures status, timings, and error messages
 */
export async function executeWorkflow(
  rawConfig: unknown,
  rawWorkflow: unknown
): Promise<WorkflowResult> {
  const startedAt = Date.now()
  const { config, workflow } = validateInputs(rawConfig, rawWorkflow)

  const limiter = pLimit(config.concurrency)
  const moduleMap = new Map(config.modules.map(m => [m.name, m]))

  const resultSlots: TaskResult[] = new Array(workflow.tasks.length)

  const tasks = workflow.tasks.map((task, index) =>
    limiter(async () => {
      const moduleDef = moduleMap.get(task.module)!
      const { config: reqCfg } = buildRequestConfig(moduleDef, task, config.concurrency)

      const retryAttempts = task.retryAttempts ?? moduleDef.retryAttempts ?? 0
      const retryDelayMs = task.retryDelayMs ?? moduleDef.retryDelayMs ?? 0

      const attemptOnce = async (): Promise<{ ok: boolean; status?: number; data?: unknown; err?: any; durationMs: number }> => {
        const t0 = Date.now()
        try {
          const resp = await axios.request(reqCfg)
          const durationMs = Date.now() - t0
          const ok = resp.status >= 200 && resp.status < 300
          return { ok, status: resp.status, data: resp.data, durationMs }
        } catch (err: any) {
          const durationMs = Date.now() - t0
          return { ok: false, err, durationMs }
        }
      }

      let attempt = 0
      let last: Awaited<ReturnType<typeof attemptOnce>> | undefined
      while (attempt <= retryAttempts) {
        last = await attemptOnce()
        if (last.ok) break
        attempt++
        if (attempt <= retryAttempts) {
          await delay(retryDelayMs * attempt) // linear backoff
        }
      }

      const started = Date.now() - (last?.durationMs ?? 0)
      const res: TaskResult = {
        module: task.module,
        method: task.method,
        status: last?.status,
        response: last?.data,
        success: !!last?.ok,
        errorMessage: last?.ok
          ? undefined
          : String(
              last?.err?.message ??
                (typeof last?.status === "number" ? `HTTP ${last.status}` : "Request failed")
            ),
        startedAt: started,
        durationMs: last?.durationMs ?? 0,
      }

      resultSlots[index] = res
    })
  )

  await Promise.all(tasks)

  const completedAt = Date.now()
  return {
    results: resultSlots,
    startedAt,
    completedAt,
    durationMs: completedAt - startedAt,
  }
}
