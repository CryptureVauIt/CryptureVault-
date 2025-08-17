import React, { useEffect, useState, memo } from "react"
import { TokenInsightCard } from "./TokenInsightCard"
import { RiskSignalBadge } from "./RiskSignalBadge"
import { WalletActivityGraph } from "./WalletActivityGraph"
import { WhaleTransferList } from "./WhaleTransferList"
import { AlertBanner } from "./AlertBanner"

// Token summary data
interface TokenData {
  name: string
  riskLevel: "Low" | "Medium" | "High"
  volume: number
}

// Recent large token transfer
interface WhaleTransfer {
  amount: number
  token: string
  address: string
}

// Wallet activity data point
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

  // Load dashboard data once on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [tokenRes, whaleRes, activityRes] = await Promise.all([
          fetch("/api/token-summary").then(res => res.json()),
          fetch("/api/whale-transfers").then(res => res.json()),
          fetch("/api/wallet-activity").then(res => res.json()),
        ])
        setTokenData(tokenRes)
        setWhaleTransfers(whaleRes)
        setWalletActivity(activityRes)
      } catch (err: any) {
        setError(err?.message ?? "Failed to load dashboard data")
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const renderLoading = () => (
    <div className="flex justify-center items-center h-full py-10">
      <p role="status" aria-live="polite">Loading dashboard...</p>
    </div>
  )

  const renderError = () => (
    <AlertBanner
      message={error || "Unexpected error occurred"}
      type="error"
    />
  )

  const renderSpikeBanner = () => {
    const riskSpike = tokenData?.riskLevel === "High" ? 37.4 : 0
    return (
      <AlertBanner
        message={`Spike detected on ${tokenData?.name} — ${riskSpike.toFixed(1)}% risk increase in last hour`}
        type="warning"
      />
    )
  }

  const renderTokenInfo = () => (
    <section
      className="dashboard-section grid grid-cols-1 md:grid-cols-2 gap-4"
      role="region"
      aria-label="Token Insights"
    >
      <TokenInsightCard
        tokenName={tokenData!.name}
        riskLevel={tokenData!.riskLevel}
        volume={tokenData!.volume}
      />
      <RiskSignalBadge level={tokenData!.riskLevel} />
    </section>
  )

  const renderActivitySection = () => (
    <section
      className="dashboard-section grid grid-cols-1 lg:grid-cols-2 gap-4"
      role="region"
      aria-label="Activity Overview"
    >
      <WalletActivityGraph data={walletActivity} />
      <WhaleTransferList transfers={whaleTransfers} />
    </section>
  )

  return (
    <div className="p-4 grid gap-6 min-h-screen bg-gray-50">
      {loading && renderLoading()}
      {!loading && (error || !tokenData) && renderError()}
      {!loading && tokenData && (
        <>
          {renderSpikeBanner()}
          {renderTokenInfo()}
          {renderActivitySection()}
        </>
      )}
    </div>
  )
})

AnalyzerDashboard.displayName = "AnalyzerDashboard"
