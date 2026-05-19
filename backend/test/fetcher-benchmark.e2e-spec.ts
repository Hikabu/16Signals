import { Test, TestingModule } from '@nestjs/testing';
import { GithubAdapterService } from '../src/modules/scoring/github-adapter/github-adapter.service';
import { SignalExtractorService } from '../src/modules/scoring/signal-extractor/signal-extractor.service';
import { ScoringService } from '../src/modules/scoring/scoring-service/scoring.service';
import { SummaryGeneratorService } from '../src/modules/scoring/summary-generator/summary-generator.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { performance } from 'perf_hooks';
import { ALEX_BACKEND } from '../src/modules/scoring/signal-extractor/__fixtures__/seed-developers';
import { EcosystemClassifierService } from '../src/modules/scoring/signal-extractor/ecosystem-clarifier.service';
import { InteractionProfileService } from '../src/modules/scoring/signal-extractor/interaction-profile.service';
import { OrgAnalyserService } from '../src/modules/scoring/signal-extractor/org-analyser.service';
import { StackFingerprintService } from '../src/modules/scoring/signal-extractor/stack-fingerprint.service';

// Mock Octokit to return instantly
jest.mock('octokit', () => {
  return {
    Octokit: jest.fn().mockImplementation(() => ({
      rest: {
        users: {
          getByUsername: jest.fn().mockImplementation(async () => {
            await new Promise((r) => setTimeout(r, 5));
            return {
              data: {
                login: ALEX_BACKEND.profile.username,
                created_at: ALEX_BACKEND.profile.accountCreatedAt.toISOString(),
                public_repos: ALEX_BACKEND.profile.publicRepos,
                followers: ALEX_BACKEND.profile.followers,
              },
            };
          }),
          listOrgsForUser: jest.fn().mockResolvedValue({ data: [] }),
        },
        repos: {
          listForUser: jest.fn().mockImplementation(async () => {
            await new Promise((r) => setTimeout(r, 5));
            return {
              data: ALEX_BACKEND.repos.map((r) => ({
                name: r.name,
                language: r.language,
                stargazers_count: r.stars,
                forks_count: r.forks,
                topics: r.topics,
                created_at: r.createdAt.toISOString(),
                pushed_at: r.pushedAt.toISOString(),
                fork: r.isFork,
                description: r.description,
              })),
            };
          }),
          listForOrg: jest.fn().mockResolvedValue({ data: [] }),
          getContent: jest
            .fn()
            .mockRejectedValue(
              Object.assign(new Error('Not found'), { status: 404 }),
            ),
        },
        search: {
          issuesAndPullRequests: jest.fn().mockResolvedValue({
            data: {
              items: ALEX_BACKEND.externalPRs.externalRepoNames.map((repo) => ({
                repository_url: `https://api.github.com/repos/${repo}`,
              })),
            },
          }),
        },
      },
      request: jest.fn().mockResolvedValue({ data: [] }),
      graphql: jest.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 5));
        return {
          user: {
            contributionsCollection: {
              contributionCalendar: {
                weeks: ALEX_BACKEND.contributions.weeklyTotals.map((t) => ({
                  contributionDays: [{ contributionCount: t }],
                })),
              },
            },
            pullRequests: {
              nodes: ALEX_BACKEND.externalPRs.externalRepoNames.map((name) => ({
                repository: {
                  name,
                  owner: { login: 'external' },
                },
              })),
            },
          },
        };
      }),
    })),
  };
});

describe('Fetcher Performance Benchmark', () => {
  let githubAdapter: GithubAdapterService;
  let signalExtractor: SignalExtractorService;
  let scoringService: ScoringService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        GithubAdapterService,
        SignalExtractorService,
        SummaryGeneratorService,
        EcosystemClassifierService,
        InteractionProfileService,
        OrgAnalyserService,
        StackFingerprintService,
        ScoringService,
        {
          provide: PrismaService,
          useValue: { githubProfile: { findUnique: jest.fn() } },
        },
        {
          provide: 'REDIS',
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue('OK'),
          },
        },
      ],
    }).compile();

    githubAdapter = module.get(GithubAdapterService);
    signalExtractor = module.get(SignalExtractorService);
    scoringService = module.get(ScoringService);
  });

  afterAll(async () => {
    await module.close();
  });

  it('should process full pipeline within 2000ms budget', async () => {
    const start = performance.now();

    // 1. Fetch
    const { Octokit } = require('octokit');
    const rawData = await githubAdapter.fetchRawData(
      new Octokit(),
      'alex-backend',
    );

    // 2. Extract
    const signals = signalExtractor.extract(rawData);
    expect(signals).toBeDefined();

    // 3. Score
    const result = scoringService.score(rawData);
    expect(result).toBeDefined();

    const end = performance.now();
    const duration = end - start;

    // console.log(`[BENCHMARK] Total Pipeline Time: ${duration.toFixed(2)}ms`);

    // Assert < 2000ms
    expect(duration).toBeLessThan(2000);
  });
});
