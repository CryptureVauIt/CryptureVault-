import {
  Connection,
  PublicKey,
  ParsedAccountData,
} from "@solana/web3.js"
import {
  walletDetailsConfigSchema,
  WalletDetailsConfig,
  walletDetailsParamsSchema,
  WalletDetailsParams,
  TokenBalance,
  TransactionSummary,
  StakeAccountInfo,
  NFTInfo,
  WalletDetails,
} from "./defineWalletDetailsShape"

/**
 * Service to fetch detailed wallet information
 */
export class WalletDetailsService {
  private connection: Connection

  constructor(rawConfig: unknown) {
    const { endpoint, commitment } = walletDetailsConfigSchema.parse(
      rawConfig
    )
    this.connection = new Connection(endpoint, commitment)
  }

  /** Fetch SPL token balances */
  public async getBalances(
    wallet: PublicKey
  ): Promise<TokenBalance[]> {
    const resp = await this.connection.getParsedTokenAccountsByOwner(
      wallet,
      { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
    )
    const result: TokenBalance[] = []
    for (const { account } of resp.value) {
      const info = (account.data as ParsedAccountData).parsed.info
      const amount = parseInt(info.tokenAmount.amount, 10)
      const decimals = info.tokenAmount.decimals
      if (amount === 0) continue
      result.push({
        mint: info.mint,
        raw: amount,
        uiAmount: amount / 10 ** decimals,
        decimals,
      })
    }
    return result
  }

  /** Fetch recent transactions */
  public async getTransactions(
    wallet: PublicKey,
    limit: number
  ): Promise<TransactionSummary[]> {
    const sigs = await this.connection.getSignaturesForAddress(
      wallet,
      { limit }
    )
    const summaries: TransactionSummary[] = []
    for (const info of sigs) {
      const ts =
        info.blockTime != null
          ? info.blockTime * 1000
          : Date.now()
      summaries.push({
        signature: info.signature,
        slot: info.slot,
        err: !!info.err,
        memo: info.memo ?? undefined,
        timestamp: ts,
      })
    }
    return summaries
  }

  /** Fetch stake account info */
  public async getStakes(
    wallet: PublicKey
  ): Promise<StakeAccountInfo[]> {
    const resp = await this.connection.getParsedProgramAccounts(
      new PublicKey("Stake11111111111111111111111111111111111111"),
      {
        filters: [
          { dataSize: 200 },
          {
            memcmp: {
              offset: 124,
              bytes: wallet.toBase58(),
            },
          },
        ],
      }
    )
    const stakes: StakeAccountInfo[] = []
    for (const { pubkey, account } of resp) {
      const info = (account.data as ParsedAccountData).parsed.info
      const delegated = parseInt(
        info.stake.delegation.stake,
        10
      )
      stakes.push({
        stakeAccount: pubkey.toBase58(),
        delegatedAmount: delegated,
        delegatedUiAmount:
          delegated / LAMPORTS_PER_SOL,
        activating: info.stake.delegation.activationEpoch
          > 0,
        deactivating:
          info.stake.delegation.deactivationEpoch > 0,
      })
    }
    return stakes
  }

  /** Placeholder for NFT fetching logic */
  public async getNFTs(
    wallet: PublicKey
  ): Promise<NFTInfo[]> {
    // In real implementation, use Metaplex or NFT standard
    return []
  }

  /** Combines all parts into WalletDetails */
  public async getWalletDetails(
    rawParams: unknown
  ): Promise<WalletDetails> {
    const { walletAddress, txLimit, includeNFTs } =
      walletDetailsParamsSchema.parse(rawParams)
    const wallet = new PublicKey(walletAddress)
    const [balances, transactions, stakes] =
      await Promise.all([
        this.getBalances(wallet),
        this.getTransactions(wallet, txLimit),
        this.getStakes(wallet),
      ])
    const details: WalletDetails = {
      balances,
      transactions,
      stakes,
    }
    if (includeNFTs) {
      details.nfts = await this.getNFTs(wallet)
    }
    return details
  }
}
