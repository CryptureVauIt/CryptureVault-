import { z } from "zod"

/**
 * Input for burst prediction
 */
const burstParamsSchema = z.object({
  /** Time series of activity counts per interval */
  counts: z.array(z.number().int().nonnegative()).min(2),
  /** Window size for moving average */
  windowSize: z.number().int().positive().default(5),
  /** Threshold multiplier for burst detection */
  thresholdMultiplier: z.number().positive().default(2),
})

export type BurstParams = z.infer<typeof burstParamsSchema>

/**
 * Burst detection result
 */
export interface BurstPrediction {
  /** Indices where bursts occur */
  burstIndices: number[]
  /** Moving average series */
  movingAverage: number[]
  /** Threshold series */
  thresholdSeries: number[]
}

/**
 * Service that predicts bursts in token activity
 */
export class TokenBurstPredictor {
  /**
   * Identify bursts where count > avg * multiplier
   */
  public predict(raw: unknown): BurstPrediction {
    const { counts, windowSize, thresholdMultiplier } =
      burstParamsSchema.parse(raw)

    const n = counts.length
    const movingAverage: number[] = []
    const thresholdSeries: number[] = []
    const burstIndices: number[] = []

    // compute moving average
    for (let i = 0; i < n; i++) {
      const start = Math.max(0, i - windowSize + 1)
      const window = counts.slice(start, i + 1)
      const avg = window.reduce((a, b) => a + b, 0) / window.length
      movingAverage.push(avg)
      const thr = avg * thresholdMultiplier
      thresholdSeries.push(thr)
      if (counts[i] > thr) {
        burstIndices.push(i)
      }
    }

    return { burstIndices, movingAverage, thresholdSeries }
  }
}
