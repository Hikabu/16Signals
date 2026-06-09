/**
 * Analysis Processor — BullMQ consumer for the GitIntel analysis pipeline.
 *
 * Processes jobs from the 'analysis' queue:
 *   'light' — Light Mode analysis (public signals only)
 *   'deep'  — Deep Mode analysis (private repos via GitHub App)
 *   'cv-verify' — CV Verification (Light Mode + CV claims)
 *
 * Uses WorkerHost pattern (same as SignalComputeProcessor).
 *
 * CRITICAL: Stores the FULL EvidenceBriefOutput in AnalysisJob.result
 * (not just 4 summary fields). Also syncs to GithubProfile.scorecard
 * for display via scorecard endpoints.
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 7
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { JobDispatcherService } from '../modules/analysis/orchestration/job-dispatcher.service';
import { DeepCollectorService } from '../modules/analysis/data-collector/deep/deep-collector.service';
import { CvClaimExtractorService } from '../modules/analysis/brief/cv-claim-extractor.service';
import { OctokitFactory } from '../modules/scoring/github-adapter/octokit.factory';
import { GitHubCredentialsService } from '../modules/github-credentials/github-credentials.service';
import { PrismaService } from '../prisma/prisma.service';
import { AnalysisConfig } from '../modules/analysis/modules/module.interface';
import { EvidenceBriefOutput } from '../modules/analysis/llm/llm-response.types';
import { buildFullResult } from '../modules/analysis/analysis/analysis-v2.helpers';

@Injectable()
@Processor('analysis')
export class AnalysisProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalysisProcessor.name);

  constructor(
    private readonly jobDispatcher: JobDispatcherService,
    private readonly deepCollector: DeepCollectorService,
    private readonly cvExtractor: CvClaimExtractorService,
    private readonly octokitFactory: OctokitFactory,
    private readonly credentialsService: GitHubCredentialsService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    const jobName = job.name;

    switch (jobName) {
      case 'light': {
        const data = job.data as { jobId: string; githubUsername: string; config: AnalysisConfig; userId?: string | null };
        return this.processLight(data);
      }
      case 'deep': {
        const data = job.data as { jobId: string; githubUsername: string; installationId: number; config: AnalysisConfig };
        return this.processDeep(data);
      }
      case 'cv-verify': {
        const data = job.data as { jobId: string; githubUsername: string; cvText: string; config: AnalysisConfig };
        return this.processCvVerify(data);
      }
      default:
        this.logger.warn(`Unknown job type: ${jobName}`);
        return { skipped: true, reason: `Unknown type: ${jobName}` };
    }
  }

  /**
   * Process a Light Mode analysis job.
   */
  async processLight(data: { jobId: string; githubUsername: string; config: AnalysisConfig; userId?: string | null }) {
    const { jobId, githubUsername, config, userId } = data;
    console.log(`1.[AnalysisProcessor] phase=process_light jobId=${jobId} username=${githubUsername}`);

    try {
      await this.updateJobStatus(jobId, 'collecting', 10);

      const octokit = await this.octokitFactory.forJob(userId ?? null);
      const result = await this.jobDispatcher.dispatchLightMode(octokit, jobId, githubUsername, config);

      // Store FULL canonical result — no more data loss
      await this.persistCompleteResult(jobId, result, 'light');

      // Sync to GithubProfile.scorecard for display
      await this.syncScorecardToProfile(githubUsername, result, 'light');

      console.log(`[AnalysisProcessor] phase=complete jobId=${jobId} durationMs=${result.totalDurationMs}`);
      return result;
    } catch (error) {
      console.log(`[AnalysisProcessor] phase=error jobId=${jobId} error=${(error as Error).message}`);
      await this.prisma.analysisJob
        .update({ where: { id: jobId }, data: { status: 'failed', error: (error as Error).message } })
        .catch(() => {});
      throw error;
    }
  }

  /**
   * Process a CV Verification job.
   */
  async processCvVerify(data: { jobId: string; githubUsername: string; cvText: string; config: AnalysisConfig }) {
    const { jobId, githubUsername, cvText, config } = data;
    console.log(`[AnalysisProcessor] phase=process_cv jobId=${jobId} username=${githubUsername}`);

    try {
      await this.updateJobStatus(jobId, 'collecting', 5);

      const extraction = this.cvExtractor.extractFromText(cvText);
      console.log(`[AnalysisProcessor] phase=cv_extracted jobId=${jobId} claims=${extraction.claims.length}`);

      const enrichedConfig: AnalysisConfig = {
        ...config,
        cv_claims: extraction.claims,
      };

      await this.updateJobStatus(jobId, 'collecting', 15);

      const octokit = await this.octokitFactory.forJob(null);
      const result = await this.jobDispatcher.dispatchLightMode(octokit, jobId, githubUsername, enrichedConfig);

      // Store FULL canonical result with CV metadata
      const fullResult = buildFullResult(result);
      fullResult.claimsExtracted = extraction.claims.length;

      await this.prisma.analysisJob.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          progress: 100,
          result: fullResult as any,
        },
      });

      // Sync to GithubProfile.scorecard
      await this.syncScorecardToProfile(githubUsername, result, 'light');

      return result;
    } catch (error) {
      console.log(`[AnalysisProcessor] phase=cv_error jobId=${jobId} error=${(error as Error).message}`);
      await this.prisma.analysisJob
        .update({ where: { id: jobId }, data: { status: 'failed', error: (error as Error).message } })
        .catch(() => {});
      throw error;
    }
  }

  /**
   * Process a Deep Mode analysis job.
   *
   * Uses GitHubCredentialsService to resolve:
   *   - primary: system PAT Octokit for public corpus
   *   - installation: App installation Octokit for private repos
   */
  async processDeep(data: { jobId: string; githubUsername: string; installationId: number; config: AnalysisConfig }) {
    const { jobId, githubUsername, installationId, config } = data;
    console.log(`[AnalysisProcessor] phase=process_deep jobId=${jobId} username=${githubUsername}`);

    try {
      await this.updateJobStatus(jobId, 'collecting', 10);

      // Resolve credentials via the pluggable provider system.
      const { installation } = await this.credentialsService.resolve({
        mode: 'deep',
        githubUsername,
        installationId,
      });

      if (!installation) {
        throw new Error(
          'Installation Octokit could not be resolved. Ensure the GitHub App ' +
          'is configured with GITHUB_ANALYSIS_APP_ID and GITHUB_ANALYSIS_PRIVATE_KEY.',
        );
      }

      console.log(
        `[AnalysisProcessor] phase=deep_auth_resolved jobId=${jobId} ` +
        `source=installation(installId=${installationId})`,
      );

      // Run deep collection
      const deepResult = await this.deepCollector.collectDeepMode(
        installation,
        installation,
        githubUsername,
        installationId,
        jobId,
      );

      await this.updateJobStatus(jobId, 'corpus_built', 50);

      console.log(
        `[AnalysisProcessor] phase=deep_corpus_ready jobId=${jobId} ` +
        `groups=${deepResult.corpus.groups_present.join(',')} ` +
        `enriched=${deepResult.groupsEnriched.join(',')}`,
      );

      // Route the deep-enriched corpus through the analysis pipeline.
      const result = await this.jobDispatcher.dispatchWithCorpus(
        deepResult.corpus,
        config,
        jobId,
      );

      // Store FULL canonical result with clone stats
      const cloneStats = {
        reposCloned: deepResult.reposCloned,
        reposSucceeded: deepResult.reposSucceeded,
        reposFailed: deepResult.reposFailed,
        totalCloneTimeMs: deepResult.totalDurationMs,
        secretLeaksFound: deepResult.secretLeaksFound ?? 0,
      };

      await this.persistCompleteResult(jobId, result, 'deep', cloneStats);

      // Sync to GithubProfile.scorecard
      await this.syncScorecardToProfile(githubUsername, result, 'deep');

      return result;
    } catch (error) {
      console.log(`[AnalysisProcessor] phase=deep_error jobId=${jobId} error=${(error as Error).message}`);
      await this.prisma.analysisJob
        .update({ where: { id: jobId }, data: { status: 'failed', error: (error as Error).message } })
        .catch(() => {});
      throw error;
    }
  }

  /**
   * Persist the complete analysis result to AnalysisJob.result.
   * Stores ALL fields from the canonical EvidenceBriefOutput — no truncation.
   */
  private async persistCompleteResult(
    jobId: string,
    result: EvidenceBriefOutput,
    mode: 'light' | 'deep',
    cloneStats?: {
      reposCloned: number;
      reposSucceeded: number;
      reposFailed: number;
      totalCloneTimeMs: number;
      secretLeaksFound: number;
    },
  ): Promise<void> {
    const fullResult = buildFullResult(result, cloneStats);

    await this.prisma.analysisJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        progress: 100,
        result: fullResult as any,
      },
    });

    console.log(
      `[AnalysisProcessor] phase=persist_complete jobId=${jobId} mode=${mode} ` +
      `fields=${Object.keys(fullResult).length} ` +
      `moduleResults=${result.moduleResults.length} ` +
      `flags=${result.flags.length} ` +
      `primitives=${result.primitives.length} ` +
      `sections=${Object.keys(result.sections).length} ` +
      `markdownLen=${result.briefMarkdown.length}`,
    );
  }

  /**
   * Sync analysis result to GithubProfile.scorecard for display.
   * This bridges the Analysis v2 pipeline with the scorecard display layer.
   *
   * The scorecard JSONB stores a CachedScorecard structure:
   *   - snapshot: always-available public display data
   *   - light: latest Light Mode ViewData (or null)
   *   - deep: latest Deep Mode ViewData (or null)
   */
  private async syncScorecardToProfile(
    githubUsername: string,
    result: EvidenceBriefOutput,
    mode: 'light' | 'deep',
  ): Promise<void> {
    try {
      const githubProfile = await this.prisma.githubProfile.findUnique({
        where: { githubUsername },
        select: { id: true, scorecard: true },
      });

      if (!githubProfile) {
        console.log(
          `[AnalysisProcessor] phase=scorecard_skip jobId=${result.jobId} ` +
          `reason=no_github_profile username=${githubUsername}`,
        );
        return;
      }

      // Build view data
      const viewData = {
        jobId: result.jobId,
        analyzedAt: result.metadata.generatedAt,
        primitives: result.primitives,
        primitiveScores: result.primitiveScores,
        flags: result.flags,
        flagCount: result.flagCount,
        sections: result.sections,
        interviewQuestions: result.interviewQuestions,
        metadata: {
          ...result.metadata,
          totalDurationMs: result.totalDurationMs,
        },
      };

      // Build snapshot (safe for public display)
      const snapshot = {
        username: result.metadata.username,
        avatarUrl: undefined, // Populated by frontend from GitHub API
        techStack: { languages: [], tools: [] }, // Extracted from corpus — populated later or from evidence
        archetypeSummary:
          result.primitives
            .filter((p) => p.confidence === 'strong')
            .slice(0, 2)
            .map((p) => p.score_label)
            .join('. ') || 'Assessment pending',
        aiLeverageClassification: undefined,
        evRung: 0,
      };

      // Upsert the scorecard
      const existingScorecard = (githubProfile.scorecard as any) || {};

      const scorecard = {
        lastAnalysisJobId: result.jobId,
        lastAnalysisMode: mode,
        lastAnalyzedAt: result.metadata.generatedAt,
        snapshot,
        light: mode === 'light' ? viewData : (existingScorecard.light ?? null),
        deep: mode === 'deep' ? viewData : (existingScorecard.deep ?? null),
      };

      await this.prisma.githubProfile.update({
        where: { id: githubProfile.id },
        data: {
          scorecard: scorecard as any,
          scorecardUpdatedAt: new Date(),
        },
      });

      console.log(
        `[AnalysisProcessor] phase=scorecard_synced jobId=${result.jobId} ` +
        `username=${githubUsername} mode=${mode} ` +
        `primitives=${result.primitives.length} flags=${result.flags.length}`,
      );
    } catch (error) {
      // Non-fatal — scorecard sync failure should not fail the job
      console.log(
        `[AnalysisProcessor] phase=scorecard_sync_error jobId=${result.jobId} ` +
        `error=${(error as Error).message}`,
      );
    }
  }

  private async updateJobStatus(jobId: string, status: string, progress: number): Promise<void> {
    await this.prisma.analysisJob
      .update({ where: { id: jobId }, data: { status, progress } })
      .catch(() => {});
  }
}