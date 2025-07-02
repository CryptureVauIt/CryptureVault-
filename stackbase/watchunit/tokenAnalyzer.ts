import { z } from "zod"

/**
 * Schema for token metric analysis
 */
const analyzerSchema = z.object({
  priceHistory: z.array(
    z.object({
      timestamp: z.date(),
      price: z.number().positive(),
      volume: z.number().nonnegative(),
    })
  ).min(2),
  windowSize: z.number().int().positive().default(14),
})

export type AnalyzerInput = z.infer<typeof analyzerSchema>

/**
 * Parse and validate the analysis input
 */
export function parseAnalyzerInput(input: unknown): AnalyzerInput {
  const res = analyzerSchema.safeParse(input)
  if (!res.success) {
    const msg = res.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid analyzer input: ${msg}`)
  }
  return res.data
}

/**
 * Result metrics for a token
 */
export interface AnalysisResult {
  volatility: number
  averageVolume: number
  rsi: number
  movingAverage: number
}

/**
 * Compute simple moving average over last N prices
 */
function computeMovingAverage(prices: number[], window: number): number {
  const slice = prices.slice(-window)
  const sum = slice.reduce((a, b) => a + b, 0)
  return sum / slice.length
}

/**
 * Compute volatility as standard deviation of returns
 */
function computeVolatility(prices: number[]): number {
  const returns: number[] = []
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length
  return Math.sqrt(variance)
}

/**
 * Compute Relative Strength Index (RSI)
 */
function computeRSI(prices: number[], window: number): number {
  let gains = 0
  let losses = 0
  for (let i = prices.length - window; i < prices.length; i++) {
    const delta = prices[i] - prices[i - 1]
    if (delta > 0) gains += delta
    else losses += Math.abs(delta)
  }
  const avgGain = gains / window
  const avgLoss = losses / window
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

/**
 * Main analyzer: computes key metrics from historical data
 */
export function tokenAnalyzer(input: unknown): AnalysisResult {
  const { priceHistory, windowSize } = parseAnalyzerInput(input)
  const prices = priceHistory.map(p => p.price)
  const volumes = priceHistory.map(p => p.volume)

  const movingAverage = computeMovingAverage(prices, windowSize)
  const volatility = computeVolatility(prices)
  const rsi = computeRSI(prices, windowSize)
  const averageVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length

  return {
    volatility,
    averageVolume,
    rsi,
    movingAverage,
  }
}
