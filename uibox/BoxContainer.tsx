import React, { useEffect, useState, memo } from "react"
import { TokenInsightCard } from "./TokenInsightCard"
import { RiskSignalBadge } from "./RiskSignalBadge"
import { WalletActivityGraph } from "./WalletActivityGraph"
import { WhaleTransferList } from "./WhaleTransferList"
import { AlertBanner } from "./AlertBanner"

// Types for incoming data
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

// Main dashboard component
export const AnalyzerDashboard: React.FC = memo(() => {
  // State hooks for fetched data
  const [tokenData, setTokenData] = useState<TokenData | null>(null)
  const [whaleTransfers, setWhaleTransfers] = useState<WhaleTransfer[]>([])
  const [walletActivity, setWalletActivity] = useState<WalletActivityPoint[]>([])

  // State for loading and error handling
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch data on component mount
  useEffect(() => {
    async function fetchData() {
      try {
        // Parallel requests to fetch all dashboard data
        const [tokenRes, whaleRes, activityRes] = await Promise.all([
          fetch('/api/token-summary').then(res => res.json()),
          fetch('/api/whale-transfers').then(res => res.json()),
          fetch('/api/wallet-activity').then(res => res.json()),
        ])

        // Set results into state
        setTokenData(tokenRes)
        setWhaleTransfers(whaleRes)
        setWalletActivity(activityRes)
      } catch (e: any) {
        // Graceful error handling
        setError(e.message || 'Failed to load dashboard data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // UI during loading
  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <p role="status" aria-live="polite">Loading dashboard...</p>
      </div>
    )
  }

  // UI in case of error or missing data
  if (error || !tokenData) {
    return <AlertBanner message={error || 'Unexpected error occurred'} type="error" />
  }

  // Render main dashboard content
  return (
    <div className="p-4 grid gap-6">
      {/* Risk warning banner (example: hardcoded spike for "High" risk) */}
      <AlertBanner
        message={`Spike detected on ${tokenData.name} — ${(
          tokenData.riskLevel === 'High' ? 37.4 : 0
        ).toFixed(1)}% risk increase in last hour`}
        type="warning"
      />

      {/* Section for token information and risk indicator */}
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

      {/* Section for wallet activity and whale transfer monitoring */}
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

// Set component display name for debugging and clarity in React DevTools
AnalyzerDashboard.displayName = 'AnalyzerDashboard'
