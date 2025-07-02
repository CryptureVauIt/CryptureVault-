import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, ConfirmOptions, SignatureResult } from "@solana/web3.js"
import { EventEmitter } from "events"
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { z } from "zod"

/** Zod schemas for input validation */
const executionConfigSchema = z.object({
  endpoint: z.string().url(),
  commitment: z.custom<ConfirmOptions>().optional(),
  payerKeypair: z.object({
    publicKey: z.instanceof(PublicKey),
    signTransaction: z.function().args(z.instanceof(Transaction)).returns(z.promise(z.instanceof(Transaction))),
  }),
})

const transferParamsSchema = z.object({
  amountLamports: z.number().int().nonnegative(),
  recipient: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
})

const splTransferParamsSchema = transferParamsSchema.extend({
  mint: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
})

const swapParamsSchema = z.object({
  inputMint: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  outputMint: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  inputAmount: z.number().positive(),
  minOutputAmount: z.number().positive(),
  swapProgramId: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  route: z.array(z.instanceof(PublicKey)).min(1),
})

/** TypeScript interfaces derived from schemas */
export type ExecutionConfig = z.infer<typeof executionConfigSchema>
export type TransferParams = z.infer<typeof transferParamsSchema>
export type SPLTransferParams = z.infer<typeof splTransferParamsSchema>
export type SwapParams = z.infer<typeof swapParamsSchema>

/** Helper for retrying confirmation */
async function waitForFinalized(
  connection: Connection,
  signature: string,
  timeoutMs: number
): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const res = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0]
    if (res?.confirmationStatus === "finalized") return true
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

/**
 * SelkaSenseExecutionAgent handles SOL/SPL transfers and swaps,
 * emitting standardized events on success, error, or timeout.
 */
export class SelkaSenseExecutionAgent extends EventEmitter {
  private connection: Connection
  private payer: ExecutionConfig["payerKeypair"]
  private commitment: ConfirmOptions

  constructor(rawConfig: unknown) {
    super()
    const { endpoint, commitment, payerKeypair } = executionConfigSchema.parse(rawConfig)
    this.connection = new Connection(endpoint, commitment || "confirmed")
    this.commitment = commitment || "confirmed"
    this.payer = payerKeypair
  }

  /** Execute a native SOL transfer */
  public async executeTransfer(raw: unknown): Promise<void> {
    const { amountLamports, recipient } = transferParamsSchema.parse(raw)
    try {
      const recPub = new PublicKey(recipient)
      const balance = await this.connection.getBalance(this.payer.publicKey, this.commitment)
      const fee = 5000
      if (balance < amountLamports + fee) {
        this.emit("error", "insufficient-funds")
        return
      }

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.payer.publicKey,
          toPubkey: recPub,
          lamports: amountLamports,
        })
      )
      await this.signAndSend(tx, "transfer-timeout")
    } catch (err) {
      this.emit("error", String(err))
    }
  }

  /** Execute an SPL token transfer */
  public async executeSPLTransfer(raw: unknown): Promise<void> {
    const { amountLamports, recipient, mint } = splTransferParamsSchema.parse(raw)
    try {
      const mintPub = new PublicKey(mint)
      const recPub = new PublicKey(recipient)
      const token = new Token(this.connection, mintPub, TOKEN_PROGRAM_ID, this.payer)
      const fromAcc = await token.getOrCreateAssociatedAccountInfo(this.payer.publicKey)
      const toAcc = await token.getOrCreateAssociatedAccountInfo(recPub)

      const splAcct = await token.getAccountInfo(fromAcc.address)
      if (splAcct.amount.toNumber() < amountLamports) {
        this.emit("error", "insufficient-token-balance")
        return
      }

      const tx = new Transaction().add(
        Token.createTransferInstruction(
          TOKEN_PROGRAM_ID,
          fromAcc.address,
          toAcc.address,
          this.payer.publicKey,
          [],
          amountLamports
        )
      )
      await this.signAndSend(tx, "spl-transfer-timeout")
    } catch (err) {
      this.emit("error", String(err))
    }
  }

  /** Execute a token swap given a route and swap program ID */
  public async executeSwap(raw: unknown): Promise<void> {
    const params = swapParamsSchema.parse(raw)
    try {
      const progKey = new PublicKey(params.swapProgramId)
      const tx = new Transaction().add({
        keys: params.route.map((k) => ({ pubkey: k, isSigner: false, isWritable: true })),
        programId: progKey,
        data: Buffer.alloc(0),
      })
      await this.signAndSend(tx, "swap-timeout")
    } catch (err) {
      this.emit("error", String(err))
    }
  }

  /** Internal: sign, send, and await confirmation with retry logic */
  private async signAndSend(tx: Transaction, timeoutTag: string): Promise<void> {
    tx.feePayer = this.payer.publicKey
    const { blockhash } = await this.connection.getLatestBlockhash(this.commitment)
    tx.recentBlockhash = blockhash

    const signedTx = await this.payer.signTransaction(tx)
    const sig = await this.connection.sendRawTransaction(signedTx.serialize())

    const confirmed = await waitForFinalized(this.connection, sig, 30000)
    if (confirmed) {
      this.emit("success", sig)
    } else {
      this.emit("timeout", timeoutTag)
    }
  }
}
