import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Connection, PublicKey } from '@solana/web3.js';
import { SolanaAdapterService } from '../../modules/scoring/web3-adapter/solana-adapter.service';

export type VoucherWeight = 'verified' | 'standard' | 'new';

const CACHE_KEY = (wallet: string) => `vouch:quality:${wallet}`;
const CACHE_TTL = 86400; // 24 h
const MIN_AGE_DAYS = 30;

@Injectable()
export class VoucherQualityService {
  private readonly logger = new Logger(VoucherQualityService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject('REDIS') private readonly redis: Redis,
    private readonly solanaAdapter: SolanaAdapterService,
  ) {}

  async assessVoucherWallet(walletAddress: string): Promise<VoucherWeight> {
    // ── Cache check ──────────────────────────────────────────────
    try {
      const cached = await this.redis.get(CACHE_KEY(walletAddress));
      if (cached) {
        return cached as VoucherWeight;
      }
    } catch {
      // Non-fatal, proceed without cache
    }

    const usingDevnet = this.config.get<string>('USING_DEVNET') === 'true';

    const rpcUrl = usingDevnet
      ? this.config.get<string>('SOLANA_DEVNET_RPC_URL')
      : this.config.get<string>('SOLANA_RPC_URL');

    if (!rpcUrl) {
      this.logger.warn(
        'SOLANA_RPC_URL not configured, defaulting to standard',
      );
      return 'standard';
    }

    try {
      const connection = new Connection(rpcUrl);
      const pubkey = new PublicKey(walletAddress);

      // ── Step 1: wallet age ───────────────────────────────────
      const sigs = await connection.getSignaturesForAddress(pubkey, {
        limit: 1000,
      });

      if (sigs.length === 0) {
        return this.cacheAndReturn(walletAddress, 'new');
      }

      const oldestBlockTime =
        sigs[sigs.length - 1].blockTime ?? Date.now() / 1000;
      const ageInDays = (Date.now() / 1000 - oldestBlockTime) / 86400;

      // ── Step 2: program check (only for wallets >= 30d old) ──
      if (ageInDays < MIN_AGE_DAYS) {
        return this.cacheAndReturn(walletAddress, 'new');
      }

      const programs =
        await this.solanaAdapter.fetchProgramsByAuthority(walletAddress);

      if (programs.length > 0) {
        return this.cacheAndReturn(walletAddress, 'verified');
      }

      // ── Step 3: age-based standard ───────────────────────────
      return this.cacheAndReturn(walletAddress, 'standard');
    } catch (err) {
      this.logger.warn(
        { walletAddress, err: (err as Error).message },
        'assessVoucherWallet_rpc_error, failing open',
      );
      return 'standard'; // fail open, don't penalise voucher for RPC outage
    }
  }

  // ─────────────────────────────────────────────────────────────
  private async cacheAndReturn(
    walletAddress: string,
    weight: VoucherWeight,
  ): Promise<VoucherWeight> {
    try {
      await this.redis.set(CACHE_KEY(walletAddress), weight, 'EX', CACHE_TTL);
    } catch {
      // Non-fatal, cache miss is acceptable
    }
    return weight;
  }
}
