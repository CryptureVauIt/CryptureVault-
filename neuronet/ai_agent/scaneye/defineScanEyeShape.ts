import { z } from "zod"

/**
 * Types of on‐chain events that ScanEye supports
 */
export const EventType = z.enum([
  "transfer",
  "mint",
  "burn",
  "swap",
  "approval",
])

export type EventType = z.infer<typeof EventType>

/**
 * Query schema for configuring a ScanEye subscription
 */
export const scanEyeQuerySchema = z.object({
  /**
   * One or more wallet addresses to monitor
   */
  walletAddresses: z
    .array(z.string().min(32).max(44).regex(/^[1-9A-HJ-NP-Za-km-z]+$/))
    .min(1),
  /**
   * Event types to watch (transfer, mint, burn, swap, approval)
   */
  eventTypes: z
    .array(EventType)
    .min(1)
    .default(["transfer"]),
  /**
   * Minimum lamports or token units threshold for reporting
   */
  threshold: z
    .number()
    .int()
    .nonnegative()
    .default(0),
  /**
   * RPC cluster to connect to
   */
  network: z.enum(["mainnet", "devnet"]).default("mainnet"),
  /**
   * Commitment level for subscriptions
   */
  commitment: z.enum(["processed", "confirmed", "finalized"]).default("confirmed"),
})

export type ScanEyeQuery = z.infer<typeof scanEyeQuerySchema>

/**
 * Represents a single detected on‐chain event
 */
export interface ScanEyeEvent {
  signature: string
  slot: number
  wallet: string
  eventType: EventType
  parsedInfo: Record<string, unknown>
}

/**
 * Parses and validates raw input into a ScanEyeQuery
 */
export function parseScanEyeQuery(input: unknown): ScanEyeQuery {
  const result = scanEyeQuerySchema.safeParse(input)
  if (!result.success) {
    const msgs = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ")
    throw new Error(`Invalid ScanEye query: ${msgs}`)
  }
  return result.data
}
