import { Test, TestingModule } from '@nestjs/testing';
import { AuthCandidateService } from './auth.candidate.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const mockEmailQueue = {
  add: jest.fn(),
  process: jest.fn(),
};

const mockPrismaService = {
  user: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  authAccount: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  candidate: {
    create: jest.fn(),
  },
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock_token'),
  verify: jest.fn(),
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'AUTH_ENCRYPTION_KEY')
      return '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // 32 bytes hex
    return null;
  }),
};

jest.mock('bcrypt');

const mockOtplib = {
  verify: jest.fn().mockReturnValue(true),
  generateSecret: jest.fn().mockReturnValue('mock_secret'),
  keyuri: jest.fn().mockReturnValue('otp_uri'),
};

// Mock the internal require used in AuthService
jest.mock(
  'otplib',
  () => {
    return {
      TOTP: jest.fn().mockImplementation(() => mockOtplib),
      NobleCryptoPlugin: jest.fn(),
      ScureBase32Plugin: jest.fn(),
    };
  },
  { virtual: true },
);

describe('AuthCandidateService', () => {
  let service: AuthCandidateService;
  let prisma: typeof mockPrismaService;
  let jwt: typeof mockJwtService;
  let redis: typeof mockRedis;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthCandidateService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: 'REDIS', useValue: mockRedis },
        { provide: 'BullQueue_email', useValue: mockEmailQueue },
      ],
    }).compile();

    service = module.get<AuthCandidateService>(AuthCandidateService);
    prisma = module.get(PrismaService);
    jwt = module.get(JwtService);
    redis = module.get('REDIS');

    jest.clearAllMocks();
  });

  describe('Local Authentication', () => {
    const registerDto = {
      email: 'test@example.com',
      username: 'testuser',
      password: 'password123',
    };

    it('should register a new user and initiate email verification', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
      prisma.user.create.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
      });

      const result = await service.register(registerDto);

      expect(prisma.user.create).toHaveBeenCalled();
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('verify_email'),
        expect.any(String),
        'EX',
        3600,
      );
      expect(result).toEqual({
        success: true,
        message:
          'If an account can be created with these details, you will receive a verification email.',
      });
    });
    it('should login and check MFA requirement', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        isEmailVerified: true,
        mfaEnabled: true,
        authAccounts: [{ provider: 'LOCAL', passwordHash: 'hashed_password' }],
      });

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({ identifier: 'test', password: 'p' });

      expect(result).toEqual({
        type: 'MFA_REQUIRED',
        data: { mfaToken: 'mock_token', userId: 'user_1' },
      });
    });
  });

  describe('MFA & Verification', () => {
    it('should setup MFA', async () => {
      const result = await service.setupMfa('user_1');
      expect(result.qrCode).toBeDefined();
      expect(redis.set).toHaveBeenCalledWith(
        'mfa_setup:user_1',
        'mock_secret',
        'EX',
        300,
      );
    });

    it('should activate MFA and encrypt secret', async () => {
      redis.get.mockResolvedValue('mock_secret');
      mockOtplib.verify.mockReturnValue(true);

      await service.activateMfa('user_1', '123456');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user_1' },
        data: expect.objectContaining({
          mfaEnabled: true,
          mfaSecret: expect.stringContaining(':'), // Encrypted format iv:tag:data
        }),
      });
    });

    it('should verify MFA and decrypt secret', async () => {
      jwt.verify.mockReturnValue({ sub: 'user_1', type: 'mfa' });
      // Construct a valid encrypted string for the test
      // Since it's symmetric, we can just mock the findUnique return with anything that looks like encrypted
      // Actually, my decrypt function will be called.
      // I'll construct a real encrypted secret using the test key.
      const testKey =
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const realSecret = 'SECRET123';
      const iv = crypto.randomBytes(12).toString('hex');
      const cipher = crypto.createCipheriv(
        'aes-256-gcm',
        Buffer.from(testKey, 'hex'),
        Buffer.from(iv, 'hex'),
      );
      let enc = cipher.update(realSecret, 'utf8', 'hex');
      enc += cipher.final('hex');
      const tag = cipher.getAuthTag().toString('hex');
      const encrypted = `${iv}:${tag}:${enc}`;

      prisma.user.findUnique.mockResolvedValue({
        id: 'user_1',
        mfaSecret: encrypted,
      });

      await service.verifyMfa('user_1', '123456', 'mfa_token');

      expect(mockOtplib.verify).toHaveBeenCalledWith({
        token: '123456',
        secret: realSecret,
      });
    });
  });
});
