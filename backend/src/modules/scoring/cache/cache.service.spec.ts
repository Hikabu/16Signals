import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from './cache.service';
import { PrismaService } from '../../../prisma/prisma.service';
import Redis from 'ioredis';
import { AnalysisResult } from '../types/result.types';

describe('CacheService', () => {
  let service: CacheService;
  let prisma: PrismaService;
  let redis: Redis;

  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockPrisma = {
    cachedResult: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const mockResult: AnalysisResult = {
    summary: 'Test summary',
    capabilities: {
      backend: { score: 0.8, confidence: 'high' },
      frontend: { score: 0.2, confidence: 'low' },
      devops: { score: 0.5, confidence: 'medium' },
    },
    ownership: {
      ownedProjects: 10,
      activelyMaintained: 5,
      confidence: 'high',
    },
    impact: {
      activityLevel: 'high',
      consistency: 'strong',
      externalContributions: 2,
      confidence: 'high',
    },
    stack: {
      languages: [],
      tools: [],
    },
    organizations: [],
    interactionProfile: null,
    web3: null,
    reputation: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: 'REDIS', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
    prisma = module.get<PrismaService>(PrismaService);
    redis = module.get<Redis>('REDIS');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('buildCacheKey', () => {
    it('should build a simple key for username', () => {
      expect(service.buildCacheKey('Alice')).toBe('analysis:alice');
    });

    it('should include wallet address if provided', () => {
      expect(service.buildCacheKey('Alice', '0x123')).toBe(
        'analysis:alice:0x123',
      );
    });

    it("15. buildCacheKey('Alice', null) === buildCacheKey('alice', null) (lowercase normalisation)", () => {
      expect(service.buildCacheKey('Alice', undefined)).toBe('analysis:alice');
      expect(service.buildCacheKey('alice', undefined)).toBe('analysis:alice');
      expect(service.buildCacheKey('Alice', undefined)).toBe(
        service.buildCacheKey('alice', undefined),
      );
    });

    it('16. buildCacheKey resolved from JWT profile and buildCacheKey from anonymous body param produce identical strings for same username', () => {
      const resolvedFromJwt = service.buildCacheKey('Alice_Dev');
      const resolvedFromBody = service.buildCacheKey('alice_dev');
      expect(resolvedFromJwt).toEqual(resolvedFromBody);
    });
  });

  describe('get', () => {
    it('should return result from Redis if available', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(mockResult));

      const result = await service.get('analysis:alice');

      expect(result).toEqual(mockResult);
      expect(mockRedis.get).toHaveBeenCalledWith('analysis:alice');
      expect(mockPrisma.cachedResult.findUnique).not.toHaveBeenCalled();
    });

    it('should fallback to Postgres if Redis misses', async () => {
      mockRedis.get.mockResolvedValue(null);
      const expiresAt = new Date(Date.now() + 10000);
      mockPrisma.cachedResult.findUnique.mockResolvedValue({
        id: '1',
        cacheKey: 'analysis:alice',
        result: mockResult,
        expiresAt,
      });

      const result = await service.get('analysis:alice');

      expect(result).toEqual(mockResult);
      expect(mockPrisma.cachedResult.findUnique).toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalled(); // Restoration to Redis
    });

    it('should return null and delete if Postgres entry is expired', async () => {
      mockRedis.get.mockResolvedValue(null);
      const expiresAt = new Date(Date.now() - 10000); // Past
      mockPrisma.cachedResult.findUnique.mockResolvedValue({
        id: '1',
        cacheKey: 'analysis:alice',
        result: mockResult,
        expiresAt,
      });

      const result = await service.get('analysis:alice');

      expect(result).toBeNull();
      expect(mockPrisma.cachedResult.delete).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });
  });

  describe('set', () => {
    it('should set result in both Redis and Postgres', async () => {
      await service.set('analysis:alice', mockResult);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'analysis:alice',
        JSON.stringify(mockResult),
        'EX',
        86400,
      );
      expect(mockPrisma.cachedResult.upsert).toHaveBeenCalled();
    });
  });

  describe('invalidate', () => {
    it('should remove from both layers', async () => {
      await service.invalidate('analysis:alice');

      expect(mockRedis.del).toHaveBeenCalledWith('analysis:alice');
      expect(mockPrisma.cachedResult.deleteMany).toHaveBeenCalled();
    });
  });
});
