import axios from "axios"
import pLimit from "p-limit"
import { z } from "zod"

/**
 * Configuration schema for LogicShell orchestrator
 */
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
  /** Method on the module */
  method: z.string().min(1),
  /** Arbitrary payload object to send */
  payload: z.record(z.unknown()),
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
  response?: unknown
  success: boolean
  errorMessage?: string
}

/**
 * Final result of executing the workflow
 */
export interface WorkflowResult {
  results: TaskResult[]
  completedAt: number
}

/**
 * Validates config and workflow definitions.
 * Throws ZodError if invalid.
 */
export function validateInputs(
  config: unknown,
  workflow: unknown
): { config: LogicShellConfig; workflow: Workflow } {
  const parsedConfig = logicShellConfigSchema.parse(config)
  const parsedWorkflow = workflowSchema.parse(workflow)

  // Verify each task references a known module and method
  const moduleMap = new Map(
    parsedConfig.modules.map(m => [m.name, m.methods])
  )

  for (const task of parsedWorkflow.tasks) {
    const methods = moduleMap.get(task.module)
    if (!methods) {
      throw new Error(`Unknown module "${task.module}" in workflow`)
    }
    if (!methods.includes(task.method)) {
      throw new Error(
        `Module "${task.module}" does not support method "${task.method}"`
      )
    }
  }

  return { config: parsedConfig, workflow: parsedWorkflow }
}

/**
 * Executes the workflow: dispatches each task to its module endpoint in order,
 * honoring the configured concurrency.
 */
export async function executeWorkflow(
  rawConfig: unknown,
  rawWorkflow: unknown
): Promise<WorkflowResult> {
  const { config, workflow } = validateInputs(rawConfig, rawWorkflow)
  const limiter = pLimit(config.concurrency)

  const results: TaskResult[] = []

  // Execute tasks in sequence but allow parallel subcalls if concurrency > 1
  for (const task of workflow.tasks) {
    const moduleDef = config.modules.find(m => m.name === task.module)!
    const url = `${moduleDef.endpoint}/${task.method}`

    // Wrap the HTTP call in the limiter
    const taskPromise = limiter(async () => {
      try {
        const resp = await axios.post(url, task.payload, {
          timeout: config.concurrency * 1000, // optional dynamic timeout
        })
        results.push({
          module: task.module,
          method: task.method,
          response: resp.data,
          success: true,
        })
      } catch (err: any) {
        results.push({
          module: task.module,
          method: task.method,
          success: false,
          errorMessage: err.message,
        })
      }
    })

    await taskPromise
  }

  return {
    results,
    completedAt: Date.now(),
  }
}
