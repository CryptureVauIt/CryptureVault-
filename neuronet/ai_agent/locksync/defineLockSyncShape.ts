import { z } from "zod"
import { PublicKey } from "@solana/web3.js"

/**
 * Configuration for LockSyncService
 */
export const lockSyncConfigSchema = z.object({
  endpoint: z.string().url(),
  commitment: z.enum(["processed", "confirmed", "finalized"]).default("confirmed"),
  payerKeypair: z.object({
    publicKey: z.instanceof(PublicKey),
    signTransaction: z.function()
      .args(z.instanceof(Object))
      .returns(z.promise(z.instanceof(Object))),
  }),
  lockProgramId: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
})

export type LockSyncConfig = z.infer<typeof lockSyncConfigSchema>

/**
 * Parameters to lock tokens
 */
export const lockParamsSchema = z.object({
  owner: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  mint: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  amount: z.number().int().positive(),
  lockDurationMs: z.number().int().positive(),
})

export type LockParams = z.infer<typeof lockParamsSchema>

/**
 * Parameters to unlock by lockId
 */
export const unlockParamsSchema = z.object({
  lockId: z.string().uuid(),
})

export type UnlockParams = z.infer<typeof unlockParamsSchema>

/**
 * Represents a lock record on-chain or in sync
 */
export interface LockRecord {
  lockId: string
  owner: string
  mint: string
  amount: number
  lockTimestamp: number
  unlockTimestamp: number
  status: "locked" | "unlocked" | "expired"
}
