import {
  Injectable,
  Inject,
  HttpException,
  HttpStatus,
  ConflictException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SyncStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import * as crypto from 'crypto';
import { encrypt } from '../../shared/utils/crypto.utils';
import { ProfileResolverService } from '../profile-candidate/profile-resolver.service';

@Injectable()
export class GithubSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly profileResolver: ProfileResolverService,
    @Inject('REDIS') private readonly redis: Redis,
    @InjectQueue('github-sync') private readonly githubSyncQueue: Queue,
  ) {}

  // ─── Connect step 1: generate state, return OAuth URL ────────────
  async startConnect(userId: string): Promise<string> {
    const state = crypto.randomBytes(16).toString('hex');
    // Store userId against state for 5 minutes, same as link flow
    await this.redis.set(`github_sync_state:${state}`, userId, 'EX', 300);

    const clientId = this.config.get('GITHUB_AUTH_CLIENT_ID');
    const callbackUrl = `${this.config.get('app.url')}${this.config.get('auth.githubSyncConnectCallback')}`;
    // console.log('callback url: ', callbackUrl);
    const scopes = encodeURIComponent('read:user repo');
    //TODO >>> START CONNECT 
    return `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${callbackUrl}&scope=${scopes}&state=${state}`;
  }

  // ─── Connect step 2: OAuth callback → create GithubProfile ───────
  async connectGithub(
    githubData: {
      githubId: string;
      username: string;
      accessToken: string;
      scopes: string[];
    },
    state: string,
  ) {
    // Recover userId from Redis state, same pattern as linkOAuth
    const userId = await this.redis.get(`github_sync_state:${state}`);
    if (!userId) {
      throw new UnauthorizedException(
        'Invalid or expired connect state. Please try again.',
      );
    }
    await this.redis.del(`github_sync_state:${state}`);

    // const candidate = await this.ensureDevCandidate(userId);
    const { devProfile } = await this.profileResolver.ensureDevStack(userId);
    if (!devProfile) {
      throw new InternalServerErrorException(
        'Failed to ensure developer profile.',
      );
    }
    const key = this.config.get<string>('GITHUB_AUTH_ENCRYPTION_KEY');
    if (!key) {
      throw new InternalServerErrorException(
        'Encryption key is not configured.',
      );
    }
    const encryptedToken = encrypt(githubData.accessToken, key);

    await this.prisma.githubProfile.upsert({
      where: { developerProfileId: devProfile.id },
      create: {
        developerProfile: { connect: { id: devProfile.id } },
        githubUsername: githubData.username,
        githubUserId: githubData.githubId,
        encryptedToken,
        scopes: githubData.scopes,
      },
      update: {
        // Rotate token on re-connect (expired or user re-authorized)
        githubUsername: githubData.username,
        githubUserId: githubData.githubId,
        encryptedToken,
        scopes: githubData.scopes,
        syncStatus: SyncStatus.CONNECT_SUCCESS,
        syncProgress: 0,
        syncError: null,
      },
    });

    // Immediately enqueue sync after connecting
    return this.triggerSync(userId);
  }

  // ─── Trigger sync ─────────────────────────────────────────────────
  async triggerSync(userId: string) {
    const { devProfile } = await this.profileResolver.ensureDevStack(userId);
    const githubProfile = devProfile?.githubProfile;

    if (!githubProfile) {
      // Frontend should redirect to /me/github/sync/connect on this code
      throw new ConflictException({
        code: 'GITHUB_NOT_CONNECTED',
        message: 'Connect your GitHub account to continue.',
        redirectTo: '/me/github/sync/connect',
      });
    }

    // Rate limit check using DeveloperProfile.githubCooldownUntil
    if (devProfile?.githubCooldownUntil && devProfile.githubCooldownUntil > new Date()) {
      const diffMs = devProfile.githubCooldownUntil.getTime() - Date.now();
      const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));

      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: `You can only sync once every 24 hours.`,
          cooldownUntil: devProfile.githubCooldownUntil,
          retryAfter: diffHours,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Set new cooldown (24 hours from now)
    // const cooldownUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
    // await this.prisma.developerProfile.update({
    //   where: { id: devProfile.id },
    //   data: { githubCooldownUntil: cooldownUntil },
    // });

    const updated = await this.prisma.githubProfile.update({
      where: { id: githubProfile.id },
      data: {
        syncStatus: SyncStatus.SYNC_REQUEST,
        syncProgress: 0,
        syncError: null,
      },
    });

    // console.log('addign sync job to queue with data');

    await this.githubSyncQueue.add('sync-profile', {
      candidateId: devProfile.candidateId,
      githubProfileId: githubProfile.id,
      userId,
    });

    return {
      synced: true,
      githubUsername: updated.githubUsername,
    };
  }

  // ─── Status ───────────────────────────────────────────────────────
  async getSyncStatus(userId: string) {
  const { devProfile } = await this.profileResolver.ensureDevStack(userId);
  
  if (!devProfile?.githubProfile) {
    return {
      isLinked: false,
      syncStatus: 'NOT_SYNCED',
    };
  }

    const profile = devProfile.githubProfile;
    return {
      isLinked: true,
      syncStatus: profile.syncStatus,
      syncProgress: profile.syncProgress,
      lastSyncAt: profile.lastSyncAt,
      error: profile.syncError,
      githubUsername: profile.githubUsername,
      cooldownUntil: devProfile.githubCooldownUntil,
    };
  }
///ONLY TESTING - DELETE TODO

  async unsyncGithub(userId: string) {
  const { devProfile } = await this.profileResolver.ensureDevStack(userId);

  if (!devProfile?.githubProfile) {
    return {
      ok: true,
      message: 'Already unsynced',
    };
  }

  // reset github profile
 await this.prisma.githubProfile.delete({
  where: { id: devProfile.githubProfile.id },
});

await this.prisma.developerProfile.update({
  where: { id: devProfile.id },
  data: {
    githubCooldownUntil: null,
  },
});

  return {
    ok: true,
    message: 'GitHub unsynced successfully',
  };
}
}
