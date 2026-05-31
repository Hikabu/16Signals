import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../scoring/cache/cache.service';
import { AnalysisResult } from '../scoring/types/result.types';
import { SCORING_SCHEMA_VERSION } from '../scoring/constants';

type RawScorecard = AnalysisResult;

@Injectable()
export class ScorecardService {
  private readonly logger = new Logger(ScorecardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Get scorecard from GithubProfile for a given userId.
   */
  async getScorecard(userId: string): Promise<RawScorecard | null> {
    const candidate = await this.prisma.candidate.findUnique({
      where: { userId },
      select: {
        id: true,
        devProfile: {
          select: {
            githubProfile: {
              select: {
                scorecard: true,
                scorecardUpdatedAt: true,
                githubUsername: true,
                lastSyncAt: true,
                syncStatus: true,
              },
            },
          },
        },
      },
    });

    if (!candidate) return null;

    const githubProfile = candidate.devProfile?.githubProfile;
    if (githubProfile?.scorecard) {
      return githubProfile.scorecard as unknown as RawScorecard;
    }

    const githubUsername = githubProfile?.githubUsername;
    if (!githubUsername) return null;

    this.logger.warn(`DB scorecard missing for user ${userId}, attempting recovery from cache`);
    const cached = await this.getScorecardFromCache(githubUsername);
    if (cached) {
      await this.persistRecoveredScorecard(githubUsername, cached);
      return cached;
    }

    const rebuilt = await this.rebuildScorecardFromAnalysis(githubUsername);
    if (rebuilt) {
      await this.persistRecoveredScorecard(githubUsername, rebuilt);
      return rebuilt;
    }

    return null;
  }

  /** Alias for getScorecard — used by controller */
  async getScorecardForUser(userId: string): Promise<RawScorecard | null> {
    return this.getScorecard(userId);
  }

  /** Preview scorecard from cache by username */
  async previewForUsername(username: string): Promise<RawScorecard | null> {
    const cached = await this.getScorecardFromCache(username);
    if (cached) return cached;

    // Try from GithubProfile
    const githubProfile = await this.prisma.githubProfile.findUnique({
      where: { githubUsername: username },
      select: { scorecard: true },
    });
    return (githubProfile?.scorecard as unknown as RawScorecard) ?? null;
  }

  /** Map RawScorecard to UI model (stub — returns raw) */
  async mapToUiModel(
    scorecard: RawScorecard | null,
    context?: { userId?: string; username?: string },
  ): Promise<any> {
    if (!scorecard) return null;
    // Pass through raw for now; UI transforms
    return scorecard;
  }

  /** Public: get scorecard from cache by username */
  async getScorecardFromCache(username: string): Promise<RawScorecard | null> {
    const cacheKey = this.cacheService.buildCacheKey(username, undefined);
    return this.cacheService.get(cacheKey) as Promise<RawScorecard | null>;
  }

  private async rebuildScorecardFromAnalysis(
    username: string,
  ): Promise<RawScorecard | null> {
    const cacheKey = this.cacheService.buildCacheKey(username, undefined);
    const cachedAnalysis = await this.cacheService.get(cacheKey);
    if (!cachedAnalysis) return null;

    const githubProfile = await this.prisma.githubProfile.findUnique({
      where: { githubUsername: username },
      select: { scorecard: true },
    });

    if (!githubProfile?.scorecard) {
      await this.persistRecoveredScorecard(username, cachedAnalysis as RawScorecard);
    }
    return cachedAnalysis as RawScorecard;
  }

  private async persistRecoveredScorecard(
    githubUsername: string,
    scorecard: RawScorecard,
  ) {
    await this.prisma.githubProfile.update({
      where: { githubUsername },
      data: {
        scorecard: scorecard as any,
        scorecardUpdatedAt: new Date(),
      },
    });
  }
}