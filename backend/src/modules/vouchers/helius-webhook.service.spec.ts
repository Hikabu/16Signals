import { HeliusWebhookService, HeliusTx } from './helius-webhook.service';
import { VouchesService } from './vouches.service';
import bs58 from 'bs58';

// ── Constants ────────────────────────────────────────────────────────────────
const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

const validVouchMemo = JSON.stringify({
  type: 'vouch',
  v: 1,
  candidate: 'alice',
  msg: 'great dev',
});

/** Encode a UTF-8 string → base58 (mirrors what Helius does in instructions.data) */
function encodeBase58(text: string): string {
  return bs58.encode(Buffer.from(text, 'utf8'));
}

function makeValidTxWithMemoField(
  memo: string | null = validVouchMemo,
): HeliusTx {
  return {
    signature: 'sig_abc123',
    feePayer: 'VoucherWallet111',
    memo,
    instructions: [],
  };
}

function makeValidTxWithInstruction(memoText: string): HeliusTx {
  return {
    signature: 'sig_abc123',
    feePayer: 'VoucherWallet111',
    memo: null,
    instructions: [
      {
        programId: MEMO_PROGRAM,
        data: encodeBase58(memoText),
        accounts: [],
      },
    ],
  };
}

// ── Suite ────────────────────────────────────────────────────────────────────
describe('HeliusWebhookService', () => {
  let service: HeliusWebhookService;
  let mockVouchesService: jest.Mocked<
    Pick<VouchesService, 'confirmVouchFromWebhook'>
  >;

  beforeEach(() => {
    service = new HeliusWebhookService();
    mockVouchesService = {
      confirmVouchFromWebhook: jest.fn().mockResolvedValue({ id: 'vouch-1' }),
    };
  });

  afterEach(() => jest.clearAllMocks());

  // ──────────────────────────────────────────────────────────────────────────
  // parseMemoFromTx
  // ──────────────────────────────────────────────────────────────────────────

  describe('parseMemoFromTx', () => {
    // 1. tx.memo present → returned directly
    it('1. returns tx.memo directly when populated', () => {
      const tx = makeValidTxWithMemoField(validVouchMemo);
      expect(service.parseMemoFromTx(tx)).toBe(validVouchMemo);
    });

    // 2. tx.memo null, valid base58 instruction → decoded UTF-8
    it('2. decodes base58 instruction data when tx.memo is null', () => {
      const tx = makeValidTxWithInstruction(validVouchMemo);
      expect(service.parseMemoFromTx(tx)).toBe(validVouchMemo);
    });

    // 3. tx.memo null, no Memo instruction → null
    it('3. returns null when there is no Memo instruction', () => {
      const tx: HeliusTx = {
        signature: 'sig_abc',
        feePayer: 'wallet',
        memo: null,
        instructions: [
          { programId: 'SomeProgramXyz', data: 'abc', accounts: [] },
        ],
      };
      expect(service.parseMemoFromTx(tx)).toBeNull();
    });

    // 4. tx.memo null, invalid base58 data → null (no throw)
    it('4. returns null when Memo instruction data cannot be base58-decoded', () => {
      const tx: HeliusTx = {
        signature: 'sig_abc',
        feePayer: 'wallet',
        memo: null,
        instructions: [
          {
            programId: MEMO_PROGRAM,
            // bs58 decode will fail on non-base58 chars like spaces
            data: '   NOT VALID BASE58!!!   ',
            accounts: [],
          },
        ],
      };
      expect(service.parseMemoFromTx(tx)).toBeNull();
    });

    // 5. tx.memo with surrounding spaces → trimmed
    it('5. trims whitespace from tx.memo', () => {
      const tx = makeValidTxWithMemoField('   padded with spaces   ');
      expect(service.parseMemoFromTx(tx)).toBe('padded with spaces');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // processWebhookPayload
  // ──────────────────────────────────────────────────────────────────────────

  describe('processWebhookPayload', () => {
    // 6. Single valid vouch tx → confirmVouchFromWebhook called once with correct params
    it('6. calls confirmVouchFromWebhook once for a valid vouch tx', async () => {
      const tx = makeValidTxWithMemoField(validVouchMemo);

      await service.processWebhookPayload(
        [tx],
        mockVouchesService as unknown as VouchesService,
      );

      expect(mockVouchesService.confirmVouchFromWebhook).toHaveBeenCalledTimes(
        1,
      );
      expect(mockVouchesService.confirmVouchFromWebhook).toHaveBeenCalledWith({
        txSignature: tx.signature,
        candidateUsername: 'alice',
        voucherWallet: tx.feePayer,
        message: 'great dev',
      });
    });

    // 7. 2 txs: 1 valid vouch + 1 non-vouch type → only 1 call
    it('7. skips txs where memo.type !== "vouch"', async () => {
      const nonVouchMemo = JSON.stringify({
        type: 'transfer',
        v: 1,
        candidate: 'alice',
        msg: 'hi',
      });
      const txValid = makeValidTxWithMemoField(validVouchMemo);
      const txOther = makeValidTxWithMemoField(nonVouchMemo);

      await service.processWebhookPayload(
        [txValid, txOther],
        mockVouchesService as unknown as VouchesService,
      );

      expect(mockVouchesService.confirmVouchFromWebhook).toHaveBeenCalledTimes(
        1,
      );
    });

    // 8. Memo is not JSON → no call, no throw
    it('8. silently skips txs with non-JSON memo', async () => {
      const tx = makeValidTxWithMemoField('not-json-at-all!!!');

      await expect(
        service.processWebhookPayload(
          [tx],
          mockVouchesService as unknown as VouchesService,
        ),
      ).resolves.not.toThrow();

      expect(mockVouchesService.confirmVouchFromWebhook).not.toHaveBeenCalled();
    });

    // 9. memo.candidate missing → no call
    it('9. skips txs where memo.candidate is missing', async () => {
      const memo = JSON.stringify({ type: 'vouch', v: 1, msg: 'hi' }); // no candidate
      const tx = makeValidTxWithMemoField(memo);

      await service.processWebhookPayload(
        [tx],
        mockVouchesService as unknown as VouchesService,
      );

      expect(mockVouchesService.confirmVouchFromWebhook).not.toHaveBeenCalled();
    });

    // 10. msg is 250 chars → message passed to service is truncated to 200
    it('10. truncates msg to 200 characters', async () => {
      const longMsg = 'x'.repeat(250);
      const memo = JSON.stringify({
        type: 'vouch',
        v: 1,
        candidate: 'alice',
        msg: longMsg,
      });
      const tx = makeValidTxWithMemoField(memo);

      await service.processWebhookPayload(
        [tx],
        mockVouchesService as unknown as VouchesService,
      );

      expect(mockVouchesService.confirmVouchFromWebhook).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'x'.repeat(200) }),
      );
    });

    // 11. Empty array → no call, no throw
    it('11. handles empty payload array gracefully', async () => {
      await expect(
        service.processWebhookPayload(
          [],
          mockVouchesService as unknown as VouchesService,
        ),
      ).resolves.not.toThrow();

      expect(mockVouchesService.confirmVouchFromWebhook).not.toHaveBeenCalled();
    });

    // 12. confirmVouchFromWebhook throws → does not propagate, continues processing
    it('12. continues processing if confirmVouchFromWebhook throws', async () => {
      mockVouchesService.confirmVouchFromWebhook
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({ id: 'vouch-2' } as any);

      const memo2 = JSON.stringify({
        type: 'vouch',
        v: 1,
        candidate: 'bob',
        msg: 'nice',
      });
      const tx1 = {
        ...makeValidTxWithMemoField(validVouchMemo),
        signature: 'sig1',
      };
      const tx2 = { ...makeValidTxWithMemoField(memo2), signature: 'sig2' };

      await expect(
        service.processWebhookPayload(
          [tx1, tx2],
          mockVouchesService as unknown as VouchesService,
        ),
      ).resolves.not.toThrow();

      // Both txs attempted, second one succeeds even though first threw
      expect(mockVouchesService.confirmVouchFromWebhook).toHaveBeenCalledTimes(
        2,
      );
    });

    // version guard: memo.v !== 1 → skipped
    it('skips txs where memo.v !== 1', async () => {
      const memo = JSON.stringify({
        type: 'vouch',
        v: 2,
        candidate: 'alice',
        msg: 'hi',
      });
      const tx = makeValidTxWithMemoField(memo);

      await service.processWebhookPayload(
        [tx],
        mockVouchesService as unknown as VouchesService,
      );

      expect(mockVouchesService.confirmVouchFromWebhook).not.toHaveBeenCalled();
    });

    // msg missing → skipped
    it('skips txs where memo.msg is missing', async () => {
      const memo = JSON.stringify({ type: 'vouch', v: 1, candidate: 'alice' }); // no msg
      const tx = makeValidTxWithMemoField(memo);

      await service.processWebhookPayload(
        [tx],
        mockVouchesService as unknown as VouchesService,
      );

      expect(mockVouchesService.confirmVouchFromWebhook).not.toHaveBeenCalled();
    });
  });
});
