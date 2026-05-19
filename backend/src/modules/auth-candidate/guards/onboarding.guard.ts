import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';

@Injectable()
export class OnboardingGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    @Inject('REDIS') private redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    // console.log('req headers:', req.headers); // Debug log to check headers
    const authHeader = req.headers.authorization;
    // console.log('Authorization header:', authHeader); // Debug log to check Authorization header presence
    const token = authHeader?.split(' ')[1] ?? req.cookies?.temp_auth;
    if (!token) throw new UnauthorizedException('No token');

    let payload: any;
    try {
      payload = this.jwt.verify(token, {
        secret: process.env.JWT_ONBOARDING_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    if (payload.type !== 'onboarding') {
      throw new UnauthorizedException('Invalid token type');
    }

    const raw = await this.redis.get(`onboarding_claim:${payload.claimId}`);
    if (!raw) {
      throw new UnauthorizedException('Session expired');
    }

    //  attach to request so controller can use it
    req.onboarding = {
      ...JSON.parse(raw),
      claimId: payload.claimId,
    };

    return true;
  }
}
