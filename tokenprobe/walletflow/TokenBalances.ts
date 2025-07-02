import {
  Connection,
  PublicKey,
  ParsedAccountData,
} from "@solana/web3.js"
import {
  parseBalanceQuery,
  BalanceQuery,
} from "./defineBalanceQueryShape"

/**
 * A single token balance entry
 */
export interface TokenBalance {
  mint: string
  raw: number
  uiAmount: number
  decimals: number
}

/**
 * Main function to retrieve balances for a set of SPL tokens
 */
export async function retrieveTokenBalances(
  input: unknown
): Promise<TokenBalance[]> {
  const { walletAddress, tokenMints, options } = parseBalanceQuery(input)

  // choose endpoint based on requested network
  const endpoint =
    options.network === "devnet"
      ? "https://api.devnet.solana.com"
      : "https://api.mainnet-beta.solana.com"
  const connection = new Connection(endpoint, "confirmed")

  const ownerKey = new PublicKey(walletAddress)
  const results: TokenBalance[] = []

  // for each token mint, fetch all token accounts and sum their balances
  for (const mint of tokenMints) {
    let totalRaw = 0
    let decimals = 0

    try {
      const resp = await connection.getParsedTokenAccountsByOwner(ownerKey, {
        mint: new PublicKey(mint),
      })
      for (const { account } of resp.value) {
        const data = account.data as ParsedAccountData
        const parsed = data.parsed.info
        const amount = parseInt(parsed.tokenAmount.amount, 10)
        decimals = parsed.tokenAmount.decimals
        totalRaw += amount
      }
    } catch (err) {
      console.error(`Failed to fetch accounts for ${mint}:`, err)
      continue
    }

    // apply minBalance filter
    if (
      totalRaw === 0 &&
      !options.includeZeroBalances
    ) {
      continue
    }
    if (
      options.minBalance !== undefined &&
      totalRaw < options.minBalance
    ) {
      continue
    }

    // convert to human-readable
    const uiAmount = totalRaw / Math.pow(10, decimals)
    results.push({ mint, raw: totalRaw, uiAmount, decimals })
  }

  // optional client‐side pagination
  if (options.pagination) {
    const { page, pageSize } = options.pagination
    const start = (page - 1) * pageSize
    return results.slice(start, start + pageSize)
  }

  return results
}
