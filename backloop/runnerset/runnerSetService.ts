import fetch from "node-fetch"
import { EventEmitter } from "events"
import { URL } from "url"
import {
  runnerSetConfigSchema,
  RunnerSetConfig,
  dispatchParamsSchema,
  DispatchParams,
  RunnerResult,
  DispatchSummary,
} from "./defineRunnerSetShape"

/**
 * Service that dispatches payloads to a set of runners in parallel,
 * respecting per-runner concurrency and per-task timeouts.
 */
export class RunnerSetService extends EventEmitter {
  private readonly endpoints: string[]
  private readonly maxConcurrencyPerRunner: number
  private readonly taskTimeoutMs: number

  constructor(rawConfig: unknown) {
    super()
    const { runnerEndpoints, maxConcurrencyPerRunner, taskTimeoutMs }: RunnerSetConfig =
      runnerSetConfigSchema.parse(rawConfig)
    this.endpoints = runnerEndpoints
    this.maxConcurrencyPerRunner = maxConcurrencyPerRunner
    this.taskTimeoutMs = taskTimeoutMs
  }

  /**
   * Dispatches the same payload to all runners.
   * Emits 'start', 'runnerResult', and 'complete' events.
   */
  public async dispatchAll(rawParams: unknown): Promise<DispatchSummary> {
    const { payload }: DispatchParams = dispatchParamsSchema.parse(rawParams)
    this.emit("start", { total: this.endpoints.length })

    const results: RunnerResult[] = []
    let successes = 0
    let failures = 0

    // limit concurrency per runner
    const runnerPromises = this.endpoints.map((endpoint) =>
      this.dispatchToRunner(endpoint, payload).then((res) => {
        results.push(res)
        if (res.success) successes++
        else failures++
        this.emit("runnerResult", res)
      })
    )

    // wait for all to finish
    await Promise.all(runnerPromises)

    const summary: DispatchSummary = {
      total: this.endpoints.length,
      successes,
      failures,
      results,
    }

    this.emit("complete", summary)
    return summary
  }

  /**
   * Sends payload to a single runner endpoint with timeout
   */
  private async dispatchToRunner(endpoint: string, payload: unknown): Promise<RunnerResult> {
    const url = new URL(endpoint)
    let controller: AbortController | undefined
    if (this.taskTimeoutMs) {
      controller = new AbortController()
      setTimeout(() => controller!.abort(), this.taskTimeoutMs)
    }

    try {
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller?.signal,
      })

      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(`HTTP ${res.status} ${res.statusText} ${text}`)
      }

      const data = await res.json()
      return { endpoint, success: true, response: data }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { endpoint, success: false, error: msg }
    }
  }
}
