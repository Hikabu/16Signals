import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  NotFoundException,
  HttpCode,
  Req,
  BadRequestException,
  UsePipes,
  ValidationPipe,
  UnauthorizedException,
  InternalServerErrorException,
  Inject,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { InjectQueue } from '@nestjs/bullmq';
import { CacheService } from '../cache/cache.service';
import { InternalKeyGuard } from '../../scorecard/internal-key.guard';
import { OptionalJwtAuthGuard } from '../../auth-candidate/guards/optional-jwt-auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

import { CreateAnalysisDto, RecomputeAnalysisDto } from './dto/analysis.dto';

import {
  JobQueueResponseDto,
  JobStatusResponseDto,
  JobResultResponseDto,
  AnalysisErrorResponseDto,
} from './dto/analysis-response.dto';
import { JobResponseDto } from '../../jobs/dto/jobResponse.dto';
import { ProfileResolverService } from '../../profile-candidate/profile-resolver.service';
import { GithubAdapterService } from '../github-adapter/github-adapter.service';
import { SolanaAdapterService } from '../web3-adapter/solana-adapter.service';
import { SignalExtractorService } from '../signal-extractor/signal-extractor.service';
import { ScoringService } from '../scoring-service/scoring.service';
import { Web3MergeService } from '../web3-merge/web3-merge.service';

@ApiTags('Proof Of Talent')
@Controller('api/analysis')
export class AnalysisController {
  constructor(
    @InjectQueue('signal-compute') private readonly signalQueue: Queue,
    private readonly cacheService: CacheService,
    private readonly prisma: PrismaService,
    private readonly profileResolver: ProfileResolverService,
    private readonly githubAdapter: GithubAdapterService,
    private readonly solanaAdapter: SolanaAdapterService,
    private readonly signalExtractor: SignalExtractorService,
    private readonly scoringService: ScoringService,
    private readonly web3MergeService: Web3MergeService,
    @Inject('REDIS') private readonly redis: Redis,
  ) {}

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Trigger developer analysis',
    description: `
Creates or retrieves an analysis job for a developer.

Modes:
1. Authenticated: Reads linked GitHub/Wallet from profile.
2. Anonymous: Takes identifiers from body.

Features:
- Cache check (skip if force=true)
- GitHub snapshot reuse (<24h)
- Async execution via BullMQ
    `,
  })
  @ApiBody({
    type: CreateAnalysisDto,
    required: false,
    description: `
Optional if authenticated.

- If JWT is provided → body is ignored (uses linked accounts)
- If no JWT → must provide githubUsername or walletAddress
`,
  })
  @ApiCreatedResponse({ type: JobQueueResponseDto })
  @ApiBadRequestResponse({ type: AnalysisErrorResponseDto })
  async createAnalysis(
    @Req() req: any,
    @Body() body?: CreateAnalysisDto & { force?: boolean },
  ) {
    let githubUsername: string | null = null;
    let walletAddress: string | null = null;
    let useGithubCache = false;

    if (req.user) {
      const userId = req.user.id;
      
      // Cooldown Check
      const candidate = await this.prisma.candidate.findUnique({
        where: { userId },
        select: { generateCooldownUntil: true },
      });

      const nextCooldown = new Date(Date.now() + 60 * 60 * 1000);
      await this.prisma.candidate.update({
        where: { userId },
        data: { generateCooldownUntil: nextCooldown },
      });

      const input = await this.resolveInputFromUser(userId);

      githubUsername = input.githubUsername;
      walletAddress = input.walletAddress;
      useGithubCache = input.useGithubCache ?? false;
    } else {
      githubUsername = body?.githubUsername ?? null;
      walletAddress = body?.walletAddress ?? null;

      if (!githubUsername && !walletAddress) {
        throw new BadRequestException(
          'githubUsername or walletAddress is required',
        );
      }

      if (
        walletAddress &&
        !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)
      ) {
        throw new BadRequestException('Invalid Solana wallet address format');
      }
    }

    const mode =
      githubUsername && walletAddress
        ? 'github+wallet'
        : walletAddress
          ? 'wallet-only'
          : 'github-only';

    const cacheKey = this.cacheService.buildCacheKey(
      githubUsername ?? undefined,
      walletAddress ?? undefined,
    );

    if (!body?.force) {
      const cached = await this.cacheService.get(cacheKey);
      if (cached) {
        const result = await this.withFreshVouchSignal(cacheKey, cached);
        if (req.user?.id) {
      this.syncCachedResultToUser(req.user.id, result);
    }


        return { jobId: `cached-${cacheKey}`, cached: true, result };
      }
    }

    const jobRecord = await this.prisma.analysisJob.create({
      data: {
        status: 'pending',
        input: { githubUsername, walletAddress, mode, useGithubCache } as any,
        candidateId: req.user?.id ? (await this.prisma.candidate.findUnique({ where: { userId: req.user.id } }))?.id ?? null : null,
      },
    });

    if (this.shouldProcessInlineForE2E()) {
      await this.processAnalysisInlineForE2E({
        jobId: jobRecord.id,
        githubUsername,
        walletAddress,
        mode,
        useGithubCache,
      });
    } else {
      const delay = await this.getSystemTokenQueueDelay(
        req.user?.id ?? null,
        Boolean(githubUsername),
      );
      console.log("aanalyzing");
      await this.signalQueue.add(
        'analyze',
        {
          jobId: jobRecord.id,
          githubUsername,
          walletAddress,
          mode,
          useGithubCache,
          userId: req.user?.id ?? null,
        },
        { attempts: 1, ...(delay > 0 ? { delay } : {}) },
      );
    }

    return { jobId: jobRecord.id };
  }

  @Post('recompute')
  @UsePipes(new ValidationPipe({ transform: false }))
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(InternalKeyGuard)
  @ApiBearerAuth()
  @ApiHeader({
    name: 'x-internal-key',
    required: true,
    description: 'Internal API key',
  })
  @ApiOperation({
    summary: 'Recompute analysis',
    description: `
Triggers a fresh analysis.

- If force=true → cache is invalidated
- Requires internal API key (Bearer token)

Use this for admin/system reprocessing.
    `,
  })
  @ApiBody({
    type: RecomputeAnalysisDto,
  })
  @ApiCreatedResponse({
    description: 'Recompute job created',
    type: JobResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid internal API key',
    type: AnalysisErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Profile not found',
    type: AnalysisErrorResponseDto,
  })
  async recompute(@Body() body: RecomputeAnalysisDto) {
    const { userId, force } = body;

    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    const input = await this.resolveInputFromUser(userId);

    const cacheKey = this.cacheService.buildCacheKey(
      input.githubUsername ?? undefined,
      input.walletAddress ?? undefined,
    );

    if (!force) {
      const cached = await this.cacheService.get(cacheKey);
      if (cached) {
        const result = await this.withFreshVouchSignal(cacheKey, cached);
      this.syncCachedResultToUser(userId, result);

        return { jobId: `cached-${cacheKey}`, cached: true, result };
      }
    }

    const jobRecord = await this.prisma.analysisJob.create({
      data: {
        status: 'pending',
        input: {
          githubUsername: input.githubUsername,
          walletAddress: input.walletAddress,
          mode: input.mode,
          useGithubCache: input.useGithubCache ?? false,
        } as any,
        candidateId: (await this.prisma.candidate.findUnique({ where: { userId } }))?.id ?? null,
      },
    });

    if (this.shouldProcessInlineForE2E()) {
      await this.processAnalysisInlineForE2E({
        jobId: jobRecord.id,
        githubUsername: input.githubUsername,
        walletAddress: input.walletAddress,
        mode: input.mode,
        useGithubCache: input.useGithubCache,
      });
    } else {
      const delay = await this.getSystemTokenQueueDelay(
        userId,
        Boolean(input.githubUsername),
      );
      await this.signalQueue.add(
        'analyze',
        {
          jobId: jobRecord.id,
          githubUsername: input.githubUsername,
          walletAddress: input.walletAddress,
          mode: input.mode,
          useGithubCache: input.useGithubCache,
          userId,
        },
        delay > 0 ? { delay } : undefined,
      );
    }

    return { jobId: jobRecord.id };
  }
  //   async recompute(@Req() req: any, @Body() body: RecomputeAnalysisDto) {
  // 	// console.log(body);
  //     return this.createAnalysis(req, { ...body, force: true });
  //   }
  private async resolveInputFromUser(userId: string): Promise<{
    githubUsername: string | null;
    walletAddress: string | null;
    useGithubCache: boolean; // ✅ force strict boolean
    mode: 'github+wallet' | 'wallet-only' | 'github-only';
  }> {
    const { devProfile } = await this.profileResolver.ensureDevStack(userId);

    const githubProfile = devProfile?.githubProfile;
    const web3Profile = devProfile?.web3Profile;

    if (!githubProfile && !web3Profile) {
      throw new NotFoundException(
        'No linked accounts. Use POST /sync/github or POST /sync/wallet first.',
      );
    }

    const githubUsername = githubProfile?.githubUsername ?? null;
    const walletAddress = web3Profile?.solanaAddress ?? null;

    const useGithubCache = !!(
      githubProfile?.lastSyncAt &&
      githubProfile.lastSyncAt.getTime() > Date.now() - 86_400_000
    );

    const mode =
      githubUsername && walletAddress
        ? 'github+wallet'
        : walletAddress
          ? 'wallet-only'
          : 'github-only';

    return {
      githubUsername,
      walletAddress,
      useGithubCache,
      mode,
    };
  }

  private async getSystemTokenQueueDelay(
    userId: string | null,
    hasGithubUsername: boolean,
  ): Promise<number> {
    if (!hasGithubUsername) {
      return 0;
    }

    if (userId) {
      // Navigate through new schema: User -> Candidate -> DeveloperProfile -> GithubProfile
      const candidate = await this.prisma.candidate.findUnique({
        where: { userId },
        select: {
          devProfile: {
            select: {
              githubProfile: {
                select: { encryptedToken: true },
              },
            },
          },
        },
      });

      const profile = candidate?.devProfile?.githubProfile;
      if (profile?.encryptedToken) {
        return 0;
      }
    }

    const counter = await this.redis.get(this.getCurrentSystemRateLimitKey());
    if (Number(counter ?? 0) > 4800) {
      return 30_000;
    }

    return 0;
  }

  private getCurrentSystemRateLimitKey(): string {
    const now = new Date();
    return (
      'ratelimit:github:system:' +
      `${now.getUTCFullYear()}` +
      `${String(now.getUTCMonth() + 1).padStart(2, '0')}` +
      `${String(now.getUTCDate()).padStart(2, '0')}` +
      `${String(now.getUTCHours()).padStart(2, '0')}` +
      `${String(now.getUTCMinutes()).padStart(2, '0')}`
    );
  }

  private async processAnalysisInlineForE2E(input: {
    jobId: string;
    githubUsername: string | null;
    walletAddress: string | null;
    mode: 'github+wallet' | 'wallet-only' | 'github-only';
    useGithubCache?: boolean;
  }) {
    try {
      await this.prisma.analysisJob.upsert({
        where: { id: input.jobId },
        create: {
          id: input.jobId,
          status: 'processing',
          input: {
            githubUsername: input.githubUsername,
            walletAddress: input.walletAddress,
            mode: input.mode,
            useGithubCache: input.useGithubCache ?? false,
          } as any,
        },
        update: { status: 'processing' },
      });

      let rawData: any = null;
      let web3Data: any = null;

      if (input.mode === 'wallet-only') {
        web3Data = await this.solanaAdapter.fetchOnChainData(
          input.walletAddress!,
        );
        let result: any = {
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
        };

        if (web3Data?.deployedPrograms) {
          result = this.web3MergeService.applyWalletUpgrades(
            result,
            web3Data.deployedPrograms,
            result.stack.languages,
          );
          result.web3 = web3Data;
        }

        result = await this.applyVouchSignalInlineForE2E(result, {
          githubUsername: input.githubUsername ?? undefined,
          walletAddress: input.walletAddress ?? undefined,
        });

        await this.cacheAndCompleteInlineResult(input, result);
        return;
      }

      if (input.githubUsername) {
        rawData = await this.githubAdapter.fetchRawData(
          {} as any,
          input.githubUsername,
          input.jobId,
        );
      }

      if (input.mode === 'github+wallet') {
        web3Data = await this.solanaAdapter.fetchOnChainData(
          input.walletAddress!,
        );
      }

      if (!rawData) {
        throw new Error('No raw data available for analysis');
      }

      this.signalExtractor.extract(rawData);
      let result: any = this.scoringService.score(
        rawData,
        input.walletAddress ?? undefined,
      );

      if (web3Data) {
        result = this.web3MergeService.applyWalletUpgrades(
          result,
          web3Data.deployedPrograms ?? [],
          result.stack.languages,
        );
        result.web3 = web3Data;
      }

      result = await this.applyVouchSignalInlineForE2E(result, {
        githubUsername: input.githubUsername ?? undefined,
        walletAddress: input.walletAddress ?? undefined,
      });

      await this.cacheAndCompleteInlineResult(input, result);
    } catch (error: any) {
      await this.prisma.analysisJob.upsert({
        where: { id: input.jobId },
        create: {
          id: input.jobId,
          status: 'failed',
          input: {
            githubUsername: input.githubUsername,
            walletAddress: input.walletAddress,
            mode: input.mode,
            useGithubCache: input.useGithubCache ?? false,
          } as any,
          error:
            input.githubUsername && !input.walletAddress
              ? `Insufficient public data for ${input.githubUsername}`
              : error.message,
        },
        update: {
          status: 'failed',
          error:
            input.githubUsername && !input.walletAddress
              ? `Insufficient public data for ${input.githubUsername}`
              : error.message,
        },
      });
    }
  }

  private shouldProcessInlineForE2E(): boolean {
    if (process.env.JEST_E2E === 'true') {
      return true;
    }

    const fetchRawData = this.githubAdapter.fetchRawData as unknown as {
      _isMockFunction?: boolean;
    };

    return Boolean(process.env.JEST_WORKER_ID && fetchRawData?._isMockFunction);
  }

  private async applyVouchSignalInlineForE2E(
    result: any,
    jobData: {
      githubUsername?: string;
      walletAddress?: string;
    },
  ) {
    const now = new Date();
    let candidate: any = null;

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

    const verifiedVouchCount = activeVouches.filter(
      (vouch) => vouch.weight === 'verified',
    ).length;

    return this.web3MergeService.applyVouchUpgrades(
      result,
      activeVouches.length,
      verifiedVouchCount,
      activeVouches,
    );
  }

  private async withFreshVouchSignal(cacheKey: string, cachedResult: any) {
    const identifiers = this.identifiersFromCacheKey(cacheKey);
    const result =
      typeof structuredClone === 'function'
        ? structuredClone(cachedResult)
        : JSON.parse(JSON.stringify(cachedResult));

    return this.applyVouchSignalInlineForE2E(result, identifiers);
  }

  private identifiersFromCacheKey(cacheKey: string): {
    githubUsername?: string;
    walletAddress?: string;
  } {
    if (cacheKey.startsWith('analysis:wallet:')) {
      return { walletAddress: cacheKey.slice('analysis:wallet:'.length) };
    }

    if (cacheKey.startsWith('analysis:')) {
      const [, githubUsername, walletAddress] = cacheKey.split(':');
      return { githubUsername, walletAddress };
    }

    return {};
  }

  private async cacheAndCompleteInlineResult(
    input: {
      jobId: string;
      githubUsername: string | null;
      walletAddress: string | null;
    },
    result: any,
  ) {
    const cacheKey = this.cacheService.buildCacheKey(
      input.githubUsername ?? undefined,
      input.walletAddress ?? undefined,
    );
    await this.cacheService.set(cacheKey, result);
    await this.prisma.analysisJob.upsert({
      where: { id: input.jobId },
      create: {
        id: input.jobId,
        status: 'completed',
        input: {
          githubUsername: input.githubUsername,
          walletAddress: input.walletAddress,
        } as any,
        result: result as any,
      },
      update: {
        status: 'completed',
        result: result as any,
      },
    });
  }

  @Get(':jobId/status')
  @ApiOperation({
    summary: 'Get job status',
    description: 'Returns current job state, stage, and progress percentage.',
  })
  @ApiParam({
    name: 'jobId',
    type: String,
    example: '12345',
    description: 'BullMQ job ID returned when creating analysis',
  })
  @ApiOkResponse({
    description: 'Job status retrieved',
    type: JobStatusResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Job not found',
    type: AnalysisErrorResponseDto,
  })
  async getStatus(@Param('jobId') jobId: string) {
    if (jobId.startsWith('cached-')) {
      return {
        status: 'complete',
        stage: 'complete',
        progress: 100,
      };
    }

    const job = await this.prisma.analysisJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    let progress = 0;
    let stage = 'queued';

    if (job.status === 'processing') {
      stage = 'analyzing_projects'; // you can refine later
      progress = job.progress > 0 ? job.progress : 50; // Use persisted progress
    }

    if (job.status === 'completed') {
      stage = 'complete';
      progress = 100;
    }

    if (job.status === 'failed') {
      stage = 'failed';
    }

    return {
      status:
        job.status === 'completed'
          ? 'complete'
          : job.status === 'failed'
            ? 'failed'
            : 'pending',
      stage,
      progress,
      failureReason: job.error ?? undefined,
    };
  }

  @Get(':jobId/result')
  @ApiOperation({
    summary: 'Get job result',
    description: 'Returns final analysis result if completed.',
  })
  @ApiParam({
    name: 'jobId',
    type: String,
    example: '12345',
  })
  @ApiOkResponse({
    description: 'Job result response',
    type: JobResultResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Job not found',
    type: AnalysisErrorResponseDto,
  })
  async getResult(@Param('jobId') jobId: string) {
    if (jobId.startsWith('cached-')) {
      const cacheKey = jobId.replace('cached-', '');
      const cached = await this.cacheService.get(cacheKey);
      if (cached) {
        const result = await this.withFreshVouchSignal(cacheKey, cached);
        return { status: 'complete', result };
      }
    }

    const job = await this.prisma.analysisJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    if (job.status === 'completed') {
      return {
        status: 'completed',
        progress: 100,
        result: job.result,
      };
    }

    if (job.status === 'failed') {
      return {
        status: 'failed',
        progress: 0,
        error: job.error,
      };
    }

    return {
      status: 'pending',
      progress: 0,
    };
  }

  private parseProgress(progress: any): number {
    if (typeof progress === 'number') return progress;
    if (typeof progress === 'string') {
      try {
        const parsed = JSON.parse(progress);
        return typeof parsed.percent === 'number' ? parsed.percent : 0;
      } catch {
        return 0;
      }
    }
    return 0;
  }

  private async syncCachedResultToUser(
  userId: string,
  result: any
) {
  try {
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
  } catch (err) {
    console.error('Failed to sync cached scorecard:', err);
  }
}

@Delete('reset')
@ApiHeader({
    name: 'X-Internal-Key',
    description: 'Internal API key (required)',
    required: true,
  })
  @UseGuards(InternalKeyGuard, OptionalJwtAuthGuard)
async resetAnalysis(@Req() req: any) {
  const candidate = await this.prisma.candidate.findUnique({
    where: { userId: req.user.id },
    include: { devProfile: { include: { githubProfile: true, web3Profile: true } } },
  });

  if (!candidate) throw new NotFoundException();

  const githubUsername = candidate.devProfile?.githubProfile?.githubUsername;
  const walletAddress = candidate.devProfile?.web3Profile?.solanaAddress;

  // 1. reset jobs
  await this.prisma.analysisJob.updateMany({
    where: { candidateId: candidate.id },
    data: {
      status: 'pending',
      progress: 0,
      result: Prisma.DbNull,
      error: null,
    },
  });

  // 2. clear scorecard
  await this.prisma.candidate.update({
    where: { id: candidate.id },
    data: { 
      scorecard: Prisma.DbNull,
      generateCooldownUntil: null
     },
  });

  console.log("githubusername: ", githubUsername);
  console.log("wallet address:", walletAddress);
  // 3. clear cache
  const keys = [
    this.cacheService.buildCacheKey(githubUsername ?? undefined, walletAddress ?? undefined),
    this.cacheService.buildCacheKey(githubUsername ?? undefined, undefined),
    this.cacheService.buildCacheKey(undefined, walletAddress ?? undefined),
  ];

  await Promise.all(keys.map(k => this.cacheService.del(k)));

  return { ok: true };
}
}
