import { z } from "zod"
import { Connection, PublicKey, ParsedTransactionWithMeta } from "@solana/web3.js"

/**
 * Input parameters for heatmap generation
 */
const heatmapParamsSchema = z.object({
  /** Token mint address */
  mint: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  /** Lookback window in hours */
  windowHours: z.number().int().positive().default(24),
  /** Number of buckets along X (time) */
  bucketsX: z.number().int().positive().default(24),
  /** Number of buckets along Y (hour of day 0–23) */
  bucketsY: z.number().int().positive().default(24),
})

export type HeatmapParams = z.infer<typeof heatmapParamsSchema>

/**
 * Heatmap data structure
 */
export interface HeatmapData {
  /** 2D array [x][y] of activity counts */
  matrix: number[][]
  /** Corresponding time labels for X axis (epoch ms) */
  timeLabels: number[]
  /** Hour labels for Y axis (0–23) */
  hourLabels: number[]
}

/**
 * Service generating activity heatmap for a token
 */
export class TokenActivityHeatmapService {
  private connection: Connection

  constructor(endpoint: string) {
    this.connection = new Connection(endpoint, "confirmed")
  }

  /**
   * Produce a heatmap of transfer counts over time buckets
   */
  public async generateHeatmap(raw: unknown): Promise<HeatmapData> {
    const { mint, windowHours, bucketsX, bucketsY } =
      heatmapParamsSchema.parse(raw)

    const now = Date.now()
    const windowMs = windowHours * 3600 * 1000
    const startTime = now - windowMs
    const bucketDuration = windowMs / bucketsX

    // initialize matrix and labels
    const matrix = Array.from({ length: bucketsX }, () =>
      Array(bucketsY).fill(0)
    )
    const timeLabels: number[] = []
    for (let i = 0; i < bucketsX; i++) {
      timeLabels.push(startTime + i * bucketDuration)
    }
    const hourLabels = Array.from({ length: bucketsY }, (_, i) => i)

    // fetch confirmed signatures for token accounts
    const mintKey = new PublicKey(mint)
    const accounts = await this.connection.getParsedTokenAccountsByOwner(
      mintKey,
      { mint: mintKey }
    )

    // iterate accounts and their transactions
    for (const { pubkey } of accounts.value) {
      const sigs = await this.connection.getSignaturesForAddress(pubkey, {
        until: undefined,
        limit: 1000,
      })

      for (const info of sigs) {
        if (!info.blockTime) continue
        const ts = info.blockTime * 1000
        if (ts < startTime || ts > now) continue

        const x = Math.min(
          bucketsX - 1,
          Math.floor((ts - startTime) / bucketDuration)
        )
        const date = new Date(ts)
        const y = date.getUTCHours() % bucketsY
        matrix[x][y]++
      }
    }

    return { matrix, timeLabels, hourLabels }
  }
}
