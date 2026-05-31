/**
 * Analysis v2 Module — Wires the v2 API controller into the GitIntel pipeline.
 *
 * Imports all pipeline modules:
 *   DataCollectorModule  → 7 group collectors + circuit breaker
 *   ModulesModule         → 14 analysis modules + ModuleRegistry
 *   OrchestrationModule   → WaveOrchestrator + JobDispatcher
 *   LLMModule             → Deepseek v4 client + LLM integration
 *   BriefModule           → Brief Assembler + CV claim extractor
 *
 * Also imports OctokitFactory from the legacy scoring module for GitHub auth.
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 7
 */

import { Module } from '@nestjs/common';
import { AnalysisV2Controller } from './analysis-v2.controller';
import { JobDispatcherService } from '../orchestration/job-dispatcher.service';
import { CorpusCacheService } from '../corpus/corpus-cache.service';
import { DataCollectorModule } from '../data-collector/data-collector.module';
import { OrchestrationModule } from '../orchestration/wave-orchestrator.module';
import { LLMModule } from '../llm/llm.module';
import { BriefModule } from '../brief/brief.module';
import { GithubAdapterModule } from '../../scoring/github-adapter/github-adapter.module';

@Module({
  imports: [
    DataCollectorModule,
    OrchestrationModule,
    LLMModule,
    BriefModule,
    GithubAdapterModule,
  ],
  controllers: [AnalysisV2Controller],
  providers: [
    JobDispatcherService,
    CorpusCacheService,
  ],
})
export class AnalysisV2Module {}