import { Connection, PublicKey, Transaction, ConfirmOptions } from "@solana/web3.js"
import { EventEmitter } from "events"
import { z } from "zod"

/**
 * Strongly typed, deterministic scheduler for Solana transactions
 * - Deterministic job IDs (time-seq, no randomness)
 * - Linear backoff with attempt-scaled delay
 * - Refreshes blockhash on retry when needed
 * - Uses modern confirmTransaction with blockhash context
 * - Safe listener lifecycle and graceful shutdown
 * - Status inspection APIs (list, get)
 */

// ---------- Zod Schemas ----------

const launchKitConfigSchema = z.object({
  endpoint: z.string().url(),
  commitment: z.enum(["processed", "confirmed", "finalized"]).default("confirmed"),
  payerKeypair: z.object({
    publicKey: z.instanceof(PublicKey),
    // expected to mutate and return the same tx instance with signatures
    signTransaction: z
      .function()
      .args(z.instanceof(Transaction))
      .returns(z.promise(z.instanceof(Transaction))),
  }),
  /** Deterministic linear backoff between retry attempts (ms) */
  retryDelayMs: z.number().int().nonnegative().default(500),
})
type LaunchKitConfig = z.infer<typeof launchKitConfigSchema>

const scheduleParamsSchema = z.object({
  tx: z.instanceof(Transaction),
  /** Execute when on-chain slot >= executeAtSlot */
  executeAtSlot: z.number().int().nonnegative(),
  confirmOptions: z
    .object({
      commitment: z.enum(["processed", "confirmed", "finalized"]).optional(),
      preflightCommitment: z.enum(["processed", "confirmed", "finalized"]).optional(),
      skipPreflight: z.boolean().optional(),
      /** Number of execution retries (send+confirm cycles) on failure */
      maxRetries: z.number().int().min(0).default(3),
    })
    .optional(),
})
type ScheduleParams = z.infer<typeof scheduleParamsSchema>

// ---------- Events & Job Types ----------

interface LaunchKitServiceEvents {
  scheduled: (jobId: string, slot: number) => void
  canceled: (jobId: string) => void
  executed: (jobId: string, signature: string) => void
  retry: (jobId: string, attempt: number) => void
  error: (jobId: string, err: Error) => void
  finalized: (jobId: string, signature: string) => void
}

type JobStatus = "scheduled" | "executing" | "finalized" | "error" | "canceled"

interface ScheduledJob {
  id: string
  executeAtSlot: number
  tx: Transaction
  listenerId: number
  confirmOptions: ConfirmOptions & { maxRetries: number }
  attempts: number
  retryDelayMs: number
  status: JobStatus
  /** latest blockhash tuple captured at send time for confirmTransaction */
  lastBlockhash?: { blockhash: string; lastValidBlockHeight: number }
  /** error recorded if terminal failure */
  lastError?: string
}

// ---------- Service Implementation ----------

export class LaunchKitService extends EventEmitter {
  private static seq = 0
  private connection: Connection
  private payer: LaunchKitConfig["payerKeypair"]
  private jobs = new Map<string, ScheduledJob>()
  private readonly retryDelayMs: number

  constructor(rawConfig: unknown) {
    super()
    const { endpoint, commitment, payerKeypair, retryDelayMs } =
      launchKitConfigSchema.parse(rawConfig)
    this.connection = new Connection(endpoint, { commitment })
    this.payer = payerKeypair
    this.retryDelayMs = retryDelayMs

    // graceful shutdown
    const shutdown = () => this.shutdown()
    process.once("SIGINT", shutdown)
    process.once("SIGTERM", shutdown)
    process.once("beforeExit", shutdown)
  }

  /** Schedule a transaction for when on-chain slot >= executeAtSlot */
  public async scheduleTransaction(raw: unknown): Promise<string> {
    const { tx, executeAtSlot, confirmOptions } = scheduleParamsSchema.parse(raw)

    const id = `${Date.now()}-${LaunchKitService.seq++}-${executeAtSlot}` // deterministic, no randomness
    const opts: ConfirmOptions & { maxRetries: number } = {
      commitment: this.connection.commitment,
      maxRetries: confirmOptions?.maxRetries ?? 3,
      ...confirmOptions,
    }

    const listenerId = await this.connection.onSlotChange(slotInfo => {
      if (slotInfo.slot >= executeAtSlot) {
        // fire once; execution method will remove this listener
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
      status: "scheduled",
    })

    this.emit("scheduled", id, executeAtSlot)
    return id
  }

  /** Cancel a scheduled job */
  public cancel(id: string): boolean {
    const job = this.jobs.get(id)
    if (!job) return false
    if (job.listenerId !== -1) {
      this.connection.removeSlotChangeListener(job.listenerId)
    }
    job.status = "canceled"
    this.jobs.delete(id)
    this.emit("canceled", id)
    return true
  }

  /** List all pending job IDs */
  public listScheduled(): string[] {
    return Array.from(this.jobs.values())
      .filter(j => j.status === "scheduled" || j.status === "executing")
      .map(j => j.id)
  }

  /** Get a snapshot of a job status */
  public getJob(id: string): Omit<ScheduledJob, "tx"> | undefined {
    const j = this.jobs.get(id)
    if (!j) return undefined
    const { tx: _omit, ...rest } = j
    return { ...rest }
  }

  /** Internal: attempt to execute a job, with deterministic linear backoff */
  private async attemptExecution(id: string): Promise<void> {
    const job = this.jobs.get(id)
    if (!job) return

    // Ensure we don't execute multiple times if multiple slot events arrive
    if (job.listenerId !== -1) {
      this.connection.removeSlotChangeListener(job.listenerId)
      job.listenerId = -1
    }

    // Guard against double invocation
    if (job.status !== "scheduled") return
    job.status = "executing"

    while (true) {
      job.attempts++
      try {
        const signature = await this.executeNow(job)
        this.emit("executed", id, signature)
        // In this basic flow, consider "executed" == "finalized" after confirmTransaction resolves
        job.status = "finalized"
        this.emit("finalized", id, signature)
        this.jobs.delete(id)
        return
      } catch (err) {
        job.lastError = (err as Error)?.message || String(err)
        if (job.attempts <= job.confirmOptions.maxRetries) {
          this.emit("retry", id, job.attempts)
          await this.delay(job.retryDelayMs * job.attempts) // linear backoff
          // refresh blockhash on each retry to avoid expiry
          continue
        } else {
          job.status = "error"
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

    // always refresh latest blockhash before each send attempt
    const latest = await this.connection.getLatestBlockhash({
      commitment: job.confirmOptions.commitment,
    })
    job.lastBlockhash = {
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    }
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
      job.status = job.status === "finalized" ? job.status : "canceled"
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

  // Typed `on` & `off`
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
