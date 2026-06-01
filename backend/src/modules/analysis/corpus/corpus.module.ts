/**
 * Corpus Module — Wires CorpusCacheService into the DI container.
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 1
 */

import { Module } from '@nestjs/common';
import { CorpusCacheService } from './corpus-cache.service';

@Module({
  providers: [CorpusCacheService],
  exports: [CorpusCacheService],
})
export class CorpusModule {}