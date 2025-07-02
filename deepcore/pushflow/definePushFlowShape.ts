import { z } from "zod"

/**
 * Configuration for PushFlowService
 */
export const pushFlowConfigSchema = z.object({
  /** Solana RPC endpoint URL */
  endpoint: z.string().url(),
  /** Commitment level for subscriptions */
  commitment: z.enum(["processed", "confirmed", "finalized"]).default("confirmed"),
})

export type PushFlowConfig = z.infer<typeof pushFlowConfigSchema>

/**
 * Parameters for subscribing to on-chain instruction flows
 */
export const pushFlowParamsSchema = z.object({
  /** Program ID to watch (base58) */
  programId: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "invalid programId"),
  /** Optional filter on instruction names (e.g. ["transfer", "swap"]) */
  instructionFilters: z.array(z.string().min(1)).optional(),
})

export type PushFlowParams = z.infer<typeof pushFlowParamsSchema>

/**
 * Emitted event for a matched instruction
 */
export interface PushFlowEvent {
  signature: string
  slot: number
  instruction: string
  data: Record<string, unknown>
}
