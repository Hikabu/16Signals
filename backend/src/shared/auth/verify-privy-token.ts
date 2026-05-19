import { createRemoteJWKSet, jwtVerify } from 'jose';

type PrivyWallet = { type?: string; address?: string };

type PrivyJwtPayload = {
  sub?: string;
  email?: string;
  preferred_username?: string;
  wallets?: PrivyWallet[];
};

const JWKS = createRemoteJWKSet(
  new URL('https://auth.privy.io/.well-known/jwks.json'),
);

export type VerifiedPrivyUser = {
  id: string;
  email: string | null;
  wallet: string | null;
};

export async function verifyPrivyToken(token: string): Promise<VerifiedPrivyUser> {
  const appId = process.env.PRIVY_APP_ID;
  if (!appId) {
    throw new Error('PRIVY_APP_ID is not configured');
  }

  const { payload } = await jwtVerify(token, JWKS, {
    issuer: 'https://auth.privy.io',
    audience: appId,
  });

  const claims = payload as PrivyJwtPayload;
  if (!claims.sub) {
    throw new Error('Privy token missing sub');
  }

  const smartWallet =
    claims.wallets?.find((w) => w?.type === 'smart')?.address ?? null;

  return {
    id: claims.sub,
    email:
      (typeof claims.email === 'string' && claims.email) ||
      (typeof claims.preferred_username === 'string' && claims.preferred_username) ||
      null,
    wallet: typeof smartWallet === 'string' ? smartWallet : null,
  };
}

