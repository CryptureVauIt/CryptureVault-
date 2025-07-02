import { z } from "zod"

/**
 * Parameters for pattern detection
 */
const patternParamsSchema = z.object({
  /** Series of transfer counts over time buckets */
  transferCounts: z.array(z.number().int().nonnegative()).min(2),
  /** Series of volume totals over same buckets */
  volumeSeries: z.array(z.number().nonnegative()).min(2),
  /** Multiplier for spike threshold */
  spikeMultiplier: z.number().positive().default(2),
  /** Multiplier for dump threshold */
  dumpMultiplier: z.number().positive().default(2),
})

export type PatternParams = z.infer<typeof patternParamsSchema>

/**
 * Detected pattern types
 */
export type PatternType = "spike" | "dump"

/**
 * Single pattern detection result
 */
export interface PatternEvent {
  index: number
  type: PatternType
  metric: "transfer" | "volume"
  value: number
  threshold: number
}

/**
 * Detection result
 */
export interface PatternDetection {
  events: PatternEvent[]
  detectionTimestamp: number
}

/**
 * Service to detect abnormal patterns in token activity
 */
export class DetectTokenPatternsService {
  /**
   * Detect spikes or dumps in the series
   */
  public detect(raw: unknown): PatternDetection {
    const { transferCounts, volumeSeries, spikeMultiplier, dumpMultiplier } =
      patternParamsSchema.parse(raw)

    const events: PatternEvent[] = []
    const tcAvg = transferCounts.reduce((a, b) => a + b, 0) / transferCounts.length
    const volAvg = volumeSeries.reduce((a, b) => a + b, 0) / volumeSeries.length

    const tcSpikeThreshold = tcAvg * spikeMultiplier
    const volSpikeThreshold = volAvg * spikeMultiplier
    const tcDumpThreshold = tcAvg / dumpMultiplier
    const volDumpThreshold = volAvg / dumpMultiplier

    // scan indexes
    for (let i = 0; i < transferCounts.length; i++) {
      const tc = transferCounts[i]
      if (tc >= tcSpikeThreshold) {
        events.push({ index: i, type: "spike", metric: "transfer", value: tc, threshold: tcSpikeThreshold })
      } else if (tc <= tcDumpThreshold) {
        events.push({ index: i, type: "dump", metric: "transfer", value: tc, threshold: tcDumpThreshold })
      }

      const vol = volumeSeries[i]
      if (vol >= volSpikeThreshold) {
        events.push({ index: i, type: "spike", metric: "volume", value: vol, threshold: volSpikeThreshold })
      } else if (vol <= volDumpThreshold) {
        events.push({ index: i, type: "dump", metric: "volume", value: vol, threshold: volDumpThreshold })
      }
    }

    return { events, detectionTimestamp: Date.now() }
  }
}
