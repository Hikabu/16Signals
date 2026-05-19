import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GithubRawDataSnapshot } from '../modules/scoring/github-adapter/types';
import { AnalysisResult } from '../modules/scoring/types/result.types';
import { ScoringService } from '../modules/scoring/scoring-service/scoring.service';
import { SignalExtractorService } from '../modules/scoring/signal-extractor/signal-extractor.service';
import { GithubAdapterService } from '../modules/scoring/github-adapter/github-adapter.service';
import { CacheService } from '../modules/scoring/cache/cache.service';
import { SolanaAdapterService } from '../modules/scoring/web3-adapter/solana-adapter.service';
import { Web3MergeService } from '../modules/scoring/web3-merge/web3-merge.service';
import { OctokitFactory } from '../modules/scoring/github-adapter/octokit.factory';
import { SCORING_SCHEMA_VERSION } from '../modules/scoring/constants';

@Processor('signal-compute', {
  concurrency: process.env.NODE_ENV === 'test' ? 1 : 10,
})
export class SignalComputeProcessor extends WorkerHost {
  private readonly logger = new Logger(SignalComputeProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringService: ScoringService,
    private readonly signalExtractor: SignalExtractorService,
    private readonly githubAdapter: GithubAdapterService,
    private readonly cacheService: CacheService,
    private readonly solanaAdapter: SolanaAdapterService,
    private readonly web3MergeService: Web3MergeService,
    private readonly octokitFactory: OctokitFactory,
  ) {
    super();
  }

  async process(
    job: Job<{
      jobId: string;
      githubUsername?: string;
      walletAddress?: string;
      mode: 'github-only' | 'github+wallet' | 'wallet-only';
      useGithubCache?: boolean;
      userId?: string | null;
    }>,
  ): Promise<AnalysisResult | void> {
    const pipelineStart = Date.now();
    const {
      jobId: recordId,
      githubUsername,
      walletAddress,
      useGithubCache,
      mode,
      userId,
    } = job.data;
    const bullmqJobId = job.id?.toString();

    this.logger.log(
      `Starting signal pipeline for profile ${
        githubUsername || walletAddress
      } in mode ${mode}`,
    );

    let profile: any;
    let rawData: any;
    let hasSnapshot = false;

    // console.log("mode: ", mode);

    try {
      // Update DB job record to processing
      await this.prisma.analysisJob.update({
        where: { id: recordId },
        data: { status: 'processing' },
      });

      // Fetch or get existing profile for modes involving GitHub
      if (mode !== 'wallet-only' && githubUsername) {
        profile = await this.prisma.githubProfile.findUnique({
          where: { githubUsername },
          include: { developerProfile: true },
        });

        // If we want to use cache, check if snapshot exists
        if (useGithubCache && profile?.rawDataSnapshot) {
          rawData = profile.rawDataSnapshot;
          hasSnapshot = true;
          this.logger.log(`Using cached GitHub snapshot for ${githubUsername}`);
        }
      }

      let web3Data: any = null;

      if (mode === 'wallet-only') {
        web3Data = await this.solanaAdapter.fetchOnChainData(walletAddress!);
        // console.log("web3 data", web3Data);
        let result: AnalysisResult = {
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
          summary:
            'On-chain developer profile. Insufficient public GitHub data to assess software capabilities.',
          web3: web3Data,
  schemaVersion: SCORING_SCHEMA_VERSION,        };

        if (web3Data && web3Data.deployedPrograms) {
          result = this.web3MergeService.applyWalletUpgrades(
            result,
            web3Data.deployedPrograms,
            result.stack.languages,
          );
          result.web3 = web3Data;
        }

        // Cache the base result (NO vouches)
        if (walletAddress) {
          const cacheKey = this.cacheService.buildCacheKey(
            undefined,
            walletAddress,
          );
          await this.cacheService.set(cacheKey, result);
        }

        // S15, Vouch signal (Live)
        result = await this.applyVouchSignal(result, {
          githubUsername,
          walletAddress,
        });

        await this.persistScorecard(userId ?? null, result);

        // Update AnalysisJob status to completed
        await this.prisma.analysisJob.update({
          where: { id: recordId },
          data: {
            status: 'completed',
            result: result as any,
          },
        });

        // console.log("result: ", result);

        this.logger.log(
          {
            jobId: job.id,
            mode,
            durationMs: Date.now() - pipelineStart,
          },
          'analysis_complete',
        );
        return result;
      }

      // Modes involving GitHub: 'github-only' and 'github+wallet'
      if (!hasSnapshot && githubUsername) {
        await this.updateProgress(recordId, 20);

        try {
          const resolvedUserId = userId ?? profile?.userId ?? null;
          const octokit = await this.octokitFactory.forJob(resolvedUserId);

          const before =
            await this.githubAdapter.getRateLimitRemaining(octokit);

          if (mode === 'github+wallet') {
            const [gitResponse, w3Response] = await Promise.all([
              this.githubAdapter.fetchRawData(
                octokit,
                githubUsername,
                bullmqJobId,
              ),
              this.solanaAdapter.fetchOnChainData(walletAddress!),
            ]);
            rawData = gitResponse;
            web3Data = w3Response;
          } else {
            rawData = await this.githubAdapter.fetchRawData(
              octokit,
              githubUsername,
              bullmqJobId,
            );
          }

          const after = await this.githubAdapter.getRateLimitRemaining(octokit);

          this.logger.log(
            {
              jobId: bullmqJobId,
              analysisJobId: recordId,
              apiCallsUsed: before - after,
              remainingAfter: after,
            },
            'github_fetch_complete',
          );

          if (profile) {
            await this.prisma.githubProfile.update({
              where: { id: profile.id },
              data: {
                rawDataSnapshot: rawData,
                lastSyncAt: new Date(),
              },
            });
          }
        } catch (error) {
          this.logger.error(
            `Failed to fetch data for ${githubUsername}: ${error.message}`,
          );
          throw new Error(`Insufficient public data for ${githubUsername}`);
        }
      }

      if (!rawData) {
        throw new Error('No raw data available for analysis');
      }

      // Update progress: analyzing_projects (50%)
      await this.updateProgress(recordId, 50);

      // Extract signals
      const signals = this.signalExtractor.extract(rawData);

      // Update progress: building_profile (75%)
      await this.updateProgress(recordId, 75);

      // Score
let result: AnalysisResult = {
  ...this.scoringService.score(rawData, walletAddress),
  schemaVersion: "v.0.0.1",
};
      // Inject web3 data if present
      if (web3Data) {
        result = this.web3MergeService.applyWalletUpgrades(
          result,
          web3Data.deployedPrograms,
          result.stack.languages,
        );
        result.web3 = web3Data;
      }

      // Cache the result (NO vouches)
      if (githubUsername || walletAddress) {
        const cacheKey = this.cacheService.buildCacheKey(
          githubUsername,
          walletAddress,
        );
        await this.cacheService.set(cacheKey, result);
      }

      // S15, Vouch signal (Live)
      result = await this.applyVouchSignal(result, {
        githubUsername,
        walletAddress,
      });

      // // Update progress: complete (100%)
      // await this.updateProgress(recordId, 100);

      await this.persistScorecard(userId ?? null, result);

      // Update AnalysisJob
      await this.prisma.analysisJob.update({
        where: { id: recordId },
        data: {
          
          status: 'completed',
          progress:100,
          result: result as any,
        },
      });


      this.logger.log(
        {
          jobId: job.id,
          mode,
          durationMs: Date.now() - pipelineStart,
        },
        'analysis_complete',
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Pipeline failed for ${githubUsername || walletAddress}: ${error.message}`,
        error.stack,
      );

      // Update failure status
      if (recordId) {
        await this.prisma.analysisJob
          .update({
            where: { id: recordId },
            data: {
              status: 'failed',
            progress: 0,
              error: (error as Error).message,
            },
          })
          .catch(() => {});
      }

      throw error;
    }
  }

  private async updateProgress(
    recordId: string | undefined,
    percent: number,
  ): Promise<void> {
    if (!recordId) return;

    try {
      await this.prisma.analysisJob.update({
      where: { id: recordId },
        data: {
          progress: percent,
          status: 'processing'
        },
      });
    } catch (error) {
      this.logger.warn(`Failed to update progress: ${error.message}`);
    }
  }

  private async applyVouchSignal(
    result: AnalysisResult,
    jobData: {
      githubUsername?: string;
      candidateUsername?: string;
      walletAddress?: string;
    },
  ): Promise<AnalysisResult> {
    const now = new Date();

    // Resolve candidateId from job data, vouches are candidate-scoped, not github-scoped
    let candidate;

    // 1. GitHub path
    if (jobData.githubUsername) {
      candidate = await this.prisma.candidate.findFirst({
        where: {
          devProfile: {
            githubProfile: {
              githubUsername: jobData.githubUsername,
            },
          },
        },
      });
    }

    // 2. Wallet path
    if (!candidate && jobData.walletAddress) {
      candidate = await this.prisma.candidate.findFirst({
        where: {
          devProfile: {
            web3Profile: {
              solanaAddress: jobData.walletAddress,
            },
          },
        },
      });
    }

    // 3. Optional user fallback (you said not needed)
    if (!candidate && jobData.candidateUsername) {
      candidate = await this.prisma.candidate.findFirst({
        where: {
          user: {
            username: jobData.candidateUsername,
          },
        },
      });
    }
    const activeVouches = candidate
      ? await this.prisma.vouch.findMany({
          where: {
            candidateId: candidate.id,
            isActive: true,
            expiresAt: { gt: now },
            flag: null,
            weight: { in: ['verified', 'standard'] },
          },
          orderBy: { confirmedAt: 'desc' },
          take: 10,
        })
      : [];

    const vouchCount = activeVouches.length;
    const verifiedVouchCount = activeVouches.filter(
      (v) => v.weight === 'verified',
    ).length;

    return this.web3MergeService.applyVouchUpgrades(
      result,
      vouchCount,
      verifiedVouchCount,
      activeVouches,
    );
  }

  private async persistScorecard(userId: string | null, result: AnalysisResult) {
    if (!userId) return;

  const candidate = await this.prisma.candidate.findUnique({
    where: { userId },
  });

  if (!candidate) return;

  await this.prisma.candidate.update({
    where: { id: candidate.id },
    data: {
      scorecard: result as any,
    },
  });
}
}
