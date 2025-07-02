import { Connection, PublicKey } from "@solana/web3.js"
import { EventEmitter } from "events"
import {
  parseScanEyeQuery,
  ScanEyeQuery,
  ScanEyeEvent,
} from "./defineScanEyeShape"

/**
 * ScanEyeClient listens for configured events on‐chain
 */
export class ScanEyeClient extends EventEmitter {
  private connection: Connection
  private wallets: PublicKey[]
  private eventTypes: Set<string>
  private threshold: number
  private subscriptionIds: number[] = []

  constructor(rawConfig: unknown) {
    super()
    const { walletAddresses, eventTypes, threshold, network, commitment }: ScanEyeQuery =
      parseScanEyeQuery(rawConfig)

    const endpoint =
      network === "devnet"
        ? "https://api.devnet.solana.com"
        : "https://api.mainnet-beta.solana.com"

    this.connection = new Connection(endpoint, commitment)
    this.wallets = walletAddresses.map((addr) => new PublicKey(addr))
    this.eventTypes = new Set(eventTypes)
    this.threshold = threshold
  }

  /**
   * Starts subscriptions for each wallet based on eventTypes
   */
  public async start(): Promise<void> {
    // subscribe to logs for each wallet
    for (const walletKey of this.wallets) {
      const id = this.connection.onLogs(
        walletKey,
        (logInfo) => this.handleLogs(logInfo.signature, logInfo.logs),
        this.connection.commitment
      )
      this.subscriptionIds.push(id)
    }
  }

  /**
   * Stops all active subscriptions
   */
  public async stop(): Promise<void> {
    for (const id of this.subscriptionIds) {
      await this.connection.removeOnLogsListener(id)
    }
    this.subscriptionIds = []
  }

  /**
   * Internal: parses raw logs to detect supported events
   */
  private async handleLogs(signature: string, logs: string[]): Promise<void> {
    let slot: number
    try {
      const meta = await this.connection.getSignatureStatuses([signature], {
        searchTransactionHistory: true,
      })
      slot = meta && meta.value[0]?.slot ? meta.value[0]!.slot : -1
    } catch {
      slot = -1
    }

    for (const line of logs) {
      // simple pattern matching based on eventTypes
      if (this.eventTypes.has("transfer") && line.includes("SystemProgram: Transfer")) {
        const parts = /from: (\w+), to: (\w+), lamports: (\d+)/.exec(line)
        if (parts) {
          const amt = parseInt(parts[3], 10)
          if (amt >= this.threshold) {
            this.emitEvent(signature, slot, parts[1], "transfer", {
              to: parts[2],
              lamports: amt,
            })
          }
        }
      }

      if (this.eventTypes.has("swap") && line.startsWith("Swap:")) {
        const m = /input=([A-Za-z0-9]+):([\d.]+) output=([A-Za-z0-9]+):([\d.]+)/.exec(line)
        if (m) {
          this.emitEvent(signature, slot, "swapProgram", "swap", {
            inputMint: m[1],
            inputAmount: parseFloat(m[2]),
            outputMint: m[3],
            outputAmount: parseFloat(m[4]),
          })
        }
      }

      // mint and burn detection (assumes logs include these keywords)
      if (this.eventTypes.has("mint") && line.includes("MintTo")) {
        this.emitEvent(signature, slot, "tokenProgram", "mint", { raw: line })
      }
      if (this.eventTypes.has("burn") && line.includes("Burn")) {
        this.emitEvent(signature, slot, "tokenProgram", "burn", { raw: line })
      }

      // approval (example)
      if (this.eventTypes.has("approval") && line.includes("Approve:")) {
        this.emitEvent(signature, slot, "tokenProgram", "approval", { raw: line })
      }
    }
  }

  /**
   * Helper to emit a structured event
   */
  private emitEvent(
    signature: string,
    slot: number,
    wallet: string,
    eventType: string,
    parsedInfo: Record<string, unknown>
  ) {
    const evt: ScanEyeEvent = {
      signature,
      slot,
      wallet,
      eventType: eventType as any,
      parsedInfo,
    }
    this.emit("event", evt)
  }
}

