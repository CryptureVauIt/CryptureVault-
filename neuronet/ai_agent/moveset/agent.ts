import { z } from "zod"

/**
 * Configuration schema for Crypture Vault AI Wallet
 */
export const cryptureVaultConfigSchema = z.object({
  /**
   * Base58 wallet address to manage
   */
  walletAddress: z
    .string()
    .min(32, "address too short")
    .max(44, "address too long")
    .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "invalid Base58 address"),

  /**
   * RPC cluster to connect to
   */
  network: z.enum(["mainnet", "devnet"]).default("mainnet"),

  /**
   * Scan interval in milliseconds for balance polling
   */
  scanIntervalMs: z.number().int().positive().default(30000),

  /**
   * Threshold (in UI token units) above which alerts are emitted
   */
  alertThreshold: z.number().nonnegative().default(1000),

  /**
   * Model type for AI-based risk predictions
   */
  predictionModel: z.enum(["basic", "advanced"]).default("basic"),
})

export type CryptureVaultConfig = z.infer<typeof cryptureVaultConfigSchema>

/**
 * Validates and parses raw input into CryptureVaultConfig
 */
export function parseCryptureVaultConfig(input: unknown): CryptureVaultConfig {
  const result = cryptureVaultConfigSchema.safeParse(input)
  if (!result.success) {
    const msg = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ")
    throw new Error(`Invalid CryptureVault configuration: ${msg}`)
  }
  return result.data
}

/**
 * Represents a single token balance entry
 */
export interface TokenBalance {
  mint: string
  raw: number
  uiAmount: number
  decimals: number
}

/**
 * Event emitted when a balance update crosses the threshold
 */
export interface ThresholdAlert {
  mint: string
  uiAmount: number
  threshold: number
}
