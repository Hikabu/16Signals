import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GithubAdapterService } from '../src/modules/scoring/github-adapter/github-adapter.service';
import { SolanaAdapterService } from '../src/modules/scoring/web3-adapter/solana-adapter.service';
import { AnalysisResult } from '../src/modules/scoring/types/result.types';
import { PrismaService } from '../src/prisma/prisma.service';
import Redis from 'ioredis';
import { WorkerModule } from '../src/queues/worker.module';
import { GitHubRawData } from '../src/modules/scoring/github-adapter/github-data.types';
import { Logger } from 'nestjs-pino';

describe('Colosseum Stage 2 Analysis Web3 & Edge Cases (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;

  jest.setTimeout(30000);

  const baseRawData = (): GitHubRawData => ({
    profile: {
      username: 'mock',
      accountCreatedAt: new Date('2020-01-01T00:00:00Z'),
      accountAge: 12,
      publicRepos: 3,
      followers: 5,
    },
    repos: [
      {
        name: 'repo1',
        language: 'TypeScript',
        stars: 1,
        forks: 0,
        topics: [],
        createdAt: new Date('2021-01-01T00:00:00Z'),
        pushedAt: new Date(),
        isFork: false,
        description: '',
      },
    ],
    contributions: {
      weeklyTotals: Array(52)
        .fill(1)
        .map((_, i) => (i < 4 ? 1 : 0)),
      activeWeeksCount: 4,
    },
    externalPRs: { mergedExternalPRCount: 0, externalRepoNames: [] },
    manifestKeys: {},
    fetchedAt: new Date(),
  });

  const mockGithubProfiles: Record<string, GitHubRawData> = {
    'mock-solana-dev': {
      ...baseRawData(),
      profile: { ...baseRawData().profile, publicRepos: 15 },
      repos: [
        {
          ...baseRawData().repos[0],
          topics: ['anchor'],
          language: 'Rust',
        },
      ],
      externalPRs: {
        mergedExternalPRCount: 1,
        externalRepoNames: ['coral-xyz/anchor'],
      },
    },
    'mock-react-dev': {
      ...baseRawData(),
      repos: [{ ...baseRawData().repos[0], topics: ['react', 'node'] }],
    },
    'mock-sparse-dev': {
      ...baseRawData(),
      profile: { ...baseRawData().profile, publicRepos: 1, accountAge: 3 },
      contributions: { weeklyTotals: [1], activeWeeksCount: 1 },
      repos: [],
    },
    'mock-stack-dev': {
      ...baseRawData(),
      manifestKeys: { 'my-repo': ['bullmq', 'pg'] },
    },
    'mock-rust-dev': {
      ...baseRawData(),
      profile: { ...baseRawData().profile, publicRepos: 7 }, // factorA = 0.5 -> score = 0.35 + bits approx > 0.3
      repos: [{ ...baseRawData().repos[0], language: 'Rust' }],
    },
  };

  const mockGithubAdapter = {
    fetchRawData: jest
      .fn()
      .mockImplementation(async (_octokit: any, username: string) => {
        if (!mockGithubProfiles[username])
          throw new Error('Not found user: ' + username);
        return mockGithubProfiles[username];
      }),
    decryptToken: jest.fn().mockReturnValue('mock-token'),
    getRateLimitRemaining: jest.fn().mockResolvedValue(5000),
    checkRateLimitOrThrow: jest.fn().mockResolvedValue(true),
  };

  const mockSolanaAdapter = {
    fetchOnChainData: jest
      .fn()
      .mockImplementation(async (walletAddress: string) => {
        if (walletAddress === '11111111111111111111111111111111') {
          return {
            ecosystem: 'solana',
            ecosystemPRs: 0,
            deployedPrograms: [],
          };
        }
        if (walletAddress === '11111111111111111111111111111112') {
          return {
            ecosystem: 'solana',
            ecosystemPRs: 0,
            deployedPrograms: [
              {
                programId: 'FakeProg1',
                uniqueCallers: 100,
                isActive: true,
                deployedAt: new Date().toISOString(),
              },
            ],
          };
        }
        return null;
      }),
    fetchProgramsByAuthority: jest.fn().mockResolvedValue([]),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [],
        }),
        AppModule,
        WorkerModule,
      ],
    })
      .overrideProvider(GithubAdapterService)
      .useValue(mockGithubAdapter)
      .overrideProvider(SolanaAdapterService)
      .useValue(mockSolanaAdapter)
      .overrideProvider(APP_GUARD)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.enableShutdownHooks();
    app.useLogger(app.get(Logger));
    await app.init();

    prisma = app.get(PrismaService);
    redis = app.get('REDIS');

    // Clean DB
    await prisma.cachedResult.deleteMany();
    await prisma.githubProfile.deleteMany();
    await prisma.developerProfile.deleteMany();
    await prisma.candidate.deleteMany();
    await prisma.user.deleteMany();

    await prisma.$connect();
    await redis.flushall();
  });

  afterAll(async () => {
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
        if (res.body.status === 'failed')
          throw new Error('Job Failed: ' + res.body.failureReason);
        return res.body;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Job ${jobId} timed out`);
  };

  it('1. GitHub-only Solana dev', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/analysis')
      .send({ githubUsername: 'mock-solana-dev' })
      .expect(HttpStatus.CREATED);

    await waitForJob(res.body.jobId);
    const resultRes = await request(app.getHttpServer())
      .get(`/api/analysis/${res.body.jobId}/result`)
      .expect(200);
    const result = resultRes.body.result;

    expect(result.web3.ecosystem).toBe('solana');
    expect(result.web3.ecosystemPRs).toBe(1);
    expect(result.impact.externalContributions).toBeGreaterThanOrEqual(1);
  });

  it('2. GitHub-only non-web3 dev', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/analysis')
      .send({ githubUsername: 'mock-react-dev' })
      .expect(HttpStatus.CREATED);

    await waitForJob(res.body.jobId);
    const resultRes = await request(app.getHttpServer())
      .get(`/api/analysis/${res.body.jobId}/result`)
      .expect(200);
    const result = resultRes.body.result;

    expect(result.web3).toBeNull();
  });

  it('3. Input validation: POST /analysis { walletAddress: "NOT_VALID!!!" }', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/analysis')
      .send({ walletAddress: 'NOT_VALID!!!' })
      .expect(HttpStatus.BAD_REQUEST);

    expect(JSON.stringify(res.body.message)).toContain('Invalid Solana wallet');
  });

  it('4. Input validation: POST /analysis {} (no fields)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/analysis')
      .send({})
      .expect(HttpStatus.BAD_REQUEST);

    expect(JSON.stringify(res.body.message)).toContain(
      'githubUsername or walletAddress is required',
    );
  });

  it('5. Wallet-only mode', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/analysis')
      .send({ walletAddress: '11111111111111111111111111111111' })
      .expect(HttpStatus.CREATED);

    expect(res.body.jobId).toBeDefined();
    await waitForJob(res.body.jobId);

    const resultRes = await request(app.getHttpServer())
      .get(`/api/analysis/${res.body.jobId}/result`)
      .expect(200);
    const result = resultRes.body.result;

    expect(result.capabilities.backend.score).toBe(0);
    expect(result.capabilities.backend.confidence).toBe('low');
    expect(result.summary).toContain('On-chain');
  });

  it('6. Sparse profile', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/analysis')
      .send({ githubUsername: 'mock-sparse-dev' })
      .expect(HttpStatus.CREATED);

    await waitForJob(res.body.jobId);
    const resultRes = await request(app.getHttpServer())
      .get(`/api/analysis/${res.body.jobId}/result`)
      .expect(200);
    const result = resultRes.body.result;

    expect(result.capabilities.backend.confidence).toBe('low');
    expect(result.capabilities.frontend.confidence).toBe('low');
    expect(result.capabilities.devops.confidence).toBe('low');
  });

  it('7. Stack fingerprint', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/analysis')
      .send({ githubUsername: 'mock-stack-dev' })
      .expect(HttpStatus.CREATED);

    await waitForJob(res.body.jobId);
    const resultRes = await request(app.getHttpServer())
      .get(`/api/analysis/${res.body.jobId}/result`)
      .expect(200);
    const result = resultRes.body.result;

    expect(result.stack.tools).toContain('BullMQ');
    expect(result.stack.tools).toContain('PostgreSQL');
  });

  it('8. Confidence upgrade', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/analysis')
      // Pass both username and walletAddress to trigger 'github+wallet' and fetchOnChainData mock
      .send({
        githubUsername: 'mock-rust-dev',
        walletAddress: '11111111111111111111111111111112',
      })
      .expect(HttpStatus.CREATED);

    await waitForJob(res.body.jobId);
    const resultRes = await request(app.getHttpServer())
      .get(`/api/analysis/${res.body.jobId}/result`)
      .expect(200);
    const result = resultRes.body.result;

    // Initial from GitHub should be 'medium', upgraded by Solana to 'high'
    expect(result.capabilities.backend.confidence).toBe('high');
  });

  it('9. Average cache hit performance', async () => {
    // Already analyzed mock-solana-dev in Test 1
    const start = Date.now();
    const res = await request(app.getHttpServer())
      .post('/api/analysis')
      .send({ githubUsername: 'mock-solana-dev' })
      .expect(HttpStatus.CREATED);

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(200);
    expect(res.body.jobId).toBeDefined();
  });
});
