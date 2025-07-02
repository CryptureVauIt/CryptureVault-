import { Connection, PublicKey } from "@solana/web3.js"
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
  private commitment: PushFlowConfig["commitment"]

  constructor(rawConfig: unknown) {
    super()
    const { endpoint, commitment } = pushFlowConfigSchema.parse(rawConfig)
    this.connection = new Connection(endpoint, commitment)
    this.commitment = commitment
  }

  /**
   * Start streaming instruction events for the given program
   */
  public async start(rawParams: unknown): Promise<void> {
    const { programId, instructionFilters }: PushFlowParams =
      pushFlowParamsSchema.parse(rawParams)
    const programKey = new PublicKey(programId)

    this.connection.onLogs(
      programKey,
      async (logInfo) => {
        const { signature, logs } = logInfo
        let slot = -1
        try {
          const status = await this.connection.getSignatureStatuses([signature], { searchTransactionHistory: true })
          slot = status.value[0]?.slot ?? -1
        } catch {
          // fallback if status unavailable
        }

        for (const line of logs) {
          // Example log format: "Program log: Instruction: transfer { ... }"
          const prefix = "Instruction: "
          const idx = line.indexOf(prefix)
          if (idx !== -1) {
            const raw = line.slice(idx + prefix.length)
            const [instr, payload] = raw.split(" ", 2)
            if (instructionFilters && !instructionFilters.includes(instr)) {
              continue
            }
            let data: Record<string, unknown> = {}
            try {
              data = JSON.parse(payload)
            } catch {
              // non-JSON payloads can be captured as raw
              data = { raw: payload }
            }
            const evt: PushFlowEvent = {
              signature,
              slot,
              instruction: instr,
              data,
            }
            this.emit("flow", evt)
          }
        }
      },
      this.commitment
    )
  }
}
