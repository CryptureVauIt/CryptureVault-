import express from "express"
import { WatchFlowService, FlowEvent } from "./watchFlowService"

const app = express()
app.use(express.json())

const service = new WatchFlowService(process.env.SOLANA_RPC_ENDPOINT!)

app.post("/watchflow", async (req, res) => {
  const { wallet, mint, limit } = req.body
  if (!wallet || !mint) {
    return res.status(400).json({ success: false, error: "wallet and mint are required" })
  }
  try {
    const events: FlowEvent[] = await service.fetchFlow(wallet, mint, limit || 100)
    res.json({ success: true, events })
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`WatchFlow API listening on port ${PORT}`))
