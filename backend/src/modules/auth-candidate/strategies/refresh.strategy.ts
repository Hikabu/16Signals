import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import Redis from 'ioredis';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

type RefreshPayload = {
  sub: string;
  jti: string;
};

@Injectable()
export class RefreshStrategy extends PassportStrategy(Strategy, 'refresh') {
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
      secretOrKey: config.get<string>('jwt_secret.refresh'),
      passReqToCallback: true,
    });
  }

  async validate(_req: unknown, payload: RefreshPayload) {
    const storedJti = await this.redis.get(`refresh:${payload.sub}`);

    if (!storedJti) throw new UnauthorizedException();

    if (storedJti !== payload.jti) {
      await this.redis.del(`refresh:${payload.sub}`);
      throw new UnauthorizedException('Refresh token revoked');
    }

    return {
      userId: payload.sub,
      jti: payload.jti,
    };
  }
}
