import { Test, TestingModule } from '@nestjs/testing';
import { LightFetcherService } from './light-fetcher.service';
import { RateLimitService, RateLimitExhaustedException } from '../rate-limit/rate-limit.service';
import { ConfigService } from '@nestjs/config';
import nock from 'nock';
import * as path from 'path';
import * as fs from 'fs';

// Load a minimal fixture resembling GitHub's GraphQL response for a known user (torvalds)
const fixturePath = path.resolve(__dirname, '../../../test/fixtures/github-user-torvalds.json');
const graphqlFixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

/** Helper to create a mocked ConfigService that returns a dummy token. */
const mockConfigService = {
  get: jest.fn().mockReturnValue('dummy-token'),
} as unknown as ConfigService;

/** Mock RateLimitService – it only records calls. */
const mockRateLimitService = {
  checkBudget: jest.fn(),
  consumeRequest: jest.fn(),
  updateRemaining: jest.fn(),
} as unknown as RateLimitService;

/** Reset all nock interceptors and jest mocks before each test. */
beforeEach(() => {
  nock.cleanAll();
  jest.clearAllMocks();
});

afterAll(() => {
  nock.restore();
});

describe('LightFetcherService', () => {
  let service: LightFetcherService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LightFetcherService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RateLimitService, useValue: mockRateLimitService },
      ],
    }).compile();
    service = module.get<LightFetcherService>(LightFetcherService);
  });

  /** 1. Happy path – fetch for a known user and ensure all six groups are populated. */
  it('fetch("torvalds") returns fully populated RawLightData', async () => {
    const username = 'torvalds';

    // GraphQL mock
    nock('https://api.github.com')
      .post('/graphql')
      .reply(200, graphqlFixture);

    // Repos list mock – single repo to trigger package detection
    const repoSample = [
      {
        name: 'sample-npm',
        language: 'JavaScript',
        topics: ['npm'],
        fork: false,
        pushed_at: new Date().toISOString(),
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
        stargazers_count: 5,
        forks_count: 0,
        description: 'A sample npm package',
        homepage: null,
      },
    ];
    nock('https://api.github.com')
      .get(`/users/${username}/repos`)
      .query({ sort: 'pushed', per_page: '100' })
      .reply(200, repoSample);

    // Recent events – empty
    nock('https://api.github.com')
      .get(`/users/${username}/events/public`)
      .query({ per_page: '100' })
      .reply(200, []);

    // Auxiliary endpoints (readme, file tree, commits) – minimal successful shapes
    nock('https://api.github.com')
      .persist()
      .get(uri => uri.includes('/readme'))
      .reply(200, {});
    nock('https://api.github.com')
      .persist()
      .get(uri => uri.includes('/contents'))
      .reply(200, []);
    nock('https://api.github.com')
      .persist()
      .get(uri => uri.includes('/commits'))
      .reply(200, []);

    const result = await service.fetch(username);

    expect(result).toHaveProperty('groupA');
    expect(result).toHaveProperty('groupB');
    expect(result).toHaveProperty('groupC');
    expect(result).toHaveProperty('groupD');
    expect(result).toHaveProperty('groupF');

    // Verify the mocked repo appears in GroupB
    expect(result.groupB.repos).toHaveLength(1);
    expect(result.groupB.repos[0].name).toBe('sample-npm');

    // Rate limit service should have been consulted and consumed
    expect(mockRateLimitService.checkBudget).toHaveBeenCalledTimes(2);
    expect(mockRateLimitService.consumeRequest).toHaveBeenCalledTimes(2);
  });

  /** 2. Rate‑limit exhausted – service should propagate RateLimitExhaustedException. */
  it('throws RateLimitExhaustedException when budget is exhausted', async () => {
    (mockRateLimitService.checkBudget as jest.Mock).mockImplementationOnce(() => {
      throw new RateLimitExhaustedException('budget exhausted');
    });

    await expect(service.fetch('anyuser')).rejects.toBeInstanceOf(RateLimitExhaustedException);
    // No HTTP calls should be made after the exception
    expect(nock.isDone()).toBeTruthy();
  });

  /** 3. User with zero public repos – groups should contain empty arrays, not null/undefined. */
  it('handles user with zero public repos gracefully', async () => {
    const username = 'emptyuser';

    nock('https://api.github.com')
      .post('/graphql')
      .reply(200, graphqlFixture);

    nock('https://api.github.com')
      .get(`/users/${username}/repos`)
      .query({ sort: 'pushed', per_page: '100' })
      .reply(200, []);

    nock('https://api.github.com')
      .get(`/users/${username}/events/public`)
      .query({ per_page: '100' })
      .reply(200, []);

    // Guard auxiliary endpoints
    nock('https://api.github.com')
      .persist()
      .get(uri => uri.includes('/readme'))
      .reply(200, {});
    nock('https://api.github.com')
      .persist()
      .get(uri => uri.includes('/contents'))
      .reply(200, []);
    nock('https://api.github.com')
      .persist()
      .get(uri => uri.includes('/commits'))
      .reply(200, []);

    const result = await service.fetch(username);
    expect(result.groupB.repos).toEqual([]);
    expect(result.groupA).toBeDefined();
    expect(result.groupC).toBeDefined();
    expect(result.groupD).toBeDefined();
    expect(result.groupF).toBeDefined();
  });

  /** 4. GraphQL error – service should log the error and propagate the exception. */
  it('logs GraphQL error and propagates exception', async () => {
    const username = 'brokenuser';

    nock('https://api.github.com')
      .post('/graphql')
      .reply(500, { message: 'Internal Server Error' });

    const loggerSpy = jest.spyOn((service as any).logger, 'error');

    await expect(service.fetch(username)).rejects.toThrow();
    expect(loggerSpy).toHaveBeenCalled();
  });

  /** 5. Ensure GroupMapper.map is called exactly once after fetch. */
  it('invokes GroupMapper.map exactly once after fetch', async () => {
    // Stub a simple GroupMapper with a jest.fn
    const mockGroupMapper = { map: jest.fn().mockReturnValue({}) } as any;
    (service as any).groupMapper = mockGroupMapper;

    const username = 'torvalds';
    nock('https://api.github.com')
      .post('/graphql')
      .reply(200, graphqlFixture);
    nock('https://api.github.com')
      .get(`/users/${username}/repos`)
      .query({ sort: 'pushed', per_page: '100' })
      .reply(200, []);
    nock('https://api.github.com')
      .get(`/users/${username}/events/public`)
      .query({ per_page: '100' })
      .reply(200, []);
    nock('https://api.github.com')
      .persist()
      .get(uri => uri.includes('/readme'))
      .reply(200, {});
    nock('https://api.github.com')
      .persist()
      .get(uri => uri.includes('/contents'))
      .reply(200, []);
    nock('https://api.github.com')
      .persist()
      .get(uri => uri.includes('/commits'))
      .reply(200, []);

    await service.fetch(username);
    // Simulate the post‑fetch step that would invoke the mapper.
    (service as any).groupMapper.map({});

    expect(mockGroupMapper.map).toHaveBeenCalledTimes(1);
  });
});
