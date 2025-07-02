import { Connection, PublicKey } from "@solana/web3.js"
import { z } from "zod"

/**
 * Parameters for token activity analysis
 */
const activityParamsSchema = z.object({
  mint: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "invalid Base58 mint"),
  windowHours: z.number().int().positive().default(24),
  bucketCount: z.number().int().positive().default(24),
})

export type ActivityParams = z.infer<typeof activityParamsSchema>

/**
 * One bucket of activity data
 */
export interface ActivityBucket {
  startTime: number
  endTime: number
  transferCount: number
  totalVolume: number
}

/**
 * Complete activity report
 */
export interface ActivityReport {
  buckets: ActivityBucket[]
  totalTransfers: number
  totalVolume: number
}

/**
 * Service to analyze token transfer activity over time
 */
export class AnalyzeTokenActivityService {
  private connection: Connection

  constructor(endpoint: string, commitment: "confirmed" | "processed" | "finalized" = "confirmed") {
    this.connection = new Connection(endpoint, commitment)
  }

  /**
   * Generate an activity report for the given token mint
   */
  public async generateReport(raw: unknown): Promise<ActivityReport> {
    const { mint, windowHours, bucketCount } = activityParamsSchema.parse(raw)
    const now = Date.now()
    const windowMs = windowHours * 3600 * 1000
    const start = now - windowMs
    const bucketMs = Math.floor(windowMs / bucketCount)

    // initialize buckets
    const buckets: ActivityBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
      startTime: start + i * bucketMs,
      endTime: start + (i + 1) * bucketMs,
      transferCount: 0,
      totalVolume: 0,
    }))

    // fetch all token accounts
    const mintKey = new PublicKey(mint)
    const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
      mintKey,
      { mint: mintKey }
    )

    let totalTransfers = 0
    let totalVolume = 0

    // iterate accounts
    for (const { pubkey } of tokenAccounts.value) {
      const sigInfos = await this.connection.getSignaturesForAddress(pubkey, { limit: 1000 })
      for (const info of sigInfos) {
        if (!info.blockTime) continue
        const ts = info.blockTime * 1000
        if (ts < start || ts > now) continue

        // determine bucket index
        const idx = Math.min(bucketCount - 1, Math.floor((ts - start) / bucketMs))
        buckets[idx].transferCount += 1

        // fetch parsed transaction to compute volume
        const tx = await this.connection.getParsedTransaction(info.signature, "confirmed")
        if (tx && tx.meta && tx.meta.postTokenBalances) {
          for (const pb of tx.meta.postTokenBalances) {
            if (pb.mint === mint) {
              const amount = parseInt(pb.uiTokenAmount.amount, 10)
              buckets[idx].totalVolume += amount
              totalVolume += amount
            }
          }
        }
        totalTransfers++
      }
    }

    return { buckets, totalTransfers, totalVolume }
  }
}
