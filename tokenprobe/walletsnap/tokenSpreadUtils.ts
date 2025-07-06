export interface TokenHolding {
  symbol: string
  amount: number
  priceUsd: number
}

export interface TokenDistribution {
  symbol: string
  valueUsd: number
  percentage: number
}


export function calculateTokenDistribution(
  holdings: TokenHolding[],
  options: { sort?: boolean; minUsd?: number } = {}
): TokenDistribution[] {
  const { sort = true, minUsd = 0 } = options

  // Compute value for each holding
  const distributions = holdings
    .map(({ symbol, amount, priceUsd }) => {
      const value = amount * priceUsd
      return {
        symbol,
        valueUsd: Math.round(value * 100) / 100,
        rawValue: value,
      }
    })
    // Filter out negligible values
    .filter(d => d.rawValue >= minUsd)

  // Compute total of filtered values
  const totalValue = distributions.reduce((sum, d) => sum + d.rawValue, 0)

  // If total is zero, return zeros for all original symbols (filtered or not)
  if (totalValue === 0) {
    return holdings.map(h => ({
      symbol: h.symbol,
      valueUsd: 0,
      percentage: 0,
    }))
  }

  // Calculate percentage and drop rawValue
  const result: TokenDistribution[] = distributions.map(d => ({
    symbol: d.symbol,
    valueUsd: d.valueUsd,
    percentage: Math.round((d.rawValue / totalValue) * 10000) / 100,
  }))

  // Optionally sort by descending percentage
  return sort
    ? result.sort((a, b) => b.percentage - a.percentage)
    : result
}
