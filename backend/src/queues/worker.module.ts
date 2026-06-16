import { Module } from '@nestjs/common';
import { EmailProcessor } from './email.processor';
import { GithubSyncProcessor } from './github-sync.processor';
import { PrismaModule } from '../prisma/prisma.module';
import { QueuesModule } from './queues.module';
import { EmailModule } from '../modules/email/email.module';
import { ConfigModule } from '../shared/config/config.module';
// GitIntel new pipeline imports
import { GitHubCredentialsModule } from '../modules/github-credentials/github-credentials.module';

const isTest = process.env.NODE_ENV === 'test';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    EmailModule,
    // GitIntel analysis pipeline modules
    GitHubCredentialsModule,
    ...(isTest ? [] : [QueuesModule]),
  ],
  providers: isTest ? [] : [EmailProcessor, GithubSyncProcessor],
})
export class WorkerModule {}
