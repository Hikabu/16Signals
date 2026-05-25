import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommitInflationService } from './commit-inflation.service';
import { ForkDumpingService } from './fork-dumping.service';
import { BurstDormancyService } from './burst-dormancy.service';
import { RepoLaunderingService } from './repo-laundering.service';
import { RateLimitModule } from '../github-analyse/rate-limit/rate-limit.module';

@Module({
  imports: [RateLimitModule, ConfigModule],
  providers: [
    CommitInflationService,
    ForkDumpingService,
    BurstDormancyService,
    RepoLaunderingService,
  ],
  exports: [
    CommitInflationService,
    ForkDumpingService,
    BurstDormancyService,
    RepoLaunderingService,
  ],
})
export class AntiGamingModule { }
