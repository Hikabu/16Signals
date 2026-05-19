import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(private config: ConfigService) {
    // console.log(
    //   'Initializing GithubStrategy with callback URL: ',
    //   config.get('app.url') + config.get('auth.githubCallback'),
    // );
    super({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: config.get('app.url') + config.get('auth.githubCallback'),
      // scope: ['read:user', 'user:email'],
      scope: ['user:email'],
      allRawEmails: true,
      //   allowSignup: true,
    });
  }

 async validate(
  accessToken: string,
  refreshToken: string,
  profile: any,
) {
  const primaryEmail =
    profile.emails?.find((e: any) => e.primary) ||
    profile.emails?.[0];

  return {
    githubId: profile.id,
    username: profile.username,
    email: primaryEmail?.value ?? null,
    email_verified: primaryEmail?.verified ?? false,
    accessToken,
  };
}
}
