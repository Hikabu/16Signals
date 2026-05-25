import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { BriefCacheService } from './brief-cache.service';
import { EvidenceBrief } from '../../../types/evidence-brief.types';

describe('BriefCacheService', () => {
  let service: BriefCacheService;
  let prisma: PrismaService;

  const mockPrisma = {
    cachedResult: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BriefCacheService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<BriefCacheService>(BriefCacheService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should build keys correctly', () => {
    const key = BriefCacheService.buildKey('torvalds', 'light');
    expect(key).toBe('brief:torvalds:light:v5');
  });

  it('should return null if result not found in cache', async () => {
    mockPrisma.cachedResult.findUnique.mockResolvedValue(null);
    const result = await service.get('key');
    expect(result).toBeNull();
  });

  it('should return null and trigger cleanup if cache result is expired', async () => {
    const expiredRecord = {
      cacheKey: 'key',
      result: { candidateId: '1' } as any,
      expiresAt: new Date(Date.now() - 1000), // 1 second ago
    };
    mockPrisma.cachedResult.findUnique.mockResolvedValue(expiredRecord);
    mockPrisma.cachedResult.delete.mockResolvedValue({});

    const result = await service.get('key');
    expect(result).toBeNull();
    expect(mockPrisma.cachedResult.delete).toHaveBeenCalledWith({
      where: { cacheKey: 'key' },
    });
  });

  it('should return parsed result if cache is valid and not expired', async () => {
    const mockBrief = { candidateId: 'user123' } as unknown as EvidenceBrief;
    const validRecord = {
      cacheKey: 'key',
      result: mockBrief,
      expiresAt: new Date(Date.now() + 60000), // 1 minute in future
    };
    mockPrisma.cachedResult.findUnique.mockResolvedValue(validRecord);

    const result = await service.get('key');
    expect(result).toEqual(mockBrief);
    expect(mockPrisma.cachedResult.delete).not.toHaveBeenCalled();
  });

  it('should upsert cache entry on set', async () => {
    const mockBrief = { candidateId: 'user123' } as unknown as EvidenceBrief;
    mockPrisma.cachedResult.upsert.mockResolvedValue({});

    await service.set('key', mockBrief, 3600);

    expect(mockPrisma.cachedResult.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { cacheKey: 'key' },
        create: expect.objectContaining({
          cacheKey: 'key',
          result: mockBrief,
        }),
      }),
    );
  });

  it('should delete records matching pattern on invalidate', async () => {
    mockPrisma.cachedResult.deleteMany.mockResolvedValue({ count: 1 });

    await service.invalidate('torvalds');

    expect(mockPrisma.cachedResult.deleteMany).toHaveBeenCalledWith({
      where: {
        cacheKey: {
          startsWith: 'brief:torvalds:',
        },
      },
    });
  });
});
