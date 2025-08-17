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
 * Represents a token balance entry for a specific SPL token mint.
 */
export interface TokenBalance {
  mint: string         // Mint address
  raw: number          // Raw balance in base units
  uiAmount: number     // Human-readable balance
  decimals: number     // Decimals for the token
}

/**
 * Fetches SPL token balances for a specific wallet and set of mints.
 *
 * Handles network selection, filters (minBalance, zero balances), and pagination.
 */
export async function retrieveTokenBalances(
  input: unknown
): Promise<TokenBalance[]> {
  // Validate and extract structured query params
  const { walletAddress, tokenMints, options } = parseBalanceQuery(input)

  // Select RPC endpoint based on requested network
  const endpoint =
    options.network === "devnet"
      ? "https://api.devnet.solana.com"
      : "https://api.mainnet-beta.solana.com"

  const connection = new Connection(endpoint, "confirmed")
  const ownerKey = new PublicKey(walletAddress)

  const results: TokenBalance[] = []

  // Loop through each requested mint address
  for (const mint of tokenMints) {
    let totalRaw = 0
    let decimals = 0

    try {
      // Get all parsed token accounts for the owner with the specified mint
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
      console.error(`Failed to fetch accounts for mint ${mint}:`, err)
      continue // Skip this mint on failure
    }

    // Skip zero balances if not explicitly requested
    if (
      totalRaw === 0 &&
      !options.includeZeroBalances
    ) {
      continue
    }

    // Skip if below specified minimum threshold
    if (
      options.minBalance !== undefined &&
      totalRaw < options.minBalance
    ) {
      continue
    }

    // Convert raw amount into human-readable units
    const uiAmount = totalRaw / Math.pow(10, decimals)

    results.push({
      mint,
      raw: totalRaw,
      uiAmount,
      decimals,
    })
  }

  // Apply client-side pagination if specified
  if (options.pagination) {
    const { page, pageSize } = options.pagination
    const start = (page - 1) * pageSize
    return results.slice(start, start + pageSize)
  }

  return results
}
