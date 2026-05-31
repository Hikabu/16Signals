/**
 * Orchestration Module — Wires WaveOrchestrator into the DI container.
 *
 * Provides WaveOrchestratorService which other modules (JobDispatcher, BriefAssembler)
 * depend on. The ModuleRegistry is imported from the ModulesModule.
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 3
 */

import { Module } from '@nestjs/common';
import { ModulesModule } from '../modules/module.module';
import { WaveOrchestratorService } from './wave-orchestrator.service';

@Module({
  imports: [ModulesModule],
  providers: [WaveOrchestratorService],
  exports: [WaveOrchestratorService],
})
export class OrchestrationModule {}