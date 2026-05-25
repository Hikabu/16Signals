import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { LightFetcherService } from './light-fetcher.service';

@Module({
  imports: [ConfigModule, RateLimitModule],
  providers: [LightFetcherService],
  exports: [LightFetcherService],
})
export class LightFetcherModule {}