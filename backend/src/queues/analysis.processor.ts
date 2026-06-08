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

      // Resolve credentials via the pluggable provider system.
      // Deep mode uses the installation Octokit as BOTH primary and
      // app Octokit — this gives us 15,000/hr rate limit and access
      // to user-scoped endpoints (listEmails, listOrgs).
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

      // Run deep collection — installation Octokit used for both
      // inline Light collection AND identity enrichment.
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
      // dispatchWithCorpus skips corpus acquisition and passes the
      // pre-built corpus directly to wave orchestration.
      const result = await this.jobDispatcher.dispatchWithCorpus(
        deepResult.corpus,
        config,
        jobId,
      );

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