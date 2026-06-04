/**
 * Analysis v2 Module — Wires the v2 API controller into the GitIntel pipeline.
 *
 * All services come from imported modules:
 *   DataCollectorModule    → DataCollectorService, DeepCollectorService,
 *                            CloneWorkerManager, CircuitBreakerService, CorpusBuilderService
 *   OrchestrationModule    → WaveOrchestratorService, JobDispatcherService
 *   BriefModule            → BriefAssemblerService, CvClaimExtractorService
 *   LLMModule              → LLMIntegrationService, GeminiClient
 *   ModulesModule          → ModuleRegistry (14 analysis modules)
 *   CorpusModule           → CorpusCacheService
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 7
 */

import { Module } from '@nestjs/common';
import { AnalysisV2Controller } from './analysis-v2.controller';
import { CorpusModule } from '../corpus/corpus.module';
import { DataCollectorModule } from '../data-collector/data-collector.module';
import { OrchestrationModule } from '../orchestration/wave-orchestrator.module';
import { LLMModule } from '../llm/llm.module';
import { BriefModule } from '../brief/brief.module';
import { ModulesModule } from '../modules/module.module';
import { GithubAdapterModule } from '../../scoring/github-adapter/github-adapter.module';
import { GitHubCredentialsModule } from '../../github-credentials/github-credentials.module';

@Module({
  imports: [
    CorpusModule,
    DataCollectorModule,
    ModulesModule,
    OrchestrationModule,
    LLMModule,
    BriefModule,
    GithubAdapterModule,
    GitHubCredentialsModule,
  ],
  controllers: [AnalysisV2Controller],
})
export class AnalysisV2Module {}