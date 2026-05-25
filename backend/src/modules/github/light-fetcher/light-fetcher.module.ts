import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LightFetcherService } from './light-fetcher.service';
import { RateLimitModule } from '../rate-limit/rate-limit.module';

@Module({
  imports: [RateLimitModule, ConfigModule],
  providers: [LightFetcherService],
  exports: [LightFetcherService],
})
export class LightFetcherModule {}
