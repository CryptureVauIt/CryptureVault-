
import { Connection, PublicKey, ConfirmedSignatureInfo } from "@solana/web3.js"

export interface FlowEvent {
  signature: string
  address: string
  timestamp: number
  direction: "in" | "out"
  amount: number
}

export class WatchFlowService {
  private conn: Connection

  constructor(rpcUrl: string) {
    this.conn = new Connection(rpcUrl, "confirmed")
  }

  /**
   * Stream and classify recent token transfer events for a given wallet.
   */
  async fetchFlow(
    wallet: string,
    mint: string,
    limit = 100
  ): Promise<FlowEvent[]> {
    const walletPub = new PublicKey(wallet)
    const sigs: ConfirmedSignatureInfo[] = await this.conn.getSignaturesForAddress(walletPub, { limit })
    const events: FlowEvent[] = []

    for (const { signature, blockTime } of sigs) {
      if (!blockTime) continue
      const tx = await this.conn.getParsedConfirmedTransaction(signature)
      if (!tx) continue
      for (const instr of tx.transaction.message.instructions as any[]) {
        if (instr.program === "spl-token" && instr.parsed?.type === "transfer") {
          const { source, destination, amount, mint: txMint } = instr.parsed.info
          if (txMint !== mint) continue
          const direction: "in" | "out" = destination === walletPub.toBase58() ? "in" : "out"
          events.push({
            signature,
            address: direction === "in" ? source : destination,
            timestamp: blockTime * 1000,
            direction,
            amount: Number(amount)
          })
        }
      }
    }

    return events.sort((a, b) => a.timestamp - b.timestamp)
  }
}
