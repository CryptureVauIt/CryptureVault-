import { z } from "zod"

/**
 * Input parameters for risk scoring
 */
const riskParamsSchema = z.object({
  /** 24h trading volume in base units */
  volume24h: z.number().nonnegative(),
  /** Number of unique addresses interacting in 24h */
  uniqueAddresses24h: z.number().int().nonnegative(),
  /** Number of transactions in 24h */
  txCount24h: z.number().int().nonnegative(),
  /** Current token age in days */
  tokenAgeDays: z.number().int().nonnegative(),
})

export type RiskParams = z.infer<typeof riskParamsSchema>

/**
 * Result of a risk scoring evaluation
 */
export interface RiskScore {
  /** Composite risk score 0 (safe) — 100 (high risk) */
  score: number
  /** Breakdown of factor contributions */
  breakdown: {
    volumeFactor: number
    addressFactor: number
    txFactor: number
    ageFactor: number
  }
}

/**
 * Service that computes a normalized risk score
 */
export class RiskScoringService {
  /**
   * Compute risk score given metrics
   */
  public computeRisk(raw: unknown): RiskScore {
    const { volume24h, uniqueAddresses24h, txCount24h, tokenAgeDays } =
      riskParamsSchema.parse(raw)

    // normalize each factor to 0–1
    const volumeNorm = Math.min(1, volume24h / 1e6)
    const addrNorm = Math.min(1, uniqueAddresses24h / 1000)
    const txNorm = Math.min(1, txCount24h / 5000)
    // older tokens are generally lower risk
    const ageNorm = tokenAgeDays > 365 ? 0 : Math.max(0, 1 - tokenAgeDays / 365)

    // weights
    const wVol = 0.3
    const wAddr = 0.25
    const wTx = 0.25
    const wAge = 0.2

    const rawScore =
      volumeNorm * wVol +
      addrNorm * wAddr +
      txNorm * wTx +
      ageNorm * wAge

    const score = Math.round(rawScore * 100)

    return {
      score,
      breakdown: {
        volumeFactor: Math.round(volumeNorm * 100),
        addressFactor: Math.round(addrNorm * 100),
        txFactor: Math.round(txNorm * 100),
        ageFactor: Math.round(ageNorm * 100),
      },
    }
  }
}
