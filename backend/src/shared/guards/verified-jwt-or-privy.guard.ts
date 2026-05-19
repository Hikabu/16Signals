import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import * as jose from 'jose';
import { verifyPrivyToken } from '../auth/verify-privy-token';

type InternalJwtPayload = {
  sub?: string;
  isEmailVerified?: boolean;
  role?: string;
  web3Profile?: unknown;
};

@Injectable()
export class VerifiedJwtOrPrivyGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    const bearer = req?.headers?.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice('Bearer '.length)
      : null;
    const cookieToken = req?.cookies?.access_token ?? null;
    const token = bearer ?? cookieToken;

    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    // 1) Try internal HS256 JWT first (existing app auth)
    const internalSecret = process.env.JWT_ACCESS_SECRET;
    if (internalSecret) {
      try {
        const { payload } = await jose.jwtVerify(token, new TextEncoder().encode(internalSecret));
        const p = payload as InternalJwtPayload;
        if (p?.sub) {
          req.user = {
            id: p.sub,
            isEmailVerified: Boolean(p.isEmailVerified),
            role: p.role,
            web3Profile: p.web3Profile ?? null,
            authSource: 'internal',
          };
          return true;
        }
      } catch {
        // fall through to Privy verification
      }
    }

    // 2) Privy ES256 JWT via JWKS
    try {
      const privy = await verifyPrivyToken(token);
      req.user = {
        id: privy.id,
        email: privy.email,
        walletAddress: privy.wallet,
        // Treat Privy-authenticated users as verified for protected endpoints.
        isEmailVerified: true,
        role: 'CANDIDATE',
        authSource: 'privy',
      };
      return true;
    } catch (e) {
      throw new UnauthorizedException('Authentication required');
    }
  }
}

