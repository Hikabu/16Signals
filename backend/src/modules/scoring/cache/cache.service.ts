import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import Redis from 'ioredis';
import { AnalysisResult } from '../types/result.types';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly CACHE_TTL_SECONDS = 86400; // 24 hours

  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS') private readonly redis: Redis,
  ) {}

  /**
   * Normalizes and builds a cache key for a given username and optional wallet
   * Cases:
   * 1. GitHub only:       'analysis:{githubUsername}'
   * 2. GitHub + wallet:   'analysis:{githubUsername}:{walletAddress}'
   * 3. Wallet only:       'analysis:wallet:{walletAddress}'
   */
  buildCacheKey(username?: string, walletAddress?: string): string {
    if (username && walletAddress) {
      return `analysis:${username.toLowerCase()}:${walletAddress}`;
    }
    if (username) {
      return `analysis:${username.toLowerCase()}`;
    }
    if (walletAddress) {
      return `analysis:wallet:${walletAddress}`;
    }
    throw new Error('Either username or walletAddress must be provided');
  }

  /**
   * Retrieves a result from cache (Redis -> Postgres fallback)
   */
  async get(cacheKey: string): Promise<AnalysisResult | null> {
    try {
      // 1. Try Redis
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit (Redis): ${cacheKey}`);
        return JSON.parse(cached) as AnalysisResult;
      }

      // 2. Try Postgres
      const dbEntry = await this.prisma.cachedResult.findUnique({
        where: { cacheKey },
      });

      if (dbEntry) {
        const now = new Date();
        if (dbEntry.expiresAt > now) {
          this.logger.debug(
            `Cache hit (Postgres): ${cacheKey}. Restoring to Redis.`,
          );
          const result = dbEntry.result as unknown as AnalysisResult;

          // Restore to Redis
          const ttl = Math.floor(
            (dbEntry.expiresAt.getTime() - now.getTime()) / 1000,
          );
          if (ttl > 0) {
            await this.redis.set(cacheKey, JSON.stringify(result), 'EX', ttl);
          }

          return result;
        } else {
          // Expired - clean up
          this.logger.debug(`Cache expired (Postgres): ${cacheKey}. Deleting.`);
          await this.prisma.cachedResult.delete({ where: { id: dbEntry.id } });
        }
      }
    } catch (error) {
      this.logger.error(
        `Error retrieving from cache: ${error.message}`,
        error.stack,
      );
    }

    return null;
  }

  /**
   * Sets a result in both Redis and Postgres cache
   */
  async set(cacheKey: string, result: AnalysisResult): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + this.CACHE_TTL_SECONDS * 1000);

      // 1. Set in Redis
      await this.redis.set(
        cacheKey,
        JSON.stringify(result),
        'EX',
        this.CACHE_TTL_SECONDS,
      );

      // 2. Set in Postgres (Upsert)
      await this.prisma.cachedResult.upsert({
        where: { cacheKey },
        create: {
          cacheKey,
          result: result as any,
          expiresAt,
        },
        update: {
          result: result as any,
          expiresAt,
        },
      });

      this.logger.debug(`Cache set: ${cacheKey}`);
    } catch (error) {
      this.logger.error(`Error setting cache: ${error.message}`, error.stack);
    }
  }

  /**
   * Invalidates a cache entry in both layers
   */
  async invalidate(cacheKey: string): Promise<void> {
    try {
      await Promise.all([
        this.redis.del(cacheKey),
        this.prisma.cachedResult.deleteMany({ where: { cacheKey } }),
      ]);
      this.logger.debug(`Cache invalidated: ${cacheKey}`);
    } catch (error) {
      this.logger.error(
        `Error invalidating cache: ${error.message}`,
        error.stack,
      );
    }
  }

  async del(key: string): Promise<void> {
  await this.redis.del(key);
}
}
