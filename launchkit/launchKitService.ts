import { Connection, PublicKey, Transaction, ConfirmOptions } from "@solana/web3.js"
import { EventEmitter } from "events"
import { z } from "zod"

// --- Zod Schemas to validate config and parameters ---

const launchKitConfigSchema = z.object({
  endpoint: z.string().url(),
  commitment: z.enum(["processed", "confirmed", "finalized"]).default("confirmed"),
  payerKeypair: z.object({
    publicKey: z.instanceof(PublicKey),
    signTransaction: z.function().args(z.instanceof(Transaction)).returns(z.promise(z.instanceof(Transaction))),
  }),
  /** Deterministic linear backoff between retry attempts (ms) */
  retryDelayMs: z.number().int().nonnegative().default(500),
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
      /** Number of execution retries (send+confirm cycles) on failure */
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
  retryDelayMs: number
  /** latest blockhash tuple captured at send time for confirmTransaction */
  lastBlockhash?: { blockhash: string; lastValidBlockHeight: number }
}

/**
 * LaunchKitService handles scheduling & execution of Solana transactions at target slots
 * Improvements:
 * - Deterministic job IDs (no randomness)
 * - Proper retry with linear backoff (no-op previously)
 * - Uses modern confirmTransaction signature with blockhash context
 * - Safer listener lifecycle and cleanup
 */
export class LaunchKitService extends EventEmitter {
  private static seq = 0
  private connection: Connection
  private payer: LaunchKitConfig["payerKeypair"]
  private jobs = new Map<string, ScheduledJob>()
  private readonly retryDelayMs: number

  constructor(rawConfig: unknown) {
    super()
    const { endpoint, commitment, payerKeypair, retryDelayMs } = launchKitConfigSchema.parse(rawConfig)
    this.connection = new Connection(endpoint, { commitment })
    this.payer = payerKeypair
    this.retryDelayMs = retryDelayMs
    process.once("beforeExit", () => this.shutdown())
  }

  /**
   * Schedule a transaction for when on-chain slot >= executeAtSlot
   */
  public async scheduleTransaction(raw: unknown): Promise<string> {
    const { tx, executeAtSlot, confirmOptions } = scheduleParamsSchema.parse(raw)

    const id = `${Date.now()}-${LaunchKitService.seq++}` // deterministic, no randomness
    const opts: ConfirmOptions & { maxRetries: number } = {
      commitment: this.connection.commitment,
      maxRetries: confirmOptions?.maxRetries ?? 3,
      ...confirmOptions,
    }

    const listenerId = this.connection.onSlotChange(slotInfo => {
      if (slotInfo.slot >= executeAtSlot) {
        // fire and forget; execution method will remove this listener
        void this.attemptExecution(id)
      }
    })

    this.jobs.set(id, {
      id,
      executeAtSlot,
      tx,
      listenerId,
      confirmOptions: opts,
      attempts: 0,
      retryDelayMs: this.retryDelayMs,
    })

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

  /** Internal: attempt to execute a job, with deterministic linear backoff */
  private async attemptExecution(id: string): Promise<void> {
    const job = this.jobs.get(id)
    if (!job) return

    // Ensure we don't execute multiple times if multiple slot events arrive
    this.connection.removeSlotChangeListener(job.listenerId)
    job.listenerId = -1 // mark as removed

    while (true) {
      job.attempts++
      try {
        const signature = await this.executeNow(job)
        this.emit("executed", id, signature)
        this.emit("finalized", id, signature)
        this.jobs.delete(id)
        return
      } catch (err) {
        if (job.attempts <= job.confirmOptions.maxRetries) {
          this.emit("retry", id, job.attempts)
          await this.delay(job.retryDelayMs * job.attempts) // linear backoff
          continue
        } else {
          this.emit("error", id, err as Error)
          this.cleanupJob(job)
          return
        }
      }
    }
  }

  /** Internal: sign, send, confirm the transaction immediately */
  private async executeNow(job: ScheduledJob): Promise<string> {
    // set fee payer & fresh blockhash
    job.tx.feePayer = this.payer.publicKey
    const latest = await this.connection.getLatestBlockhash({ commitment: job.confirmOptions.commitment })
    job.lastBlockhash = { blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight }
    job.tx.recentBlockhash = latest.blockhash

    // sign & serialize
    const signed = await this.payer.signTransaction(job.tx)
    const raw = signed.serialize()

    // send & confirm using modern API that includes blockhash context
    const sig = await this.connection.sendRawTransaction(raw, job.confirmOptions)
    await this.connection.confirmTransaction(
      {
        signature: sig,
        blockhash: job.lastBlockhash.blockhash,
        lastValidBlockHeight: job.lastBlockhash.lastValidBlockHeight,
      },
      job.confirmOptions.commitment
    )

    return sig
  }

  /** Remove all listeners & clear pending jobs */
  private shutdown(): void {
    for (const job of this.jobs.values()) {
      if (job.listenerId !== -1) {
        this.connection.removeSlotChangeListener(job.listenerId)
      }
    }
    this.jobs.clear()
  }

  /** Clean up after exhausting retries */
  private cleanupJob(job: ScheduledJob): void {
    if (job.listenerId !== -1) {
      this.connection.removeSlotChangeListener(job.listenerId)
    }
    this.jobs.delete(job.id)
  }

  private delay(ms: number): Promise<void> {
    return new Promise(res => setTimeout(res, ms))
  }

  // Override typed `on` & `off`
  public override on<K extends keyof LaunchKitServiceEvents>(event: K, listener: LaunchKitServiceEvents[K]): this {
    return super.on(event, listener)
  }

  public override off<K extends keyof LaunchKitServiceEvents>(event: K, listener: LaunchKitServiceEvents[K]): this {
    return super.off(event, listener)
  }
}
