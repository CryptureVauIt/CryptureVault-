import { EventEmitter } from "events"
import {
  DeepcoreSolService
} from "./deepcoreSolService"
import {
  DeepcoreSolConfig,
  SolQueryParams,
  SolAnalytics
} from "./defineDeepcoreSolShape"

/**
 * Agent orchestrating DeepCore SOL analytics
 */
export class DeepcoreSolAgent extends EventEmitter {
  private service: DeepcoreSolService

  constructor(config: DeepcoreSolConfig) {
    super()
    this.service = new DeepcoreSolService(config)
  }

  /**
   * Run analytics for the given wallet
   * Emits "start", "result", or "error"
   */
  public async analyze(params: SolQueryParams): Promise<SolAnalytics> {
    this.emit("start", params.walletAddress)
    try {
      const analytics = await this.service.getAnalytics(params)
      this.emit("result", analytics)
      return analytics
    } catch (err) {
      this.emit("error", err)
      throw err
    }
  }
}

