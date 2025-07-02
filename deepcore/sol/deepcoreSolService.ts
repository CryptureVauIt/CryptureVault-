import fetch from "node-fetch"
import { Connection, PublicKey, ParsedAccountData } from "@solana/web3.js"
import {
  deepcoreSolConfigSchema,
  DeepcoreSolConfig,
  solQueryParamsSchema,
  SolQueryParams,
  SolAnalytics,
  SolBalance,
  SolPrice,
} from "./defineDeepcoreSolShape"

/**
 * Service for fetching SOL-specific analytics
 */
export class DeepcoreSolService {
  private conn: Connection
  private priceApiUrl?: string

  constructor(rawConfig: unknown) {
    const cfg: DeepcoreSolConfig = deepcoreSolConfigSchema.parse(rawConfig)
    this.conn = new Connection(cfg.endpoint, cfg.commitment)
    this.priceApiUrl = cfg.priceApiUrl
  }

  /**
   * Fetch SOL balance for a wallet
   */
  public async fetchBalance(walletAddr: string): Promise<SolBalance> {
    const pubkey = new PublicKey(walletAddr)
    const lamports = await this.conn.getBalance(pubkey, "confirmed")
    return { lamports, sol: lamports / LAMPORTS_PER_SOL }
  }

  /**
   * Count stake accounts and sum delegated SOL
   */
  public async fetchStakeInfo(walletAddr: string): Promise<{ stakeAccounts: number; delegatedSol: number }> {
    const stakeProgram = new PublicKey("Stake11111111111111111111111111111111111111")
    const pubkey = new PublicKey(walletAddr)
    const resp = await this.conn.getParsedProgramAccounts(stakeProgram, {
      filters: [
        { dataSize: 200 },
        { memcmp: { offset: 124, bytes: walletAddr } },
      ],
    })
    let delegatedLamports = 0
    resp.forEach(({ account }) => {
      const info = (account.data as ParsedAccountData).parsed.info.stake.delegation
      delegatedLamports += Number(info.stake)
    })
    return { stakeAccounts: resp.length, delegatedSol: delegatedLamports / LAMPORTS_PER_SOL }
  }

  /**
   * Fetch current SOL price in USD
   */
  public async fetchPrice(): Promise<SolPrice | undefined> {
    if (!this.priceApiUrl) return undefined
    const res = await fetch(this.priceApiUrl, { timeout: 5000 })
    if (!res.ok) throw new Error(`Price API error ${res.status}`)
    const data = (await res.json()) as { priceUsd: number }
    return { priceUsd: data.priceUsd, timestamp: Date.now() }
  }

  /**
   * Aggregate all analytics into a single result
   */
  public async getAnalytics(rawParams: unknown): Promise<SolAnalytics> {
    const { walletAddress }: SolQueryParams = solQueryParamsSchema.parse(rawParams)
    const [balance, stakeInfo, price] = await Promise.all([
      this.fetchBalance(walletAddress),
      this.fetchStakeInfo(walletAddress),
      this.fetchPrice(),
    ])
    return {
      balance,
      stakeAccounts: stakeInfo.stakeAccounts,
      delegatedSol: stakeInfo.delegatedSol,
      price,
    }
  }
}
