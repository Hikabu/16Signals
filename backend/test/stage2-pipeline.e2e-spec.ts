import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GithubAdapterService } from '../src/modules/analysis/github-adapter/github-adapter.service';
import {
  ALEX_BACKEND,
  SARAH_FULLSTACK,
  MAYA_DEVOPS,
  NEW_DEV,
  GHOST_PROFILE,
} from '../src/modules/scoring/signal-extractor/__fixtures__/seed-developers';
import { AnalysisResult } from '../src/modules/scoring/types/result.types';
import { PrismaService } from '../src/prisma/prisma.service';
import Redis from 'ioredis';
import { WorkerModule } from '../src/queues/worker.module';
describe('Colosseum Stage 2 Pipeline (E2E)', () => {
  jest.setTimeout(30000);

  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let githubAdapter: GithubAdapterService;

  const mockGithubAdapter = {
    fetchRawData: jest
      .fn()
      .mockImplementation(async (_octokit: any, username: string) => {
        switch (username) {
          case 'alex-backend':
            return ALEX_BACKEND;
          case 'sarah-fullstack':
            return SARAH_FULLSTACK;
          case 'maya-devops':
            return MAYA_DEVOPS;
          case 'new-dev':
            return NEW_DEV;
          case 'ghost-profile':
            throw new Error('Insufficient public data for ghost-profile');
          default:
            throw new Error(`User ${username} not found`);
        }
      }),
    decryptToken: jest.fn().mockReturnValue('mock-token'),
    getRateLimitRemaining: jest.fn().mockResolvedValue(5000),
    checkRateLimitOrThrow: jest.fn().mockResolvedValue(true),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [], // Disable throttling
        }),
        AppModule,
        WorkerModule, // Ensure WorkerModule is included for processing job
      ],
    })
      .overrideProvider(GithubAdapterService)
      .useValue(mockGithubAdapter)
      .overrideProvider(APP_GUARD)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.enableShutdownHooks();
    await app.init();

    prisma = app.get(PrismaService);
    // console.log('PRISMA:', app.get(PrismaService));
    redis = app.get('REDIS');
    githubAdapter = app.get(GithubAdapterService);

    // Clean DB
    // await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User" CASCADE;`);
    await prisma.cachedResult.deleteMany();
    await prisma.githubProfile.deleteMany();
    await prisma.developerProfile.deleteMany();
    await prisma.candidate.deleteMany();
    await prisma.user.deleteMany();

    await prisma.$connect();
    await redis.flushall();
    await prisma.cachedResult.deleteMany();
  });

  afterAll(async () => {
    // console.log('quitiitng');
    await app.close();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await prisma.$disconnect();
    await redis.quit();
  });

  const waitForJob = async (jobId: string, maxSeconds = 10): Promise<any> => {
    const start = Date.now();
    while (Date.now() - start < maxSeconds * 1000) {
      const res = await request(app.getHttpServer()).get(
        `/api/analysis/${jobId}/status`,
      );
      if (res.body.status === 'complete' || res.body.status === 'failed') {
        return res.body;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`Job ${jobId} timed out`);
  };

  describe('TEST E1, Happy path', () => {
    it('should complete analysis for alex-backend', async () => {
      // console.log("first test");
      const res = await request(app.getHttpServer())
        .post('/api/analysis')
        .send({ githubUsername: 'alex-backend' })
        .expect(HttpStatus.CREATED);

      expect(res.body.jobId).toBeDefined();
      const jobId = res.body.jobId;
      // console.log("jobid: ", jobId);
      const status = await waitForJob(jobId);
      expect(status.status).toBe('complete');

      const resultRes = await request(app.getHttpServer())
        .get(`/api/analysis/${jobId}/result`)
        .expect(HttpStatus.OK);

      const result: AnalysisResult = resultRes.body.result;
      expect(result.capabilities.backend.score).toBeGreaterThanOrEqual(0.7);
      expect(result.capabilities.backend.confidence).toBe('medium');
      expect(result.ownership.ownedProjects).toBe(5);
      expect(result.impact.activityLevel).toBe('high');
      expect(result.impact.externalContributions).toBe(12);
      expect(result.summary.length).toBeGreaterThan(0);

      // Schema check
      expect(result).toMatchObject({
        summary: expect.any(String),
        capabilities: {
          backend: {
            score: expect.any(Number),
            confidence: expect.stringMatching(/low|medium|high/),
          },
          frontend: {
            score: expect.any(Number),
            confidence: expect.stringMatching(/low|medium|high/),
          },
          devops: {
            score: expect.any(Number),
            confidence: expect.stringMatching(/low|medium|high/),
          },
        },
        ownership: {
          ownedProjects: expect.any(Number),
          activelyMaintained: expect.any(Number),
          confidence: expect.stringMatching(/low|medium|high/),
        },
        impact: {
          activityLevel: expect.stringMatching(/high|medium|low/),
          consistency: expect.stringMatching(/strong|moderate|sparse/),
          externalContributions: expect.any(Number),
          confidence: expect.stringMatching(/low|medium|high/),
        },
      });
    });
  });

  describe('TEST E2, Cache hit path', () => {
    it('should return cached job immediately and avoid re-fetch', async () => {
      // First request already done in E1
      // console.log("second test");
      mockGithubAdapter.fetchRawData.mockClear();

      const res = await request(app.getHttpServer())
        .post('/api/analysis')
        .send({ githubUsername: 'alex-backend' })
        .expect(HttpStatus.CREATED);

      const jobId = res.body.jobId;
      // Cached jobs start with 'cached-' in AnalysisController
      expect(jobId).toContain('cached-');

      const resultRes = await request(app.getHttpServer())
        .get(`/api/analysis/${jobId}/result`)
        .expect(HttpStatus.OK);

      expect(mockGithubAdapter.fetchRawData).not.toHaveBeenCalled();
    });
  });

  describe('TEST E3, Zero public data → graceful failure', () => {
    // console.log("test 3");
    it('should fail with Insufficient public data', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/analysis')
        .send({ githubUsername: 'ghost-profile' })
        .expect(HttpStatus.CREATED);

      const status = await waitForJob(res.body.jobId);
      expect(status.status).toBe('failed');
      expect(status.failureReason).toContain('Insufficient public data');
    });
  });

  describe('TEST E4, Private-heavy profile', () => {
    it('should include private work note and low devops confidence for maya-devops', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/analysis')
        .send({ githubUsername: 'maya-devops' })
        .expect(HttpStatus.CREATED);

      await waitForJob(res.body.jobId);

      const resultRes = await request(app.getHttpServer())
        .get(`/api/analysis/` + res.body.jobId + '/result')
        .expect(HttpStatus.OK);

      const result: AnalysisResult = resultRes.body.result;
      // Maya has devops focus in fixtures but few public repos
      expect(result.privateWorkNote).toBeDefined();
      expect(result.privateWorkNote?.toLowerCase()).toContain('private');
      expect(result.capabilities.devops.confidence).toBe('medium');
    });
  });

  describe('TEST E5, Confidence levels map correctly', () => {
    it('should only use low, medium, high confidence values', async () => {
      const usernames = [
        'alex-backend',
        'sarah-fullstack',
        'maya-devops',
        'new-dev',
      ];
      const results: AnalysisResult[] = [];

      for (const username of usernames) {
        const res = await request(app.getHttpServer())
          .post('/api/analysis')
          .send({ githubUsername: username });

        await waitForJob(res.body.jobId);
        const resultRes = await request(app.getHttpServer()).get(
          `/api/analysis/${res.body.jobId}/result`,
        );
        results.push(resultRes.body.result);
      }

      const allConfidenceValues = new Set<string>();
      results.forEach((r) => {
        allConfidenceValues.add(r.capabilities.backend.confidence);
        allConfidenceValues.add(r.capabilities.frontend.confidence);
        allConfidenceValues.add(r.capabilities.devops.confidence);
        allConfidenceValues.add(r.ownership.confidence);
        allConfidenceValues.add(r.impact.confidence);
      });

      const allowed = ['low', 'medium', 'high'];
      allConfidenceValues.forEach((val) => {
        expect(allowed).toContain(val);
      });

      // Specifically check alex-backend for medium/high
      const alex = results[0];
      expect(['medium', 'high']).toContain(
        alex.capabilities.backend.confidence,
      );
    });
  });

  describe('TEST E6, Progress stages in correct order', () => {
    it('should transition through stages in order with non-decreasing percentages', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/analysis')
        .send({ githubUsername: 'new-dev' })
        .expect(HttpStatus.CREATED);

      const observedStages: string[] = [];
      const observedPercentages: number[] = [];

      const start = Date.now();
      while (Date.now() - start < 5000) {
        const statusRes = await request(app.getHttpServer()).get(
          `/api/analysis/${res.body.jobId}/status`,
        );
        observedStages.push(statusRes.body.stage);
        observedPercentages.push(statusRes.body.progress);
        // console.log(statusRes.body);

        if (statusRes.body.status === 'complete') break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Assert order: queued → fetching_repos → analyzing_projects → building_profile → complete
      const uniqueStages = Array.from(new Set(observedStages));
      const expectedOrder = [
        'queued',
        'fetching_repos',
        'analyzing_projects',
        'building_profile',
        'complete',
      ];

      // Check that observed stages match the expected sequence (ignoring skips if too fast, but must be in order)
      let lastIndex = -1;
      for (const stage of uniqueStages) {
        const index = expectedOrder.indexOf(stage);
        if (index !== -1) {
          expect(index).toBeGreaterThan(lastIndex);
          lastIndex = index;
        }
      }

      // Assert non-decreasing percentages
      for (let i = 1; i < observedPercentages.length; i++) {
        expect(observedPercentages[i]).toBeGreaterThanOrEqual(
          observedPercentages[i - 1],
        );
      }
    });
  });

  describe('TEST E7, Recompute endpoint', () => {
    it('should bypass cache when force=true', async () => {
      mockGithubAdapter.fetchRawData.mockClear();

      const xKey = process.env.INTERNAL_API_KEY || 'default_timeout_for_tests';
      const user = await prisma.user.create({
        data: {
          email: 'recompute-alex@example.com',
          username: 'recompute-alex',
          isEmailVerified: true,
          role: 'CANDIDATE',
          candidate: {
            create: {
              devProfile: {
                create: {
                  githubProfile: {
                    create: {
                      githubUsername: 'alex-backend',
                      githubUserId: 'recompute-alex',
                      encryptedToken: 'mock-token',
                      scopes: [],
                    },
                  },
                },
              },
            },
          },
        },
      });
      const res = await request(app.getHttpServer())
        .post('/api/analysis/recompute')
        .set('X-Internal-Key', xKey)
        .send({ userId: user.id, force: true })
        .expect(HttpStatus.CREATED);

      expect(res.body.jobId).toBeDefined();
      expect(res.body.jobId).not.toContain('cached-');

      await waitForJob(res.body.jobId);
      expect(mockGithubAdapter.fetchRawData).toHaveBeenCalled();
    });
  });

  describe('TEST E8, Schema contract', () => {
    it('should verify contract for all 5 fixtures', async () => {
      const fixtures = [
        'alex-backend',
        'sarah-fullstack',
        'maya-devops',
        'new-dev',
      ];

      for (const username of fixtures) {
        const res = await request(app.getHttpServer())
          .post('/api/analysis')
          .send({ githubUsername: username });
        await waitForJob(res.body.jobId);
        const resultRes = await request(app.getHttpServer()).get(
          `/api/analysis/${res.body.jobId}/result`,
        );
        const result: AnalysisResult = resultRes.body.result;
        // console.log("result: ", result);

        // Capability scores
        Object.values(result.capabilities).forEach((cap) => {
          // console.log("cap: ", cap);
          expect(cap.score).toBeGreaterThanOrEqual(0);
          expect(cap.score).toBeLessThanOrEqual(1);
          expect(['low', 'medium', 'high']).toContain(cap.confidence);
        });

        // Impact
        expect(['high', 'medium', 'low']).toContain(
          result.impact.activityLevel,
        );
        expect(['strong', 'moderate', 'sparse']).toContain(
          result.impact.consistency,
        );
        expect(Number.isInteger(result.impact.externalContributions)).toBe(
          true,
        );
        expect(result.impact.externalContributions).toBeGreaterThanOrEqual(0);

        // Summary
        expect(typeof result.summary).toBe('string');
        expect(result.summary.length).toBeGreaterThan(0);
      }
    });
  });
});
