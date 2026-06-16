import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OctokitFactory } from './octokit.factory';
import { PrismaService } from '../../../prisma/prisma.service';
import { Octokit } from 'octokit';

// Mock Octokit
jest.mock('octokit', () => {
  return {
    Octokit: jest.fn().mockImplementation((config) => ({
      _config: config,
    })),
  };
});

// Mock crypto util
jest.mock('../../../shared/utils/crypto.utils', () => ({
  decrypt: jest.fn((data, key) => `decrypted-${data}`),
}));

describe('OctokitFactory', () => {
  let factory: OctokitFactory;
  let prisma: PrismaService;
  let config: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OctokitFactory,
        {
          provide: PrismaService,
          useValue: {
            candidate: {
              findUnique: jest.fn(),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'AUTH_ENCRYPTION_KEY') return 'test-key';
              if (key === 'GITHUB_SYSTEM_TOKEN') return 'system-token';
              return null;
            }),
          },
        },
      ],
    }).compile();

    factory = module.get<OctokitFactory>(OctokitFactory);
    prisma = module.get<PrismaService>(PrismaService);
    config = module.get<ConfigService>(ConfigService);
    jest.clearAllMocks();
  });

  it('throws at startup when GITHUB_SYSTEM_TOKEN is missing', async () => {
    await expect(
      Test.createTestingModule({
        providers: [
          OctokitFactory,
          {
            provide: PrismaService,
            useValue: {
              candidate: {
                findUnique: jest.fn(),
              },
            },
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === 'AUTH_ENCRYPTION_KEY') return 'test-key';
                if (key === 'GITHUB_SYSTEM_TOKEN') return undefined;
                return null;
              }),
            },
          },
        ],
      }).compile(),
    ).rejects.toThrow(
      'GITHUB_SYSTEM_TOKEN is not set. Set it in .env. Without it all GitHub requests are unauthenticated (60 req/hr).',
    );
  });

  it('1. userId present, profile has encryptedToken -> decrypt called, Octokit created with decrypted token', async () => {
    (prisma.candidate.findUnique as jest.Mock).mockResolvedValue({
      devProfile: {
        githubProfile: { encryptedToken: 'v1:encrypted-token' },
      },
    });

    const octokit = await factory.forJob('user-1');

    expect(prisma.candidate.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: {
        devProfile: {
          select: {
            githubProfile: {
              select: { encryptedToken: true },
            },
          },
        },
      },
    });
    expect(Octokit).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          headers: expect.objectContaining({
            authorization: 'token decrypted-encrypted-token',
          }),
        }),
      }),
    );
    // Verify it's not the system token
    expect((octokit as any)._config.request.headers.authorization).toEqual(
      'token decrypted-encrypted-token',
    );
  });

  it('2. userId present, profile has no encryptedToken -> falls back to system token', async () => {
    (prisma.candidate.findUnique as jest.Mock).mockResolvedValue({
      devProfile: {
        githubProfile: { encryptedToken: null },
      },
    });

    const octokit = await factory.forJob('user-1');

    expect(Octokit).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          headers: expect.objectContaining({
            authorization: 'token system-token',
          }),
        }),
      }),
    );
  });

  it('3. userId present, decrypt throws -> logs warning, falls back to system token', async () => {
    (prisma.candidate.findUnique as jest.Mock).mockResolvedValue({
      devProfile: {
        githubProfile: { encryptedToken: 'v1:bad-token' },
      },
    });
    const decryptMock = require('../../../shared/utils/crypto.utils').decrypt;
    decryptMock.mockImplementationOnce(() => {
      throw new Error('Decrypt failed');
    });

    const warnSpy = jest.spyOn((factory as any).logger, 'warn');

    const octokit = await factory.forJob('user-1');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ err: 'Decrypt failed', userId: 'user-1' }),
      'octokit_token_decrypt_failed',
    );
    expect(Octokit).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          headers: expect.objectContaining({
            authorization: 'token system-token',
          }),
        }),
      }),
    );
  });

  it('4. userId null -> system token used immediately, no DB query made', async () => {
    const octokit = await factory.forJob(null);

    expect(prisma.candidate.findUnique).not.toHaveBeenCalled();
    expect(Octokit).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          headers: expect.objectContaining({
            authorization: 'token system-token',
          }),
        }),
      }),
    );
  });
});
