import { Connection, PublicKey } from "@solana/web3.js"
import {
  solCheckerConfigSchema,
  SolCheckerConfig,
  solCheckerParamsSchema,
  SolCheckerParams,
  BalanceCheck,
  StakeCheck,
  SolCheckResult,
} from "./defineSolCheckerShape"

/**
 * Service to verify SOL balance and optional stake existence
 */
export class SolCheckerService {
  private connection: Connection
  private config: SolCheckerConfig

  constructor(rawConfig: unknown) {
    this.config = solCheckerConfigSchema.parse(rawConfig)
    this.connection = new Connection(
      this.config.endpoint,
      this.config.commitment
    )
  }

  /**
   * Perform checks: SOL balance and, if configured, stake accounts
   */
  public async runCheck(rawParams: unknown): Promise<SolCheckResult> {
    const { walletAddress }: SolCheckerParams =
      solCheckerParamsSchema.parse(rawParams)
    const pubkey = new PublicKey(walletAddress)

    // Check balance
    const lamports = await this.connection.getBalance(
      pubkey,
      this.config.commitment
    )
    const sol = lamports / 1e9
    const meetsMinBalance = sol >= this.config.minSolBalance
    const balance: BalanceCheck = { lamports, sol, meetsMinBalance }

    let stake: StakeCheck | undefined
    if (this.config.requireStakeAccount) {
      const stakeProgram = new PublicKey(
        "Stake11111111111111111111111111111111111111"
      )
      const accounts = await this.connection.getParsedProgramAccounts(
        stakeProgram,
        {
          filters: [
            { dataSize: 200 },
            { memcmp: { offset: 124, bytes: walletAddress } },
          ],
        }
      )
      const count = accounts.length
      const hasStakeAccount = count > 0
      stake = { count, hasStakeAccount }
    }

    return {
      balance,
      ...(stake ? { stake } : {}),
      timestamp: Date.now(),
    }
  }
}
