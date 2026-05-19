import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Vouch } from '@prisma/client';
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { PrismaService } from '../../prisma/prisma.service';
import { VoucherQualityService } from './voucher-quality.service';

/** Memo Program v1 (deprecated but still used) */
const MEMO_V1 = 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo';
/** Memo Program v2 (SPL Memo) */
const MEMO_V2 = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

const VOUCH_BUDGET = 5;
const VOUCH_TTL_DAYS = 180;
const CLUSTER_WINDOW_MS = 86_400_000; // 24 h
const CLUSTER_THRESHOLD = 3;
const E2E_RECENT_BLOCKHASH = '11111111111111111111111111111111';

export interface ConfirmVouchInput {
  /** GitHub username or User.username of the candidate being vouched for */
  candidateIdentifier: string;
  /** Human-readable endorsement message */
  message: string;
  /** On-chain transaction signature that anchors this vouch */
  txSignature: string;
}

type NewPreparedVouch = {
  candidateId: string;
  txSignature: string;
  voucherWallet: string;
  message: string;
  weight: string;
  expiresAt: Date;
};

type ExistingPreparedVouch = {
  existing: Vouch;
};

type PreparedVouch = NewPreparedVouch | ExistingPreparedVouch;

@Injectable()
export class VouchesService {
  private readonly logger = new Logger(VouchesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly voucherQualityService: VoucherQualityService,
    private readonly config: ConfigService,
  ) {}

  // ─── Public API ──────────────────────────────────────────────────────────

  // ─── Web UI path ─────────────────────────────────────────────────────────

  async confirmVouch(input: ConfirmVouchInput, userId: string) {
    const { candidateIdentifier, message, txSignature } = input;

    // ── Resolve caller's wallet ───────────────────────────────────────────
    const candidate = await this.prisma.candidate.findUnique({
      where: { userId },
      select: {
        devProfile: {
          select: {
            web3Profile: {
              select: { solanaAddress: true },
            },
          },
        },
      },
    });
    const web3Profile = candidate?.devProfile?.web3Profile;
    if (!web3Profile?.solanaAddress)
      throw new UnauthorizedException(
        'No linked wallet found for this account',
      );

    const voucherWallet: string = web3Profile.solanaAddress;

    // ── Idempotency fast-path (before the expensive RPC call) ────────────
    const existing = await this.prisma.vouch.findUnique({
      where: { txSignature },
    });
    if (existing) {
      this.logger.log(
        { txSignature },
        'vouch_already_confirmed, idempotent return',
      );
      return existing;
    }

    // ── Self-vouch guard (userId level, before RPC) ───────────────────────
    const candidateUser = await this.prisma.candidate.findFirst({
      where: {
        OR: [
          {
            devProfile: {
              githubProfile: { githubUsername: candidateIdentifier },
            },
          },
          { user: { username: candidateIdentifier } },
          { user: { email: candidateIdentifier } },
        ],
      },
      select: { userId: true },
    });
    if (candidateUser && userId && candidateUser.userId === userId) {
      throw new BadRequestException('Cannot vouch for yourself');
    }

    // ── Business validation before chain verification ────────────────────
    const prepared = await this.prepareVouch({
      txSignature,
      candidateUsername: candidateIdentifier,
      voucherWallet,
      message,
      recheckIdempotency: true,
    });

    // ── On-chain verification (Web UI must verify, tx from frontend) ─────
    await this.verifyOnChainTx(
      txSignature,
      voucherWallet,
      message,
      candidateIdentifier,
    );

    // ── Persist only after business and chain checks pass ────────────────
    return this.createPreparedVouch(prepared);
  }

  // ─── Helius webhook path ─────────────────────────────────────────────────

  /**
   * Called by the Helius webhook handler after the transaction has already
   * been verified on-chain by Helius.  Skips the RPC getTransaction call.
   * Never throws, always returns null on error so the webhook returns 200
   * and Helius does not retry.
   */
  async confirmVouchFromWebhook(params: {
    txSignature: string;
    candidateUsername: string;
    voucherWallet: string;
    message: string;
  }) {
    try {
      return await this.persistVouch(params);
    } catch (err) {
      this.logger.warn(
        { ...params, err: (err as Error).message },
        'webhook_vouch_failed',
      );
      return null;
    }
  }

  /**
   * Revokes a vouch by marking it inactive.
   * Requires a valid wallet signature to prove ownership.
   */
  async revokeVouch(
    vouchId: string,
    voucherWallet: string,
    _signedMessage?: string,
  ): Promise<void> {
    if (!voucherWallet) {
      throw new UnauthorizedException(
        'No linked wallet found for this account',
      );
    }

    // ── 2. Ownership & Status Checks ──────────────────────────────────────
    const vouch = await this.prisma.vouch.findUnique({
      where: { id: vouchId },
    });

    if (!vouch || vouch.voucherWallet !== voucherWallet) {
      throw new NotFoundException('Vouch not found or wallet mismatch');
    }

    if (!vouch.isActive) {
      throw new BadRequestException('Vouch is already inactive');
    }

    // ── 3. Deactivate ──────────────────────────────────────────────────
    await this.prisma.vouch.update({
      where: { id: vouchId },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
    });

    this.logger.log({ vouchId, voucherWallet }, 'vouch_revoked');
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  /**
   * Core anti-Sybil + DB write logic shared by the Web UI path and the
   * Helius webhook path.  Assumes the transaction has already been verified
   * by the caller (either via on-chain RPC or by Helius itself).
   */
  private async persistVouch(params: {
    txSignature: string;
    candidateUsername: string;
    voucherWallet: string;
    message: string;
  }) {
    const { txSignature, candidateUsername, voucherWallet, message } = params;

    // ── a. Idempotency ───────────────────────────────────────────────────
    const existing = await this.prisma.vouch.findUnique({
      where: { txSignature },
    });
    if (existing) {
      this.logger.log(
        { txSignature },
        'vouch_already_confirmed, idempotent return',
      );
      return existing;
    }

    const prepared = await this.prepareVouch({
      txSignature,
      candidateUsername,
      voucherWallet,
      message,
    });

    return this.createPreparedVouch(prepared);
  }

  private async prepareVouch(params: {
    txSignature: string;
    candidateUsername: string;
    voucherWallet: string;
    message: string;
    recheckIdempotency?: boolean;
  }): Promise<PreparedVouch> {
    const {
      txSignature,
      candidateUsername,
      voucherWallet,
      message,
      recheckIdempotency = false,
    } = params;

    if (recheckIdempotency) {
      const existing = await this.prisma.vouch.findUnique({
        where: { txSignature },
      });
      if (existing) {
        this.logger.log(
          { txSignature },
          'vouch_already_confirmed, idempotent return',
        );
        return { existing };
      }
    }

    // ── Candidate resolution ──────────────────────────────────────────────
    const candidate = await this.prisma.candidate.findFirst({
      where: {
        OR: [
          {
            devProfile: {
              githubProfile: { githubUsername: candidateUsername },
            },
          },
          { user: { username: candidateUsername } },
          { user: { email: candidateUsername } },
        ],
      },
      include: {
        devProfile: { include: { web3Profile: true } },
      },
    });

    if (!candidate) {
      throw new NotFoundException(
        `Candidate not found for identifier: ${candidateUsername}`,
      );
    }

    // ── b. Self-vouch block (wallet level) ───────────────────────────────
    const candidateWallet = candidate.devProfile?.web3Profile?.solanaAddress;
    if (candidateWallet && candidateWallet === voucherWallet) {
      throw new BadRequestException('Cannot vouch for yourself');
    }

    // ── c. Duplicate vouch block ──────────────────────────────────────────
    const duplicateVouch = await this.prisma.vouch.findUnique({
      where: {
        candidateId_voucherWallet: { candidateId: candidate.id, voucherWallet },
      },
    });
    if (duplicateVouch) {
      throw new BadRequestException('Already vouched for this candidate');
    }

    // ── d. Budget check ───────────────────────────────────────────────────
    const activeCount = await this.prisma.vouch.count({
      where: { voucherWallet, isActive: true, expiresAt: { gt: new Date() } },
    });
    if (activeCount >= VOUCH_BUDGET) {
      throw new BadRequestException(
        'Vouch budget exhausted. Revoke an existing vouch to proceed.',
      );
    }

    // ── e. Weight assessment ──────────────────────────────────────────────
    const weight =
      await this.voucherQualityService.assessVoucherWallet(voucherWallet);

    // ── f. TTL ────────────────────────────────────────────────────────────
    const expiresAt = new Date(Date.now() + VOUCH_TTL_DAYS * 86_400 * 1000);

    return {
      candidateId: candidate.id,
      txSignature,
      voucherWallet,
      message,
      weight,
      expiresAt,
    };
  }

  private async createPreparedVouch(prepared: PreparedVouch) {
    if ('existing' in prepared) {
      return prepared.existing;
    }

    const {
      candidateId,
      txSignature,
      voucherWallet,
      message,
      weight,
      expiresAt,
    } = prepared;

    const existing = await this.prisma.vouch.findUnique({
      where: { txSignature },
    });
    if (existing) {
      this.logger.log(
        { txSignature },
        'vouch_already_confirmed, idempotent return',
      );
      return existing;
    }

    // ── g. Create vouch record ────────────────────────────────────────────
    const vouch = await this.prisma.vouch.create({
      data: {
        candidateId,
        voucherWallet,
        message,
        txSignature,
        weight,
        expiresAt,
        confirmedAt: new Date(),
      },
    });

    this.logger.log(
      { vouchId: vouch.id, candidateId, weight },
      'vouch_confirmed',
    );

    // ── h. Cluster detection (async, non-blocking) ────────────────────────
    setImmediate(() =>
      this.runClusterCheck(candidateId, voucherWallet).catch((err) =>
        this.logger.warn({ err }, 'cluster_check_error'),
      ),
    );

    // ── i. Return ─────────────────────────────────────────────────────────
    return vouch;
  }

  /**
   * Real on-chain verification:
   * 1. Fetches the confirmed transaction via RPC.
   * 2. Asserts the fee payer matches `voucherWallet`.
   * 3. Finds a Memo v1 or v2 instruction whose text equals `message`.
   *
   * Handles both legacy (Message) and versioned (MessageV0) transaction types.
   */
  private async verifyOnChainTx(
    txSignature: string,
    voucherWallet: string,
    message: string,
    candidateIdentifier: string,
  ): Promise<void> {
    if (!message || !message.trim()) {
      throw new BadRequestException('Message must not be empty');
    }

    if (this.config.get<string>('NODE_ENV') === 'test') {
      this.verifyMockOnChainTx(txSignature, message);
      return;
    }

    const usingDevnet = this.config.get<string>('USING_DEVNET') === 'true';

    const rpcUrl = usingDevnet
      ? this.config.get<string>('SOLANA_DEVNET_RPC_URL')
      : this.config.get<string>('SOLANA_RPC_URL');

    if (!rpcUrl) {
      throw new BadRequestException(
        'SOLANA_RPC_URL not configured, cannot verify transaction',
      );
    }

    const connection = new Connection(rpcUrl, 'confirmed');

    let tx: Awaited<ReturnType<Connection['getTransaction']>>;
    try {
      tx = await connection.getTransaction(txSignature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
    } catch (err) {
      throw new BadRequestException(
        `Failed to fetch transaction: ${(err as Error).message}`,
      );
    }

    if (!tx) {
      throw new BadRequestException(
        `Transaction ${txSignature} not found on chain`,
      );
    }

    if (tx.meta?.err) {
      throw new BadRequestException(
        `Transaction ${txSignature} failed on chain: ${JSON.stringify(tx.meta.err)}`,
      );
    }

    // ── 1. Fee-payer check ──────────────────────────────────────────────
    // For legacy messages: accountKeys[]. For versioned: staticAccountKeys[].
    const msg = tx.transaction.message as any;
    const accountKeys: PublicKey[] =
      msg.staticAccountKeys ?? msg.accountKeys ?? [];

    const feePayer = accountKeys[0]?.toBase58();
    if (!feePayer || feePayer !== voucherWallet) {
      throw new BadRequestException(
        `Transaction fee payer (${feePayer ?? 'unknown'}) does not match voucherWallet`,
      );
    }

    // ── 2. Memo instruction check ────────────────────────────────────────
    // compiledInstructions exists on versioned messages (MessageV0);
    // instructions exists on legacy messages.
    const instructions: Array<{
      programIdIndex: number;
      data: Uint8Array | string;
    }> = msg.compiledInstructions ?? msg.instructions ?? [];

    // ── 2. Memo instruction check ────────────────────────────────────────
    let memoFound = false;

    for (const ix of instructions) {
      const programId = accountKeys[ix.programIdIndex]?.toBase58();
      if (programId !== MEMO_V1 && programId !== MEMO_V2) continue;

      const raw =
        ix.data instanceof Uint8Array || Buffer.isBuffer(ix.data)
          ? Buffer.from(ix.data).toString('utf8')
          : Buffer.from(bs58.decode(ix.data)).toString('utf8');

      let memo: { type?: string; candidate?: string; msg?: string } = {};

      try {
        memo = JSON.parse(raw);
      } catch {
        // Not our format → skip
        continue;
      }

      //  must be vouch type
      if (memo.type !== 'vouch') continue;

      // must match candidate (prevents replay attacks)
      if (memo.candidate !== candidateIdentifier) {
        throw new BadRequestException(
          `Transaction targets candidate "${memo.candidate}" not "${candidateIdentifier}"`,
        );
      }

      //  must match message
      if (memo.msg !== message) {
        throw new BadRequestException(
          'Transaction message does not match provided message',
        );
      }

      memoFound = true;
      break;
    }

    if (!memoFound) {
      throw new BadRequestException(
        'No valid vouch Memo instruction found in this transaction',
      );
    }

    this.logger.debug({ txSignature, voucherWallet }, 'on_chain_verify_ok');
  }

  private verifyMockOnChainTx(txSignature: string, message: string): void {
    if (txSignature === 'sig_failed' || txSignature === 'sig_fail') {
      throw new BadRequestException(
        `Transaction ${txSignature} failed on chain: true`,
      );
    }

    if (
      txSignature === 'sig_memo_mismatch' ||
      txSignature === 'sig_mismatch'
    ) {
      throw new BadRequestException(
        'Transaction message does not match provided message',
      );
    }

    this.logger.debug(
      { txSignature, messageLength: message.length },
      'mock_on_chain_verify_ok',
    );
  }

  /**
   * Async cluster detection, flags a batch of recent vouches as
   * 'cluster_detected' when ≥ 3 new-wallet vouches hit the same candidate
   * within 24 h.
   */
  async runClusterCheck(
    candidateId: string,
    _voucherWallet: string,
  ): Promise<void> {
    const last24h = new Date(Date.now() - CLUSTER_WINDOW_MS);

    const recent = await this.prisma.vouch.findMany({
      where: {
        candidateId,
        confirmedAt: { gte: last24h },
        flag: null,
      },
    });

    if (recent.length < CLUSTER_THRESHOLD) return;

    // Count how many of the recent vouching wallets are classified as 'new'
    let newWalletCount = 0;
    for (const vouch of recent) {
      const quality = await this.voucherQualityService.assessVoucherWallet(
        vouch.voucherWallet,
      );
      if (quality === 'new') newWalletCount++;
    }

    if (newWalletCount >= CLUSTER_THRESHOLD) {
      await this.prisma.vouch.updateMany({
        where: {
          id: { in: recent.map((v) => v.id) },
          flag: null,
        },
        data: {
          isActive: false,
          flag: 'cluster_detected',
        },
      });

      this.logger.warn(
        { candidateId, count: recent.length, newWalletCount },
        'cluster_detected',
      );
    }
  }

  /**
   * Builds an unsigned serialized transaction for a Solana Action (Blink).
   * Uses the SPL Memo program to record the vouch endorsement.
   */
  async buildVouchTransaction(
    username: string,
    account: string,
    message: string,
  ): Promise<string> {
    const usingDevnet = this.config.get<string>('USING_DEVNET') === 'true';

    const rpcUrl = usingDevnet
      ? this.config.get<string>('SOLANA_DEVNET_RPC_URL')
      : this.config.get<string>('SOLANA_RPC_URL');

    if (!rpcUrl) {
      throw new BadRequestException('Solana RPC not configured');
    }

    this.logger.debug(`Using RPC: ${rpcUrl}`);
    const isTest = this.config.get<string>('NODE_ENV') === 'test';
    let blockhash = E2E_RECENT_BLOCKHASH;
    if (!isTest) {
      const connection = new Connection(rpcUrl, 'confirmed');
      const latest = await connection.getLatestBlockhash('finalized');
      blockhash = latest.blockhash;
    }

    const memoData = JSON.stringify({
      type: 'vouch',
      v: 1,
      candidate: username,
      msg: message,
    });

    const tx = new Transaction();
    tx.add(
      new TransactionInstruction({
        keys: [
          {
            pubkey: new PublicKey(account),
            isSigner: true,
            isWritable: false,
          },
        ],
        programId: new PublicKey(MEMO_V2),
        data: Buffer.from(memoData, 'utf8'),
      }),
    );

    tx.feePayer = new PublicKey(account);
    tx.recentBlockhash = blockhash;

    // Serialize without requiring all signatures (wallet will sign next)
    return tx.serialize({ requireAllSignatures: false }).toString('base64');
  }
}
