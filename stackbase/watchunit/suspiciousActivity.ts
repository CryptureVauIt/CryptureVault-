import { z } from "zod"
import { Connection, PublicKey, ParsedAccountData } from "@solana/web3.js"

/**
 * Schema for suspicious activity detection
 */
const suspiciousSchema = z.object({
  walletAddress: z.string().min(32).max(44).regex(/^[1-9A-HJ-NP-Za-km-z]+$/),
  threshold: z.number().positive().default(1_000_000),  // raw units
  lookbackSlots: z.number().int().positive().default(5000),
  network: z.enum(['mainnet', 'devnet']).default('mainnet'),
})

export type SuspiciousQuery = z.infer<typeof suspiciousSchema>

/**
 * Parse and validate input
 */
export function parseSuspiciousQuery(input: unknown): SuspiciousQuery {
  const res = suspiciousSchema.safeParse(input)
  if (!res.success) {
    const msg = res.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid suspicious activity query: ${msg}`)
  }
  return res.data
}

/**
 * Suspicious transfer event
 */
export interface SuspiciousEvent {
  signature: string
  slot: number
  amount: number
  mint: string
}

/**
 * Scan recent token account activity for large transfers
 */
export async function suspiciousActivity(input: unknown): Promise<SuspiciousEvent[]> {
  const { walletAddress, threshold, lookbackSlots, network } = parseSuspiciousQuery(input)
  const endpoint = network === 'devnet'
    ? 'https://api.devnet.solana.com'
    : 'https://api.mainnet-beta.solana.com'
  const conn = new Connection(endpoint, 'confirmed')
  const owner = new PublicKey(walletAddress)
  const resp = await conn.getParsedTokenAccountsByOwner(owner, { programId: PublicKey.default })
  const events: SuspiciousEvent[] = []

  for (const { pubkey } of resp.value) {
    const hist = await conn.getConfirmedSignaturesForAddress2(pubkey, { limit: lookbackSlots })
    for (const info of hist) {
      if (info.err) continue
      const tx = await conn.getParsedTransaction(info.signature, 'confirmed')
      tx?.meta?.postTokenBalances?.forEach(balanceInfo => {
        const pre = tx.meta?.preTokenBalances?.find(p => p.accountIndex === balanceInfo.accountIndex)
        if (pre && balanceInfo.uiTokenAmount.amount && pre.uiTokenAmount.amount) {
          const delta = parseInt(balanceInfo.uiTokenAmount.amount, 10) - parseInt(pre.uiTokenAmount.amount, 10)
          if (Math.abs(delta) >= threshold) {
            events.push({
              signature: info.signature,
              slot: info.slot,
              amount: delta,
              mint: balanceInfo.mint,
            })
          }
        }
      })
    }
  }

  return events
}
