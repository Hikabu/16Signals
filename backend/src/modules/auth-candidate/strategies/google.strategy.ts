import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private config: ConfigService) {
    // console.log("GOOGLE STRATEGY CALLBAKC:",config.get('app.url') + config.get('auth.googleCallback') );
      console.log('GOOGLE ENV DEBUG');
  console.log({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret:
      process.env.GOOGLE_CLIENT_SECRET?.slice(0, 15),
    appUrl: config.get('app.url'),
    callback: config.get('auth.googleCallback'),
    fullCallback:
      config.get('app.url') +
      config.get('auth.googleCallback'),
  });
    super({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: config.get('app.url') + config.get('auth.googleCallback'),
      scope: ['email', 'profile'],
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: any) {
    // console.log('Google profile:', profile); // Debug log to check the profile object
    return {
      googleId: profile.id,
      email: profile.emails?.[0]?.value,
      email_verified:
        profile.emails?.[0]?.verified || profile._json?.email_verified,
      username: profile.displayName,
      firstName: profile.name?.givenName,
      lastName: profile.name?.familyName,
    };
  }
}
