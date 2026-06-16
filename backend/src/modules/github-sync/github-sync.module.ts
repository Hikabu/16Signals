import { Module } from '@nestjs/common';
import { GithubSyncService } from './github-sync.service';
import { GithubSyncController } from './github-sync.controller';
import { GitHubAppService } from './github-app.service';
import { GitHubAppWebhookController } from './github-app.webhook.controller';
import { ProfileResolverModule } from '../profile-candidate/profile-resolver.module';

@Module({
  imports: [ProfileResolverModule],
  providers: [GithubSyncService, GitHubAppService],
  controllers: [GithubSyncController, GitHubAppWebhookController],
})
export class GithubSyncModule {}
