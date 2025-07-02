import { z } from "zod"

/**
 * Configuration schema for DexPulseAgent
 */
export const dexPulseConfigSchema = z.object({
  /** Base URL of the DEX metrics API */
  apiUrl: z.string().url(),
  /** Commitment level for any on-chain queries (if used) */
  commitment: z.enum(["processed", "confirmed", "finalized"]).optional(),
})

export type DexPulseConfig = z.infer<typeof dexPulseConfigSchema>

/**
 * Parameters for requesting a trading pulse
 */
export const dexPulseQuerySchema = z.object({
  /** SPL token mint address for the input side */
  inputMint: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "invalid Base58 mint"),
  /** SPL token mint address for the output side */
  outputMint: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "invalid Base58 mint"),
  /** Lookback window in hours */
  windowHours: z.number().int().positive().default(24),
})

export type DexPulseQuery = z.infer<typeof dexPulseQuerySchema>

/**
 * Represents a single pulse data point
 */
export interface DexPulseData {
  /** Pair formatted as "INPUT/OUTPUT" */
  pair: string
  /** Total volume over the window (base units) */
  volume: number
  /** Spike score on a 0–100 scale */
  spikeScore: number
  /** Epoch ms when data was generated */
  timestamp: number
}
