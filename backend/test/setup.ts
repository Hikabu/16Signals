import { config as loadEnv } from 'dotenv';

process.env.NODE_ENV = 'test';
loadEnv({ quiet: true });

process.env.DATABASE_URL ??=
  'postgresql://postgres:strong@localhost:5432/16signals?schema=public&connection_limit=5&connect_timeout=10';
process.env.PORT ??= '8080';
process.env.SERVER_URL ??= 'https://api.example.test';
process.env.FRONTEND_URL ??= 'https://app.example.test';
process.env.FRONTEND_URL ??= 'https://app.example.test';
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
process.env.INTERNAL_SERVICE_KEY ??= 'test-internal-key';
process.env.GITHUB_PRIVATE_KEY ??= 'test-key';
process.env.GITHUB_SYSTEM_TOKEN ??= 'test-github-system-token';

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
