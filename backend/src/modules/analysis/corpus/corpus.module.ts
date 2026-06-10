/**
 * Corpus Module — Wires CorpusCacheService into the DI container.
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 1
 */

import { Module } from '@nestjs/common';
import { RedisModule } from '../../../redis/redis.module';
import { CorpusCacheService } from './corpus-cache.service';

@Module({
  imports: [RedisModule],
  providers: [CorpusCacheService],
  exports: [CorpusCacheService],
})
export class CorpusModule {}
