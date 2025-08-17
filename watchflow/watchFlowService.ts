import {
  Connection,
  PublicKey,
  ConfirmedSignatureInfo,
  ParsedInstruction,
  ParsedTransactionWithMeta
} from "@solana/web3.js"

export interface FlowEvent {
  signature: string
  address: string
  timestamp: number
  direction: "in" | "out"
  amount: number
}

export class WatchFlowService {
  private readonly conn: Connection

  constructor(rpcUrl: string) {
    this.conn = new Connection(rpcUrl, "confirmed")
  }

  /**
   * Fetch recent SPL token transfer events for a specific wallet and mint.
   * @param wallet Wallet address to watch
   * @param mint Token mint address to filter
   * @param limit Number of recent transactions to inspect
   */
  async fetchFlow(wallet: string, mint: string, limit = 100): Promise<FlowEvent[]> {
    const walletPubkey = new PublicKey(wallet)
    const mintAddress = mint.toString()
    const signatures: ConfirmedSignatureInfo[] = await this.conn.getSignaturesForAddress(walletPubkey, { limit })

    const events: FlowEvent[] = []

    for (const { signature, blockTime } of signatures) {
      if (!blockTime) continue

      const parsedTx: ParsedTransactionWithMeta | null =
        await this.conn.getParsedConfirmedTransaction(signature)

      if (!parsedTx) continue

      const instructions = parsedTx.transaction.message.instructions as ParsedInstruction[]

      for (const instr of instructions) {
        if (
          instr.program !== "spl-token" ||
          instr.parsed?.type !== "transfer" ||
          instr.parsed?.info?.mint !== mintAddress
        ) {
          continue
        }

        const { source, destination, amount } = instr.parsed.info
        const direction: "in" | "out" = destination === wallet ? "in" : "out"
        const counterparty = direction === "in" ? source : destination

        events.push({
          signature,
          address: counterparty,
          timestamp: blockTime * 1000,
          direction,
          amount: Number(amount)
        })
      }
    }

    return events.sort((a, b) => a.timestamp - b.timestamp)
  }
}
