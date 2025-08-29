import { Connection, PublicKey, Commitment, ParsedTransactionWithMeta } from "@solana/web3.js"
import { EventEmitter } from "events"

/**
 * Represents a single swap event parsed from on-chain logs
 */
export interface SwapEvent {
  transactionSignature: string
  programId: string
  slot: number
  timestamp: Date
  inputMint: string
  outputMint: string
  inputAmount: number
  outputAmount: number
}

/**
 * Options for configuring the DexStream client
 */
export interface DexStreamOptions {
  /** The RPC endpoint to connect to */
  endpoint: string
  /** The public key of the DEX program to monitor */
  programId: string
  /** Commitment level for subscription */
  commitment?: Commitment
  /** If true, fetches blockTime for each signature to produce real timestamps */
  enrichTimestamps?: boolean
  /** Backoff base (ms) used for reconnects; quadratic backoff is applied per retry */
  reconnectBackoffMs?: number
  /** Maximum backoff delay (ms) */
  maxReconnectBackoffMs?: number
}

/**
 * DexStreamClient connects to a Solana RPC endpoint, listens for
 * program log updates, and emits parsed swap events
 */
export class DexStreamClient extends EventEmitter {
  private connection: Connection
  private programKey: PublicKey
  private subscriptionId: number | null = null
  private commitment: Commitment
  private enrichTimestamps: boolean
  private reconnectBackoffMs: number
  private maxReconnectBackoffMs: number
  private startAttempts = 0
  private stopped = false

  constructor(options: DexStreamOptions) {
    super()
    this.connection = new Connection(options.endpoint, options.commitment ?? "confirmed")
    this.programKey = new PublicKey(options.programId)
    this.commitment = options.commitment ?? "confirmed"
    this.enrichTimestamps = options.enrichTimestamps ?? true
    this.reconnectBackoffMs = Math.max(250, options.reconnectBackoffMs ?? 1000)
    this.maxReconnectBackoffMs = Math.max(1_000, options.maxReconnectBackoffMs ?? 30_000)
  }

  /**
   * Start listening to program logs for swap events
   */
  public async start(): Promise<void> {
    if (this.subscriptionId !== null) return
    this.stopped = false
    await this.bindSubscriptionWithRetry()
  }

  /**
   * Stop listening and clean up subscription
   */
  public async stop(): Promise<void> {
    this.stopped = true
    if (this.subscriptionId !== null) {
      const id = this.subscriptionId
      this.subscriptionId = null
      try {
        await this.connection.removeOnLogsListener(id)
      } catch (err) {
        this.emit("error", err)
      }
    }
  }

  /**
   * Internal: attempt to bind the onLogs subscription with quadratic backoff
   */
  private async bindSubscriptionWithRetry(): Promise<void> {
    while (!this.stopped && this.subscriptionId === null) {
      try {
        this.subscriptionId = this.connection.onLogs(
          this.programKey,
          (logInfo, ctx) => this.handleLog(logInfo.signature, logInfo.logs, ctx?.slot),
          this.commitment
        )
        this.startAttempts = 0
        this.emit("ready")
        break
      } catch (err) {
        this.startAttempts += 1
        this.emit("error", err)
        const delay = Math.min(
          this.maxReconnectBackoffMs,
          this.reconnectBackoffMs * this.startAttempts * this.startAttempts
        )
        await this.delay(delay)
      }
    }
  }

  /**
   * Internal log handler: parses logs and emits SwapEvent when found
   */
  private async handleLog(signature: string, logs: string[], slot?: number): Promise<void> {
    try {
      const parsed = this.parseSwapFromLogs(logs, signature, slot)
      if (!parsed) return

      if (this.enrichTimestamps) {
        const ts = await this.fetchSignatureTime(signature)
        if (ts) parsed.timestamp = ts
      }

      this.emit("swap", parsed)
    } catch (err) {
      this.emit("error", err)
    }
  }

  /**
   * Parse a swap event from program logs using multiple known patterns
   * Extendable to support different DEX log formats
   */
  private parseSwapFromLogs(logs: string[], signature: string, slot?: number): SwapEvent | null {
    // Patterns:
    // 1) "Swap: input=TOKENA:100.0 output=TOKENB:99.5"
    // 2) "swap input TOKENA 100.0 -> TOKENB 99.5"
    // 3) JSON-ish: "event: {"type":"swap","inMint":"TOKENA","inAmt":"100.0","outMint":"TOKENB","outAmt":"99.5"}"
    const patterns: Array<(line: string) => SwapEvent | null> = [
      (line) => {
        if (!line.startsWith("Swap:")) return null
        const m = /input=([A-Za-z0-9]+):([\d.]+)\s+output=([A-Za-z0-9]+):([\d.]+)/.exec(line)
        if (!m) return null
        return this.makeEvent(signature, slot, m[1], m[2], m[3], m[4])
      },
      (line) => {
        const m = /swap\s+input\s+([A-Za-z0-9]+)\s+([\d.]+)\s*->\s*([A-Za-z0-9]+)\s+([\d.]+)/i.exec(line)
        if (!m) return null
        return this.makeEvent(signature, slot, m[1], m[2], m[3], m[4])
      },
      (line) => {
        const idx = line.indexOf("{")
        if (idx === -1) return null
        const jsonCandidate = line.slice(idx)
        try {
          const obj = JSON.parse(jsonCandidate)
          if (obj?.type?.toLowerCase?.() !== "swap") return null
          return this.makeEvent(signature, slot, obj.inMint, obj.inAmt, obj.outMint, obj.outAmt)
        } catch {
          return null
        }
      },
    ]

    for (const line of logs) {
      for (const p of patterns) {
        const evt = p(line)
        if (evt) return evt
      }
    }
    return null
  }

  private makeEvent(signature: string, slot: number | undefined, inMint: string, inAmt: string, outMint: string, outAmt: string): SwapEvent {
    return {
      transactionSignature: signature,
      programId: this.programKey.toBase58(),
      slot: typeof slot === "number" ? slot : 0,
      timestamp: new Date(), // may be overwritten by enrichment
      inputMint: String(inMint),
      outputMint: String(outMint),
      inputAmount: Number(inAmt),
      outputAmount: Number(outAmt),
    }
  }

  /**
   * Fetch the blockTime for a given signature and convert to Date
   */
  private async fetchSignatureTime(signature: string): Promise<Date | null> {
    try {
      const tx = await this.connection.getTransaction(signature, {
        commitment: this.commitment,
        maxSupportedTransactionVersion: 0,
      }) as ParsedTransactionWithMeta | null
      if (tx?.blockTime) return new Date(tx.blockTime * 1000)
    } catch {
      // ignore enrichment failures
    }
    return null
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
