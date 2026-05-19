import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GithubLinkStrategy extends PassportStrategy(
  Strategy,
  'githubLink',
) {
  constructor(private config: ConfigService) {
    // console.log(
    //   'Initializing GithubLinkStrategy with callback URL: ',
    //   config.get('app.url') + config.get('auth.githubCallback'),
    // );

    super({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL:
        config.get('app.url') + config.get('auth.githubLinkCallback'),
      scope: ['read:user'],
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: any) {
    return {
      githubId: profile.id,
      username: profile.username,
      email: profile.emails?.[0]?.value ?? null, // 👈 optional
      email_verified: profile.emails?.[0]?.verified ?? false,
      accessToken,
    };
  }
}
