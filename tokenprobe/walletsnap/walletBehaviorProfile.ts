
export interface TransactionRecord {
  timestamp: number
  amount: number
  direction: "in" | "out"
}

export interface WalletProfile {
  firstTx: number
  lastTx: number
  totalIn: number
  totalOut: number
  averageTxSize: number
}

export function analyzeWalletBehavior(records: TransactionRecord[]): WalletProfile {
  if (records.length === 0) {
    return { firstTx: 0, lastTx: 0, totalIn: 0, totalOut: 0, averageTxSize: 0 }
  }
  const sorted = [...records].sort((a, b) => a.timestamp - b.timestamp)
  const totalIn = records.filter(r => r.direction === "in").reduce((sum, r) => sum + r.amount, 0)
  const totalOut = records.filter(r => r.direction === "out").reduce((sum, r) => sum + r.amount, 0)
  const avgSize = records.reduce((sum, r) => sum + r.amount, 0) / records.length

  return {
    firstTx: sorted[0].timestamp,
    lastTx: sorted[sorted.length - 1].timestamp,
    totalIn,
    totalOut,
    averageTxSize: Number(avgSize.toFixed(4))
  }
}
