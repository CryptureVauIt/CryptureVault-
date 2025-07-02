import { z } from "zod"

/**
 * Configuration for SolCheckerService
 */
export const solCheckerConfigSchema = z.object({
  /** RPC endpoint URL */
  endpoint: z.string().url(),
  /** Commitment level for on-chain queries */
  commitment: z.enum(["processed", "confirmed", "finalized"]).default("confirmed"),
  /** Minimum SOL balance threshold (in SOL) */
  minSolBalance: z.number().nonnegative().default(0),
  /** Flag to check for existence of any staking accounts */
  requireStakeAccount: z.boolean().default(false),
})

export type SolCheckerConfig = z.infer<typeof solCheckerConfigSchema>

/**
 * Parameters for a single check invocation
 */
export const solCheckerParamsSchema = z.object({
  /** Base58 wallet address to check */
  walletAddress: z
    .string()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "invalid Base58 address"),
})

export type SolCheckerParams = z.infer<typeof solCheckerParamsSchema>

/**
 * Result of SOL balance check
 */
export interface BalanceCheck {
  /** Lamports balance */
  lamports: number
  /** SOL balance */
  sol: number
  /** Passed minimum threshold */
  meetsMinBalance: boolean
}

/**
 * Result of stake account existence check
 */
export interface StakeCheck {
  /** Number of stake accounts */
  count: number
  /** Meets requirement (>=1) */
  hasStakeAccount: boolean
}

/**
 * Aggregated check result
 */
export interface SolCheckResult {
  balance: BalanceCheck
  stake?: StakeCheck
  timestamp: number
}
