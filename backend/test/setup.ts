process.env.NODE_ENV = 'test';

process.env.DATABASE_URL ??=
  'postgresql://postgres:strong@localhost:5432/16signals?schema=public&connection_limit=5&connect_timeout=10';
process.env.PORT ??= '8080';
process.env.SERVER_URL ??= 'https://api.example.test';
process.env.FRONTEND_URL ??= 'https://app.example.test';
process.env.CORS_ORIGINS ??= 'https://app.example.test';
process.env.JWT_SECRET ??= 'test-jwt-secret-with-at-least-thirty-two-chars';
process.env.JWT_ACCESS_SECRET ??=
  'test-access-secret-with-at-least-thirty-two-chars';
process.env.JWT_REFRESH_SECRET ??=
  'test-refresh-secret-with-at-least-thirty-two-chars';
process.env.JWT_MFA_SECRET ??= 'test-mfa-secret-with-at-least-thirty-two-chars';
process.env.JWT_ONBOARDING_SECRET ??=
  'test-onboarding-secret-with-at-least-thirty-two-chars';
process.env.AUTH_ENCRYPTION_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.ENCRYPTION_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.INTERNAL_API_KEY ??= 'test-internal-key';
process.env.GITHUB_SYSTEM_TOKEN ??= 'test-github-system-token';
process.env.PRIVY_APP_ID ??= 'test-privy-app';
process.env.PRIVY_SECRET ??= 'test-privy-secret';
process.env.PRIVY_JWKS_URL ??=
  'https://auth.privy.io/api/v1/apps/test-privy-app/jwks.json';
process.env.PRIVY_BYPASS ??= 'true';
process.env.WALLET_CHALLENGE_SECRET ??= 'test-wallet-challenge-secret';
process.env.HELIUS_WEBHOOK_SECRET ??= 'test-helius-webhook-secret';

jest.mock('../src/modules/auth-employer/privyAuth', () => ({
  verifyPrivyAccessToken: jest.fn(async (token: string) => {
    if (!token || token === 'invalid') {
      const { AppException } = jest.requireActual(
        '../src/shared/app.exception',
      );
      throw new AppException('Invalid or expired Privy token', 401);
    }

    return {
      privyUserId:
        token === 'mock-token' ? 'test-privy-id' : 'did:privy:test-user-123',
      email:
        token === 'mock-token' ? 'test@example.com' : 'valeriia@test.com',
      walletAddress:
        token === 'mock-token'
          ? '0x123'
          : '0x123456789abcdef0123456789abcdef012345678',
    };
  }),
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
