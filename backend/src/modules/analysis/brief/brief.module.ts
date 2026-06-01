/**
 * Brief Module — Wires Brief Assembler, Renderer, Seniority Weighting, and CV
 * Claim Extractor into the NestJS DI container.
 *
 * Provides BriefAssemblerService to the JobDispatcher (Stage 7).
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 6
 */

import { Module } from '@nestjs/common';
import { BriefAssemblerService } from './brief-assembler.service';
import { BriefRenderer } from './brief-renderer';
import { SeniorityWeightingService } from './seniority-weighting';
import { CvClaimExtractorService } from './cv-claim-extractor.service';

@Module({
  providers: [
    BriefAssemblerService,
    BriefRenderer,
    SeniorityWeightingService,
    CvClaimExtractorService,
  ],
  exports: [
    BriefAssemblerService,
    CvClaimExtractorService,
  ],
})
export class BriefModule {}