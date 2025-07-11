import {
  Connection,
  PublicKey,
  ParsedInstruction,
  ParsedTransactionWithMeta,
  ConfirmedSignatureInfo,
} from "@solana/web3.js"
import PQueue from "p-queue"
import {
  parseWatchLinkQuery,
  WatchLinkQuery,
  LinkEvent,
  toPublicKey,
} from "./defineWatchLinkShape"

export interface RetrieveLinkHistoryOptions {
  /** Maximum number of signatures to scan (default: 1000) */
  maxSignatures?: number
  /** How many transactions to fetch in parallel (default: 10) */
  concurrency?: number
  /** Whether to include SPL token transfers (default: false) */
  includeSplTransfers?: boolean
  /** RPC commitment level (default: "confirmed") */
  commitment?: "finalized" | "confirmed" | "processed"
}

/**
 * Scans on-chain history between two addresses, reporting link (transfer) events.
 *
 * - Paginates through up to `maxSignatures` confirmations
 * - Optionally includes SPL token transfers as well as native SOL transfers
 * - Parses in parallel with controlled concurrency
 * - Returns events sorted newest→oldest
 *
 * @param rawInput   Raw query, parsed via `parseWatchLinkQuery`
 * @param opts       Optional settings to control scan behavior
 * @returns          Array of matching LinkEvent objects
 * @throws           Error on invalid input or RPC failures
 */
export async function retrieveLinkHistory(
  rawInput: unknown,
  opts: RetrieveLinkHistoryOptions = {}
): Promise<LinkEvent[]> {
  const {
    sourceAddress,
    destinationAddress,
    minLamports,
    network,
  } = parseWatchLinkQuery(rawInput)

  const {
    maxSignatures = 1000,
    concurrency = 10,
    includeSplTransfers = false,
    commitment = "confirmed",
  } = opts

  if (maxSignatures <= 0) {
    throw new RangeError(`maxSignatures must be > 0, got ${maxSignatures}`)
  }

  const endpoint =
    network === "devnet"
      ? "https://api.devnet.solana.com"
      : "https://api.mainnet-beta.solana.com"
  const connection = new Connection(endpoint, commitment)

  const sourceKey = toPublicKey(sourceAddress)
  const destKey = toPublicKey(destinationAddress)

  // 1. Fetch signatures in pages of 'limit' until maxSignatures reached
  let allSignatures: ConfirmedSignatureInfo[] = []
  let before: string | undefined = undefined
  const pageSize = Math.min(1000, maxSignatures)
  while (allSignatures.length < maxSignatures) {
    const batch = await connection.getConfirmedSignaturesForAddress2(
      sourceKey,
      { limit: pageSize, before }
    )
    if (batch.length === 0) break
    allSignatures.push(...batch)
    before = batch[batch.length - 1].signature
    if (batch.length < pageSize) break
  }
  allSignatures = allSignatures.slice(0, maxSignatures)

  // 2. Process each signature in parallel, limited by concurrency
  const queue = new PQueue({ concurrency })
  const events: LinkEvent[] = []

  await Promise.all(
    allSignatures.map(sigInfo =>
      queue.add(async () => {
        if (sigInfo.err) return

        let tx: ParsedTransactionWithMeta | null
        try {
          tx = await connection.getParsedTransaction(sigInfo.signature, commitment)
        } catch {
          return
        }
        if (!tx?.meta) return

        const instrs = tx.transaction.message.instructions as ParsedInstruction[]
        for (const ix of instrs) {
          // native SOL transfer
          if (
            ix.program === "system" &&
            ix.parsed?.type === "transfer" &&
            ix.parsed.info.source === sourceKey.toBase58() &&
            ix.parsed.info.destination === destKey.toBase58()
          ) {
            const lamports = Number(ix.parsed.info.lamports)
            if (lamports >= minLamports) {
              events.push({
                signature: sigInfo.signature,
                slot: tx.slot,
                timestamp: tx.blockTime ?? 0,
                source: ix.parsed.info.source,
                destination: ix.parsed.info.destination,
                lamports,
                tokenMint: "SOL",
              })
            }
          }
          // optional SPL token transfer
          else if (
            includeSplTransfers &&
            ix.program === "spl-token" &&
            ix.parsed?.type === "transfer" &&
            ix.parsed.info.source === sourceKey.toBase58() &&
            ix.parsed.info.destination === destKey.toBase58()
          ) {
            const amount = Number(ix.parsed.info.amount)
            const mint = ix.parsed.info.mint
            // convert decimals if needed (assumes 9 decimals)
            const lamports = amount
            if (lamports >= minLamports) {
              events.push({
                signature: sigInfo.signature,
                slot: tx.slot,
                timestamp: tx.blockTime ?? 0,
                source: ix.parsed.info.source,
                destination: ix.parsed.info.destination,
                lamports,
                tokenMint: mint,
              })
            }
          }
        }
      })
    )
  )

  // 3. Sort descending by slot (then timestamp for tie-break)
  return events.sort((a, b) => {
    if (b.slot !== a.slot) return b.slot - a.slot
    return (b.timestamp ?? 0) - (a.timestamp ?? 0)
  })
}
