import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { EvidenceBrief } from '../../../types/evidence-brief.types';

@Injectable()
export class BriefCacheService {
  private readonly logger = new Logger(BriefCacheService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Build cache key with consistent format */
  static buildKey(username: string, mode: 'light' | 'deep', version = 'v5'): string {
    return `brief:${username}:${mode}:${version}`;
  }

  /** Retrieve evidence brief from DB if not expired */
  async get(key: string): Promise<EvidenceBrief | null> {
    try {
      const cached = await this.prisma.cachedResult.findUnique({
        where: { cacheKey: key },
      });

      if (!cached) return null;

      if (cached.expiresAt.getTime() < Date.now()) {
        // Expired cache entry, clean up asynchronously
        this.prisma.cachedResult
          .delete({ where: { cacheKey: key } })
          .catch((err) => this.logger.warn({ key, err: err.message }, 'expired_cache_cleanup_failed'));
        return null;
      }

      return cached.result as unknown as EvidenceBrief;
    } catch (err: any) {
      this.logger.error({ key, err: err.message }, 'cache_get_failed');
      return null;
    }
  }

  /** Write or update cache result */
  async set(key: string, brief: EvidenceBrief, ttlSeconds: number): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      await this.prisma.cachedResult.upsert({
        where: { cacheKey: key },
        update: {
          result: brief as any,
          expiresAt,
        },
        create: {
          cacheKey: key,
          result: brief as any,
          expiresAt,
        },
      });
    } catch (err: any) {
      this.logger.error({ key, err: err.message }, 'cache_set_failed');
    }
  }

  /** Invalidate all cache versions for a user */
  async invalidate(username: string): Promise<void> {
    try {
      const pattern = `brief:${username}:`;
      await this.prisma.cachedResult.deleteMany({
        where: {
          cacheKey: {
            startsWith: pattern,
          },
        },
      });
    } catch (err: any) {
      this.logger.error({ username, err: err.message }, 'cache_invalidate_failed');
    }
  }
}
