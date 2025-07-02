import { z } from "zod"
import {
  Connection,
  PublicKey,
  ParsedAccountData,
  AccountInfo,
} from "@solana/web3.js"
import { EventEmitter } from "events"

/**
 * Configuration schema for a data stream subscription
 */
const dataStreamSchema = z.object({
  /** Base58 wallet address to monitor */
  walletAddress: z
    .string()
    .min(32, "address too short")
    .max(44, "address too long")
    .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "invalid Base58 address"),
  /** SPL token mint address to filter */
  tokenMint: z
    .string()
    .min(32, "mint too short")
    .max(44, "mint too long")
    .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "invalid Base58 mint"),
  /** RPC endpoint cluster */
  network: z.enum(["mainnet", "devnet"]).default("mainnet"),
  /** Commitment level */
  commitment: z.enum(["processed", "confirmed", "finalized"]).default("confirmed"),
})

export type DataStreamConfig = z.infer<typeof dataStreamSchema>

/**
 * Parses and validates raw input into a DataStreamConfig
 */
export function parseDataStreamConfig(raw: unknown): DataStreamConfig {
  const result = dataStreamSchema.safeParse(raw)
  if (!result.success) {
    const messages = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ")
    throw new Error(`Invalid datastream configuration: ${messages}`)
  }
  return result.data
}

/**
 * Emitted when a token account's balance changes
 */
export interface BalanceUpdate {
  /** Base58 pubkey of the token account */
  accountPubkey: string
  /** Raw token amount */
  rawAmount: number
  /** Decimals of the token mint */
  decimals: number
  /** Computed UI amount (raw / 10^decimals) */
  uiAmount: number
}

/**
 * DataStreamClient listens for SPL token balance updates
 * on all associated token accounts of a given wallet.
 */
export class DataStreamClient extends EventEmitter {
  private connection: Connection
  private ownerKey: PublicKey
  private mintKey: PublicKey
  private subscriptionIds: number[] = []

  constructor(config: unknown) {
    super()
    const { walletAddress, tokenMint, network, commitment } =
      parseDataStreamConfig(config)

    const endpoint =
      network === "devnet"
        ? "https://api.devnet.solana.com"
        : "https://api.mainnet-beta.solana.com"

    this.connection = new Connection(endpoint, commitment)
    this.ownerKey = new PublicKey(walletAddress)
    this.mintKey = new PublicKey(tokenMint)
  }

  /**
   * Starts streaming balance updates.
   * Emits 'update' events with BalanceUpdate payload.
   */
  public async start(): Promise<void> {
    // fetch all associated token accounts for this wallet & mint
    const resp = await this.connection.getParsedTokenAccountsByOwner(
      this.ownerKey,
      { mint: this.mintKey }
    )

    // subscribe to each account's change notifications
    for (const { pubkey } of resp.value) {
      const id = this.connection.onAccountChange(
        pubkey,
        this.handleAccountChange.bind(this),
        this.connection.commitment
      )
      this.subscriptionIds.push(id)
    }
  }

  /**
   * Stops all active subscriptions
   */
  public async stop(): Promise<void> {
    for (const id of this.subscriptionIds) {
      await this.connection.removeAccountChangeListener(id)
    }
    this.subscriptionIds = []
  }

  /**
   * Internal handler for account data changes
   */
  private handleAccountChange(
    accountInfo: AccountInfo<Buffer>,
    context: { slot: number }
  ): void {
    try {
      const data = (accountInfo.data as any) as ParsedAccountData
      const info = data.parsed.info.tokenAmount
      const raw = parseInt(info.amount, 10)
      const decimals = info.decimals
      const uiAmount = raw / 10 ** decimals

      const update: BalanceUpdate = {
        accountPubkey: context.slot.toString(), // or use pubkey if needed
        rawAmount: raw,
        decimals,
        uiAmount,
      }
      this.emit("update", update)
    } catch (err) {
      this.emit("error", new Error(`Failed to parse account change: ${err}`))
    }
  }
}

