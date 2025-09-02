import { z } from "zod"
import { AnalyzeTokenActivityService, ActivityReport } from "./analyzeTokenActivity"

/**
 * Deep analysis parameters
 */
const deepParamsSchema = z.object({
  mint: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "invalid Base58 mint"),
  priceHistory: z
    .array(
      z.object({
        timestamp: z.number().int(),
        price: z.number().positive()
      })
    )
    .min(3, "at least 3 price points are required"),
  windowHours: z.number().int().positive().default(24),
  bucketCount: z.number().int().positive().default(24)
})

export type DeepParams = z.infer<typeof deepParamsSchema>

/**
 * Result of deep analysis combining activity and price metrics
 */
export interface DeepAnalysis {
  activity: ActivityReport
  volatility: number
  priceMovingAverage: number
  analysisTimestamp: number
}

/**
 * Service for deep token analysis
 */
export class AnalyzeTokenDeepService {
  private activityService: AnalyzeTokenActivityService

  constructor(endpoint: string) {
    this.activityService = new AnalyzeTokenActivityService(endpoint)
  }

  /**
   * Normalize and validate price history:
   * - sort by timestamp ascending
   * - drop duplicates by timestamp
   * - ensure strictly increasing timestamps
   */
  private normalizePriceHistory(
    priceHistory: { timestamp: number; price: number }[]
  ): { timestamp: number; price: number }[] {
    const sorted = [...priceHistory].sort((a, b) => a.timestamp - b.timestamp)
    const deduped: { timestamp: number; price: number }[] = []
    let lastTs = -1
    for (const p of sorted) {
      if (!Number.isFinite(p.timestamp) || !Number.isFinite(p.price) || p.price <= 0) continue
      if (p.timestamp === lastTs) continue
      if (deduped.length > 0 && p.timestamp <= deduped[deduped.length - 1].timestamp) continue
      deduped.push({ timestamp: p.timestamp, price: p.price })
      lastTs = p.timestamp
    }
    return deduped
  }

  /**
   * Compute volatility as standard deviation of close-to-close percentage returns (in decimals, not %)
   * Returns 0 when insufficient data
   */
  private computeVolatility(prices: number[]): number {
    if (prices.length < 3) return 0
    const returns: number[] = []
    for (let i = 1; i < prices.length; i++) {
      const prev = prices[i - 1]
      const curr = prices[i]
      if (prev <= 0) continue
      const r = (curr - prev) / prev
      if (Number.isFinite(r)) returns.push(r)
    }
    if (returns.length < 2) return 0
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance =
      returns.reduce((sum, r) => sum + (r - mean) * (r - mean), 0) / returns.length
    return Math.sqrt(variance)
  }

  /**
   * Compute simple moving average of prices
   */
  private computeMovingAverage(prices: number[]): number {
    if (prices.length === 0) return 0
    const sum = prices.reduce((a, b) => a + b, 0)
    return sum / prices.length
  }

  /**
   * Run deep analysis combining on-chain activity and price metrics
   */
  public async analyze(raw: unknown): Promise<DeepAnalysis> {
    const parsed = deepParamsSchema.parse(raw)

    const cleanedHistory = this.normalizePriceHistory(parsed.priceHistory)
    if (cleanedHistory.length < 3) {
      // Preserve determinism: return zeros rather than throwing for borderline inputs
      const activity = await this.activityService.generateReport({
        mint: parsed.mint,
        windowHours: parsed.windowHours,
        bucketCount: parsed.bucketCount
      })
      return {
        activity,
        volatility: 0,
        priceMovingAverage: this.computeMovingAverage(cleanedHistory.map(p => p.price)),
        analysisTimestamp: Date.now()
      }
    }

    // on-chain activity
    const activity = await this.activityService.generateReport({
      mint: parsed.mint,
      windowHours: parsed.windowHours,
      bucketCount: parsed.bucketCount
    })

    // price metrics
    const prices = cleanedHistory.map(p => p.price)
    const volatility = this.computeVolatility(prices)
    const movingAverage = this.computeMovingAverage(prices)

    return {
      activity,
      volatility,
      priceMovingAverage: movingAverage,
      analysisTimestamp: Date.now()
    }
  }
}
