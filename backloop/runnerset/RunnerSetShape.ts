import { z } from "zod"

/**
 * Configuration for RunnerSetService
 */
export const runnerSetConfigSchema = z.object({
  /** List of runner endpoints (HTTP URLs) */
  runnerEndpoints: z.array(z.string().url()).min(1),
  /** Maximum concurrent tasks per runner */
  maxConcurrencyPerRunner: z.number().int().positive().default(5),
  /** Global timeout for any task (ms) */
  taskTimeoutMs: z.number().int().positive().default(30_000),
})

export type RunnerSetConfig = z.infer<typeof runnerSetConfigSchema>

/**
 * Parameters for dispatching a work item
 */
export const dispatchParamsSchema = z.object({
  /** Arbitrary payload to send to runner */
  payload: z.record(z.unknown()),
})

export type DispatchParams = z.infer<typeof dispatchParamsSchema>

/**
 * Represents the result from a runner
 */
export interface RunnerResult {
  endpoint: string
  success: boolean
  response?: unknown
  error?: string
}

/**
 * Overall dispatch summary
 */
export interface DispatchSummary {
  total: number
  successes: number
  failures: number
  results: RunnerResult[]
}
