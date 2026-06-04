import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ZodValidationPipeProvider } from './shared/config/zod.config';
import { ConfigModule } from './shared/config/config.module';

import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

import { GithubSyncModule } from './modules/github-sync/github-sync.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { HealthModule } from './modules/health/health.module';
import { QueuesModule } from './queues/queues.module';
import { TestQueuesModule } from './queues/test-queues.module';
import { ScoringModule } from './modules/scoring/scoring.module';
import { EmailModule } from './modules/email/email.module';
import { ScorecardModule } from './modules/scorecard/scorecard.module';
import { ProfileModule } from './modules/profile-candidate/profile.module';
import { AuthEmployerModule } from './modules/auth-employer/auth.employer.module';
import { AuthCandidateModule } from './modules/auth-candidate/auth.candidate.module';
import { CompaniesModule } from './modules/profile-employer/companies.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ApplicantsModule } from './modules/applicants/applicants.module';
import { VouchersModule } from './modules/vouchers/vouchers.module';
import { WalletSyncModule } from './modules/wallet-sync/wallet-sync.module';
import { EscrowModule } from './modules/escrow/escrow.module';
import { AnalysisV2Module } from './modules/analysis/analysis/analysis-v2.module';
import { GitHubCredentialsModule } from './modules/github-credentials/github-credentials.module';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    ZodValidationPipeProvider,
  ],
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000,
          limit: 300,
        },
      ],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production' &&
          process.env.NODE_ENV !== 'test'
            ? {
                target: 'pino-pretty',
                options: { singleLine: true },
              }
            : undefined,
      },
    }),
    ConfigModule,
    PrismaModule,
    RedisModule,
    AnalyticsModule,
    AnalysisV2Module,
    GitHubCredentialsModule,
    ApplicantsModule,
    GithubSyncModule,
    JobsModule,
    AuthEmployerModule,
    AuthCandidateModule,
    CompaniesModule,
    HealthModule,
    process.env.NODE_ENV === 'test' ? TestQueuesModule : QueuesModule,
    ScoringModule,
    EmailModule,
    ScorecardModule,
    ProfileModule,
    CompaniesModule,
    VouchersModule,
    WalletSyncModule,
    EscrowModule,
  ],
})
export class AppModule {}