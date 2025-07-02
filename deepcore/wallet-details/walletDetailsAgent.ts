import { EventEmitter } from "events"
import {
  WalletDetailsService
} from "./walletDetailsService"
import {
  WalletDetailsConfig,
  WalletDetailsParams,
  WalletDetails
} from "./defineWalletDetailsShape"

/**
 * Agent to orchestrate wallet detail retrieval and emit events
 */
export class WalletDetailsAgent extends EventEmitter {
  private service: WalletDetailsService

  constructor(config: WalletDetailsConfig) {
    super()
    this.service = new WalletDetailsService(config)
  }

  /**
   * Initiates retrieval of wallet details
   * Emits "start", "success", or "error"
   */
  public async fetchDetails(
    params: WalletDetailsParams
  ): Promise<WalletDetails> {
    this.emit("start", params.walletAddress)
    try {
      const details = await this.service.getWalletDetails(
        params
      )
      this.emit("success", details)
      return details
    } catch (err) {
      this.emit("error", err)
      throw err
    }
  }
}
