import { z } from "zod'
import { Connection, PublicKey, ParsedAccountData } from "@solana/web3.js"

/**
 * Schema for grouping token balances by a given property
 */
const groupByTokenSchema = z.object({
  walletAddress: z.string().min(32).max(44).regex(/^[1-9A-HJ-NP-Za-km-z]+$/),
  tokenMints: z.array(z.string().min(32).max(44).regex(/^[1-9A-HJ-NP-Za-km-z]+$/)).min(1),
  network: z.enum(['mainnet', 'devnet']).default('mainnet'),
  property: z.enum(['mint', 'decimals', 'uiAmount']).default('mint'),
})

export type GroupByTokenQuery = z.infer<typeof groupByTokenSchema>

/**
 * Validate and parse the raw input
 */
export function parseGroupByTokenQuery(input: unknown): GroupByTokenQuery {
  const result = groupByTokenSchema.safeParse(input)
  if (!result.success) {
    const msg = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid grouping query: ${msg}`)
  }
  return result.data
}

/**
 * Represents a single token balance
 */
interface TokenBalance {
  mint: string
  raw: number
  uiAmount: number
  decimals: number
}

/**
 * Grouping result type
 */
type GroupMap = Record<string, TokenBalance[]>

/**
 * Fetch all token balances for a given wallet and token list
 */
async function fetchBalances(
  connection: Connection,
  owner: PublicKey,
  mints: string[]
): Promise<TokenBalance[]> {
  const balances: TokenBalance[] = []
  for (const mint of mints) {
    const resp = await connection.getParsedTokenAccountsByOwner(owner, {
      mint: new PublicKey(mint),
    })
    let totalRaw = 0
    let decimals = 0
    for (const { account } of resp.value) {
      const info = (account.data as ParsedAccountData).parsed.info.tokenAmount
      totalRaw += parseInt(info.amount, 10)
      decimals = info.decimals
    }
    if (totalRaw > 0) {
      balances.push({
        mint,
        raw: totalRaw,
        uiAmount: totalRaw / 10 ** decimals,
        decimals,
      })
    }
  }
  return balances
}

/**
 * Core function: groups token balances by specified property
 */
export async function groupByToken(input: unknown): Promise<GroupMap> {
  const { walletAddress, tokenMints, network, property } = parseGroupByTokenQuery(input)
  const endpoint = network === 'devnet'
    ? 'https://api.devnet.solana.com'
    : 'https://api.mainnet-beta.solana.com'
  const conn = new Connection(endpoint, 'confirmed')
  const owner = new PublicKey(walletAddress)
  const balances = await fetchBalances(conn, owner, tokenMints)

  return balances.reduce<GroupMap>((acc, bal) => {
    const key = String((bal as any)[property])
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(bal)
    return acc
  }, {})
}
