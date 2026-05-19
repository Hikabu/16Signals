import { Injectable, Logger } from '@nestjs/common';
import { Octokit } from 'octokit';
import { ScorecardUiDto } from './contract/scorecard.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { ScorecardResult } from './scorecard.types';
import { GithubAdapterService } from '../scoring/github-adapter/github-adapter.service';
import { ConfigService } from '@nestjs/config';
import { AnalysisResult } from '../scoring/types/result.types';
import { CacheService } from '../scoring/cache/cache.service';
import { RawScorecard } from './contract/scorecard.schema';
import { User } from '@privy-io/node/resources/index';
import { SCORING_SCHEMA_VERSION } from '../scoring/constants';

@Injectable()
export class ScorecardService {
  private readonly logger = new Logger(ScorecardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly githubAdapter: GithubAdapterService,
    private readonly cacheService: CacheService,
  ) {}

  async computeForCandidate(candidateId: string): Promise<ScorecardResult> {
    this.logger.log(`Computing scorecard for candidate ${candidateId}`);
    return this.buildPlaceholderResult();
  }

  async previewForUsername(githubUsername: string): Promise<ScorecardResult> {
    this.logger.log(`Running headless preview for ${githubUsername}`);

    const githubToken = this.configService.get<string>('GITHUB_SYSTEM_TOKEN');
    if (!githubToken) {
      throw new Error('GITHUB_SYSTEM_TOKEN not configured');
    }

    // const octokit = new Octokit({
    //   request: {
    //     headers: {
    //       authorization: `token ${githubToken}`,
    //       'X-GitHub-Api-Version': '2022-11-28',
    //     },
    //   },
    // });
    const octokit = new Octokit({
  auth: githubToken,
  request: {
    headers: {
      'X-GitHub-Api-Version': '2022-11-28',
    },
  },
})

    await this.githubAdapter.fetchRawData(octokit, githubUsername);

    return this.buildPlaceholderResult();
  }

async getScorecardForUser({
  userId,
  username,
}: {
  userId?: string
  username?: string
}): Promise<RawScorecard | null> {

  const candidate = await this.prisma.candidate.findFirst({
    where: {
      OR: [
        userId
          ? { userId }
          : undefined,

        username
          ? {
              user: {
                username: username.toLowerCase(),
              },
            }
          : undefined,
      ].filter(Boolean) as any,
    },

      select: {
        id: true,
        scorecard: true,
        devProfile: {
          select: {
            githubProfile: {
              select: {
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

    if (candidate.scorecard) {
      return candidate.scorecard as RawScorecard;
    }

    const githubUsername = candidate.devProfile?.githubProfile?.githubUsername;
    
  if (!githubUsername) return null;

  this.logger.warn(
    `DB scorecard missing for user ${userId}, attempting recovery from cache`,
  );

    // 2. Redis fallback
  const cached = await this.getScorecardFromCache(githubUsername);

  if (cached) {
    await this.persistRecoveredScorecard(candidate.id, cached);
    return cached;
  }

  // 3. FINAL fallback: reconstruct from analysis cache
  const rebuilt = await this.rebuildScorecardFromAnalysis(githubUsername);

  if (rebuilt) {
    await this.persistRecoveredScorecard(candidate.id, rebuilt);
    return rebuilt;
  }

  return null;
  }
private async rebuildScorecardFromAnalysis(
  username: string,
): Promise<RawScorecard | null> {
  const cacheKey = this.cacheService.buildCacheKey(username, undefined);

  const cachedAnalysis = await this.cacheService.get(cacheKey);
  if (!cachedAnalysis) return null;

  const candidate = await this.prisma.candidate.findFirst({
    where: {
      devProfile: {
        githubProfile: { githubUsername: username },
      },
    },
    select: { id: true, scorecard: true },
  });

  if (!candidate) {
    return cachedAnalysis as RawScorecard;
  }

  // ONLY persist if missing
  if (!candidate.scorecard) {
    await this.persistRecoveredScorecard(candidate.id, cachedAnalysis as RawScorecard);
  }

  return cachedAnalysis as RawScorecard;
}
  private async persistRecoveredScorecard(candidateId: string, scorecard: RawScorecard) {
  await this.prisma.candidate.update({
    where: { id: candidateId },
    data: {
      scorecard: scorecard as any,
    },
  });
}

  async getScorecardFromCache(
    githubUsername: string,
  ): Promise<AnalysisResult | null> {
    const cacheKey = this.cacheService.buildCacheKey(githubUsername);
    return this.cacheService.get(cacheKey);
  }

  // ─────────────────────────────────────────────────────────────
  // UI MAPPER (FIXED)
  // ─────────────────────────────────────────────────────────────

async mapToUiModel(
  raw: RawScorecard | ScorecardResult,
  {
    userId,
    username,
  }: {
    userId?: string
    username?: string
  } = {},
): Promise<ScorecardUiDto> {
    const isRaw = (r: any): r is RawScorecard => 'ownership' in r;

    // ── Fallback / placeholder UI ─────────────────────────────
    if (!isRaw(raw)) {
      return {
        profile: {
          username: "unknown",
          avatarUrl: undefined,
          summary: 'Reviewing developer history...',
        },
        score: {
          value: 0,
          percentile: 0,
          isWithheld: { value: false },
        },
        trust: {
          level: 'PARTIAL' as any,
          risk: 'LOW_RISK' as any,
          label: 'NEUTRAL',
          guidance: 'Awaiting updated scoring analysis.',
        },
        insights: {
          capabilities: [],
          highlights: [],
          gaps: [],
          caveats: [],
          ownership: {
            ownedProjects: 0,
            activelyMaintained: 0,
            confidence: 'low',
          },
          impact: {
            activityLevel: 'low',
            consistency: 'sparse',
            externalContributions: 0,
            confidence: 'low',
          },
          reputation: null,
          organizations: [],
          interactionProfile: null,
          stack: { languages: [], tools: [] },
          web3: null,
        },
      };
    }

    const real = raw;

    

    const capabilities = [
      this.mapCapability('backend', real.capabilities.backend),
      this.mapCapability('frontend', real.capabilities.frontend),
      this.mapCapability('devops', real.capabilities.devops),
    ];

      const candidate = await this.prisma.candidate.findFirst({
     where: {
      OR: [
        userId
          ? { userId }
          : undefined,

        username
          ? {
              user: {
                username: username.toLowerCase(),
              },
            }
          : undefined,
      ].filter(Boolean) as any,
    },
    select: {
      id: true,
      devProfile: {
        select: {
          githubProfile: {
            select: {
              githubUsername: true,
              rawDataSnapshot: true,
            },
          },
        },
      },
    },
  });

  const githubProfile = candidate?.devProfile?.githubProfile;
  const githubUsername = githubProfile?.githubUsername;

    return {
      profile: {
        username: githubUsername ?? "unknown",
    avatarUrl: githubUsername
        ? `https://github.com/${githubUsername}.png`
        : undefined,
        summary: real.summary,
      },
      score: {
        value: this.computeOverallScore(real.capabilities),
        percentile: 0,
        isWithheld: { value: false },
      },
      trust: {
        level: this.mapConfidenceLevel(real),
        risk: 'LOW_RISK' as any,
        label: this.mapTrustLabel(real),
        guidance: this.mapGuidance(real),
      },
      insights: {
        capabilities, // ✅ FIXED (was [] → now correct)
        highlights: this.buildHighlights(real),
        gaps: this.buildGaps(real),
        caveats: [],
        ownership: real.ownership,
        impact: real.impact,
        reputation: real.reputation ?? null,
        privateWorkNote: real.privateWorkNote,
        organizations: real.organizations ?? [],
        interactionProfile: real.interactionProfile ?? null,
        stack: real.stack ?? { languages: [], tools: [] },
        web3: real.web3 ?? null,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // HELPERS (unchanged but valid)
  // ─────────────────────────────────────────────────────────────

  private buildGaps(raw: RawScorecard): string[] {
    const out: string[] = [];

    if (raw.capabilities.frontend.score < 0.5) {
      out.push('Limited frontend evidence');
    }
    if (raw.capabilities.devops.score < 0.5) {
      out.push('Limited DevOps exposure');
    }
    if (raw.impact.externalContributions === 0) {
      out.push('No external contributions detected');
    }

    return out;
  }

  private buildHighlights(raw: RawScorecard): string[] {
    const out: string[] = [];

    if (raw.capabilities.backend.score >= 0.7) {
      out.push('Strong backend capability');
    }
    if (raw.ownership.activelyMaintained > 5) {
      out.push(`Maintains ${raw.ownership.activelyMaintained} active projects`);
    }
    if (raw.impact.externalContributions > 0) {
      out.push('Has external/open-source contributions');
    }

    return out;
  }

  private mapGuidance(raw: RawScorecard): string {
    if (raw.impact.externalContributions === 0) {
      return 'Limited external contributions—consider reviewing project depth.';
    }
    return 'Sufficient activity and project ownership observed.';
  }

  private mapTrustLabel(raw: RawScorecard): string {
    if (raw.impact.confidence === 'high') return 'HIGH CONFIDENCE';
    if (raw.impact.confidence === 'medium') return 'MODERATE CONFIDENCE';
    return 'LOW CONFIDENCE';
  }

  private mapConfidenceLevel(raw: RawScorecard): string {
    const confidences = [
      raw.capabilities.backend.confidence,
      raw.capabilities.frontend.confidence,
      raw.capabilities.devops.confidence,
      raw.ownership.confidence,
      raw.impact.confidence,
    ];

    if (confidences.every((c) => c === 'high')) return 'FULL';
    if (confidences.includes('medium')) return 'PARTIAL';
    return 'LOW';
  }

  private mapCapability(
    key: 'backend' | 'frontend' | 'devops',
    data: { score: number; confidence: string },
  ) {
    return {
      key,
      label: this.labelize(key),
      score: data.score,
      displayScore: Math.round(data.score * 100),
      confidence: data.confidence,
      strength: this.mapStrength(data.score),
    };
  }

  private mapStrength(score: number): 'strong' | 'moderate' | 'weak' {
    if (score >= 0.7) return 'strong';
    if (score >= 0.4) return 'moderate';
    return 'weak';
  }

  private labelize(key: string): string {
    return key.charAt(0).toUpperCase() + key.slice(1);
  }

  private computeOverallScore(
    capabilities: RawScorecard['capabilities'],
  ): number {
    const scores = [
      capabilities.backend.score,
      capabilities.frontend.score,
      capabilities.devops.score,
    ];

    return Math.round(
      (scores.reduce((a, b) => a + b, 0) / scores.length) * 100,
    );
  }

  private buildPlaceholderResult(): ScorecardResult {
    return {
      summary: 'Reviewing developer history...',
      capabilities: {
        backend: { score: 0, confidence: 'low' },
        frontend: { score: 0, confidence: 'low' },
        devops: { score: 0, confidence: 'low' },
      },
      ownership: {
        ownedProjects: 0,
        activelyMaintained: 0,
        confidence: 'low',
      },
      impact: {
        activityLevel: 'low',
        consistency: 'sparse',
        externalContributions: 0,
        confidence: 'low',
      },
      reputation: null,
      organizations: [],
      interactionProfile: null,
      stack: { languages: [], tools: [] },
      web3: null,
      schemaVersion: SCORING_SCHEMA_VERSION
    };
  }
}
