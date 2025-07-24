import { Connection, PublicKey, Transaction, ConfirmOptions, BlockhashWithExpiryBlockHeight } from "@solana/web3.js"
import { EventEmitter } from "events"
import { z } from "zod"

// Configuration schema for LaunchKitService
const launchKitConfigSchema = z.object({
  endpoint: z.string().url(),
  commitment: z.enum(["processed", "confirmed", "finalized"]).default("confirmed"),
  payerKeypair: z.object({
    publicKey: z.instanceof(PublicKey),
    signTransaction: z
      .function()
      .args(z.instanceof(Transaction))
      .returns(z.promise(z.instanceof(Transaction))),
  }),
})

type LaunchKitConfig = z.infer<typeof launchKitConfigSchema>

// Parameters for scheduling a transaction
const scheduleParamsSchema = z.object({
  tx: z.instanceof(Transaction),
  executeAtSlot: z.number().int().nonnegative(),
  confirmOptions: z
    .object({
      commitment: z.enum(["processed", "confirmed", "finalized"]),
      preflightCommitment: z.enum(["processed", "confirmed", "finalized"]).optional(),
      skipPreflight: z.boolean().optional(),
      maxRetries: z.number().int().min(0).default(3),
    })
    .optional(),
})

type ScheduleParams = z.infer<typeof scheduleParamsSchema>

interface ScheduledJob {
  id: string
  executeAtSlot: number
  tx: Transaction
  listenerId: number
  confirmOptions: ConfirmOptions & { maxRetries: number }
  attempts: number
}

/**
 * LaunchKitService handles scheduling & execution of Solana transactions at target slots
 */
export class LaunchKitService extends EventEmitter {
  private connection: Connection
  private payer: LaunchKitConfig["payerKeypair"]
  private jobs = new Map<string, ScheduledJob>()

  constructor(rawConfig: unknown) {
    super()
    const { endpoint, commitment, payerKeypair } = launchKitConfigSchema.parse(rawConfig)
    this.connection = new Connection(endpoint, { commitment })
    this.payer = payerKeypair
    // cleanup on exit
    process.once('beforeExit', () => this.shutdown())
  }

  /**
   * Schedule a transaction for when on-chain slot >= executeAtSlot
   */
  public async scheduleTransaction(raw: unknown): Promise<string> {
    const { tx, executeAtSlot, confirmOptions } = scheduleParamsSchema.parse(raw)
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const options = {
      commitment: this.connection.commitment,
      maxRetries: confirmOptions?.maxRetries ?? 3,
      ...(confirmOptions ?? {}),
    }
    const listenerId = this.connection.onSlotChange(async slotInfo => {
      if (slotInfo.slot >= executeAtSlot) {
        await this.attemptExecution(id)
      }
    })

    this.jobs.set(id, { id, executeAtSlot, tx, listenerId, confirmOptions: options, attempts: 0 })
    this.emit('scheduled', { id, executeAtSlot })
    return id
  }

  /** Cancel a scheduled job */
  public async cancel(id: string): Promise<boolean> {
    const job = this.jobs.get(id)
    if (!job) return false
    this.connection.removeSlotChangeListener(job.listenerId)
    this.jobs.delete(id)
    this.emit('canceled', id)
    return true
  }

  /** List pending schedules */
  public listScheduled(): string[] {
    return [...this.jobs.keys()]
  }

  private async attemptExecution(id: string): Promise<void> {
    const job = this.jobs.get(id)
    if (!job) return
    job.attempts++
    try {
      await this.executeNow(job)
      this.emit('executed', { id })
    } catch (err) {
      if (job.attempts <= job.confirmOptions.maxRetries) {
        this.emit('retry', { id, attempt: job.attempts })
      } else {
        this.emit(`error:${id}`, err)
        this.cleanupJob(job)
      }
    }
  }

  private async executeNow(job: ScheduledJob): Promise<void> {
    const { tx, listenerId, confirmOptions } = job
    this.connection.removeSlotChangeListener(listenerId)
    this.jobs.delete(job.id)

    tx.feePayer = this.payer.publicKey
    const latest = await this.connection.getLatestBlockhash({ commitment: confirmOptions.commitment })
    tx.recentBlockhash = (latest as BlockhashWithExpiryBlockHeight).blockhash

    const signedTx = await this.payer.signTransaction(tx)
    const raw = signedTx.serialize()
    const signature = await this.connection.sendRawTransaction(raw, confirmOptions)
    await this.connection.confirmTransaction(signature, confirmOptions)

    this.emit('finalized', { id: job.id, signature })
  }

  /** Graceful shutdown: remove all listeners */
  private shutdown() {
    for (const job of this.jobs.values()) {
      this.connection.removeSlotChangeListener(job.listenerId)
    }
    this.jobs.clear()
  }

  /** Helper to cleanup after max retries */
  private cleanupJob(job: ScheduledJob) {
    this.connection.removeSlotChangeListener(job.listenerId)
    this.jobs.delete(job.id)
  }
}
