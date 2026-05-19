import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger, Inject } from '@nestjs/common';
import { GithubAdapterService } from '../modules/scoring/github-adapter/github-adapter.service';
import { PrismaService } from '../prisma/prisma.service';
import { SyncStatus } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { OctokitFactory } from '../modules/scoring/github-adapter/octokit.factory';

@Processor('github-sync', { concurrency: 5 })
export class GithubSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(GithubSyncProcessor.name);

  constructor(
    private readonly githubAdapter: GithubAdapterService,
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
    const jobId = job.id?.toString();
    this.logger.log(
      {
        jobId,
        githubProfileId,
      },
      'github_sync_started',
    );

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

    try {
      // (b) Set syncStatus = IN_PROGRESS, syncProgress = fetching_repos (20%)
      await this.prisma.githubProfile.update({
        where: { id: githubProfileId },
        data: {
          syncStatus: SyncStatus.SYNC_REQUEST,
          syncProgress: 20,
        },
      });

      // (c) Call consolidated fetcher
      const resolvedUserId = job.data.userId;
      const octokit = await this.octokitFactory.forJob(resolvedUserId ?? null);
      const rawData = await this.githubAdapter.fetchRawData(
        octokit,
        profile.githubUsername,
        jobId,
      );
await this.prisma.$transaction([
  this.prisma.developerProfile.update({
    where: { id: profile.developerProfileId },
    data: {
      githubCooldownUntil: new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      ),
    },
  }),

  this.prisma.githubProfile.update({
    where: { id: githubProfileId },
    data: {
      rawDataSnapshot: rawData as any,
      lastSyncAt: new Date(),
      syncError: null,
      syncStatus: SyncStatus.SYNC_SUCCESS,
      syncProgress: 100,
    },
  }),
]);
     
      this.logger.log(
        {
          jobId,
          githubProfileId,
        },
        'github_sync_completed',
      );
    } catch (error) {
      this.logger.error(
        `GitHub sync failed for profile ${githubProfileId}: ${error.message}`,
      );

      // (g) On error: set status = FAILED, syncProgress = 0, syncError = error.message
      await this.prisma.githubProfile.update({
        where: { id: githubProfileId },
        data: {
          syncStatus: SyncStatus.SYNC_FAILED,
          syncProgress: 0,
          syncError: error.message,
        },
      });

      throw error;
    }
  }
}
