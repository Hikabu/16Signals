import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import Redis from 'ioredis';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';
import { ProfileResolverService } from '../profile-candidate/profile-resolver.service';
import crypto from 'crypto';

@Injectable()
export class WalletSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profileResolver: ProfileResolverService,
    @Inject('REDIS') private readonly redis: Redis,
  ) {}

  async generateChallenge(userId: string): Promise<string> {
    const randomHex = crypto.randomBytes(8).toString('hex');
    const timestamp = Date.now();
    const challenge = `link-wallet:${userId}:${timestamp}:${randomHex}`;

    await this.redis.set(`wallet-challenge:${userId}`, challenge, 'EX', 300);

    return challenge;
  }
async linkWallet(
  userId: string,
  walletAddress: string,
  signature: string,
  message?: string,
): Promise<{ linked: boolean; solanaAddress: string }> {
  // 1. Validate wallet format
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
    throw new BadRequestException('Invalid Solana wallet address');
  }

  // 2. Resolve challenge
  let finalChallenge: string;

  if (message) {
    const parts = message.split(':');

    if (parts.length !== 4 || parts[0] !== 'link-wallet') {
      throw new BadRequestException('Invalid challenge message format');
    }

    const [, challengeUserId, timestampStr] = parts;

    if (challengeUserId !== userId) {
      throw new UnauthorizedException('Challenge user mismatch');
    }

    const timestamp = parseInt(timestampStr, 10);

    if (Number.isNaN(timestamp)) {
      throw new BadRequestException('Invalid timestamp');
    }

    if (Math.abs(Date.now() - timestamp) > 300_000) {
      throw new UnauthorizedException('Challenge expired');
    }

    finalChallenge = message;
  } else {
    const challenge = await this.redis.get(`wallet-challenge:${userId}`);

    if (!challenge) {
      throw new NotFoundException('Challenge expired or not found');
    }

    finalChallenge = challenge;
    await this.redis.del(`wallet-challenge:${userId}`);
  }

  // 3. Verify signature (BEFORE DB writes)
  try {
    const msgBytes = Buffer.from(finalChallenge, 'utf8');
    const sigBytes = bs58.decode(signature);
    const pubkeyBytes = new PublicKey(walletAddress).toBytes();

    const valid = nacl.sign.detached.verify(
      msgBytes,
      sigBytes,
      pubkeyBytes,
    );

    if (!valid) {
      throw new UnauthorizedException('Wallet signature invalid');
    }
  } catch (err) {
    throw new UnauthorizedException(
      `Verification failed: ${(err as Error).message}`,
    );
  }

  // 4. Ensure dev profile exists
  const { devProfile } = await this.profileResolver.ensureDevStack(userId);
  if (!devProfile) throw new Error('Developer profile not found');

  // 5. Upsert wallet
  await this.prisma.web3Profile.upsert({
    where: { developerProfileId: devProfile.id },
    create: {
      developerProfileId: devProfile.id,
      solanaAddress: walletAddress,
    },
    update: {
      solanaAddress: walletAddress,
    },
  });

  // 6. Apply cooldown AFTER successful link (15 min)
  await this.prisma.developerProfile.update({
    where: { id: devProfile.id },
    data: {
      walletCooldownUntil: new Date(Date.now() + 15 * 60 * 1000),
    },
  });

  return {
    linked: true,
    solanaAddress: walletAddress,
  };
}

async unsyncWallet(userId: string) {
  const { devProfile } = await this.profileResolver.ensureDevStack(userId);
  if (!devProfile) throw new Error('Developer profile not found');

  await this.prisma.developerProfile.update({
    where: { id: devProfile.id },
    data: {
      walletCooldownUntil: null,
    },
  })

  if (devProfile?.web3Profile) {
    await this.prisma.web3Profile.delete({
      where: { id: devProfile.web3Profile.id },
    })
  }

  return {
    unlinked: true,
  }
}
}