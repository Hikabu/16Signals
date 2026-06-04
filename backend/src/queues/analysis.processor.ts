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

      await this.prisma.analysisJob.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          progress: 100,
          result: {
            briefMarkdown: result.briefMarkdown,
            moduleCount: result.moduleCount,
            flagCount: result.flagCount,
            totalDurationMs: result.totalDurationMs,
          } as any,
        },
      });

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

      await this.prisma.analysisJob.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          progress: 100,
          result: {
            briefMarkdown: result.briefMarkdown,
            moduleCount: result.moduleCount,
            flagCount: result.flagCount,
            totalDurationMs: result.totalDurationMs,
            claimsExtracted: extraction.claims.length,
          } as any,
        },
      });

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

      // Resolve credentials via the pluggable provider system
      const { primary, installation } = await this.credentialsService.resolve({
        mode: 'deep',
        githubUsername,
        installationId,
      });

      console.log(
        `[AnalysisProcessor] phase=deep_auth_resolved jobId=${jobId} ` +
        `sources=${(primary as any).__githubTokenSource ?? 'system'}${installation ? '+installation' : ''}`,
      );

      // If installation Octokit is available, use it for private repo access.
      // Otherwise fall back to primary (legacy behavior for user PAT with repo scope).
      const appOctokit = installation ?? primary;
      if (!installation) {
        this.logger.warn(
          `No installation Octokit resolved for deep mode. Falling back to primary token. Private repos may be inaccessible.`,
        );
      }

      const deepResult = await this.deepCollector.collectDeepMode(
        primary,
        appOctokit,
        githubUsername,
        installationId,
        jobId,
      );

      await this.updateJobStatus(jobId, 'corpus_built', 50);

      const result = await this.jobDispatcher.dispatchLightMode(primary, jobId, githubUsername, config);

      await this.prisma.analysisJob.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          progress: 100,
          result: {
            briefMarkdown: result.briefMarkdown,
            moduleCount: result.moduleCount,
            flagCount: result.flagCount,
            totalDurationMs: deepResult.totalDurationMs + (result.totalDurationMs || 0),
            reposCloned: deepResult.reposCloned,
            reposSucceeded: deepResult.reposSucceeded,
          } as any,
        },
      });

      return result;
    } catch (error) {
      console.log(`[AnalysisProcessor] phase=deep_error jobId=${jobId} error=${(error as Error).message}`);
      await this.prisma.analysisJob
        .update({ where: { id: jobId }, data: { status: 'failed', error: (error as Error).message } })
        .catch(() => {});
      throw error;
    }
  }

  private async updateJobStatus(jobId: string, status: string, progress: number): Promise<void> {
    await this.prisma.analysisJob
      .update({ where: { id: jobId }, data: { status, progress } })
      .catch(() => {});
  }
}