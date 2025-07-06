import express, { Request, Response, NextFunction } from "express"
import cors from "cors"
import helmet from "helmet"
import { WatchFlowService, FlowEvent } from "./watchFlowService"
import { z } from "zod"

const app = express()

// Security & parsing middleware
app.use(cors())
app.use(helmet())
app.use(express.json())

// Validate that RPC endpoint is provided
const rpcEndpoint = process.env.SOLANA_RPC_ENDPOINT
if (!rpcEndpoint) {
  console.error("❌ Missing SOLANA_RPC_ENDPOINT environment variable")
  process.exit(1)
}

const service = new WatchFlowService(rpcEndpoint)

// Zod schema for request body
const watchFlowSchema = z.object({
  wallet: z.string().min(1, "wallet is required"),
  mint: z.string().min(1, "mint is required"),
  limit: z.number().int().positive().max(1000).optional(),
})

app.post(
  "/watchflow",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate input
      const { wallet, mint, limit } = watchFlowSchema.parse(req.body)

      // Fetch flow events
      const events: FlowEvent[] = await service.fetchFlow(wallet, mint, limit ?? 100)
      return res.json({ success: true, events })
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ success: false, errors: err.errors })
      }
      next(err)
    }
  }
)

// Global error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("❌ /watchflow error:", err)
  res.status(500).json({ success: false, error: "Internal server error" })
})

const PORT = Number(process.env.PORT) || 3000
app.listen(PORT, () => console.log(`🚀 WatchFlow API listening on port ${PORT}`))
