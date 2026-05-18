import { Injectable, Logger } from '@nestjs/common';
import bs58 from 'bs58';
import { VouchesService } from './vouches.service';

/** Memo Program v2 (SPL Memo), the one Helius reports in `instructions` */
const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

/**
 * Relevant fields from a Helius Enhanced Transaction object.
 * Only the fields this service actually reads are listed.
 */
export interface HeliusTx {
  signature: string;
  /** Fee payer == the wallet that signed and paid, i.e. the voucher's wallet */
  feePayer: string;
  instructions?: Array<{
    programId: string;
    /** Base58-encoded instruction data (Memo data is raw UTF-8 bytes → base58) */
    data: string;
    accounts: string[];
  }>;
  /**
   * Helius populates this top-level field when a Memo instruction is present.
   * It is the human-readable UTF-8 string already decoded.
   */
  memo?: string | null;
}

@Injectable()
export class HeliusWebhookService {
  private readonly logger = new Logger(HeliusWebhookService.name);

  // ─── Payload parser ───────────────────────────────────────────────────────

  /**
   * Extracts the raw memo string from a Helius Enhanced Transaction.
   *
   * Priority:
   *   1. `tx.memo` , Helius pre-decodes it for us.
   *   2. Walk `tx.instructions`, find the Memo program, and decode its
   *      base58-encoded data as a UTF-8 string.
   *
   * Returns `null` when no readable memo is present.
   */
  parseMemoFromTx(tx: HeliusTx): string | null {
    // Fast path: Helius already extracted it
    if (tx.memo) return tx.memo.trim();

    // Fallback: scan instructions for the Memo program
    const memoIx = tx.instructions?.find((ix) => ix.programId === MEMO_PROGRAM);
    if (!memoIx?.data) return null;

    try {
      const bytes = bs58.decode(memoIx.data);
      return Buffer.from(bytes).toString('utf8');
    } catch {
      return null;
    }
  }

  // ─── Entry point called by the webhook controller ─────────────────────────

  /**
   * Processes a full Helius Enhanced Transaction webhook payload (array).
   *
   * For each transaction:
   *   1. Extract memo string.
   *   2. Parse JSON.
   *   3. Validate vouch shape (`type === 'vouch'`, `v === 1`, required fields).
   *   4. Delegate to `VouchesService.confirmVouchFromWebhook` which never throws.
   */
  async processWebhookPayload(
    payload: HeliusTx[],
    vouchesService: VouchesService,
  ): Promise<void> {
    for (const tx of payload) {
      // 1. Extract memo
      const rawMemo = this.parseMemoFromTx(tx);
      if (!rawMemo) continue; // Not a Memo tx we care about

      // 2. Parse JSON
      let memo: Record<string, unknown>;
      try {
        memo = JSON.parse(rawMemo) as Record<string, unknown>;
      } catch {
        // Not JSON, not our vouch format
        continue;
      }

      // 3. Validate vouch shape
      if (memo.type !== 'vouch') continue;
      if (memo.v !== 1) continue;
      if (!memo.candidate || typeof memo.candidate !== 'string') continue;
      if (!memo.msg || typeof memo.msg !== 'string') continue;

      this.logger.debug(
        {
          txSignature: tx.signature,
          candidate: memo.candidate,
          feePayer: tx.feePayer,
        },
        'helius_vouch_tx_received',
      );

      // 4. Confirm via VouchesService, never throws natively, but errors are caught defensively
      try {
        await vouchesService.confirmVouchFromWebhook({
          txSignature: tx.signature,
          candidateUsername: memo.candidate,
          voucherWallet: tx.feePayer,
          message: memo.msg.slice(0, 200),
        });
      } catch (err) {
        this.logger.error(
          { txSignature: tx.signature, err: (err as Error).message },
          'Unhandled error in confirmVouchFromWebhook',
        );
      }
    }
  }
}
