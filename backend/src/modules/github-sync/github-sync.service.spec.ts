import { Test, TestingModule } from '@nestjs/testing';
import { GithubSyncService } from './github-sync.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ProfileResolverService } from '../profile-candidate/profile-resolver.service';

const mockPrisma = {
  githubProfile: {
    upsert: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
  },
  developerProfile: {
    update: jest.fn(),
  },
};

const mockConfig = {
  get: jest.fn((key: string) => {
    if (key === 'AUTH_ENCRYPTION_KEY')
      return 'mock-key-32-chars-long-123456789012';
    return 'mock-value';
  }),
};

const mockProfileResolver = {
  ensureDevStack: jest
    .fn()
    .mockResolvedValue({ devProfile: { id: 'dev_1', candidateId: 'cand_1' } }),
};

const mockQueue = {
  add: jest.fn(),
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

describe('GithubSyncService', () => {
  let service: GithubSyncService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GithubSyncService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: ProfileResolverService, useValue: mockProfileResolver },
        { provide: 'REDIS', useValue: mockRedis },
        { provide: 'BullQueue_github-sync', useValue: mockQueue },
      ],
    }).compile();

    service = module.get(GithubSyncService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('adds userId to github sync jobs', async () => {
    mockProfileResolver.ensureDevStack.mockResolvedValueOnce({
      devProfile: {
        id: 'dev_1',
        candidateId: 'cand_1',
        githubProfile: {
          id: 'github_1',
          githubUsername: 'alice',
          lastSyncAt: null,
        },
      },
    });
    mockPrisma.githubProfile.update.mockResolvedValueOnce({
      id: 'github_1',
      githubUsername: 'alice',
    });
    mockPrisma.developerProfile.update.mockResolvedValueOnce({
      id: 'dev_1',
    });

    await service.triggerSync('user_1');

    expect(mockQueue.add).toHaveBeenCalledWith('sync-profile', {
      candidateId: 'cand_1',
      githubProfileId: 'github_1',
      userId: 'user_1',
    });
  });
});
