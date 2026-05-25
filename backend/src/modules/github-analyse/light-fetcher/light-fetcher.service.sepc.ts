import { Test, TestingModule } from '@nestjs/testing';
import { LightFetcherService } from './light-fetcher.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { GroupMapperService, OctokitRawResponse } from '../group-mapper/group-mapper.service';
import { RateLimitExhaustedException } from '../errors/rate-limit-exhausted.exception';
import nock from 'nock';
import * as path from 'path';
import { readFileSync } from 'fs';

jest.mock('../rate-limit/rate-limit.service');
jest.mock('../group-mapper/group-mapper.service');

describe('LightFetcherService', () => {
  let service: LightFetcherService;
  let rateLimitService: RateLimitService;
  let groupMapperService: GroupMapperService;

  const fixturePath = path.resolve(__dirname, '../../test/fixtures/github-user-torvalds.json');
  const torvaldsFixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LightFetcherService, RateLimitService, GroupMapperService],
    }).compile();

    service = module.get<LightFetcherService>(LightFetcherService);
    rateLimitService = module.get<RateLimitService>(RateLimitService);
    groupMapperService = module.get<GroupMapperService>(GroupMapperService);
  });

  afterEach(() => {
    nock.cleanAll();
    jest.clearAllMocks();
  });

  it('should fetch all groups for a known public profile (torvalds)', async () => {
    // Mock REST endpoints
    nock('https://api.github.com')
      .get('/users/torvalds')
      .reply(200, torvaldsFixture.userProfile)
      .get('/users/torvalds/repos')
      .reply(200, torvaldsFixture.repos)
      .post('/graphql')
      .reply(200, torvaldsFixture.graphql);

    // Mock RateLimitService to have enough budget
    (rateLimitService.checkBudget as jest.Mock).mockReturnValue(undefined);
    (rateLimitService.consumeRequest as jest.Mock).mockImplementation(() => {});

    // Mock mapper to return a dummy map
    const dummyMap = {
      p1: {} as any,
      p2: {} as any,
      p3: {} as any,
      p4: {} as any,
      p5: {} as any,
      p6: {} as any,
      p7: {} as any,
    };
    (groupMapperService.map as jest.Mock).mockReturnValue(dummyMap);

    const result = await service.fetch('torvalds');
    expect(result).toBeDefined();
    // Ensure all groups are present (light fetch populates 6 groups in RawLightData)
    expect(result.groupA).toBeDefined();
    expect(result.groupB).toBeDefined();
    expect(result.groupC).toBeDefined();
    expect(result.groupD).toBeDefined();
    expect(result.groupE).toBeDefined();
    expect(result.groupF).toBeDefined();
    // Ensure mapper called once
    expect(groupMapperService.map).toHaveBeenCalledTimes(1);
  });

  it('should throw RateLimitExhaustedException when rate limit remaining is < 500', async () => {
    (rateLimitService.checkBudget as jest.Mock).mockImplementation(() => {
      throw new RateLimitExhaustedException();
    });
    await expect(service.fetch('anyuser')).rejects.toBeInstanceOf(RateLimitExhaustedException);
    expect(rateLimitService.checkBudget).toHaveBeenCalled();
  });

  it('should handle user with 0 public repos and return empty arrays', async () => {
    nock('https://api.github.com')
      .get('/users/norepos')
      .reply(200, { ...torvaldsFixture.userProfile, public_repos: 0 })
      .get('/users/norepos/repos')
      .reply(200, [])
      .post('/graphql')
      .reply(200, torvaldsFixture.graphql);

    (rateLimitService.checkBudget as jest.Mock).mockReturnValue(undefined);
    (rateLimitService.consumeRequest as jest.Mock).mockImplementation(() => {});
    (groupMapperService.map as jest.Mock).mockReturnValue({
      p1: {} as any,
      p2: {} as any,
      p3: {} as any,
      p4: {} as any,
      p5: {} as any,
      p6: {} as any,
      p7: {} as any,
    });
    const result = await service.fetch('norepos');
    // Expect repository related groups to be empty structures
    expect(result.groupB.repos).toEqual([]);
    expect(result.groupE).toBeDefined();
  });

  it('should return partial result with GraphQL error logged but not thrown', async () => {
    nock('https://api.github.com')
      .get('/users/torvalds')
      .reply(200, torvaldsFixture.userProfile)
      .get('/users/torvalds/repos')
      .reply(200, torvaldsFixture.repos)
      .post('/graphql')
      .reply(200, { errors: [{ message: 'Some GraphQL error' }], data: {} });

    (rateLimitService.checkBudget as jest.Mock).mockReturnValue(undefined);
    (rateLimitService.consumeRequest as jest.Mock).mockImplementation(() => {});
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (groupMapperService.map as jest.Mock).mockReturnValue({
      p1: {} as any,
      p2: {} as any,
      p3: {} as any,
      p4: {} as any,
      p5: {} as any,
      p6: {} as any,
      p7: {} as any,
    });
    const result = await service.fetch('torvalds');
    expect(consoleSpy).toHaveBeenCalled();
    expect(result).toBeDefined();
    consoleSpy.mockRestore();
  });

  it('should call GroupMapper.map exactly once with the raw Octokit response', async () => {
    nock('https://api.github.com')
      .get('/users/torvalds')
      .reply(200, torvaldsFixture.userProfile)
      .get('/users/torvalds/repos')
      .reply(200, torvaldsFixture.repos)
      .post('/graphql')
      .reply(200, torvaldsFixture.graphql);

    (rateLimitService.checkBudget as jest.Mock).mockReturnValue(undefined);
    (rateLimitService.consumeRequest as jest.Mock).mockImplementation(() => {});
    (groupMapperService.map as jest.Mock).mockReturnValue({
      p1: {} as any,
      p2: {} as any,
      p3: {} as any,
      p4: {} as any,
      p5: {} as any,
      p6: {} as any,
      p7: {} as any,
    });

    await service.fetch('torvalds');
    expect(groupMapperService.map).toHaveBeenCalledTimes(1);
    const rawArg = (groupMapperService.map as jest.Mock).mock.calls[0][1] as OctokitRawResponse;
    expect(rawArg.userProfile).toBeDefined();
    expect(rawArg.repos).toBeInstanceOf(Array);
  });
});
