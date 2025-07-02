import { Connection, PublicKey, ParsedInstruction, ParsedTransactionWithMeta, ConfirmedSignatureInfo } from "@solana/web3.js"
import {
  parseWatchLinkQuery,
  WatchLinkQuery,
  LinkEvent,
  toPublicKey,
} from "./defineWatchLinkShape"

/**
 * Retrieves historical link (transfer) events from source to destination
 * within a specified signature limit.
 */
export async function retrieveLinkHistory(
  rawInput: unknown,
  maxSignatures = 1000
): Promise<LinkEvent[]> {
  const { sourceAddress, destinationAddress, minLamports, network } =
    parseWatchLinkQuery(rawInput)

  const endpoint =
    network === "devnet"
      ? "https://api.devnet.solana.com"
      : "https://api.mainnet-beta.solana.com"
  const connection = new Connection(endpoint, "confirmed")
  const sourceKey = toPublicKey(sourceAddress)
  const destKey = toPublicKey(destinationAddress)

  // fetch signatures involving the source account
  let signatures: ConfirmedSignatureInfo[] = []
  try {
    signatures = await connection.getConfirmedSignaturesForAddress2(
      sourceKey,
      { limit: maxSignatures }
    )
  } catch (err) {
    throw new Error(`Failed to fetch signatures: ${String(err)}`)
  }

  const events: LinkEvent[] = []

  // process each signature serially (could be parallelized with caution)
  for (const info of signatures) {
    if (info.err) {
      continue
    }
    let tx: ParsedTransactionWithMeta | null = null
    try {
      tx = await connection.getParsedTransaction(info.signature, "confirmed")
    } catch {
      continue
    }
    if (!tx || !tx.meta) {
      continue
    }

    // inspect each instruction for a matching transfer
    const instructions = tx.transaction.message.instructions as ParsedInstruction[]
    for (const ix of instructions) {
      if (
        ix.program === "system" &&
        ix.parsed?.type === "transfer" &&
        ix.parsed.info.source === sourceKey.toBase58() &&
        ix.parsed.info.destination === destKey.toBase58()
      ) {
        const lamports = Number(ix.parsed.info.lamports)
        if (lamports >= minLamports) {
          events.push({
            signature: info.signature,
            slot: tx.slot,
            source: ix.parsed.info.source,
            destination: ix.parsed.info.destination,
            lamports,
          })
        }
      }
    }
  }

  // sort events by slot descending (most recent first)
  return events.sort((a, b) => b.slot - a.slot)
}
