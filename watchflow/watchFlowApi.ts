import express, { Request, Response, NextFunction } from "express"
import cors, { CorsOptions } from "cors"
import helmet from "helmet"
import morgan from "morgan"
import rateLimit from "express-rate-limit"
import compression from "compression"
import { z } from "zod"
import { AddressInfo } from "net"
import { PublicKey } from "@solana/web3.js"
import { WatchFlowService, FlowEvent } from "./watchFlowService"

// --- App bootstrap ---
const app = express()
app.disable("x-powered-by")
app.set("trust proxy", true) // respect X-Forwarded-* when behind a proxy/load balancer

// --- Deterministic request id (no randomness) ---
let reqCounter = 0
app.use((req, _res, next) => {
  const headerId = req.header("x-request-id")
  ;(req as any).reqId =
    headerId && headerId.trim().length > 0
      ? headerId.trim()
      : `${Date.now()}-${++reqCounter}`
  next()
})

// --- Body parsing & compression ---
app.use(express.json({ limit: "200kb", strict: true }))
app.use(compression())

// --- CORS allow-list via env CORS_ORIGINS (comma-separated) ---
const rawOrigins = (process.env.CORS_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean)
const corsAllowAll = rawOrigins.length === 0
const corsOptions: CorsOptions = {
  origin: corsAllowAll
    ? true
    : (origin, cb) => {
        if (!origin) return cb(null, false) // disallow non-browser defaults when list is set
        cb(null, rawOrigins.includes(origin))
      },
  credentials: false,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["content-type", "x-request-id"],
  maxAge: 600
}
app.use(cors(corsOptions))

// --- Security headers ---
app.use(
  helmet({
    contentSecurityPolicy: false, // API-only, no templates
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
)

// --- Logging (skip noise) ---
app.use(
  morgan(":date[iso] :method :url :status :res[content-length] - :response-time ms :remote-addr :req[x-request-id]", {
    skip: req => req.url === "/healthz"
  })
)

// --- Rate limiter: 200 req / 15 min / IP ---
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({ success: false, error: "too_many_requests", message: "Too many requests, please try later" })
  })
)

// --- Health check ---
app.get("/healthz", (_req: Request, res: Response) => {
  res.status(200).json({ success: true, status: "ok" })
})

// --- Environment validation ---
const rpcEndpoint = process.env.SOLANA_RPC_ENDPOINT
if (!rpcEndpoint) {
  // Exit fast on missing configuration
  // eslint-disable-next-line no-console
  console.error("Missing SOLANA_RPC_ENDPOINT environment variable")
  process.exit(1)
}
const service = new WatchFlowService(rpcEndpoint)

// --- Helpers: safe PublicKey validator (throws if invalid) ---
const isPublicKey = (s: string): boolean => {
  try {
    // Throws on invalid base58 or length
    new PublicKey(s)
    return true
  } catch {
    return false
  }
}

// --- Zod schemas ---
const coerceNumber = z.union([z.number(), z.string()]).transform(v => {
  const n = typeof v === "number" ? v : Number(v)
  if (!Number.isFinite(n)) throw new Error("NaN")
  return n
})

const watchFlowSchema = z.object({
  wallet: z.string().trim().refine(isPublicKey, "wallet must be a valid Solana address"),
  mint: z.string().trim().refine(isPublicKey, "mint must be a valid Solana address"),
  limit: coerceNumber.pipe(z.number().int().positive().max(1000)).default(100)
})
type WatchFlowRequest = z.infer<typeof watchFlowSchema>

// --- Content-Type guard ---
app.use((req, res, next) => {
  if (req.method === "POST") {
    const ct = req.headers["content-type"] || ""
    if (!ct.toString().includes("application/json")) {
      return res.status(415).json({ success: false, error: "unsupported_media_type", message: "Use application/json" })
    }
  }
  next()
})

// --- Routes ---
app.post("/watchflow", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { wallet, mint, limit }: WatchFlowRequest = watchFlowSchema.parse(req.body)
    const events: FlowEvent[] = await service.fetchFlow(wallet, mint, limit)
    return res.status(200).json({
      success: true,
      requestId: (req as any).reqId,
      count: events.length,
      events
    })
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      const errors = err.errors.map(e => ({ field: e.path.join(".") || "body", message: e.message }))
      return res.status(400).json({ success: false, error: "invalid_request", errors })
    }
    next(err)
  }
})

// --- 404 handler for unknown routes ---
app.use((_req, res) => {
  res.status(404).json({ success: false, error: "not_found", message: "Route not found" })
})

// --- Global error handler ---
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error(`watchflow_error reqId=${(req as any).reqId || "n/a"}`, err)
  res.status(500).json({ success: false, error: "internal_error", message: "Internal server error" })
})

// --- Server startup & graceful shutdown ---
const PORT = Number(process.env.PORT) || 3000
const server = app.listen(PORT, () => {
  const addr = server.address() as AddressInfo
  // eslint-disable-next-line no-console
  console.log(`WatchFlow API listening on port ${addr.port}`)
})

const shutdown = (signal: string) => {
  // eslint-disable-next-line no-console
  console.log(`Received ${signal}, shutting down`)
  server.close(err => {
    if (err) {
      // eslint-disable-next-line no-console
      console.error("Error during shutdown", err)
      process.exit(1)
    }
    process.exit(0)
  })
}

process.on("SIGINT", () => shutdown("SIGINT"))
process.on("SIGTERM", () => shutdown("SIGTERM"))
