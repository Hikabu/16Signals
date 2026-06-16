import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SyncStatus } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { OctokitFactory } from '../modules/analysis/github-adapter/octokit.factory';

/**
 * GithubSyncProcessor — Refactored to use the new GitIntel pipeline.
 *
 * Previously used GithubAdapterService.fetchRawData() which returned GitHubRawData.
 * Now uses:
 *   1. DataCollectorService.collectLightMode() → SignalCorpus (7 groups A-G)
 *   2. CorpusCacheService.set() → Redis 7d TTL cache
 *   3. rawDataSnapshot still stored for backward compatibility
 *
 * Tracing: Every step emits structured console.log for real-time visibility.
 */
@Processor('github-sync', { concurrency: 5 })
export class GithubSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(GithubSyncProcessor.name);

  constructor(
    // private readonly dataCollector: DataCollectorService,
    // private readonly corpusCache: CorpusCacheService,
    private readonly prisma: PrismaService,
    @InjectQueue('signal-compute') private readonly signalQueue: Queue,
    private readonly octokitFactory: OctokitFactory,
  ) {
    super();
  }

  async process(
    job: Job<{
      candidateId: string;
      githubProfileId: string;
      userId?: string | null;
    }>,
  ): Promise<any> {
    const { candidateId, githubProfileId } = job.data;
    const jobId = job.id?.toString() || 'sync';
    this.logger.log({ jobId, githubProfileId }, 'github_sync_started');
    console.log(`[GithubSyncProcessor] phase=sync_start jobId=${jobId} githubProfileId=${githubProfileId}`);

    // (a) Load GithubProfile
    const profile = await this.prisma.githubProfile.findUnique({
      where: { id: githubProfileId },
      select: {
        id: true,
        githubUsername: true,
        developerProfileId: true,
      },
    });

    if (!profile) {
      throw new Error(`GithubProfile ${githubProfileId} not found`);
    }

    const username = profile.githubUsername;
    console.log(`[GithubSyncProcessor] phase=profile_loaded jobId=${jobId} username=${username}`);

    try {
      // (b) Set syncStatus = IN_PROGRESS, syncProgress = 20%
      await this.prisma.githubProfile.update({
        where: { id: githubProfileId },
        data: {
          syncStatus: SyncStatus.SYNC_REQUEST,
          syncProgress: 20,
        },
      });
      console.log(`[GithubSyncProcessor] phase=sync_progress jobId=${jobId} progress=20 status=SYNC_REQUEST`);
      //TODO -> UPDATE MIGRATE

      // // (c) Collect data using the new GitIntel DataCollectorService

      // // (d) Store corpus in Redis cache with 7d TTL
     

      // // (e) Build transaction operations for DB persistence
      // const operations: any[] = [];

      // // DeveloperProfile cooldown update (if developerProfileId is set)
      // if (profile.developerProfileId) {
      //   operations.push(
      //     this.prisma.developerProfile.update({
      //       where: { id: profile.developerProfileId },
      //       data: {
      //         githubCooldownUntil: new Date(
      //           Date.now() + 24 * 60 * 60 * 1000,
      //         ),
      //       },
      //     }),
      //   );
      // }

      // // GithubProfile update — store corpus JSON for backward compatibility
      // operations.push(
      //   this.prisma.githubProfile.update({
      //     where: { id: githubProfileId },
      //     data: {
      //       rawDataSnapshot: corpus as any,
      //       lastSyncAt: new Date(),
      //       syncError: null,
      //       syncStatus: SyncStatus.SYNC_SUCCESS,
      //       syncProgress: 100,
      //     },
      //   }),
      // );

      // // (f) Execute transaction
      // await this.prisma.$transaction(operations);

      // console.log(
      //   `[GithubSyncProcessor] phase=sync_complete jobId=${jobId} ` +
      //   `username=${username} groups=${groupsCollected.join(',')} ` +
      //   `corpusId=${corpus.corpus_id}`,
      // );
      // this.logger.log({ jobId, githubProfileId }, 'github_sync_completed');
    } catch (error) {
      console.log(
        `[GithubSyncProcessor] phase=sync_error jobId=${jobId} ` +
        `error=${(error as Error).message}`,
      );
      this.logger.error(
        `GitHub sync failed for profile ${githubProfileId}: ${error.message}`,
      );

      // (g) On error: set status = FAILED
      await this.prisma.githubProfile.update({
        where: { id: githubProfileId },
        data: {
          syncStatus: SyncStatus.SYNC_FAILED,
          syncProgress: 0,
          syncError: (error as Error).message,
        },
      });

      throw error;
    }
  }
}
