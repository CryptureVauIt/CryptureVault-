import axios, { AxiosRequestConfig } from "axios"
import pLimit from "p-limit"
import { z } from "zod"

/**
 * Configuration for RunnerSetService
 * - Adds optional retries and default headers
 */
export const runnerSetConfigSchema = z.object({
  /** List of runner endpoints (HTTP URLs) */
  runnerEndpoints: z.array(z.string().url()).min(1),
  /** Maximum concurrent requests overall (caps parallelism across runners) */
  maxConcurrencyPerRunner: z.number().int().positive().default(5),
  /** Global timeout for any task (ms) */
  taskTimeoutMs: z.number().int().positive().default(30_000),
  /** Deterministic retry attempts per runner call */
  retryAttempts: z.number().int().nonnegative().default(0),
  /** Linear backoff step in ms (attempt N waits N * retryDelayMs) */
  retryDelayMs: z.number().int().nonnegative().default(0),
  /** Default headers applied to every request */
  defaultHeaders: z.record(z.string()).default({}),
})

export type RunnerSetConfig = z.infer<typeof runnerSetConfigSchema>

/**
 * Parameters for dispatching a work item
 */
export const dispatchParamsSchema = z.object({
  /** Arbitrary payload to send to runner */
  payload: z.record(z.unknown()).default({}),
  /** Optional per-dispatch headers (merged over config.defaultHeaders) */
  headers: z.record(z.string()).optional(),
  /** Optional HTTP method (defaults to POST) */
  method: z.enum(["POST", "PUT", "PATCH"]).default("POST"),
  /** Optional per-dispatch timeout override */
  timeoutMs: z.number().int().positive().optional(),
})

export type DispatchParams = z.infer<typeof dispatchParamsSchema>

/**
 * Represents the result from a runner
 */
export interface RunnerResult {
  endpoint: string
  success: boolean
  status?: number
  response?: unknown
  error?: string
  startedAt: number
  durationMs: number
}

/**
 * Overall dispatch summary
 */
export interface DispatchSummary {
  total: number
  successes: number
  failures: number
  results: RunnerResult[] // preserves input order (same order as runnerEndpoints)
  startedAt: number
  completedAt: number
  durationMs: number
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

/** Deterministic linear backoff */
function delay(ms: number): Promise<void> {
  return new Promise(res => setTimeout(res, ms))
}

/** Build Axios config for one call */
function buildAxiosConfig(
  endpoint: string,
  config: RunnerSetConfig,
  params: DispatchParams
): AxiosRequestConfig {
  const timeout = params.timeoutMs ?? config.taskTimeoutMs
  const headers = {
    ...config.defaultHeaders,
    ...(params.headers ?? {}),
    "content-type": "application/json",
  }
  return {
    url: endpoint,
    method: params.method,
    data: params.payload,
    headers,
    timeout,
    validateStatus: () => true, // treat non-2xx as resolved; we handle success flag manually
  }
}

/**
 * Dispatches the work item to all runners in parallel, with global concurrency, timeout, and retries.
 *
 * @param rawConfig  Unvalidated RunnerSetConfig-like object
 * @param rawParams  Unvalidated DispatchParams-like object
 */
export async function dispatchWorkItem(
  rawConfig: unknown,
  rawParams: unknown
): Promise<DispatchSummary> {
  const startedAt = Date.now()
  const { config, params } = validateDispatchInputs(rawConfig, rawParams)

  // Global limiter across all runners (since we have one call per runner)
  const limiter = pLimit(Math.min(config.maxConcurrencyPerRunner, config.runnerEndpoints.length))

  const results: RunnerResult[] = new Array(config.runnerEndpoints.length)

  const makeOne = async (endpoint: string, index: number) => {
    const reqCfg = buildAxiosConfig(endpoint, config, params)

    const attemptOnce = async (): Promise<RunnerResult> => {
      const t0 = Date.now()
      try {
        const resp = await axios.request(reqCfg)
        const ok = resp.status >= 200 && resp.status < 300
        return {
          endpoint,
          success: ok,
          status: resp.status,
          response: ok ? resp.data : undefined,
          error: ok ? undefined : `HTTP ${resp.status}`,
          startedAt: t0,
          durationMs: Date.now() - t0,
        }
      } catch (err: any) {
        return {
          endpoint,
          success: false,
          error: err?.message ?? "Request failed",
          startedAt: t0,
          durationMs: Date.now() - t0,
        }
      }
    }

    let last: RunnerResult | undefined
    for (let attempt = 0; attempt <= config.retryAttempts; attempt++) {
      last = await attemptOnce()
      if (last.success) break
      if (attempt < config.retryAttempts) {
        await delay(config.retryDelayMs * (attempt + 1))
      }
    }

    results[index] = last!
  }

  await Promise.all(
    config.runnerEndpoints.map((endpoint, i) => limiter(() => makeOne(endpoint, i)))
  )

  const successes = results.filter(r => r.success).length
  const failures = results.length - successes
  const completedAt = Date.now()

  return {
    total: results.length,
    successes,
    failures,
    results,
    startedAt,
    completedAt,
    durationMs: completedAt - startedAt,
  }
}
