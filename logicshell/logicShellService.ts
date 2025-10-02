import fetch, { RequestInit } from "node-fetch"
import { EventEmitter } from "events"
import {
  logicShellConfigSchema,
  LogicShellConfig,
  workflowSchema,
  Workflow,
  TaskParams,
  TaskResult,
  WorkflowResult,
} from "./defineLogicShellShape"

/**
 * Event map for better DX
 */
type LogicShellEvents = {
  workflowStarted: (workflow: Workflow) => void
  workflowCompleted: (summary: WorkflowResult) => void
  workflowAborted: (summary: WorkflowResult) => void
  workflowError: (error: unknown) => void
  taskStarted: (meta: { module: string; method: string; payload: unknown; attempt: number }) => void
  taskCompleted: (result: TaskResult) => void
}

/**
 * Internal fetch helper with timeout and retries
 */
async function fetchJson<T = any>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
  retries = 0,
  backoffMs = 0
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), Math.max(1, init.timeoutMs ?? 10_000))
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
          ...(init.headers || {}),
        },
      })
      clearTimeout(t)
      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(`HTTP ${res.status} ${res.statusText} ${text}`)
      }
      return (await res.json()) as T
    } catch (err) {
      clearTimeout(t)
      lastErr = err
      if (attempt < retries) {
        if (backoffMs > 0) await new Promise((r) => setTimeout(r, backoffMs))
        continue
      }
      break
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/**
 * LogicShellService orchestrates workflows of module calls
 * - Validates config/workflow with zod schemas
 * - Executes with bounded concurrency (batching)
 * - Per-task timeout and retry support (non-breaking optional fields)
 * - Emits structured lifecycle events
 * - Aborts remaining tasks on first failure
 */
export class LogicShellService extends EventEmitter {
  private readonly orchestratorUrl: string
  private readonly modules: Map<string, string>
  private readonly concurrency: number

  constructor(rawConfig: unknown) {
    super()
    const { orchestratorUrl, modules, concurrency }: LogicShellConfig =
      logicShellConfigSchema.parse(rawConfig)
    this.orchestratorUrl = orchestratorUrl.replace(/\/+$/, "")
    this.modules = new Map(modules.map((m) => [m.name, m.endpoint.replace(/\/+$/, "")]))
    this.concurrency = Math.max(1, Math.floor(concurrency))
  }

  /** Accessor for a module endpoint */
  public getModuleEndpoint(name: string): string | undefined {
    return this.modules.get(name)
  }

  /**
   * Execute a workflow: calls tasks with bounded concurrency
   * Results preserve the original task order
   * Aborts remaining tasks on first failure
   */
  public async executeWorkflow(raw: unknown): Promise<WorkflowResult> {
    const wf: Workflow = workflowSchema.parse(raw)
    if (!Array.isArray(wf.tasks) || wf.tasks.length === 0) {
      const empty: WorkflowResult = { results: [], completedAt: Date.now() }
      this.emit("workflowCompleted", empty)
      return empty
    }

    this.emit("workflowStarted", wf)

    const results: TaskResult[] = []
    let aborted = false

    try {
      for (let i = 0; i < wf.tasks.length && !aborted; i += this.concurrency) {
        const batch = wf.tasks.slice(i, i + this.concurrency)
        const settled = await Promise.all(
          batch.map((task) => this.executeTaskWithPolicy(task).then(
            (res) => res,
            (err) =>
              ({
                module: task.module,
                method: task.method,
                response: null,
                success: false,
                errorMessage: err instanceof Error ? err.message : String(err),
              }) as TaskResult
          ))
        )

        for (const r of settled) {
          results.push(r)
          this.emit("taskCompleted", r)
          if (!r.success) {
            aborted = true
          }
        }
      }

      const summary: WorkflowResult = { results, completedAt: Date.now() }
      if (aborted) {
        this.emit("workflowAborted", summary)
      } else {
        this.emit("workflowCompleted", summary)
      }
      return summary
    } catch (err) {
      this.emit("workflowError", err)
      const summary: WorkflowResult = { results, completedAt: Date.now() }
      this.emit("workflowAborted", summary)
      throw err
    }
  }

  /**
   * Execute a single task with retry/timeout policy
   * Additional optional fields supported on TaskParams (non-breaking):
   * - timeoutMs?: number
   * - retries?: number
   * - backoffMs?: number
   * - headers?: Record<string, string>
   */
  private async executeTaskWithPolicy(task: TaskParams & Partial<{
    timeoutMs: number
    retries: number
    backoffMs: number
    headers: Record<string, string>
  }>): Promise<TaskResult> {
    const { module, method, payload } = task
    const endpoint = this.modules.get(module)
    if (!endpoint) {
      return {
        module,
        method,
        response: null,
        success: false,
        errorMessage: `Unknown module "${module}"`,
      }
    }

    const url = `${endpoint}/rpc/${method}`
    const retries = Number.isFinite(task.retries) ? Math.max(0, Math.floor(task.retries!)) : 0
    const timeoutMs = Number.isFinite(task.timeoutMs) ? Math.max(1, Math.floor(task.timeoutMs!)) : 10_000
    const backoffMs = Number.isFinite(task.backoffMs) ? Math.max(0, Math.floor(task.backoffMs!)) : 300

    let lastErr: unknown

    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      this.emit("taskStarted", { module, method, payload, attempt })
      try {
        const data = await fetchJson<any>(
          url,
          {
            method: "POST",
            timeoutMs,
            body: JSON.stringify(payload ?? {}),
            headers: { ...(task.headers || {}) },
          },
          0,
          0
        )
        return { module, method, response: data, success: true }
      } catch (err) {
        lastErr = err
        if (attempt <= retries) {
          if (backoffMs > 0) await new Promise((r) => setTimeout(r, backoffMs))
          continue
        }
      }
    }

    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr)
    return { module, method, response: null, success: false, errorMessage: msg }
  }
}

/*
filename options
- logic_shell_service.ts
- logic_shell_orchestrator.ts
- logic_shell_runner.ts
*/
