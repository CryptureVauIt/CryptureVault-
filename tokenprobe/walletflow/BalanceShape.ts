import { z } from "zod"

/**
 * Schema for validating a balance query request
 */
export const balanceQuerySchema = z.object({
  /**
   * The Solana wallet address in Base58 format
   */
  walletAddress: z
    .string()
    .min(32, "Address too short")
    .max(44, "Address too long")
    .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "Invalid Base58 address"),

  /**
   * An array of SPL token mint addresses to fetch balances for
   */
  tokenMints: z
    .array(
      z
        .string()
        .min(32, "Mint address too short")
        .max(44, "Mint address too long")
        .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "Invalid Base58 mint")
    )
    .min(1, "At least one mint address is required"),

  /**
   * Additional options to control the behavior of the balance retrieval
   */
  options: z
    .object({
      /**
       * If true, zero balances will be included in the results
       */
      includeZeroBalances: z.boolean().default(false),
      /**
       * Filter out any balances below this threshold (raw token units)
       */
      minBalance: z.number().nonnegative().optional(),
      /**
       * Network to connect to (mainnet or devnet)
       */
      network: z.enum(["mainnet", "devnet"]).default("mainnet"),
      /**
       * Pagination settings for very large token lists (not usually needed)
       */
      pagination: z
        .object({
          page: z.number().int().positive().default(1),
          pageSize: z.number().int().positive().max(200).default(100),
        })
        .optional(),
    })
    .default({}),
})

/**
 * Type inferred from the schema
 */
export type BalanceQuery = z.infer<typeof balanceQuerySchema>

/**
 * Helper to validate input against the schema
 */
export function parseBalanceQuery(input: unknown): BalanceQuery {
  const parsed = balanceQuerySchema.safeParse(input)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ")
    throw new Error(`BalanceQuery validation failed: ${issues}`)
  }
  return parsed.data
}

/**
 * Example of how to construct a next‐page token string from pagination settings
 */
export function getPageToken(page: number, pageSize: number): string {
  return Buffer.from(`${page}:${pageSize}`).toString("base64")
}

/**
 * Example of decoding a page token back into numbers
 */
export function decodePageToken(token: string): { page: number; pageSize: number } {
  try {
    const [page, pageSize] = Buffer.from(token, "base64")
      .toString()
      .split(":")
      .map((n) => parseInt(n, 10))
    if (isNaN(page) || isNaN(pageSize)) {
      throw new Error("Invalid page token format")
    }
    return { page, pageSize }
  } catch {
    throw new Error("Failed to decode page token")
  }
}
