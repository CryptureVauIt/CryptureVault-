
import type { OrderBookEntry, SpreadMetrics } from "./tokenSpreadUtils"
import type { TransactionRecord, WalletProfile } from "./walletBehaviorProfile"

export interface InspectionResult {
  spread: SpreadMetrics
  profile: WalletProfile
}

export class WalletInspectionJob {
  constructor(
    private fetchTransactions: (addr: string) => Promise<TransactionRecord[]>,
    private fetchOrderBook: (symbol: string) => Promise<{ bids: OrderBookEntry[]; asks: OrderBookEntry[] }>
  ) {}

  async run(walletAddress: string, symbol: string): Promise<InspectionResult> {
    const [records, book] = await Promise.all([
      this.fetchTransactions(walletAddress),
      this.fetchOrderBook(symbol)
    ])

    const profile = await Promise.resolve(analyzeWalletBehavior(records))
    const spread = await Promise.resolve(computeSpread(book.bids, book.asks))

    return { spread, profile }
  }
}

// Helpers imported inline to avoid additional imports in code:
import { analyzeWalletBehavior } from "./walletBehaviorProfile"
import { computeSpread } from "./tokenSpreadUtils"
