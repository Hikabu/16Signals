/**
 * Orchestration Module — Wires WaveOrchestrator and JobDispatcher into the DI container.
 *
 * Provides:
 *   WaveOrchestratorService — wave-based module execution engine
 *   JobDispatcherService — end-to-end pipeline coordinator (corpus → waves → LLM → brief)
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 3, Stage 7
 */

import { Module } from '@nestjs/common';
import { ModulesModule } from '../modules/module.module';
import { CorpusModule } from '../corpus/corpus.module';
import { DataCollectorModule } from '../data-collector/data-collector.module';
import { LLMModule } from '../llm/llm.module';
import { BriefModule } from '../brief/brief.module';
import { WaveOrchestratorService } from './wave-orchestrator.service';
import { JobDispatcherService } from './job-dispatcher.service';

@Module({
  imports: [
    ModulesModule,
    CorpusModule,
    DataCollectorModule,
    LLMModule,
    BriefModule,
  ],
  providers: [
    WaveOrchestratorService,
    JobDispatcherService,
  ],
  exports: [
    WaveOrchestratorService,
    JobDispatcherService,
  ],
})
export class OrchestrationModule {}