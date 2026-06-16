import { Module } from '@nestjs/common';
import { GithubAdapterService } from './github-adapter.service';
import { OctokitFactory } from './octokit.factory';

@Module({
  providers: [GithubAdapterService, OctokitFactory],
  exports: [GithubAdapterService, OctokitFactory],
})
export class GithubAdapterModule {}
