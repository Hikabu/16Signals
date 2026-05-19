import { Test, TestingModule } from '@nestjs/testing';
import { AuthCandidateController } from './auth.candidate.controller';
import { AuthCandidateService } from './auth.candidate.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

describe('AuthCandidateController', () => {
  let controller: AuthCandidateController;
  let authService: AuthCandidateService;

  const mockAuthService = {
    login: jest.fn(),
    register: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    completeOnboarding: jest.fn(),
    oauthLogin: jest.fn(),
    linkOAuth: jest.fn(),
    generateLinkState: jest.fn().mockResolvedValue('mock_state'),
    verifyEmail: jest.fn(),
    setupMfa: jest.fn(),
    activateMfa: jest.fn(),
    verifyMfa: jest.fn(),
    githubLink: jest.fn(),
    googleLink: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key) => {
      if (key === 'app.url') return 'https://api.example.test';
      if (key === 'app.frontendUrl') return 'https://app.example.test';
      if (key === 'auth.githubLinkCallback')
        return '/auth/github/link/callback';
      if (key === 'github.clientID') return 'client_id';
      return null;
    }),
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  const mockRedis = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthCandidateController],
      providers: [
        { provide: AuthCandidateService, useValue: mockAuthService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: 'REDIS', useValue: mockRedis },
      ],
    }).compile();

    controller = module.get<AuthCandidateController>(AuthCandidateController);
    authService = module.get<AuthCandidateService>(AuthCandidateService);
  });

  describe('Secure Linking', () => {
    it('should generate secure state for link and redirect', async () => {
      const req = { user: { id: 'user_1' } };
      const res = { redirect: jest.fn() } as any;
      mockAuthService.githubLink.mockResolvedValue('https://github.auth.url');

      await controller.linkGithub(req, res);

      expect(mockAuthService.githubLink).toHaveBeenCalledWith('user_1');
      expect(res.redirect).toHaveBeenCalledWith('https://github.auth.url');
    });

    it('should verify state in callback', async () => {
      const req = {
        authUser: { id: 'user_1' },
        user: { id: 'user_1' }, // IMPORTANT: callback uses BOTH
      };
      const res = { redirect: jest.fn() } as any;

      await controller.linkGithubCallback(req, res, { state: 'mock_state' });

      expect(authService.linkOAuth).toHaveBeenCalledWith(
        'user_1', // authUser.id
        req.user, // profile
        'GITHUB',
        'mock_state',
      );
      expect(res.redirect).toHaveBeenCalledWith('/profile?linked=github');
    });
  });

  describe('MFA & Verification', () => {
    it('should call verifyEmail', async () => {
      await controller.verifyEmail({ code: '123456' });
      expect(authService.verifyEmail).toHaveBeenCalledWith('123456');
    });

    it('should call setupMfa', async () => {
      const req = { user: { id: 'user_1' } };
      await controller.setupMfa(req);
      expect(authService.setupMfa).toHaveBeenCalledWith('user_1');
    });
  });
});
