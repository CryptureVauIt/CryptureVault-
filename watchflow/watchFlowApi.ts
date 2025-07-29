import express, { Request, Response, NextFunction } from "express"
import cors from "cors"
import helmet from "helmet"
import morgan from "morgan"
import rateLimit from "express-rate-limit"
import { WatchFlowService, FlowEvent } from "./watchFlowService"
import { z } from "zod"

const app = express()

// --- Middleware ---
app.use(cors())
app.use(helmet())
app.use(express.json())
app.use(morgan("combined"))

// Rate limiter: max 200 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, error: "Too many requests, please try later" },
})
app.use(limiter)

// --- Health Check ---
app.get("/healthz", (_req: Request, res: Response) => {
  res.status(200).json({ success: true, status: "ok" })
})

// --- Environment validation ---
const rpcEndpoint = process.env.SOLANA_RPC_ENDPOINT
if (!rpcEndpoint) {
  console.error("❌ Missing SOLANA_RPC_ENDPOINT environment variable")
  process.exit(1)
}
const service = new WatchFlowService(rpcEndpoint)

// --- Zod schema & types ---
const watchFlowSchema = z.object({
  wallet: z.string().min(1, "wallet is required"),
  mint: z.string().min(1, "mint is required"),
  limit: z.number().int().positive().max(1000).default(100),
})
type WatchFlowRequest = z.infer<typeof watchFlowSchema>

// --- Route handler ---
app.post(
  "/watchflow",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { wallet, mint, limit }: WatchFlowRequest =
        watchFlowSchema.parse(req.body)

      const events: FlowEvent[] = await service.fetchFlow(wallet, mint, limit)
      return res.json({ success: true, events })
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        const errors = err.errors.map(e => ({
          field: e.path.join("."),
          message: e.message,
        }))
        return res.status(400).json({ success: false, errors })
      }
      next(err)
    }
  }
)

// --- Global error handler ---
app.use(
  (err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error("❌ /watchflow error:", err)
    res
      .status(500)
      .json({ success: false, error: "Internal server error" })
  }
)

// --- Start server ---
const PORT = Number(process.env.PORT) || 3000
app.listen(PORT, () =>
  console.log(`🚀 WatchFlow API listening on port ${PORT}`)
)
