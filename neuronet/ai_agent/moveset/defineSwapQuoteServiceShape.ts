import { z } from "zod"

export const swapQuoteConfigSchema = z.object({
  apiUrl: z.string().url(),
})

export type SwapQuoteConfig = z.infer<typeof swapQuoteConfigSchema>

export const swapQuoteParamsSchema = z.object({
  inputMint: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "invalid Base58 mint"),
  outputMint: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "invalid Base58 mint"),
  amountIn: z.number().int().positive(),
  midPrice: z.number().positive(),
})

export type SwapQuoteParams = z.infer<typeof swapQuoteParamsSchema>

/** Raw quote returned by an external liquidity‐pool service */
export interface PoolQuote {
  poolId: string
  inputAmount: number
  outputAmount: number
  estimatedFee: number
}

/** Normalised, user‐facing quote */
export interface SwapQuote {
  bestPool: string
  amountOut: number
  fee: number
  slippagePercent: number
  timestamp: number
}
