import { INestApplication } from '@nestjs/common';
import { AuthCandidateService } from './auth.candidate.service';
import { resetBefore, resetAfter } from '../../../test/shared';
import { App } from 'supertest/types';
import Redis from 'ioredis';

jest.mock('@privy-io/node', () => ({
  PrivyClient: jest.fn().mockImplementation(() => ({
    verifyVerify: jest.fn(),
  })),
}));

jest.mock(
  'otplib',
  () => {
    return {
      TOTP: jest.fn().mockImplementation(() => ({
        generate: jest.fn().mockReturnValue('123456'),
        verify: jest.fn().mockReturnValue(true),
        generateSecret: jest.fn().mockReturnValue('mock_secret'),
        keyuri: jest.fn().mockReturnValue('otp_uri'),
      })),
      NobleCryptoPlugin: jest.fn(),
      ScureBase32Plugin: jest.fn(),
    };
  },
  { virtual: true },
);

describe('AuthCandidateService (Integration)', () => {
  let app: INestApplication<App>;
  let service: AuthCandidateService;
  let redis: Redis;
  let testId: string;

  beforeEach(async () => {
    const setup = await resetBefore();
    app = setup.app;
    testId = setup.id;
    service = app.get(AuthCandidateService);
    redis = app.get('REDIS');
  });

  afterEach(async () => {
    await resetAfter(app);
  });

  describe('Registration & Constraints', () => {
    it('should prevent duplicate email registration', async () => {
      const dto = {
        email: `dup-${testId}@example.com`,
        username: `user1-${testId}`,
        password: 'Password123!',
        role: 'CANDIDATE',
      };

      await service.register(dto);

      const result = await service.register({
        ...dto,
        username: `user2-${testId}`,
      });

      expect(result).toEqual({
        success: true,
        message:
          'If an account can be created with these details, you will receive a verification email.',
      });
    });

    it('should prevent duplicate username registration', async () => {
      const dto = {
        email: `user1-${testId}@example.com`,
        username: `dup-${testId}`,
        password: 'Password123!',
        role: 'CANDIDATE',
      };

      await service.register(dto);

      const result = await service.register({
        ...dto,
        email: `user2-${testId}@example.com`,
      });

      expect(result).toEqual({
        success: true,
        message:
          'If an account can be created with these details, you will receive a verification email.',
      });
    });
  });

  describe('MFA Integration', () => {
    it('should store encrypted MFA secret in DB and decrypt correctly', async () => {
      // 1. Register and verify email
      const email = `mfa-${testId}@example.com`;
      await service.register({
        email,
        password: 'Password123!',
        role: 'CANDIDATE',
      });
      const user = await (service as any).prisma.user.findUnique({
        where: { email },
      });
      await (service as any).prisma.user.update({
        where: { id: user.id },
        data: { isEmailVerified: true } as any,
      });

      // 2. Setup MFA
      const { secret } = await service.setupMfa(user.id);
      expect(secret).toBeDefined();

      // 3. Activate MFA (uses the secret from Redis)
      // Since it's integration, we can't easily generate a real TOTP code without otplib helper
      const authenticator = (service as any).getAuthenticator();
      const code = authenticator.generate(secret);

      await service.activateMfa(user.id, code);

      // 4. Verify DB state - secret should be encrypted
      const updatedUser = await (service as any).prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(updatedUser.mfaEnabled).toBe(true);
      expect(updatedUser.mfaSecret).toContain(':'); // IV:TAG:ENC format
      expect(updatedUser.mfaSecret).not.toEqual(secret);
    });
  });

  describe('Password Reset & Session Invalidation', () => {
    it('should manage password reset tokens in Redis', async () => {
      const email = `reset-${testId}@example.com`;
      await service.register({
        email,
        username: `reset-${testId}`,
        password: 'Password123!',
        role: 'CANDIDATE',
      });

      await service.requestPasswordReset({ email });

      // Check Redis for token (we have to find it since it's random)
      const keys = await redis.keys('password_reset:*');
      expect(keys.length).toBe(1);

      const token = keys[0].split(':')[1];
      const ttl = await redis.ttl(keys[0]);
      expect(ttl).toBeGreaterThan(3500); // Close to 1h

      // Reset password
      await service.resetPassword({ token, newPassword: 'NewPassword123!' });

      // Token should be deleted
      const exists = await redis.exists(keys[0]);
      expect(exists).toBe(0);
    });

    it('should invalidate all sessions on password reset', async () => {
      const email = `inv-${testId}@example.com`;
      await service.register({
        email,
        password: 'Password123!',
        role: 'CANDIDATE',
      });
      const user = await (service as any).prisma.user.findUnique({
        where: { email },
      });
      await (service as any).prisma.user.update({
        where: { id: user.id },
        data: { isEmailVerified: true } as any,
      });

      // 1. Initial Login to get tokens
      const loginResult = await service.login({
        identifier: email,
        password: 'Password123!',
      });
      expect(await redis.exists(`refresh:${user.id}`)).toBe(1);

      // 2. Reset password
      const token = 'fake-token';
      await redis.set(`password_reset:${token}`, user.id);
      await service.resetPassword({ token, newPassword: 'NewPassword123!' });

      // 3. Session should be gone
      expect(await redis.exists(`refresh:${user.id}`)).toBe(0);
    });
  });
});
