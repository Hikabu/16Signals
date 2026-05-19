import * as jose from 'jose';
import { AppException } from '../../shared/app.exception';

type PrivyJwtClaims = {
  sub?: string;
  email?: { address?: string };
  wallet?: { address?: string };
};

export type PrivyAuthUser = {
  privyUserId: string;
  email?: string;
  walletAddress?: string;
};

const PRIVY_ISSUER = 'privy.io';
const PRIVY_JWKS_COOLDOWN_MS = 5 * 60 * 1000;

type PrivyTokenErrorCode =
  | 'EXPIRED_TOKEN'
  | 'INVALID_ISSUER'
  | 'INVALID_AUDIENCE'
  | 'INVALID_ALGORITHM'
  | 'MISSING_SUB'
  | 'MALFORMED_TOKEN'
  | 'UNKNOWN_VERIFY_ERROR';

type PrivyTokenErrorResult = {
  code: PrivyTokenErrorCode;
  message: string;
};

function getPrivyAppId(): string {
  const appId = process.env.PRIVY_APP_ID;
  if (!appId) {
    throw new AppException('PRIVY_APP_ID is not configured', 500);
  }
  return appId;
}

function getPrivyJwksUrl(appId: string): URL {
  return new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`);
}

let jwksCache: ReturnType<typeof jose.createRemoteJWKSet> | null = null;
let jwksCacheAppId: string | null = null;

function getPrivyJwks(appId: string) {
  if (!jwksCache || jwksCacheAppId !== appId) {
    jwksCache = jose.createRemoteJWKSet(getPrivyJwksUrl(appId), {
      cooldownDuration: PRIVY_JWKS_COOLDOWN_MS,
    });
    jwksCacheAppId = appId;
  }
  return jwksCache;
}

function toPrivyTokenError(error: unknown): PrivyTokenErrorResult {
  if (error instanceof jose.errors.JWTExpired) {
    return { code: 'EXPIRED_TOKEN', message: 'Privy token has expired' };
  }
  if (error instanceof jose.errors.JWTClaimValidationFailed) {
    if (error.claim === 'iss') {
      return { code: 'INVALID_ISSUER', message: 'Privy token issuer is invalid' };
    }
    if (error.claim === 'aud') {
      return {
        code: 'INVALID_AUDIENCE',
        message: 'Privy token audience does not match PRIVY_APP_ID',
      };
    }
    return {
      code: 'UNKNOWN_VERIFY_ERROR',
      message: `Privy token claim validation failed (${error.claim ?? 'unknown claim'})`,
    };
  }
  if (error instanceof jose.errors.JOSEAlgNotAllowed) {
    return {
      code: 'INVALID_ALGORITHM',
      message: 'Privy token algorithm is invalid (expected ES256)',
    };
  }
  if (
    error instanceof jose.errors.JWSInvalid ||
    error instanceof jose.errors.JWTInvalid
  ) {
    return { code: 'MALFORMED_TOKEN', message: 'Privy token is malformed or invalid' };
  }
  return {
    code: 'UNKNOWN_VERIFY_ERROR',
    message: 'Privy token verification failed for an unknown reason',
  };
}

export async function verifyPrivyAccessToken(
  token: string,
): Promise<PrivyAuthUser> {
  if (!token) {
    throw new AppException('Privy access token is required', 401);
  }

  const appId = getPrivyAppId();
  const jwks = getPrivyJwks(appId);

  try {
    const { payload } = await jose.jwtVerify(token, jwks, {
      issuer: PRIVY_ISSUER,
      audience: appId,
      algorithms: ['ES256'],
    });

    const claims = payload as PrivyJwtClaims;
    if (!claims.sub) {
      const missingSubMessage = '[MISSING_SUB] Privy token is missing subject claim';
      throw new AppException(missingSubMessage, 401);
    }

    return {
      privyUserId: claims.sub,
      email: claims.email?.address,
      walletAddress: claims.wallet?.address,
    };
  } catch (error) {
    if (error instanceof AppException) {
      throw error;
    }
    const privyError = toPrivyTokenError(error);
    throw new AppException(`[${privyError.code}] ${privyError.message}`, 401);
  }
}
