import { Module } from '@nestjs/common';
import { AuthCandidateService } from './auth.candidate.service';
import { AuthCandidateController } from './auth.candidate.controller';
import { GithubStrategy } from './strategies/github.strategy';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshStrategy } from './strategies/refresh.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { GithubLinkGuard } from './guards/github.link.guard';
import { GoogleLinkGuard } from './guards/google.link.guard';
import { ConfigModule, ConfigService } from '@nestjs/config';
import authConfig from './auth.candidate.config';
import { GithubLinkStrategy } from './strategies/github.link.strategy';
import { GoogleLinkStrategy } from './strategies/google.link.strategy';
import { GithubSyncConnectStrategy } from './strategies/github.sync.connect.strategy';

const githubAuthProviders =
  process.env.GITHUB_AUTH_ENABLED !== 'false' &&
  Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)
    ? [GithubStrategy, GithubLinkStrategy, GithubSyncConnectStrategy]
    : [];

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [authConfig],
    }),
  ],
  controllers: [AuthCandidateController],
  providers: [
    AuthCandidateService,
    GoogleStrategy,
    GoogleLinkStrategy,
    ...githubAuthProviders,
    JwtStrategy,
    RefreshStrategy,
    GithubLinkGuard,
    GoogleLinkGuard,
  ],
})
export class AuthCandidateModule {}
