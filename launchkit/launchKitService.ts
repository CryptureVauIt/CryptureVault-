import { Connection, PublicKey, Transaction, ConfirmOptions } from "@solana/web3.js"
import { EventEmitter } from "events"
import { z } from "zod"

/** Configuration schema for LaunchKitService */
const launchKitConfigSchema = z.object({
  endpoint: z.string().url(),
  commitment: z.enum(["processed", "confirmed", "finalized"]).default("confirmed"),
  payerKeypair: z.object({
    publicKey: z.instanceof(PublicKey),
    signTransaction: z.function().args(z.instanceof(Transaction)).returns(z.promise(z.instanceof(Transaction))),
  }),
})

export type LaunchKitConfig = z.infer<typeof launchKitConfigSchema>

/** Parameters for scheduling a transaction at a target slot */
const scheduleParamsSchema = z.object({
  tx: z.instanceof(Transaction),
  executeAtSlot: z.number().int().nonnegative(),
})

export type ScheduleParams = z.infer<typeof scheduleParamsSchema>

/** Represents a scheduled job */
interface ScheduledJob {
  id: string
  executeAtSlot: number
  tx: Transaction
  listenerId: number
}

/**
 * LaunchKitService:
 * Schedules and executes transactions at a specific Solana slot.
 */
export class LaunchKitService extends EventEmitter {
  private connection: Connection
  private commitment: ConfirmOptions
  private payer: LaunchKitConfig["payerKeypair"]
  private jobs: Map<string, ScheduledJob> = new Map()

  constructor(rawConfig: unknown) {
    super()
    const { endpoint, commitment, payerKeypair } = launchKitConfigSchema.parse(rawConfig)
    this.connection = new Connection(endpoint, commitment)
    this.commitment = commitment
    this.payer = payerKeypair
  }

  /**
   * Schedule a transaction to be sent when on-chain slot >= executeAtSlot
   * Emits "scheduled", "executed", "canceled", or "error:<id>"
   */
  public async scheduleTransaction(raw: unknown): Promise<string> {
    const { tx, executeAtSlot } = scheduleParamsSchema.parse(raw)
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const listenerId = this.connection.onSlotChange(async (slotInfo) => {
      if (slotInfo.slot >= executeAtSlot) {
        try {
          await this.executeNow(id)
        } catch (err) {
          this.emit(`error:${id}`, err)
        }
      }
    })
    this.jobs.set(id, { id, executeAtSlot, tx, listenerId })
    this.emit("scheduled", { id, executeAtSlot })
    return id
  }

  /** Cancel a scheduled transaction by its id */
  public async cancel(id: string): Promise<boolean> {
    const job = this.jobs.get(id)
    if (!job) return false
    await this.connection.removeSlotChangeListener(job.listenerId)
    this.jobs.delete(id)
    this.emit("canceled", id)
    return true
  }

  /** Immediately execute a scheduled transaction and clean up */
  private async executeNow(id: string): Promise<void> {
    const job = this.jobs.get(id)
    if (!job) return
    const { tx, listenerId } = job
    // stop listening
    await this.connection.removeSlotChangeListener(listenerId)
    this.jobs.delete(id)

    // prepare and send
    tx.feePayer = this.payer.publicKey
    const { blockhash } = await this.connection.getLatestBlockhash(this.commitment)
    tx.recentBlockhash = blockhash
    const signed = await this.payer.signTransaction(tx)
    const sig = await this.connection.sendRawTransaction(signed.serialize())
    this.emit("executed", { id, signature: sig })
  }

  /** List all pending scheduled job IDs */
  public listScheduled(): string[] {
    return Array.from(this.jobs.keys())
  }
}
