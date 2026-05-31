/**
 * Modules Module — Registers all 14 analysis modules + ModuleRegistry
 *
 * Provides ModuleRegistry as a provider so the WaveOrchestrator
 * can discover and execute modules by wave ID.
 */
import { Module } from '@nestjs/common';
import { ModuleRegistry } from './module-registry';
import { P1ExecutionReliabilityModule } from './primitives/p1-execution-reliability.module';
import { P2SystemsEvolutionModule } from './primitives/p2-systems-evolution.module';
import { P3CollaborationLeverageModule } from './primitives/p3-collaboration-leverage.module';
import { P4TechnicalDepthModule } from './primitives/p4-technical-depth.module';
import { P5OperationalMaturityModule } from './primitives/p5-operational-maturity.module';
import { P6AILeverageModule } from './primitives/p6-ai-leverage.module';
import { P7AuthenticityConfidenceModule } from './primitives/p7-authenticity-confidence.module';
import { AG1CommitInflationModule } from './anti-gaming/ag1-commit-inflation.module';
import { AG2ForkDumpModule } from './anti-gaming/ag2-fork-dump.module';
import { AG3BurstDormancyModule } from './anti-gaming/ag3-burst-dormancy.module';
import { AG4RepositoryLaunderingModule } from './anti-gaming/ag4-repository-laundering.module';
import { AG5AIGenerationDetectionModule } from './anti-gaming/ag5-ai-generation-detection.module';
import { AG6CredentialLeakModule } from './anti-gaming/ag6-credential-leak.module';
import { EVEmploymentVerificationModule } from './employment/ev-employment-verification.module';

@Module({
  providers: [
    // Register all 14 module implementations (injected into ModuleRegistry)
    P1ExecutionReliabilityModule,
    P2SystemsEvolutionModule,
    P3CollaborationLeverageModule,
    P4TechnicalDepthModule,
    P5OperationalMaturityModule,
    P6AILeverageModule,
    P7AuthenticityConfidenceModule,
    AG1CommitInflationModule,
    AG2ForkDumpModule,
    AG3BurstDormancyModule,
    AG4RepositoryLaunderingModule,
    AG5AIGenerationDetectionModule,
    AG6CredentialLeakModule,
    EVEmploymentVerificationModule,
    // ModuleRegistry (consumes all 14 modules via constructor injection)
    ModuleRegistry,
  ],
  exports: [ModuleRegistry],
})
export class ModulesModule {}