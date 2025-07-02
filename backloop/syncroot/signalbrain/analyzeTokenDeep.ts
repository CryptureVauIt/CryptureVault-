import { z } from "zod"
import { AnalyzeTokenActivityService, ActivityReport } from "./analyzeTokenActivity"

/**
 * Deep analysis parameters
 */
const deepParamsSchema = z.object({
  mint: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "invalid Base58 mint"),
  priceHistory: z.array(
    z.object({
      timestamp: z.number().int(),
      price: z.number().positive(),
    })
  ).min(2),
  windowHours: z.number().int().positive().default(24),
  bucketCount: z.number().int().positive().default(24),
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
   * Compute volatility as standard deviation of returns
   */
  private computeVolatility(prices: number[]): number {
    const returns: number[] = []
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length
    return Math.sqrt(variance)
  }

  /**
   * Compute simple moving average of prices
   */
  private computeMovingAverage(prices: number[]): number {
    const sum = prices.reduce((a, b) => a + b, 0)
    return sum / prices.length
  }

  /**
   * Run deep analysis combining on-chain activity and price metrics
   */
  public async analyze(raw: unknown): Promise<DeepAnalysis> {
    const { mint, priceHistory, windowHours, bucketCount } = deepParamsSchema.parse(raw)

    // on-chain activity
    const activity = await this.activityService.generateReport({ mint, windowHours, bucketCount })

    // price metrics
    const prices = priceHistory.map((p) => p.price)
    const volatility = this.computeVolatility(prices)
    const movingAverage = this.computeMovingAverage(prices)

    return {
      activity,
      volatility,
      priceMovingAverage: movingAverage,
      analysisTimestamp: Date.now(),
    }
  }
}
