import { Connection, PublicKey, Commitment } from "@solana/web3.js"
import { EventEmitter } from "events"

/**
 * Represents a single swap event parsed from on‐chain logs
 */
export interface SwapEvent {
  transactionSignature: string
  programId: string
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
  /**
   * The RPC endpoint to connect to
   */
  endpoint: string
  /**
   * The public key of the DEX program to monitor
   */
  programId: string
  /**
   * Commitment level for subscription
   */
  commitment?: Commitment
}

/**
 * DexStreamClient connects to a Solana RPC endpoint, listens for
 * program log updates, and emits parsed swap events
 */
export class DexStreamClient extends EventEmitter {
  private connection: Connection
  private programKey: PublicKey
  private subscriptionId: number | null = null

  constructor(options: DexStreamOptions) {
    super()
    this.connection = new Connection(options.endpoint, options.commitment || "confirmed")
    this.programKey = new PublicKey(options.programId)
  }

  /**
   * Start listening to program logs for swap events
   */
  public async start(): Promise<void> {
    if (this.subscriptionId !== null) {
      return
    }
    this.subscriptionId = this.connection.onLogs(
      this.programKey,
      this.handleLog.bind(this),
      this.connection.commitment
    )
  }

  /**
   * Stop listening and clean up subscription
   */
  public async stop(): Promise<void> {
    if (this.subscriptionId !== null) {
      await this.connection.removeOnLogsListener(this.subscriptionId)
      this.subscriptionId = null
    }
  }

  /**
   * Internal log handler: parses logs and emits SwapEvent when found
   */
  private handleLog(logInfo: { signature: string; logs: string[] }): void {
    const { signature, logs } = logInfo
    let parsed: SwapEvent | null = null
    for (const line of logs) {
      // Example pattern: "Swap: input=TOKENA:100.0 output=TOKENB:99.5"
      if (line.startsWith("Swap:")) {
        const match = /input=([A-Za-z0-9]+):([\d.]+)\s+output=([A-Za-z0-9]+):([\d.]+)/.exec(line)
        if (match) {
          parsed = {
            transactionSignature: signature,
            programId: this.programKey.toBase58(),
            timestamp: new Date(),
            inputMint: match[1],
            inputAmount: parseFloat(match[2]),
            outputMint: match[3],
            outputAmount: parseFloat(match[4]),
          }
        }
        break
      }
    }
    if (parsed) {
      this.emit("swap", parsed)
    }
  }
}

