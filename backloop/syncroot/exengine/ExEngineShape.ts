import { z } from "zod"

/**
 * Configuration schema for the Execution Engine
 */
export const exEngineConfigSchema = z.object({
  /** Maximum number of orders kept in the book (per side) */
  maxOrderBookSize: z.number().int().positive().default(1000),
  /** Taker fee rate, e.g. 0.002 = 0.2% */
  takerFeeRate: z.number().min(0).max(1).default(0.002),
  /** Maker fee rate, e.g. -0.0001 = rebate of 0.01% */
  makerFeeRate: z.number().min(-1).max(1).default(-0.0001),
})

export type ExEngineConfig = z.infer<typeof exEngineConfigSchema>

/**
 * Parameters for submitting an order
 */
export const orderParamsSchema = z.object({
  /** Unique client order ID */
  orderId: z.string().min(1),
  /** Price in base precision units */
  price: z.number().positive(),
  /** Quantity in base precision units */
  quantity: z.number().positive(),
  /** "buy" or "sell" */
  side: z.enum(["buy", "sell"]),
  /** Timestamp ms */
  timestamp: z.number().int().nonnegative(),
})

export type OrderParams = z.infer<typeof orderParamsSchema>

/**
 * Represents an order in the book
 */
export interface Order {
  orderId: string
  price: number
  quantity: number
  side: "buy" | "sell"
  timestamp: number
}

/**
 * Result of a match execution
 */
export interface MatchResult {
  makerOrderId: string
  takerOrderId: string
  price: number
  quantity: number
  makerFee: number
  takerFee: number
}

/**
 * Engine health report
 */
export interface EngineStatus {
  bids: number
  asks: number
  totalMatches: number
}
