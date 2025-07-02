import { z } from "zod"

/**
 * Configuration for connecting to Solana
 */
export const walletDetailsConfigSchema = z.object({
  endpoint: z.string().url(),
  commitment: z
    .enum(["processed", "confirmed", "finalized"])
    .default("confirmed"),
})

export type WalletDetailsConfig = z.infer<typeof walletDetailsConfigSchema>

/**
 * Parameters for fetching wallet details
 */
export const walletDetailsParamsSchema = z.object({
  /** Base58 wallet address */
  walletAddress: z
    .string()
    .min(32)
    .max(44)
    .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "invalid Base58 address"),
  /** Number of transactions to fetch */
  txLimit: z.number().int().positive().default(20),
  /** Whether to include NFT data */
  includeNFTs: z.boolean().default(false),
})

export type WalletDetailsParams = z.infer<
  typeof walletDetailsParamsSchema
>

/** A single SPL token balance */
export interface TokenBalance {
  mint: string
  raw: number
  uiAmount: number
  decimals: number
}

/** A single transaction summary */
export interface TransactionSummary {
  signature: string
  slot: number
  err: boolean
  memo?: string
  timestamp: number
}

/** A staking account overview */
export interface StakeAccountInfo {
  stakeAccount: string
  delegatedAmount: number
  delegatedUiAmount: number
  activating: boolean
  deactivating: boolean
}

/** A simple NFT representation */
export interface NFTInfo {
  mint: string
  name?: string
  uri?: string
}

/** Full wallet details */
export interface WalletDetails {
  balances: TokenBalance[]
  transactions: TransactionSummary[]
  stakes: StakeAccountInfo[]
  nfts?: NFTInfo[]
}
