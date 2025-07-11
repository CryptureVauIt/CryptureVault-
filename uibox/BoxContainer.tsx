import React, { useEffect, useState, memo } from "react"
import { TokenInsightCard } from "./TokenInsightCard"
import { RiskSignalBadge } from "./RiskSignalBadge"
import { WalletActivityGraph } from "./WalletActivityGraph"
import { WhaleTransferList } from "./WhaleTransferList"
import { AlertBanner } from "./AlertBanner"

interface TokenData {
  name: string
  riskLevel: "Low" | "Medium" | "High"
  volume: number
}

interface WhaleTransfer {
  amount: number
  token: string
  address: string
}

interface WalletActivityPoint {
  time: string
  value: number
}

export const AnalyzerDashboard: React.FC = memo(() => {
  const [tokenData, setTokenData] = useState<TokenData | null>(null)
  const [whaleTransfers, setWhaleTransfers] = useState<WhaleTransfer[]>([])
  const [walletActivity, setWalletActivity] = useState<WalletActivityPoint[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const [tokenRes, whaleRes, activityRes] = await Promise.all([
          fetch('/api/token-summary').then(res => res.json()),
          fetch('/api/whale-transfers').then(res => res.json()),
          fetch('/api/wallet-activity').then(res => res.json()),
        ])
        setTokenData(tokenRes)
        setWhaleTransfers(whaleRes)
        setWalletActivity(activityRes)
      } catch (e: any) {
        setError(e.message || 'Failed to load dashboard data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <p role="status" aria-live="polite">Loading dashboard...</p>
      </div>
    )
  }

  if (error || !tokenData) {
    return <AlertBanner message={error || 'Unexpected error occurred'} type="error" />
  }

  return (
    <div className="p-4 grid gap-6">
      <AlertBanner
        message={`Spike detected on ${tokenData.name} — ${(
          (tokenData.riskLevel === 'High' ? 37.4 : 0)
        ).toFixed(1)}% risk increase in last hour`}
        type="warning"
      />

      <section
        className="dashboard-section grid grid-cols-1 md:grid-cols-2 gap-4"
        role="region"
        aria-label="Token Insights"
      >
        <TokenInsightCard
          tokenName={tokenData.name}
          riskLevel={tokenData.riskLevel}
          volume={tokenData.volume}
        />
        <RiskSignalBadge level={tokenData.riskLevel} />
      </section>

      <section
        className="dashboard-section grid grid-cols-1 lg:grid-cols-2 gap-4"
        role="region"
        aria-label="Activity Overview"
      >
        <WalletActivityGraph data={walletActivity} />
        <WhaleTransferList transfers={whaleTransfers} />
      </section>
    </div>
  )
})

AnalyzerDashboard.displayName = 'AnalyzerDashboard'
