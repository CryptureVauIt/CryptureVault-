import { z } from "zod"

/**
 * Strict URL schema limited to http/https endpoints
 */
const httpUrl = z
  .string()
  .url()
  .refine(u => /^https?:\/\//i.test(u), "endpoint must start with http:// or https://")

/**
 * Configuration for PushFlowService with sane defaults and bounds
 */
export const pushFlowConfigSchema = z
  .object({
    /** Solana RPC endpoint URL (http/https only) */
    endpoint: httpUrl,
    /** Commitment level for subscriptions */
    commitment: z.enum(["processed", "confirmed", "finalized"]).default("confirmed"),
    /** Optional WebSocket endpoint; if omitted, derive from http(s) endpoint */
    wsEndpoint: z
      .string()
      .url()
      .refine(u => /^wss?:\/\//i.test(u), "wsEndpoint must start with ws:// or wss://")
      .optional(),
    /** Max simultaneous subscriptions */
    maxSubscriptions: z.number().int().positive().max(10_000).default(1024),
    /** Reconnect backoff in milliseconds (base); actual backoff is deterministic quadratic on retries */
    reconnectBackoffMs: z.number().int().positive().max(60_000).default(1_000),
    /** Maximum reconnect backoff clamp in ms */
    maxReconnectBackoffMs: z.number().int().positive().max(300_000).default(30_000),
    /** Timeout for initial connection handshake in ms */
    connectTimeoutMs: z.number().int().positive().max(120_000).default(10_000),
    /** Queue size for pending events per subscription before dropping oldest */
    maxEventQueue: z.number().int().positive().max(100_000).default(5_000),
    /** Whether to include inner instructions */
    includeInner: z.boolean().default(true),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.wsEndpoint) {
      // If both endpoints provided, ensure they target the same host when obvious
      try {
        const h1 = new URL(cfg.endpoint).host
        const h2 = new URL(cfg.wsEndpoint).host
        if (h1 && h2 && h1 !== h2) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["wsEndpoint"],
            message: "wsEndpoint host should match endpoint host",
          })
        }
      } catch {
        // ignore URL parsing errors; covered by the base validators
      }
    }
  })

export type PushFlowConfig = z.infer<typeof pushFlowConfigSchema>

/** Public key string in base58 (32-44 chars, no 0OIl) */
export const base58Pubkey = z
  .string()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "invalid base58 public key")

/**
 * Parameters for subscribing to on-chain instruction flows
 */
export const pushFlowParamsSchema = z
  .object({
    /** Program IDs to watch (one or many) */
    programIds: z
      .array(base58Pubkey)
      .nonempty("at least one programId is required")
      .transform(arr => Array.from(new Set(arr))), // dedupe
    /** Optional filter on instruction names (e.g. ["transfer", "swap"]) */
    instructionFilters: z
      .array(z.string().min(1).max(128))
      .transform(arr => Array.from(new Set(arr)))
      .optional(),
    /** Optional account keys to filter by (any match) */
    accountFilters: z.array(base58Pubkey).transform(a => Array.from(new Set(a))).optional(),
    /** Start at or after this slot */
    fromSlot: z.number().int().nonnegative().optional(),
    /** Exclusive upper bound slot */
    toSlot: z.number().int().positive().optional(),
  })
  .superRefine((params, ctx) => {
    if (params.fromSlot && params.toSlot && params.fromSlot >= params.toSlot) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toSlot"],
        message: "toSlot must be greater than fromSlot",
      })
    }
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
  programId: string
  accounts: string[]
  isInner: boolean
}

/**
 * Helpers
 */

/** Validate and normalize config; derives wsEndpoint if missing */
export function validateConfig(input: unknown): PushFlowConfig & { wsEndpoint: string } {
  const cfg = pushFlowConfigSchema.parse(input)
  const wsEndpoint =
    cfg.wsEndpoint ?? deriveWsEndpoint(cfg.endpoint)
  return { ...cfg, wsEndpoint }
}

/** Validate subscription params */
export function validateParams(input: unknown): PushFlowParams {
  return pushFlowParamsSchema.parse(input)
}

/** Derive ws(s) URL from http(s) URL */
export function deriveWsEndpoint(httpEndpoint: string): string {
  const u = new URL(httpEndpoint)
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:"
  // Common path rewrites for providers that segregate HTTP and WS paths can be added here
  return u.toString()
}
