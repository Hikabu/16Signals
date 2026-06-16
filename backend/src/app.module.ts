import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ZodValidationPipeProvider } from './shared/config/zod.config';
import { ConfigModule } from './shared/config/config.module';

import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

import { GithubSyncModule } from './modules/github-sync/github-sync.module';
import { HealthModule } from './modules/health/health.module';
import { QueuesModule } from './queues/queues.module';
import { TestQueuesModule } from './queues/test-queues.module';
import { EmailModule } from './modules/email/email.module';
import { AuthCandidateModule } from './modules/auth-candidate/auth.candidate.module';
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
    GitHubCredentialsModule,
    GithubSyncModule,
    AuthCandidateModule,
    HealthModule,
    process.env.NODE_ENV === 'test' ? TestQueuesModule : QueuesModule,
    EmailModule,
  ],
})
export class AppModule {}