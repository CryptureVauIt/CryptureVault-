import { EventEmitter } from "events"
import { z } from "zod"
import {
  exEngineConfigSchema,
  ExEngineConfig,
  orderParamsSchema,
  OrderParams,
  Order,
  MatchResult,
  EngineStatus,
} from "./defineExEngineShape"

/**
 * Simple price‐time priority matching engine
 */
export class ExEngineService extends EventEmitter {
  private config: ExEngineConfig
  private bids: Order[] = []
  private asks: Order[] = []
  private totalMatches = 0

  constructor(rawConfig: unknown) {
    super()
    this.config = exEngineConfigSchema.parse(rawConfig)
  }

  /**
   * Submit a new order; will attempt matching immediately
   */
  public submitOrder(raw: unknown): void {
    const params: OrderParams = orderParamsSchema.parse(raw)
    const order: Order = { ...params }
    this.emit("orderSubmitted", order)

    const bookSide = order.side === "buy" ? this.bids : this.asks
    const oppositeSide = order.side === "buy" ? this.asks : this.bids

    // sort opposite side for matching
    oppositeSide.sort((a, b) =>
      order.side === "buy" ? a.price - b.price : b.price - a.price
    )

    let remainingQty = order.quantity

    // match while price conditions and remaining quantity
    for (let i = 0; i < oppositeSide.length && remainingQty > 0; ) {
      const bookOrder = oppositeSide[i]
      const priceMatch =
        order.side === "buy"
          ? order.price >= bookOrder.price
          : order.price <= bookOrder.price

      if (!priceMatch) break

      const matchQty = Math.min(remainingQty, bookOrder.quantity)
      const matchPrice = bookOrder.price
      const makerFee = matchQty * matchPrice * this.config.makerFeeRate
      const takerFee = matchQty * matchPrice * this.config.takerFeeRate

      const result: MatchResult = {
        makerOrderId: bookOrder.orderId,
        takerOrderId: order.orderId,
        price: matchPrice,
        quantity: matchQty,
        makerFee,
        takerFee,
      }
      this.emit("matched", result)
      this.totalMatches++

      // deduct quantities
      remainingQty -= matchQty
      bookOrder.quantity -= matchQty

      // remove fully filled book order
      if (bookOrder.quantity <= 0) {
        oppositeSide.splice(i, 1)
      } else {
        i++
      }
    }

    // if leftover, add to our book side
    if (remainingQty > 0) {
      const resting: Order = {
        orderId: order.orderId,
        price: order.price,
        quantity: remainingQty,
        side: order.side,
        timestamp: order.timestamp,
      }
      bookSide.push(resting)
      this.emit("orderRested", resting)
    }
  }

  /**
   * Cancel an existing order by ID
   */
  public cancelOrder(orderId: string): boolean {
    const removed = this.removeFromBook(this.bids, orderId) || this.removeFromBook(this.asks, orderId)
    if (removed) this.emit("orderCanceled", orderId)
    return removed
  }

  private removeFromBook(book: Order[], orderId: string): boolean {
    const idx = book.findIndex((o) => o.orderId === orderId)
    if (idx !== -1) {
      book.splice(idx, 1)
      return true
    }
    return false
  }

  /**
   * Get current status of the engine
   */
  public getStatus(): EngineStatus {
    return {
      bids: this.bids.length,
      asks: this.asks.length,
      totalMatches: this.totalMatches,
    }
  }
}
