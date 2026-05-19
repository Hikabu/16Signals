import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VouchesService } from '../vouches.service';
import { VoucherQualityService } from '../voucher-quality.service';
import { PrismaService } from '../../../prisma/prisma.service';

// ── Solana web3.js mock ────────────────────────────────────────────────────
const mockGetTransaction = jest.fn();
const mockNaclVerify = jest.fn();

jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn().mockImplementation(() => ({
    getTransaction: mockGetTransaction,
  })),
  PublicKey: jest.fn().mockImplementation((key: string) => ({
    toBase58: () => key,
    toBytes: () => Buffer.from(key, 'utf8'), // dummy fixed bytes
  })),
}));

jest.mock('tweetnacl', () => ({
  sign: {
    detached: {
      verify: (...args: any[]) => mockNaclVerify(...args),
    },
  },
}));

jest.mock('bs58', () => ({
  decode: (s: string) => Buffer.from(s, 'utf8'),
}));

// ── Fixtures ───────────────────────────────────────────────────────────────
const VOUCHER_WALLET = 'VoucherWallet111';
const CANDIDATE_WALLET = 'CandidateWallet111';
const MESSAGE = 'Great dev!';
const TX_SIG = 'sig_test_signature';

const CANDIDATE = {
  id: 'cand-1UUID',
  devProfile: {
    web3Profile: { solanaAddress: CANDIDATE_WALLET },
    githubProfile: { githubUsername: 'alice' },
  },
};

const BASE_INPUT = {
  candidateIdentifier: 'alice',
  message: MESSAGE,
  txSignature: TX_SIG,
};

function makeMockTx(memoText = MESSAGE, candidate = 'alice') {
  const jsonMemo = JSON.stringify({ type: 'vouch', candidate, msg: memoText });
  return {
    meta: { err: null },
    transaction: {
      message: {
        staticAccountKeys: [
          { toBase58: () => VOUCHER_WALLET },
          { toBase58: () => 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr' },
        ],
        compiledInstructions: [
          { programIdIndex: 1, data: Buffer.from(jsonMemo, 'utf8') },
        ],
      },
    },
  };
}

describe('VouchesService', () => {
  let service: VouchesService;
  let mockPrisma: any;
  let mockQuality: { assessVoucherWallet: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockGetTransaction.mockResolvedValue(makeMockTx());
    mockNaclVerify.mockReturnValue(true);

    mockPrisma = {
      vouch: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest
          .fn()
          .mockImplementation((args) =>
            Promise.resolve({ id: 'vouch-1', ...args.data }),
          ),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn().mockResolvedValue({ id: 'vouch-1', isActive: false }),
      },
      candidate: {
        findUnique: jest.fn().mockResolvedValue({
          devProfile: {
            web3Profile: { solanaAddress: VOUCHER_WALLET },
          },
        }),
        findFirst: jest.fn().mockResolvedValue(CANDIDATE),
      },
    };

    mockQuality = {
      assessVoucherWallet: jest.fn().mockResolvedValue('standard'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VouchesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: VoucherQualityService, useValue: mockQuality },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('http://mock-rpc') },
        },
      ],
    }).compile();

    service = module.get<VouchesService>(VouchesService);
  });

  describe('confirmVouch Anti-Abuse', () => {
    // 7. voucherWallet === candidate.devProfile.web3Profile.walletAddress → 400 self-vouch
    it('throws BadRequestException for self-vouching', async () => {
      // Override caller profile to return the target candidate's own wallet
      mockPrisma.candidate.findUnique.mockResolvedValue({
        devProfile: {
          web3Profile: { solanaAddress: CANDIDATE_WALLET },
        },
      });
      await expect(
        service.confirmVouch(BASE_INPUT, 'user-abc'),
      ).rejects.toThrow(BadRequestException);
    });

    // 8. Same wallet already vouched for candidate (same candidateId) → 400 duplicate
    it('throws BadRequestException for duplicate vouch', async () => {
      mockPrisma.vouch.findUnique
        .mockResolvedValueOnce(null) // idempotency check in confirmVouch
        .mockResolvedValueOnce(null) // idempotency check in persistVouch
        .mockResolvedValueOnce({ id: 'existing' }); // duplicate check
      await expect(
        service.confirmVouch(BASE_INPUT, 'user-abc'),
      ).rejects.toThrow(BadRequestException);
    });

    // 9. voucherWallet has 5 active non-expired vouches → 400 budget exhausted
    it('throws BadRequestException when budget (5) is exhausted', async () => {
      mockPrisma.vouch.count.mockResolvedValue(5);
      await expect(
        service.confirmVouch(BASE_INPUT, 'user-abc'),
      ).rejects.toThrow(BadRequestException);
    });

    // 10. voucherWallet has 4 active + 1 expired → budget check passes (5 slots, 1 free)
    it('allows vouching if one slot is expired', async () => {
      mockPrisma.vouch.count.mockResolvedValue(4);
      const res = await service.confirmVouch(BASE_INPUT, 'user-abc');
      expect(res.id).toBe('vouch-1');
    });

    // 11. Cluster: 3+ vouches in 24h all from 'new' weight wallets → all flagged cluster_detected
    it('flags cluster if 3 "new" wallets vouch in 24h', async () => {
      mockPrisma.vouch.findMany.mockResolvedValue([
        { id: 'v1', voucherWallet: 'w1' },
        { id: 'v2', voucherWallet: 'w2' },
        { id: 'v3', voucherWallet: 'w3' },
      ]);
      mockQuality.assessVoucherWallet.mockResolvedValue('new');

      await service.runClusterCheck('cand-1UUID', 'w4');

      expect(mockPrisma.vouch.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isActive: false, flag: 'cluster_detected' },
        }),
      );
    });

    // 12. Cluster: 3 vouches but only 2 from 'new' wallets → no flag
    it('does not flag cluster if fewer than 3 wallets are "new"', async () => {
      mockPrisma.vouch.findMany.mockResolvedValue([
        { id: 'v1', voucherWallet: 'w1' },
        { id: 'v2', voucherWallet: 'w2' },
        { id: 'v3', voucherWallet: 'w3' },
      ]);
      mockQuality.assessVoucherWallet
        .mockResolvedValueOnce('new')
        .mockResolvedValueOnce('new')
        .mockResolvedValueOnce('standard');

      await service.runClusterCheck('cand-1UUID', 'w4');
      expect(mockPrisma.vouch.updateMany).not.toHaveBeenCalled();
    });

    // 13. Valid vouch saved correctly
    it('saves a valid vouch with correct weight and expiration', async () => {
      mockQuality.assessVoucherWallet.mockResolvedValue('verified');

      const res = await service.confirmVouch(BASE_INPUT, 'user-abc');

      expect(res.weight).toBe('verified');
      expect(res.candidateId).toBe('cand-1UUID');
      const expectedExpiryThreshold = Date.now() + 179 * 86400 * 1000;
      expect(res.expiresAt.getTime()).toBeGreaterThan(expectedExpiryThreshold);
    });
  });

  describe('revokeVouch', () => {
    const VOUCH_ID = 'vouch-uuid';

    beforeEach(() => {
      mockPrisma.vouch.findUnique.mockResolvedValue({
        id: VOUCH_ID,
        voucherWallet: VOUCHER_WALLET,
        isActive: true,
      });
    });

    // 14. Valid signed message → vouch.isActive: false, revokedAt set
    it('successfully revokes a vouch with valid signature', async () => {
      await service.revokeVouch(VOUCH_ID, VOUCHER_WALLET, 'valid_sig');
      expect(mockPrisma.vouch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isActive: false, revokedAt: expect.any(Date) },
        }),
      );
    });

    // 15. voucherWallet empty → 401
    it('throws UnauthorizedException if no wallet provided', async () => {
      await expect(service.revokeVouch(VOUCH_ID, '', 'sig')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    // 16. voucherWallet mismatch → 404
    it('throws NotFoundException if wallet does not own the vouch', async () => {
      await expect(
        service.revokeVouch(VOUCH_ID, 'WrongWallet', 'sig'),
      ).rejects.toThrow(NotFoundException);
    });

    // 17. Already inactive vouch → 400
    it('throws BadRequestException if vouch is already inactive', async () => {
      mockPrisma.vouch.findUnique.mockResolvedValue({
        id: VOUCH_ID,
        voucherWallet: VOUCHER_WALLET,
        isActive: false,
      });
      await expect(
        service.revokeVouch(VOUCH_ID, VOUCHER_WALLET, 'sig'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Refactor regression: path separation (tests 13-16 from spec)
  // ──────────────────────────────────────────────────────────────────────────

  describe('path separation regression', () => {
    const USER_ID = 'user-abc';
    const PERSIST_PARAMS = {
      txSignature: TX_SIG,
      candidateUsername: 'alice',
      voucherWallet: VOUCHER_WALLET,
      message: MESSAGE,
    };

    // 13. confirmVouch (Web UI path): getTransaction must be called
    it('13. confirmVouch calls getTransaction once (Web UI path)', async () => {
      await service.confirmVouch(BASE_INPUT, USER_ID);
      expect(mockGetTransaction).toHaveBeenCalledTimes(1);
      expect(mockGetTransaction).toHaveBeenCalledWith(TX_SIG, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      expect(mockPrisma.vouch.create).toHaveBeenCalledTimes(1);
    });

    // 14. confirmVouchFromWebhook (Helius path): getTransaction must NOT be called
    it('14. confirmVouchFromWebhook never calls getTransaction (webhook path)', async () => {
      await service.confirmVouchFromWebhook(PERSIST_PARAMS);
      expect(mockGetTransaction).not.toHaveBeenCalled();
      expect(mockPrisma.vouch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            txSignature: TX_SIG,
            candidateId: 'cand-1UUID',
            voucherWallet: VOUCHER_WALLET,
            message: MESSAGE,
          }),
        }),
      );
    });

    // 15. confirmVouchFromWebhook: persistVouch throws BadRequestException → returns null
    it('15. confirmVouchFromWebhook returns null when persistVouch throws BadRequestException', async () => {
      mockPrisma.vouch.findUnique.mockResolvedValue({ id: 'existing' }); // triggers idempotency → but actually let's use duplicate
      // Force duplicate: first findUnique (idempotency) → null, second (duplicate) → existing
      mockPrisma.vouch.findUnique
        .mockResolvedValueOnce(null) // idempotency in persistVouch
        .mockResolvedValueOnce({ id: 'existing' }); // duplicate check

      const result = await service.confirmVouchFromWebhook(PERSIST_PARAMS);
      expect(result).toBeNull();
    });

    // 16. confirmVouchFromWebhook: any error → returns null, no throw
    it('16. confirmVouchFromWebhook swallows all errors and returns null', async () => {
      mockPrisma.candidate.findFirst.mockRejectedValue(
        new Error('DB connection lost'),
      );

      await expect(
        service.confirmVouchFromWebhook(PERSIST_PARAMS),
      ).resolves.toBeNull();
    });
  });
});
