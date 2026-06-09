import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../scoring/cache/cache.service';
import {
  CachedScorecard,
  ViewData,
} from '../analysis/llm/llm-response.types';
import {
  ScorecardViewType,
  RequestedMode,
  ViewSpecificOutput,
  SnapshotUiOutput,
  RecruiterUiOutput,
  DeepDiveUiOutput,
  PublicUiOutput,
  RawUiOutput,
} from './scorecard.types';

@Injectable()
export class ScorecardService {
  private readonly logger = new Logger(ScorecardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════
  // Public API — view-based scorecard retrieval
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Get scorecard for a GitHub username, rendered in the requested view.
   *
   * @param githubUsername - GitHub username to look up
   * @param options.mode - 'light' | 'deep' | undefined (latest)
   * @param options.view - 'snapshot' | 'recruiter' | 'deep' | 'public' | 'raw'
   */
  async getScorecardForGithubUser(
    githubUsername: string,
    options?: { mode?: RequestedMode; view?: ScorecardViewType },
  ): Promise<ViewSpecificOutput | null> {
    const scorecard = await this.loadScorecard(githubUsername);
    if (!scorecard) return null;

    const mode = this.resolveMode(scorecard, options?.mode);
    const view = options?.view ?? 'snapshot';
    const viewData = this.getViewData(scorecard, mode);
    if (!viewData) return null;

    return this.mapToView(viewData, scorecard.snapshot, mode, view);
  }

  /**
   * Get scorecard for a platform user, rendered in the requested view.
   */
  async getScorecardForUser(
    userId: string,
    options?: { mode?: RequestedMode; view?: ScorecardViewType },
  ): Promise<ViewSpecificOutput | null> {
    const candidate = await this.prisma.candidate.findUnique({
      where: { userId },
      select: {
        devProfile: {
          select: {
            githubProfile: {
              select: { githubUsername: true, scorecard: true, scorecardUpdatedAt: true },
            },
          },
        },
      },
    });

    const githubProfile = candidate?.devProfile?.githubProfile;
    if (!githubProfile?.githubUsername) return null;

    // If DB has a scorecard, use it directly
    if (githubProfile.scorecard) {
      const scorecard = githubProfile.scorecard as unknown as CachedScorecard;
      const mode = this.resolveMode(scorecard, options?.mode);
      const view = options?.view ?? 'snapshot';
      const viewData = this.getViewData(scorecard, mode);
      if (!viewData) return null;
      return this.mapToView(viewData, scorecard.snapshot, mode, view);
    }

    // Fallback: load via GitHub username
    return this.getScorecardForGithubUser(githubProfile.githubUsername, options);
  }

  /**
   * Get legacy raw scorecard (for backward compatibility with mock endpoints).
   */
  async getRawScorecard(githubUsername: string): Promise<CachedScorecard | null> {
    return this.loadScorecard(githubUsername);
  }

  // ═══════════════════════════════════════════════════════════════════
  // View Mappers
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Map view data to the requested view output.
   */
  private mapToView(
    viewData: ViewData,
    snapshot: CachedScorecard['snapshot'],
    mode: string,
    view: ScorecardViewType,
  ): ViewSpecificOutput {
    switch (view) {
      case 'public':
        return this.toPublicView(snapshot);
      case 'snapshot':
        return this.toSnapshotView(snapshot, viewData, mode);
      case 'recruiter':
        return this.toRecruiterView(snapshot, viewData, mode);
      case 'deep':
        return this.toDeepDiveView(snapshot, viewData, mode);
      case 'raw':
        return this.toRawView(snapshot, viewData, mode);
      default:
        return this.toSnapshotView(snapshot, viewData, mode);
    }
  }

  /**
   * Snapshot view — quick overview for CTO or listing pages.
   */
  private toSnapshotView(
    snapshot: CachedScorecard['snapshot'],
    viewData: ViewData,
    mode: string,
  ): SnapshotUiOutput {
    return {
      type: 'snapshot',
      username: snapshot.username,
      avatarUrl: snapshot.avatarUrl,
      techStack: snapshot.techStack,
      archetypeSummary: snapshot.archetypeSummary,
      analysisMode: mode,
      lastAnalyzedAt: viewData?.analyzedAt ?? null,
    };
  }

  /**
   * Recruiter view — screening with primitives, flags, and interview questions.
   */
  private toRecruiterView(
    snapshot: CachedScorecard['snapshot'],
    viewData: ViewData,
    mode: string,
  ): RecruiterUiOutput {
    const hardFlags = (viewData.flags || []).filter((f) => f.flag_type === 'HARD');
    const softFlags = (viewData.flags || []).filter((f) => f.flag_type === 'SOFT');
    const strongPrimitives = (viewData.primitives || []).filter(
      (p) => p.confidence === 'strong',
    ).length;
    const observabilityGaps = (viewData.primitives || []).filter(
      (p) => p.confidence === 'observability_gap',
    ).length;

    const recommendedAction =
      hardFlags.length > 0
        ? 'flag_review'
        : observabilityGaps > 3
          ? 'screen'
          : 'interview';

    return {
      type: 'recruiter',
      username: snapshot.username,
      avatarUrl: snapshot.avatarUrl,
      analysisMode: mode,
      lastAnalyzedAt: viewData?.analyzedAt ?? null,
      atAGlance: {
        totalFlags: viewData.flagCount ?? 0,
        hardFlags: hardFlags.length,
        strongPrimitives,
        observabilityGaps,
        recommendedAction,
      },
      primitives: viewData.primitives || [],
      flags: { hard: hardFlags, soft: softFlags },
      interviewQuestions: viewData.interviewQuestions || [],
    };
  }

  /**
   * Deep Dive view — full narrative sections for Hiring Managers.
   */
  private toDeepDiveView(
    snapshot: CachedScorecard['snapshot'],
    viewData: ViewData,
    mode: string,
  ): DeepDiveUiOutput {
    return {
      type: 'deep',
      username: snapshot.username,
      avatarUrl: snapshot.avatarUrl,
      analysisMode: mode,
      lastAnalyzedAt: viewData?.analyzedAt ?? null,
      profileSummary: viewData.sections?.A || '',
      cvCrossRef: viewData.sections?.B || '',
      workPattern: viewData.sections?.C || '',
      roleMatch: viewData.sections?.F || null,
      limitations: viewData.sections?.G || '',
      primitives: viewData.primitives || [],
      primitiveScores: viewData.primitiveScores || {},
      flags: viewData.flags || [],
      interviewQuestions: viewData.interviewQuestions || [],
      metadata: (viewData.metadata as unknown as Record<string, unknown>) || {},
    };
  }

  /**
   * Public view — anonymous-safe, minimal data.
   */
  private toPublicView(
    snapshot: CachedScorecard['snapshot'],
  ): PublicUiOutput {
    return {
      type: 'public',
      username: snapshot.username,
      avatarUrl: snapshot.avatarUrl,
      techStack: snapshot.techStack,
      archetypeSummary: snapshot.archetypeSummary,
    };
  }

  /**
   * Raw view — full data dump for admin/debug inspection.
   */
  private toRawView(
    snapshot: CachedScorecard['snapshot'],
    viewData: ViewData,
    mode: string,
  ): RawUiOutput {
    return {
      type: 'raw',
      username: snapshot.username,
      analysisMode: mode,
      lastAnalyzedAt: viewData?.analyzedAt ?? null,
      briefMarkdown: '', // Raw markdown stored in AnalysisJob, not in scorecard
      sections: viewData.sections || { A: '', B: '', C: '', D: '', E: '', F: null, G: '' },
      primitives: viewData.primitives || [],
      primitiveScores: viewData.primitiveScores || {},
      flags: viewData.flags || [],
      interviewQuestions: viewData.interviewQuestions || [],
      moduleResults: [], // Raw module results are on AnalysisJob, not scorecard
      metadata: (viewData.metadata as unknown as Record<string, unknown>) || {},
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Load the cached scorecard from GithubProfile.scorecard JSONB.
   */
  private async loadScorecard(
    githubUsername: string,
  ): Promise<CachedScorecard | null> {
    const githubProfile = await this.prisma.githubProfile.findUnique({
      where: { githubUsername },
      select: { scorecard: true },
    });

    const scorecard = githubProfile?.scorecard as unknown as CachedScorecard | null;

    if (!scorecard || !scorecard.snapshot) {
      this.logger.debug(`No scorecard found for ${githubUsername}`);
      return null;
    }

    return scorecard;
  }

  /**
   * Resolve which mode's data to use.
   * If a specific mode is requested, use it (with fallback to other mode).
   * If no mode is specified, use the latest.
   */
  private resolveMode(
    scorecard: CachedScorecard,
    requestedMode: RequestedMode,
  ): 'light' | 'deep' {
    if (requestedMode === 'light' && scorecard.light) return 'light';
    if (requestedMode === 'deep' && scorecard.deep) return 'deep';

    // Fallback: if requested mode unavailable, try the other
    if (requestedMode === 'light' && scorecard.deep) {
      this.logger.debug(`Light mode not available, falling back to deep`);
      return 'deep';
    }
    if (requestedMode === 'deep' && scorecard.light) {
      this.logger.debug(`Deep mode not available, falling back to light`);
      return 'light';
    }

    // No specific request: use the latest
    return scorecard.lastAnalysisMode;
  }

  /**
   * Get the ViewData for a specific mode.
   */
  private getViewData(
    scorecard: CachedScorecard,
    mode: 'light' | 'deep',
  ): ViewData | null {
    const data = mode === 'light' ? scorecard.light : scorecard.deep;
    if (!data) {
      // Try the other mode as fallback
      const fallback = mode === 'light' ? scorecard.deep : scorecard.light;
      if (fallback) {
        this.logger.debug(`Mode ${mode} not available, falling back to other mode`);
        return fallback;
      }
      return null;
    }
    return data;
  }
}