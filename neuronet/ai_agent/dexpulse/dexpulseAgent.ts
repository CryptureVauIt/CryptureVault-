import fetch from "node-fetch"
import { EventEmitter } from "events"
import {
  dexPulseConfigSchema,
  DexPulseConfig,
  dexPulseQuerySchema,
  DexPulseQuery,
  DexPulseData,
} from "./defineDexpulseShape"

/**
 * DexPulseAgent fetches trading volume spikes for a given token pair
 */
export class DexPulseAgent extends EventEmitter {
  private readonly apiUrl: string

  constructor(rawConfig: unknown) {
    super()
    const { apiUrl } = dexPulseConfigSchema.parse(rawConfig)
    this.apiUrl = apiUrl.replace(/\/+$/, "")
  }

  /**
   * Fetches the pulse for a given input/output mint and time window
   */
  public async getPulse(rawQuery: unknown): Promise<DexPulseData> {
    const { inputMint, outputMint, windowHours } = dexPulseQuerySchema.parse(rawQuery)
    const url = `${this.apiUrl}/pulse?in=${inputMint}&out=${outputMint}&hrs=${windowHours}`

    try {
      const res = await fetch(url, { method: "GET", timeout: 10_000 })
      if (!res.ok) {
        throw new Error(`API error ${res.status}: ${res.statusText}`)
      }
      const data = (await res.json()) as Partial<DexPulseData>
      this.validateResponse(data, inputMint, outputMint)
      const result: DexPulseData = {
        pair: `${inputMint}/${outputMint}`,
        volume: data.volume!,
        spikeScore: data.spikeScore!,
        timestamp: data.timestamp!,
      }
      this.emit("pulseFetched", result)
      return result
    } catch (err) {
      this.emit("error", err)
      throw err
    }
  }

  /** Ensures the API response contains required fields */
  private validateResponse(
    data: Partial<DexPulseData>,
    inMint: string,
    outMint: string
  ): void {
    if (
      typeof data.volume !== "number" ||
      typeof data.spikeScore !== "number" ||
      typeof data.timestamp !== "number"
    ) {
      throw new Error(
        `Invalid response for ${inMint}/${outMint}: missing volume, spikeScore, or timestamp`
      )
    }
  }
}
