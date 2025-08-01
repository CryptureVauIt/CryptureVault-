import axios from "axios"
import pLimit from "p-limit"
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

/**
 * Validates config and params, throwing if invalid.
 */
export function validateDispatchInputs(
  config: unknown,
  params: unknown
): { config: RunnerSetConfig; params: DispatchParams } {
  const parsedConfig = runnerSetConfigSchema.parse(config)
  const parsedParams = dispatchParamsSchema.parse(params)
  return { config: parsedConfig, params: parsedParams }
}

/**
 * Dispatches the work item to all runners in parallel, with per-runner concurrency and timeout.
 *
 * @param rawConfig  Unvalidated RunnerSetConfig-like object
 * @param rawParams  Unvalidated DispatchParams-like object
 */
export async function dispatchWorkItem(
  rawConfig: unknown,
  rawParams: unknown
): Promise<DispatchSummary> {
  const { config, params } = validateDispatchInputs(rawConfig, rawParams)
  const { runnerEndpoints, maxConcurrencyPerRunner, taskTimeoutMs } = config

  // per-runner limiter
  const limit = pLimit(maxConcurrencyPerRunner)
  const results: RunnerResult[] = []

  // prepare tasks
  const tasks = runnerEndpoints.map(endpoint =>
    limit(async () => {
      const result: RunnerResult = { endpoint, success: false }
      try {
        const resp = await axios.post(
          endpoint,
          params.payload,
          { timeout: taskTimeoutMs }
        )
        result.success = true
        result.response = resp.data
      } catch (err: any) {
        result.error = err.message
      } finally {
        results.push(result)
      }
    })
  )

  await Promise.all(tasks)

  const successes = results.filter(r => r.success).length
  const failures = results.length - successes

  return {
    total: results.length,
    successes,
    failures,
    results,
  }
}
