import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  HttpStatus,
  ValidationPipe,
  ExecutionContext,
} from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GithubAdapterService } from '../src/modules/scoring/github-adapter/github-adapter.service';
import { SolanaAdapterService } from '../src/modules/scoring/web3-adapter/solana-adapter.service';
import { OptionalJwtAuthGuard } from '../src/modules/auth-candidate/guards/optional-jwt-auth.guard';
import { ProfileResolverService } from '../src/modules/profile-candidate/profile-resolver.service';
import { WorkerModule } from '../src/queues/worker.module';
import Redis from 'ioredis';

describe('Analysis Routing & Flows (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;

  const mockGithubAdapter = {
    fetchRawData: jest.fn(),
    getRateLimitRemaining: jest.fn().mockResolvedValue(5000),
    checkRateLimitOrThrow: jest.fn().mockResolvedValue(true),
  };
  const mockSolanaAdapter = {
    fetchProgramsByAuthority: jest.fn(),
    fetchOnChainData: jest.fn().mockResolvedValue(null),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, WorkerModule],
    })
      .overrideProvider(GithubAdapterService)
      .useValue(mockGithubAdapter)
      .overrideProvider(SolanaAdapterService)
      .useValue(mockSolanaAdapter)
      .overrideProvider(ProfileResolverService)
      .useValue({
        ensureDevStack: jest.fn().mockImplementation(async (userId: string) => {
          if (userId === 'test-user-both') {
            return {
              devProfile: {
                githubProfile: { githubUsername: 'auth-dev-both' },
                web3Profile: {
                  solanaAddress: '22222222222222222222222222222222',
                },
              },
            };
          }
          if (userId === 'test-user-github') {
            return {
              devProfile: {
                githubProfile: { githubUsername: 'auth-dev-github' },
              },
            };
          }
          if (userId === 'test-user-wallet') {
            return {
              devProfile: {
                web3Profile: {
                  solanaAddress: '33333333333333333333333333333333',
                },
              },
            };
          }
          return { devProfile: {} };
        }),
      })
      .overrideGuard(OptionalJwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          const authHeader = req.headers['authorization'];

          if (authHeader) {
            const token = authHeader.split(' ')[1];
            let githubUsername = null;
            let walletAddress = null;

            let userId = 'test-user-id';

            if (token === 'valid_both') {
              githubUsername = 'auth-dev-both';
              walletAddress = '22222222222222222222222222222222';
              userId = 'test-user-both';
            } else if (token === 'valid_github_only') {
              githubUsername = 'auth-dev-github';
              userId = 'test-user-github';
            } else if (token === 'valid_wallet_only') {
              walletAddress = '33333333333333333333333333333333';
              userId = 'test-user-wallet';
            } else if (token === 'valid_none') {
              userId = 'test-user-none';
            }

            req.user = {
              id: userId,
              candidateId: userId,
              web3Profile: walletAddress ? { walletAddress } : null,
              githubProfile: githubUsername ? { githubUsername } : null,
            };
          }
          return true; // We bypass full token verification for E2E flow testing
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.enableShutdownHooks();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    // Depending on your setup REDIS may be bound to a specific string token
    redis = app.get('REDIS') || app.get(Redis);

    await prisma.analysisJob?.deleteMany();
    await prisma.user?.deleteMany({
      where: {
        id: {
          in: [
            'test-user-id',
            'test-user-both',
            'test-user-github',
            'test-user-wallet',
            'test-user-none',
          ],
        },
      },
    });
    await prisma.user.createMany({
      data: [
        {
          id: 'test-user-id',
          email: 'test-analysis@example.com',
          role: 'CANDIDATE',
        },
        {
          id: 'test-user-both',
          email: 'test-both@example.com',
          role: 'CANDIDATE',
        },
        {
          id: 'test-user-github',
          email: 'test-github@example.com',
          role: 'CANDIDATE',
        },
        {
          id: 'test-user-wallet',
          email: 'test-wallet@example.com',
          role: 'CANDIDATE',
        },
        {
          id: 'test-user-none',
          email: 'test-none@example.com',
          role: 'CANDIDATE',
        },
      ],
    });
    for (const userId of [
      'test-user-id',
      'test-user-both',
      'test-user-github',
      'test-user-wallet',
      'test-user-none',
    ]) {
      await prisma.candidate.create({ data: { userId } });
    }
    await redis.flushall();
  });

  afterAll(async () => {
    await app.close();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await prisma.$disconnect();
    await redis.quit();
  });

  beforeEach(async () => {
    // Reset all mocks between tests so Once mocks don't leak across tests
    mockGithubAdapter.fetchRawData.mockReset();
    mockGithubAdapter.fetchRawData.mockResolvedValue({
      fetchedAt: new Date().toISOString(),
      profile: { followers: 0, publicRepos: 0, accountAge: 0 },
      contributions: {
        activeWeeksCount: 0,
        weeklyTotals: new Array(52).fill(0),
      },
      repos: [],
      commits: [],
      pulls: [],
      externalPRs: { mergedExternalPRCount: 0, externalRepoNames: [] },
    });
    mockSolanaAdapter.fetchOnChainData.mockReset();
    mockSolanaAdapter.fetchOnChainData.mockResolvedValue(null);
    mockSolanaAdapter.fetchProgramsByAuthority.mockReset();
    mockSolanaAdapter.fetchProgramsByAuthority.mockResolvedValue([]);
  });

  const waitForJob = async (jobId: string, maxSeconds = 5) => {
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

  const getResult = async (jobId: string) => {
    const res = await request(app.getHttpServer()).get(
      `/api/analysis/${jobId}/result`,
    );
    return res.body.result;
  };

  describe('Anonymous flow', () => {
    it('1. POST /analysis { githubUsername: "mock-solana-dev" }', async () => {
      mockGithubAdapter.fetchRawData.mockResolvedValueOnce({
        fetchedAt: new Date().toISOString(),
        profile: { followers: 10, publicRepos: 5, accountAge: 12 },
        contributions: {
          activeWeeksCount: 5,
          weeklyTotals: new Array(52).fill(0),
        },
        repos: [
          {
            name: 'repo-anchor',
            topics: ['anchor'],
            createdAt: new Date(Date.now() - 100 * 86400000).toISOString(),
            pushedAt: new Date().toISOString(),
            isFork: false,
          },
        ],
        commits: [],
        pulls: [],
      });
      mockSolanaAdapter.fetchProgramsByAuthority.mockResolvedValueOnce({
        programs: [],
        achievements: [],
      });

      const res = await request(app.getHttpServer())
        .post('/api/analysis')
        .send({ githubUsername: 'mock-solana-dev' })
        .expect(HttpStatus.CREATED);

      expect(res.body.jobId).toBeDefined();

      const status = await waitForJob(res.body.jobId);
      if (status.status === 'complete') {
        const result = await getResult(res.body.jobId);
        expect(result.web3?.ecosystem).toBe('solana');
        expect(Array.isArray(result.stack?.tools)).toBe(true);
      }
    });

    it('2. POST /analysis { walletAddress: "11111111111111111111111111111111" }', async () => {
      mockSolanaAdapter.fetchProgramsByAuthority.mockResolvedValueOnce({
        programs: [],
        achievements: [],
      });

      const res = await request(app.getHttpServer())
        .post('/api/analysis')
        .send({ walletAddress: '11111111111111111111111111111111' })
        .expect(HttpStatus.CREATED);

      expect(res.body.jobId).toBeDefined();
      const status = await waitForJob(res.body.jobId);

      if (status.status === 'complete') {
        const result = await getResult(res.body.jobId);
        expect(result.capabilities?.backend?.score).toBe(0);
        expect(result.capabilities?.backend?.confidence).toBe('low');
        expect(result.summary).toContain('On-chain');
        expect(result.reputation).toBeNull();
      }
    });

    it('3. POST /analysis {} (no params)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/analysis')
        .send({});

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
      expect(res.body.message).toContain(
        'githubUsername or walletAddress is required',
      );
    });

    it('4. POST /analysis { walletAddress: "NOT_VALID!!!" }', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/analysis')
        .send({ walletAddress: 'NOT_VALID!!!' });

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
      // Validate that Invalid Solana wallet or similar is thrown by class-validator or constraint
    });

    it('5. Cache hit', async () => {
      const firstCall = await request(app.getHttpServer())
        .post('/api/analysis')
        .send({ githubUsername: 'cached-dev' })
        .expect(HttpStatus.CREATED);

      await waitForJob(firstCall.body.jobId);

      // Second call, no force
      const secondCall = await request(app.getHttpServer())
        .post('/api/analysis')
        .send({ githubUsername: 'cached-dev' })
        .expect(HttpStatus.CREATED); // Controllers returns 201 for queued or cached

      expect(secondCall.body.cached).toBe(true);
      expect(secondCall.body.result).toBeDefined();
      expect(secondCall.body.jobId).toContain('cached');
    });

    it('6. POST /analysis { githubUsername: "cached-dev", force: true }', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/analysis')
        .send({ githubUsername: 'cached-dev', force: true })
        .expect(HttpStatus.CREATED);

      expect(res.body.jobId).toBeDefined();
      // A new jobId is expected for forced requests
    });
  });

  describe('Authenticated flow', () => {
    it('7. User has github + wallet linked', async () => {
      mockGithubAdapter.fetchRawData.mockResolvedValueOnce({
        fetchedAt: new Date().toISOString(),
        profile: { followers: 10, publicRepos: 5, accountAge: 12 },
        contributions: {
          activeWeeksCount: 5,
          weeklyTotals: new Array(52).fill(0),
        },
        repos: [],
        commits: [],
        pulls: [],
      });
      mockSolanaAdapter.fetchOnChainData.mockResolvedValueOnce({
        ecosystem: 'solana',
        ecosystemPRs: 0,
        deployedPrograms: [
          {
            programId: 'mock1',
            isActive: true,
            uniqueCallers: 5,
            upgradeCount: 1,
            deployedAt: null,
          },
          {
            programId: 'mock2',
            isActive: true,
            uniqueCallers: 3,
            upgradeCount: 0,
            deployedAt: null,
          },
        ],
      });

      const res = await request(app.getHttpServer())
        .post('/api/analysis')
        .set('Authorization', 'Bearer valid_both')
        .send({ force: true })
        .expect(HttpStatus.CREATED);

      expect(res.body.jobId).toBeDefined();
      expect(res.body.jobId).not.toContain('cached');
      const status = await waitForJob(res.body.jobId);
      expect(status.status).toBe('complete');
      const result = await getResult(res.body.jobId);
      expect(result.web3?.deployedPrograms?.length).toBeGreaterThanOrEqual(1);
    });

    it('8. User has ONLY github linked', async () => {
      mockGithubAdapter.fetchRawData.mockResolvedValueOnce({
        fetchedAt: new Date().toISOString(),
        profile: { followers: 10, publicRepos: 5, accountAge: 12 },
        contributions: {
          activeWeeksCount: 5,
          weeklyTotals: new Array(52).fill(0),
        },
        repos: [
          {
            name: 'test-solana',
            topics: ['solana'],
            createdAt: new Date(Date.now() - 100 * 86400000).toISOString(),
            pushedAt: new Date().toISOString(),
            isFork: false,
          },
        ],
        commits: [],
        pulls: [],
      });

      const res = await request(app.getHttpServer())
        .post('/api/analysis')
        .set('Authorization', 'Bearer valid_github_only')
        .send({})
        .expect(HttpStatus.CREATED);

      expect(res.body.jobId).toBeDefined();
      const status = await waitForJob(res.body.jobId);

      if (status.status === 'complete') {
        const result = await getResult(res.body.jobId);
        // Mode is github-only, shouldn't have programs from Solana wallet
        if (result.web3) {
          expect(result.web3.deployedPrograms).toEqual([]);
        }
      }
    });

    it('9. User has ONLY wallet linked', async () => {
      mockSolanaAdapter.fetchProgramsByAuthority.mockResolvedValueOnce({
        programs: [],
        achievements: [],
      });

      const res = await request(app.getHttpServer())
        .post('/api/analysis')
        .set('Authorization', 'Bearer valid_wallet_only')
        .send({})
        .expect(HttpStatus.CREATED);

      expect(res.body.jobId).toBeDefined();
      const status = await waitForJob(res.body.jobId);

      if (status.status === 'complete') {
        const result = await getResult(res.body.jobId);
        // Mode is wallet-only, github capability scores should be 0
        expect(result.capabilities?.backend?.score).toBe(0);
      }
    });

    it('10. User has NO linked accounts', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/analysis')
        .set('Authorization', 'Bearer valid_none')
        .send({});

      expect(res.status).toBe(HttpStatus.NOT_FOUND);
      expect(res.body.message).toContain('No linked accounts');
    });
  });

  describe('Signal tests (mock data driven)', () => {
    it('11. Mock repos topics: ["anchor", "solana"] -> result.web3.ecosystem === "solana"', async () => {
      mockGithubAdapter.fetchRawData.mockResolvedValueOnce({
        fetchedAt: new Date().toISOString(),
        profile: { followers: 10, publicRepos: 5, accountAge: 12 },
        contributions: {
          activeWeeksCount: 5,
          weeklyTotals: new Array(52).fill(0),
        },
        repos: [
          {
            name: 'r1',
            topics: ['anchor', 'solana'],
            createdAt: new Date(Date.now() - 100 * 86400000).toISOString(),
            pushedAt: new Date().toISOString(),
            isFork: false,
          },
        ],
        commits: [],
        pulls: [],
      });

      const res = await request(app.getHttpServer())
        .post('/api/analysis')
        .send({ githubUsername: 'signal-dev-1' });

      const status = await waitForJob(res.body.jobId);
      expect(status.status).toBe('complete');
      const result = await getResult(res.body.jobId);
      expect(result.web3?.ecosystem).toBe('solana');
    });

    it('12. Mock PR into "coral-xyz/anchor" -> result.web3.ecosystemPRs >= 1', async () => {
      mockGithubAdapter.fetchRawData.mockResolvedValueOnce({
        fetchedAt: new Date().toISOString(),
        profile: { followers: 10, publicRepos: 5, accountAge: 12 },
        contributions: {
          activeWeeksCount: 5,
          weeklyTotals: new Array(52).fill(0),
        },
        repos: [
          {
            name: 'anchor-repo',
            topics: ['anchor'],
            createdAt: new Date(Date.now() - 100 * 86400000).toISOString(),
            pushedAt: new Date().toISOString(),
            isFork: false,
          },
        ],
        commits: [],
        externalPRs: {
          mergedExternalPRCount: 1,
          externalRepoNames: ['coral-xyz/anchor'],
        },
        pulls: [],
      });

      const res = await request(app.getHttpServer())
        .post('/api/analysis')
        .send({ githubUsername: 'signal-dev-2', force: true });

      const status = await waitForJob(res.body.jobId);
      expect(status.status).toBe('complete');
      const result = await getResult(res.body.jobId);
      expect(result.web3?.ecosystemPRs).toBeGreaterThanOrEqual(1);
    });

    it('13. Mock repos topics: ["react", "nodejs"] -> result.web3 === null', async () => {
      mockGithubAdapter.fetchRawData.mockResolvedValueOnce({
        fetchedAt: new Date().toISOString(),
        profile: { followers: 10, publicRepos: 5, accountAge: 12 },
        contributions: {
          activeWeeksCount: 5,
          weeklyTotals: new Array(52).fill(0),
        },
        repos: [
          {
            name: 'frontend',
            topics: ['react', 'nodejs'],
            createdAt: new Date(Date.now() - 100 * 86400000).toISOString(),
            pushedAt: new Date().toISOString(),
            isFork: false,
          },
        ],
        commits: [],
        pulls: [],
      });

      const res = await request(app.getHttpServer())
        .post('/api/analysis')
        .send({ githubUsername: 'signal-dev-3' });

      const status = await waitForJob(res.body.jobId);
      expect(status.status).toBe('complete');
      const result = await getResult(res.body.jobId);
      expect(result.web3).toBeNull();
    });

    it('14. Mock manifestKeys: { "repo": ["bullmq", "pg", "ioredis"] } -> result.stack.tools includes mapping', async () => {
      mockGithubAdapter.fetchRawData.mockResolvedValueOnce({
        fetchedAt: new Date().toISOString(),
        profile: { followers: 10, publicRepos: 5, accountAge: 12 },
        contributions: {
          activeWeeksCount: 5,
          weeklyTotals: new Array(52).fill(0),
        },
        repos: [
          {
            name: 'backend',
            topics: [],
            language: 'TypeScript',
            createdAt: new Date(Date.now() - 100 * 86400000).toISOString(),
            pushedAt: new Date().toISOString(),
            isFork: false,
          },
        ],
        commits: [],
        pulls: [],
        manifestKeys: { repo: ['bullmq', 'pg', 'ioredis'] },
      });

      const res = await request(app.getHttpServer())
        .post('/api/analysis')
        .send({ githubUsername: 'signal-dev-4' });

      const status = await waitForJob(res.body.jobId);
      expect(status.status).toBe('complete');
      const result = await getResult(res.body.jobId);
      expect(result.stack?.tools).toContain('BullMQ');
      expect(result.stack?.tools).toContain('PostgreSQL');
      expect(result.stack?.tools).toContain('Redis');
    });

    it('15. Mock Rust language + SolanaAdapter returns 1 active program -> backend.confidence !== "low"', async () => {
      mockGithubAdapter.fetchRawData.mockResolvedValueOnce({
        fetchedAt: new Date().toISOString(),
        profile: { followers: 10, publicRepos: 10, accountAge: 12 },
        contributions: {
          activeWeeksCount: 5,
          weeklyTotals: new Array(52).fill(0),
        },
        repos: [
          {
            name: 'rust-protocol',
            topics: [],
            language: 'Rust',
            createdAt: new Date(Date.now() - 100 * 86400000).toISOString(),
            pushedAt: new Date().toISOString(),
            isFork: false,
          },
        ],
        commits: [],
        pulls: [],
      });
      mockSolanaAdapter.fetchOnChainData.mockResolvedValueOnce({
        ecosystem: 'solana',
        ecosystemPRs: 0,
        deployedPrograms: [
          {
            programId: 'mock-program',
            isActive: true,
            uniqueCallers: 10,
            upgradeCount: 2,
            deployedAt: null,
          },
        ],
      });

      const res = await request(app.getHttpServer())
        .post('/api/analysis')
        .set('Authorization', 'Bearer valid_both')
        .send({ force: true });

      const status = await waitForJob(res.body.jobId);
      expect(status.status).toBe('complete');
      const result = await getResult(res.body.jobId);
      expect(result.capabilities?.backend?.confidence).not.toBe('low');
    });
  });
});
