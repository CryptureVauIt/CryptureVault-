import { EventEmitter } from "events"
import {
  WalletDetailsService
} from "./walletDetailsService"
import {
  WalletDetailsConfig,
  WalletDetailsParams,
  WalletDetails
} from "./defineWalletDetailsShape"

/** Agent runtime status */
type AgentStatus = "idle" | "running" | "success" | "error" | "timeout" | "canceled"

/** Typed event map for the agent */
interface AgentEvents {
  start: (walletAddress: string, attempt: number) => void
  attempt: (walletAddress: string, attempt: number) => void
  success: (details: WalletDetails) => void
  error: (error: unknown, attempt: number) => void
  timeout: (walletAddress: string) => void
  cancel: (walletAddress: string) => void
  done: (walletAddress: string, status: AgentStatus) => void
}

/** Options controlling retries and timing */
export interface WalletDetailsAgentOptions {
  /** number of retry attempts after the first try */
  retries?: number
  /** delay between attempts in ms */
  retryDelayMs?: number
  /** overall timeout for a single attempt in ms (no cancellation propagation) */
  timeoutMs?: number
}

/**
 * Agent to orchestrate wallet detail retrieval and emit events
 * Adds retries, attempt-level timeout, typed events, and state inspection
 */
export class WalletDetailsAgent extends EventEmitter {
  private service: WalletDetailsService
  private readonly opts: Required<WalletDetailsAgentOptions>
  private status: AgentStatus = "idle"
  private inFlight = false
  private lastError: unknown = null
  private lastStartedAt: number | null = null
  private lastFinishedAt: number | null = null
  private lastWallet: string | null = null
  private cancelRequested = false

  constructor(config: WalletDetailsConfig, options: WalletDetailsAgentOptions = {}) {
    super()
    this.service = new WalletDetailsService(config)
    this.opts = {
      retries: options.retries ?? 2,
      retryDelayMs: options.retryDelayMs ?? 1000,
      timeoutMs: options.timeoutMs ?? 15_000,
    }
  }

  /** Typed 'on' overloads */
  public on<EventName extends keyof AgentEvents>(event: EventName, listener: AgentEvents[EventName]): this {
    return super.on(event, listener)
  }
  /** Typed 'once' overloads */
  public once<EventName extends keyof AgentEvents>(event: EventName, listener: AgentEvents[EventName]): this {
    return super.once(event, listener)
  }

  /**
   * Initiates retrieval of wallet details with retries
   * Emits: start, attempt, success, error, timeout, cancel, done
   */
  public async fetchDetails(params: WalletDetailsParams): Promise<WalletDetails> {
    if (this.inFlight) {
      throw new Error("WalletDetailsAgent is already running")
    }

    this.prepareRun(params.walletAddress)

    const maxAttempts = this.opts.retries + 1
    let lastErr: unknown = null

    this.emit("start", params.walletAddress, 1)

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (this.cancelRequested) {
        this.finishRun("canceled")
        this.emit("cancel", params.walletAddress)
        this.emit("done", params.walletAddress, "canceled")
        throw new Error("WalletDetailsAgent run was canceled")
      }

      this.emit("attempt", params.walletAddress, attempt)

      try {
        const details = await this.withTimeout(
          this.service.getWalletDetails(params),
          this.opts.timeoutMs
        )
        this.finishRun("success")
        this.emit("success", details)
        this.emit("done", params.walletAddress, "success")
        return details
      } catch (err) {
        lastErr = err
        this.lastError = err

        // if it was a timeout, mark and maybe retry
        if (this.isTimeoutError(err)) {
          this.status = "timeout"
          this.emit("timeout", params.walletAddress)
        } else {
          this.status = "error"
          this.emit("error", err, attempt)
        }

        // no more attempts left
        if (attempt >= maxAttempts) {
          this.finishRun(this.isTimeoutError(err) ? "timeout" : "error")
          this.emit("done", params.walletAddress, this.status)
          throw err
        }

        // delay before next attempt
        await this.delay(this.opts.retryDelayMs)
      }
    }

    // should be unreachable
    this.finishRun("error")
    this.emit("done", params.walletAddress, "error")
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
  }

  /** Cancel the current run (best-effort; does not abort underlying I/O) */
  public cancel(): void {
    if (!this.inFlight) return
    this.cancelRequested = true
  }

  /** Current state snapshot */
  public getState(): {
    status: AgentStatus
    running: boolean
    lastError: unknown
    lastStartedAt: number | null
    lastFinishedAt: number | null
    lastWallet: string | null
    options: Required<WalletDetailsAgentOptions>
  } {
    return {
      status: this.status,
      running: this.inFlight,
      lastError: this.lastError,
      lastStartedAt: this.lastStartedAt,
      lastFinishedAt: this.lastFinishedAt,
      lastWallet: this.lastWallet,
      options: this.opts,
    }
  }

  // ------------------ internals ------------------

  private prepareRun(walletAddress: string): void {
    this.inFlight = true
    this.cancelRequested = false
    this.lastError = null
    this.status = "running"
    this.lastStartedAt = Date.now()
    this.lastFinishedAt = null
    this.lastWallet = walletAddress
  }

  private finishRun(finalStatus: AgentStatus): void {
    this.status = finalStatus
    this.inFlight = false
    this.lastFinishedAt = Date.now()
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private isTimeoutError(err: unknown): boolean {
    return err instanceof Error && err.name === "TimeoutError"
  }

  private async withTimeout<T>(p: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const e = new Error(`Operation timed out after ${timeoutMs} ms`)
        e.name = "TimeoutError"
        reject(e)
      }, Math.max(1, timeoutMs))
    })
    try {
      return await Promise.race([p, timeout])
    } finally {
      clearTimeout(timer!)
    }
  }
}

/*
filename options
- wallet_details_agent.ts
- wallet_details_orchestrator.ts
- wallet_details_runner.ts
*/
