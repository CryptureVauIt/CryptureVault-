import { z } from "zod"
import { PublicKey } from "@solana/web3.js"

/**
 * Configuration for DeepCore SOL analytics
 */
export const deepcoreSolConfigSchema = z.object({
  /** RPC endpoint URL */
  endpoint: z.string().url(),
  /** Commitment level for on-chain queries */
  commitment: z.enum(["processed", "confirmed", "finalized"]).default("confirmed"),
  /** Optional external price API URL */
  priceApiUrl: z.string().url().optional(),
})

export type DeepcoreSolConfig = z.infer<typeof deepcoreSolConfigSchema>

/**
 * Parameters for a SOL analytics request
 */
export const solQueryParamsSchema = z.object({
  /** Wallet address to analyze */
  walletAddress: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "invalid Base58 address"),
})

export type SolQueryParams = z.infer<typeof solQueryParamsSchema>

/**
 * SOL balance breakdown
 */
export interface SolBalance {
  lamports: number
  sol: number
}

/**
 * SOL price point
 */
export interface SolPrice {
  priceUsd: number
  timestamp: number
}

/**
 * Aggregate analytics result
 */
export interface SolAnalytics {
  balance: SolBalance
  stakeAccounts: number
  delegatedSol: number
  price?: SolPrice
}
