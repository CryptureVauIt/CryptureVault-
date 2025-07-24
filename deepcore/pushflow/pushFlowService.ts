import { Connection, PublicKey, Commitment } from "@solana/web3.js"
import { EventEmitter } from "events"
import {
  pushFlowConfigSchema,
  PushFlowConfig,
  pushFlowParamsSchema,
  PushFlowParams,
  PushFlowEvent,
} from "./definePushFlowShape"

/**
 * PushFlowService listens to program logs and emits structured events
 */
export class PushFlowService extends EventEmitter {
  private connection: Connection
  private commitment: Commitment
  private listeners = new Map<string, number>()

  constructor(rawConfig: unknown) {
    super()
    const { endpoint, commitment }: PushFlowConfig = pushFlowConfigSchema.parse(rawConfig)
    this.connection = new Connection(endpoint, commitment)
    this.commitment = commitment
    process.once('beforeExit', () => this.stopAll())
  }

  /**
   * Start streaming instruction events for a program
   * Emits 'started' and 'flow' events, and 'error:<programId>' on errors
   */
  public start(rawParams: unknown): string {
    const { programId, instructionFilters }: PushFlowParams =
      pushFlowParamsSchema.parse(rawParams)
    const key = programId.toString()
    if (this.listeners.has(key)) {
      throw new Error(`Listener already running for program ${key}`)
    }
    const programKey = new PublicKey(programId)

    const listenerId = this.connection.onLogs(
      programKey,
      async (logInfo) => {
        try {
          const { signature, logs } = logInfo
          let slot = -1
          try {
            const status = await this.connection.getSignatureStatuses(
              [signature],
              { searchTransactionHistory: true }
            )
            slot = status.value[0]?.slot ?? -1
          } catch {
            // fallback if status unavailable
          }

          for (const line of logs) {
            const prefix = "Instruction: "
            const idx = line.indexOf(prefix)
            if (idx === -1) continue

            const raw = line.slice(idx + prefix.length)
            const [instr, ...rest] = raw.split(/\s+/, 2)
            if (instructionFilters && !instructionFilters.includes(instr)) {
              continue
            }

            let data: Record<string, unknown>
            const payload = rest.join(' ')
            try {
              data = JSON.parse(payload)
            } catch {
              data = { raw: payload }
            }

            const evt: PushFlowEvent = { signature, slot, instruction: instr, data }
            this.emit("flow", evt)
          }
        } catch (err) {
          this.emit(`error:${key}`, err)
        }
      },
      this.commitment
    )

    this.listeners.set(key, listenerId)
    this.emit("started", key)
    return key
  }

  /**
   * Stop streaming for a given program
   */
  public stop(programId: string): boolean {
    const listenerId = this.listeners.get(programId)
    if (!listenerId) return false
    this.connection.removeOnLogsListener(listenerId)
    this.listeners.delete(programId)
    this.emit("stopped", programId)
    return true
  }

  /**
   * Stop all active listeners
   */
  public stopAll(): void {
    for (const [programId, listenerId] of this.listeners) {
      this.connection.removeOnLogsListener(listenerId)
      this.emit("stopped", programId)
    }
    this.listeners.clear()
  }

  /**
   * Get list of active program listeners
   */
  public listActive(): string[] {
    return Array.from(this.listeners.keys())
  }
}
