import { Connection, PublicKey, Transaction, SystemProgram, ConfirmOptions } from "@solana/web3.js"
import { EventEmitter } from "events"
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { v4 as uuidv4 } from "uuid"
import {
  lockSyncConfigSchema,
  LockSyncConfig,
  lockParamsSchema,
  unlockParamsSchema,
  LockParams,
  UnlockParams,
  LockRecord,
} from "./defineLockSyncShape"

/**
 * Service to lock and unlock SPL tokens, and synchronize lock status
 */
export class LockSyncService extends EventEmitter {
  private connection: Connection
  private payer: LockSyncConfig["payerKeypair"]
  private commitment: ConfirmOptions
  private programId: PublicKey

  constructor(rawConfig: unknown) {
    super()
    const cfg = lockSyncConfigSchema.parse(rawConfig)
    this.connection = new Connection(cfg.endpoint, cfg.commitment)
    this.commitment = cfg.commitment
    this.payer = cfg.payerKeypair
    this.programId = new PublicKey(cfg.lockProgramId)
  }

  /**
   * Locks tokens by sending a custom instruction to the lock program
   */
  public async lockTokens(raw: unknown): Promise<LockRecord> {
    const params = lockParamsSchema.parse(raw)
    const lockId = uuidv4()
    const ownerKey = new PublicKey(params.owner)
    const mintKey = new PublicKey(params.mint)
    const token = new Token(this.connection, mintKey, TOKEN_PROGRAM_ID, this.payer)
    const fromAcc = await token.getOrCreateAssociatedAccountInfo(this.payer.publicKey)
    const lockAcc = await token.getOrCreateAssociatedAccountInfo(ownerKey)

    // Build custom lock instruction (placeholder data layout)
    const data = Buffer.from(
      JSON.stringify({ lockId, amount: params.amount, duration: params.lockDurationMs })
    )
    const instruction = {
      keys: [
        { pubkey: fromAcc.address, isSigner: false, isWritable: true },
        { pubkey: lockAcc.address, isSigner: false, isWritable: true },
        { pubkey: ownerKey, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data,
    }

    const tx = new Transaction().add(instruction)
    const sig = await this.signAndSend(tx)

    const now = Date.now()
    const record: LockRecord = {
      lockId,
      owner: params.owner,
      mint: params.mint,
      amount: params.amount,
      lockTimestamp: now,
      unlockTimestamp: now + params.lockDurationMs,
      status: "locked",
    }

    this.emit("locked", record, sig)
    return record
  }

  /**
   * Unlocks tokens by lockId
   */
  public async unlockTokens(raw: unknown): Promise<void> {
    const { lockId } = unlockParamsSchema.parse(raw)
    const data = Buffer.from(JSON.stringify({ lockId }))
    const instruction = {
      keys: [],
      programId: this.programId,
      data,
    }
    const tx = new Transaction().add(instruction)
    const sig = await this.signAndSend(tx)
    this.emit("unlocked", lockId, sig)
  }

  /**
   * Queries on-chain account for lock record (stubbed)
   */
  public async queryLockStatus(lockId: string): Promise<LockRecord> {
    // Placeholder: in real implementation, fetch account data for lockId
    // Here we emit an event indicating a query occurred
    this.emit("queried", lockId)
    throw new Error("queryLockStatus not implemented")
  }

  /**
   * Periodically synchronize lock status, emitting 'sync' events
   */
  public startSynchronization(intervalMs: number): void {
    const timer = setInterval(async () => {
      try {
        // Placeholder: fetch all pending locks and emit updates
        this.emit("sync", [])
      } catch (err) {
        this.emit("error", err)
      }
    }, intervalMs)
    this.emit("sync-started", intervalMs)
    // Allow stop logic via returned token or similar in real use
  }

  /**
   * Internal helper to sign, send, and confirm a transaction
   */
  private async signAndSend(tx: Transaction): Promise<string> {
    tx.feePayer = this.payer.publicKey
    const { blockhash } = await this.connection.getLatestBlockhash(this.commitment)
    tx.recentBlockhash = blockhash
    const signed = await this.payer.signTransaction(tx)
    const sig = await this.connection.sendRawTransaction(signed.serialize())
    await this.connection.confirmTransaction(sig, this.commitment)
    return sig
  }
}
