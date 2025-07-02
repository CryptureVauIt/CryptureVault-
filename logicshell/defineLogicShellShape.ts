import { z } from "zod"

/**
 * Configuration schema for LogicShell orchestrator
 */
export const logicShellConfigSchema = z.object({
  /** Base URL for the orchestrator itself (health checks, status) */
  orchestratorUrl: z.string().url(),
  /** Definitions of modules this shell can invoke */
  modules: z.array(
    z.object({
      name: z.string().min(1),
      endpoint: z.string().url(),
      /** Supported methods on this module */
      methods: z.array(z.string().min(1)).min(1),
    })
  ).min(1),
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
  response: unknown
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
