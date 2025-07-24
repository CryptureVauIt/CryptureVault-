import { z, ZodError } from "zod"
import { PublicKey } from "@solana/web3.js"

/**
 * Zod schema for a valid Solana public key string → transforms into a PublicKey
 */
const PublicKeySchema = z
  .string()
  .min(32, "too short")
  .max(44, "too long")
  .refine((s) => {
    try {
      new PublicKey(s)
      return true
    } catch {
      return false
    }
  }, "invalid Solana public key")
  .transform((s) => new PublicKey(s))

/**
 * Input schema for watching transfer (“link”) events between two addresses
 */
export const watchLinkQuerySchema = z
  .object({
    /** Wallet address sending outgoing transfers */
    sourceAddress: PublicKeySchema,

    /** Wallet address receiving incoming transfers */
    destinationAddress: PublicKeySchema,

    /** Minimum lamports to consider a link event */
    minLamports: z.number().int().nonnegative().default(0),

    /** Cluster to connect to */
    network: z.enum(["mainnet", "devnet"]).default("mainnet"),
  })
  .describe("Parameters for filtering transfer events between two wallets")

export type WatchLinkQuery = z.infer<typeof watchLinkQuerySchema>

/**
 * Parse & validate raw input into a WatchLinkQuery
 * @throws ZodError containing detailed issues
 */
export function parseWatchLinkQuery(input: unknown): WatchLinkQuery {
  const parsed = watchLinkQuerySchema.safeParse(input)
  if (!parsed.success) {
    // rethrow full ZodError so callers can inspect `issues`
    throw parsed.error
  }
  return parsed.data
}

/**
 * Represents a transfer (link) event between two accounts
 */
export interface LinkEvent {
  signature: string
  slot: number
  source: PublicKey
  destination: PublicKey
  lamports: number
}
