import { z } from "zod"
import { PublicKey } from "@solana/web3.js"

/**
 * Input schema for watching link (transfer) events between two addresses
 */
export const watchLinkQuerySchema = z.object({
  /**
   * The sender wallet address to watch for outgoing transfers
   */
  sourceAddress: z
    .string()
    .min(32, "too short")
    .max(44, "too long")
    .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "invalid Base58"),

  /**
   * The recipient wallet address to filter incoming transfers
   */
  destinationAddress: z
    .string()
    .min(32, "too short")
    .max(44, "too long")
    .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "invalid Base58"),

  /**
   * Minimum lamports to consider a link event
   */
  minLamports: z.number().int().nonnegative().default(0),

  /**
   * Cluster to connect to
   */
  network: z.enum(["mainnet", "devnet"]).default("mainnet"),
})

export type WatchLinkQuery = z.infer<typeof watchLinkQuerySchema>

/**
 * Validates and parses raw input into a WatchLinkQuery
 */
export function parseWatchLinkQuery(input: unknown): WatchLinkQuery {
  const res = watchLinkQuerySchema.safeParse(input)
  if (!res.success) {
    const msg = res.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ")
    throw new Error(`Invalid watch link query: ${msg}`)
  }
  return res.data
}

/**
 * Represents a transfer (link) event between two accounts
 */
export interface LinkEvent {
  signature: string
  slot: number
  source: string
  destination: string
  lamports: number
}

/**
 * Helper to convert a base58 string into a PublicKey or throw
 */
export function toPublicKey(addr: string): PublicKey {
  try {
    return new PublicKey(addr)
  } catch {
    throw new Error(`Invalid public key: ${addr}`)
  }
}
