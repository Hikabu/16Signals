import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

type RefreshPayload = {
  sub: string;
  jti: string;
  role?: string;
};

@Injectable()
export class EmployerRefreshStrategy extends PassportStrategy(
  Strategy,
  'refresh-employer',
) {
  constructor(
    @Inject('REDIS') private readonly redis: Redis,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req) => req?.cookies?.refresh_token,
        (req) => req?.headers?.authorization?.replace('Bearer ', ''),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(_req: unknown, payload: RefreshPayload) {
    if (payload.role && payload.role !== 'employer') {
      throw new UnauthorizedException();
    }

    const refreshKey = `employer_refresh:${payload.sub}`;
    const storedJti = await this.redis.get(refreshKey);

    if (!storedJti) throw new UnauthorizedException();

    if (storedJti !== payload.jti) {
      await this.redis.del(refreshKey);
      throw new UnauthorizedException('Refresh token revoked');
    }

    return {
      companyId: payload.sub,
      jti: payload.jti,
    };
  }
}
