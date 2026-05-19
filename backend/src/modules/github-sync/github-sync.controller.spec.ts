import { Test, TestingModule } from '@nestjs/testing';
import { GithubSyncController } from './github-sync.controller';
import { GithubSyncService } from './github-sync.service';
import { ConfigService } from '@nestjs/config';

const mockGithubSyncService = {
  triggerSync: jest.fn(),
  getSyncStatus: jest.fn(),
};

describe('GithubSyncController', () => {
  let controller: GithubSyncController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GithubSyncController],
      providers: [
        {
          provide: GithubSyncService,
          useValue: mockGithubSyncService,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-internal-key') },
        },
      ],
    }).compile();

    controller = module.get<GithubSyncController>(GithubSyncController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
