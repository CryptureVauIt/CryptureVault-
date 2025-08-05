import { EventEmitter } from "events"
import {
  DeepcoreSolService
} from "./deepcoreSolService"
import {
  DeepcoreSolConfig,
  SolQueryParams,
  SolAnalytics
} from "./defineDeepcoreSolShape"

/** Strongly-typed events for DeepcoreSolAgent */
export interface DeepcoreSolAgentEvents {
  start: (walletAddress: string) => void
  result: (analytics: SolAnalytics) => void
  error: (error: Error) => void
  timeout: (walletAddress: string) => void
}

export class DeepcoreSolAgent extends EventEmitter {
  private service: DeepcoreSolService
  private defaultTimeoutMs: number

  constructor(config: DeepcoreSolConfig, timeoutMs: number = 30_000) {
    super()
    this.service = new DeepcoreSolService(config)
    this.defaultTimeoutMs = timeoutMs
  }

  /**
   * Run analytics for the given wallet
   * Emits "start", "result", "error", or "timeout"
   */
  public async analyze(
    params: SolQueryParams,
    timeoutMs: number = this.defaultTimeoutMs
  ): Promise<SolAnalytics> {
    const { walletAddress } = params
    this.emit("start", walletAddress)

    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => {
        this.emit("timeout", walletAddress)
        reject(new Error(`DeepcoreSolAgent: analysis timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    )

    // Race actual service call against timeout
    try {
      const analytics = await Promise.race([
        this.service.getAnalytics(params),
        timeoutPromise
      ]) as SolAnalytics

      this.emit("result", analytics)
      return analytics
    } catch (err) {
      this.emit("error", err as Error)
      throw err
    }
  }

  /**
   * Register a typed listener
   */
  public on<K extends keyof DeepcoreSolAgentEvents>(
    event: K,
    listener: DeepcoreSolAgentEvents[K]
  ): this {
    return super.on(event, listener)
  }

  /**
   * Remove a typed listener
   */
  public off<K extends keyof DeepcoreSolAgentEvents>(
    event: K,
    listener: DeepcoreSolAgentEvents[K]
  ): this {
    return super.off(event, listener)
  }
}
