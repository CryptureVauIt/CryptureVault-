import { Connection, PublicKey, Transaction, ConfirmOptions, BlockhashWithExpiryBlockHeight } from "@solana/web3.js"
import { EventEmitter } from "events"
import { z } from "zod"

// --- Zod Schemas to validate config and parameters ---

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

// --- Typed Events ---

interface LaunchKitServiceEvents {
  scheduled: (jobId: string, slot: number) => void
  canceled: (jobId: string) => void
  executed: (jobId: string, signature: string) => void
  retry: (jobId: string, attempt: number) => void
  error: (jobId: string, err: Error) => void
  finalized: (jobId: string, signature: string) => void
}

// --- Internal Job Shape ---

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
    process.once("beforeExit", () => this.shutdown())
  }

  /**
   * Schedule a transaction for when on-chain slot >= executeAtSlot
   */
  public async scheduleTransaction(raw: unknown): Promise<string> {
    const { tx, executeAtSlot, confirmOptions } = scheduleParamsSchema.parse(raw)

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const opts: ConfirmOptions & { maxRetries: number } = {
      commitment: this.connection.commitment,
      maxRetries: confirmOptions?.maxRetries ?? 3,
      ...confirmOptions,
    }

    // Attach slot listener
    const listenerId = this.connection.onSlotChange(slotInfo => {
      if (slotInfo.slot >= executeAtSlot) {
        void this.attemptExecution(id)
      }
    })

    this.jobs.set(id, { id, executeAtSlot, tx, listenerId, confirmOptions: opts, attempts: 0 })
    this.emit("scheduled", id, executeAtSlot)
    return id
  }

  /** Cancel a scheduled job */
  public cancel(id: string): boolean {
    const job = this.jobs.get(id)
    if (!job) return false

    this.connection.removeSlotChangeListener(job.listenerId)
    this.jobs.delete(id)
    this.emit("canceled", id)
    return true
  }

  /** List all pending job IDs */
  public listScheduled(): string[] {
    return Array.from(this.jobs.keys())
  }

  /** Internal: attempt to execute a job, with retries */
  private async attemptExecution(id: string): Promise<void> {
    const job = this.jobs.get(id)
    if (!job) return

    job.attempts++
    try {
      const signature = await this.executeNow(job)
      this.emit("executed", id, signature)
    } catch (err) {
      if (job.attempts <= job.confirmOptions.maxRetries) {
        this.emit("retry", id, job.attempts)
      } else {
        this.emit("error", id, err as Error)
        this.cleanupJob(job)
      }
    }
  }

  /** Internal: sign, send, confirm the transaction immediately */
  private async executeNow(job: ScheduledJob): Promise<string> {
    // cleanup listener & job entry before execution
    this.connection.removeSlotChangeListener(job.listenerId)
    this.jobs.delete(job.id)

    // set fee payer & recent blockhash
    job.tx.feePayer = this.payer.publicKey
    const latest = await this.connection.getLatestBlockhash({ commitment: job.confirmOptions.commitment })
    job.tx.recentBlockhash = (latest as BlockhashWithExpiryBlockHeight).blockhash

    // sign & serialize
    const signed = await this.payer.signTransaction(job.tx)
    const raw = signed.serialize()

    // send & confirm
    const sig = await this.connection.sendRawTransaction(raw, job.confirmOptions)
    await this.connection.confirmTransaction(sig, job.confirmOptions)

    this.emit("finalized", job.id, sig)
    return sig
  }

  /** Remove all listeners & clear pending jobs */
  private shutdown(): void {
    for (const job of this.jobs.values()) {
      this.connection.removeSlotChangeListener(job.listenerId)
    }
    this.jobs.clear()
  }

  /** Clean up after exhausting retries */
  private cleanupJob(job: ScheduledJob): void {
    this.connection.removeSlotChangeListener(job.listenerId)
    this.jobs.delete(job.id)
  }

  // Override typed `on` & `off`
  public override on<K extends keyof LaunchKitServiceEvents>(
    event: K,
    listener: LaunchKitServiceEvents[K]
  ): this {
    return super.on(event, listener)
  }

  public override off<K extends keyof LaunchKitServiceEvents>(
    event: K,
    listener: LaunchKitServiceEvents[K]
  ): this {
    return super.off(event, listener)
  }
}
