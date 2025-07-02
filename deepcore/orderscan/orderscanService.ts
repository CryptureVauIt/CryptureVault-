import { Connection, PublicKey, AccountInfo, ParsedAccountData } from "@solana/web3.js"
import { EventEmitter } from "events"
import { z } from "zod"

/**
 * Configuration schema for OrderScanService
 */
const orderScanConfigSchema = z.object({
  endpoint: z.string().url(),
  commitment: z.enum(["processed", "confirmed", "finalized"]).default("confirmed"),
  marketProgramId: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "invalid programId"),
})

export type OrderScanConfig = z.infer<typeof orderScanConfigSchema>

/**
 * Parameters for scanning a market's orderbook
 */
const scanParamsSchema = z.object({
  marketAddress: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "invalid market address"),
  pollIntervalMs: z.number().int().positive().default(5000),
})

export type ScanParams = z.infer<typeof scanParamsSchema>

/**
 * Represents a single open order on the market
 */
export interface OpenOrder {
  owner: string
  orderId: string
  price: number
  size: number
  side: "buy" | "sell"
  slot: number
}

/**
 * Service that polls or subscribes to open orders on a given market
 */
export class OrderScanService extends EventEmitter {
  private connection: Connection
  private commitment: string
  private programId: PublicKey
  private poller: NodeJS.Timeout | null = null
  private lastSeen: Record<string, OpenOrder> = {}

  constructor(rawConfig: unknown) {
    super()
    const { endpoint, commitment, marketProgramId } = orderScanConfigSchema.parse(rawConfig)
    this.connection = new Connection(endpoint, commitment)
    this.commitment = commitment
    this.programId = new PublicKey(marketProgramId)
  }

  /**
   * Start polling for open orders on a market
   */
  public start(rawParams: unknown): void {
    const { marketAddress, pollIntervalMs } = scanParamsSchema.parse(rawParams)
    const marketKey = new PublicKey(marketAddress)

    if (this.poller) return
    this.poller = setInterval(async () => {
      try {
        const orders = await this.fetchOpenOrders(marketKey)
        this.diffAndEmit(orders)
      } catch (err) {
        this.emit("error", err)
      }
    }, pollIntervalMs)

    // initial fetch
    this.fetchOpenOrders(marketKey)
      .then((orders) => this.diffAndEmit(orders))
      .catch((err) => this.emit("error", err))
  }

  /**
   * Stop polling
   */
  public stop(): void {
    if (this.poller) {
      clearInterval(this.poller)
      this.poller = null
    }
  }

  /**
   * Fetch all open orders for the market from on-chain accounts
   */
  private async fetchOpenOrders(marketKey: PublicKey): Promise<OpenOrder[]> {
    const resp = await this.connection.getParsedProgramAccounts(this.programId, {
      filters: [
        { memcmp: { offset: 0, bytes: marketKey.toBase58() } },
      ],
    })

    const orders: OpenOrder[] = []
    for (const { pubkey, account } of resp) {
      const info = (account.data as ParsedAccountData).parsed.info
      // Assuming info contains these fields; adjust offsets per actual program
      const owner = info.owner as string
      const orderId = pubkey.toBase58()
      const price = Number(info.price)
      const size = Number(info.size)
      const side = (info.side as string) === "sell" ? "sell" : "buy"
      orders.push({ owner, orderId, price, size, side, slot: account.lamports /* placeholder */ })
    }
    return orders
  }

  /**
   * Compare new orders to previously seen and emit events
   */
  private diffAndEmit(current: OpenOrder[]): void {
    const seenIds = new Set(Object.keys(this.lastSeen))
    const currentMap: Record<string, OpenOrder> = {}

    for (const o of current) {
      currentMap[o.orderId] = o
      if (!this.lastSeen[o.orderId]) {
        this.emit("orderCreated", o)
      } else {
        const prev = this.lastSeen[o.orderId]
        if (prev.size !== o.size || prev.price !== o.price) {
          this.emit("orderUpdated", o, prev)
        }
      }
      seenIds.delete(o.orderId)
    }

    // any IDs left in seenIds have been canceled
    for (const id of seenIds) {
      const o = this.lastSeen[id]
      this.emit("orderCancelled", o)
    }

    this.lastSeen = currentMap
    this.emit("snapshot", current)
  }
}
