/**
 * ModuleRegistry — Central registry for all 14 analysis modules.
 *
 * Provides wave-based lookup, preflight coordination, and module lifecycle
 * tracing for the entire analysis pipeline.
 *
 * Architecture: Registry pattern. All modules are injected via constructor
 * and registered on initialization. This enables the WaveOrchestrator to
 * discover modules by wave ID without knowing individual module classes.
 *
 * Tracing: Every registration and lookup emits structured console.log output.
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 2
 */

import { Injectable, Logger } from '@nestjs/common';
import { AnalysisModule, AnalysisConfig } from './module.interface';
import { ModuleResult } from './module-result.types';
import { SignalCorpus, CorpusGroup } from '../corpus/corpus.types';
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

@Injectable()
export class ModuleRegistry {
  private readonly logger = new Logger(ModuleRegistry.name);
  private modules: Map<string, AnalysisModule> = new Map();

  /**
   * Wave → Module ID mapping as defined in spec Section 1.6.
   * Wave 2a is conditional (runs only if AG1 or AG3 fires).
   * EV runs in Wave 3 alongside P6 and AG5 as part of the LLM batch.
   */
  private readonly waveMap: Record<string, string[]> = {
    wave_1: ['ag1_commit_inflation', 'ag2_fork_dump', 'ag3_burst_dormancy'],
    wave_2a: ['ag4_repository_laundering'],
    wave_2b: [
      'p1_execution_reliability',
      'p2_systems_evolution',
      'p5_operational_maturity',
    ],
    wave_2c: ['p3_collaboration_leverage'],
    wave_2d: ['p4_technical_depth'],
    wave_3: ['p6_ai_leverage', 'ag5_ai_generation_detection', 'ev_employment_verification'],
  };

  constructor(
    // Primitives
    p1: P1ExecutionReliabilityModule,
    p2: P2SystemsEvolutionModule,
    p3: P3CollaborationLeverageModule,
    p4: P4TechnicalDepthModule,
    p5: P5OperationalMaturityModule,
    p6: P6AILeverageModule,
    p7: P7AuthenticityConfidenceModule,
    // Anti-gaming
    ag1: AG1CommitInflationModule,
    ag2: AG2ForkDumpModule,
    ag3: AG3BurstDormancyModule,
    ag4: AG4RepositoryLaunderingModule,
    ag5: AG5AIGenerationDetectionModule,
    ag6: AG6CredentialLeakModule,
    // Employment verification
    ev: EVEmploymentVerificationModule,
  ) {
    const allModules: AnalysisModule[] = [
      p1, p2, p3, p4, p5, p6, p7,
      ag1, ag2, ag3, ag4, ag5, ag6,
      ev,
    ];

    for (const mod of allModules) {
      this.modules.set(mod.module_id, mod);
      console.log(
        `[ModuleRegistry] phase=registered moduleId=${mod.module_id} ` +
        `primitiveId=${mod.primitive_id ?? 'null'} ` +
        `requiredGroups=${mod.required_corpus_groups.join(',')} ` +
        `requiredMode=${mod.required_collection_mode}`,
      );
    }

    console.log(
      `[ModuleRegistry] phase=init_complete totalModules=${this.modules.size} ` +
      `waves=${Object.keys(this.waveMap).length}`,
    );
  }

  /**
   * Get a single module by ID.
   */
  get(moduleId: string): AnalysisModule | undefined {
    return this.modules.get(moduleId);
  }

  /**
   * Get all registered modules.
   */
  getAll(): AnalysisModule[] {
    return Array.from(this.modules.values());
  }

  /**
   * Get all modules for a given wave.
   */
  getWaveModules(wave: string): AnalysisModule[] {
    const ids = this.waveMap[wave] || [];
    const waveModules = ids
      .map((id) => this.modules.get(id))
      .filter(Boolean) as AnalysisModule[];

    console.log(
      `[ModuleRegistry] phase=wave_lookup wave=${wave} ` +
      `modules=${waveModules.map((m) => m.module_id).join(',')} ` +
      `count=${waveModules.length}`,
    );

    return waveModules;
  }

  /**
   * Check if Wave 2a should be triggered based on Wave 1 results.
   * AG4 runs only if AG1 or AG3 raised flags.
   */
  shouldRunWave2a(wave1Results: ModuleResult[]): boolean {
    const ag1Module = 'ag1_commit_inflation';
    const ag3Module = 'ag3_burst_dormancy';

    const hasAglFlag = wave1Results.some(
      (r) =>
        (r.module_id === ag1Module || r.module_id === ag3Module) &&
        r.flags.length > 0,
    );

    console.log(
      `[ModuleRegistry] phase=wave2a_check ` +
      `ag1Flags=${wave1Results.find((r) => r.module_id === ag1Module)?.flags.length ?? 0} ` +
      `ag3Flags=${wave1Results.find((r) => r.module_id === ag3Module)?.flags.length ?? 0} ` +
      `trigger=${hasAglFlag}`,
    );

    return hasAglFlag;
  }

  /**
   * Pre-flight check for a module against a given corpus.
   * Returns the list of missing required corpus groups.
   */
  preflight(moduleId: string, corpus: SignalCorpus): CorpusGroup[] {
    const mod = this.modules.get(moduleId);
    if (!mod) {
      console.log(
        `[ModuleRegistry] phase=preflight_fail moduleId=${moduleId} reason=not_found`,
      );
      return [];
    }

    const missing = mod.required_corpus_groups.filter(
      (g) => !corpus.groups_present.includes(g),
    );

    if (missing.length > 0) {
      console.log(
        `[ModuleRegistry] phase=preflight_fail moduleId=${moduleId} ` +
        `missingGroups=${missing.join(',')} presentGroups=${corpus.groups_present.join(',')}`,
      );
    } else {
      console.log(
        `[ModuleRegistry] phase=preflight_pass moduleId=${moduleId} ` +
        `requiredGroups=${mod.required_corpus_groups.join(',')}`,
      );
    }

    return missing;
  }

  /**
   * Execute a single module with tracing.
   * Handles preflight, execution, timing, and error boundaries.
   */
  executeModule(
    moduleId: string,
    corpus: SignalCorpus,
    config: AnalysisConfig,
  ): ModuleResult {
    const mod = this.modules.get(moduleId);
    if (!mod) {
      console.log(
        `[ModuleRegistry] phase=execute_error moduleId=${moduleId} reason=not_found`,
      );
      return {
        module_id: moduleId,
        primitive_id: null,
        confidence: 'insufficient_data',
        score_label: 'Module not found in registry.',
        evidence: [],
        flags: [],
        interview_probe: null,
        raw_signals_used: [],
      };
    }

    // Pre-flight
    const missing = mod.preflight(corpus);
    if (missing.length > 0) {
      console.log(
        `[ModuleRegistry] phase=execute_skipped moduleId=${moduleId} reason=missing_groups groups=${missing.join(',')}`,
      );
      return {
        module_id: mod.module_id,
        primitive_id: mod.primitive_id,
        confidence: 'observability_gap',
        score_label:
          'No public evidence — likely private or enterprise context. Do not penalise.',
        evidence: [],
        flags: [],
        interview_probe: null,
        raw_signals_used: [],
      };
    }

    // Execute
    const startMs = Date.now();
    try {
      const result = mod.run(corpus, config);
      const durationMs = Date.now() - startMs;

      console.log(
        `[Module:${moduleId}] phase=run_complete confidence=${result.confidence} ` +
        `durationMs=${durationMs} flags=${result.flags.length} evidence=${result.evidence.length}`,
      );

      if (result.flags.length > 0) {
        for (const flag of result.flags) {
          console.log(
            `[Module:${moduleId}] phase=flag_raised flagType=${flag.flag_type} ` +
            `flagId=${flag.flag_id} severity=${flag.severity}`,
          );
        }
      }

      if (result.evidence.length > 0) {
        for (const ev of result.evidence.slice(0, 3)) {
          console.log(
            `[Module:${moduleId}] phase=evidence signal="${ev.signal}" ` +
            `field=${ev.corpus_field} value=${JSON.stringify(ev.value).slice(0, 80)}`,
          );
        }
      }

      return result;
    } catch (error) {
      const durationMs = Date.now() - startMs;
      const errMsg = (error as Error).message;
      console.log(
        `[ModuleRegistry] phase=execute_error moduleId=${moduleId} ` +
        `durationMs=${durationMs} error=${errMsg}`,
      );

      return {
        module_id: mod.module_id,
        primitive_id: mod.primitive_id,
        confidence: 'insufficient_data',
        score_label: `Module execution error: ${errMsg}`,
        evidence: [],
        flags: [],
        interview_probe: null,
        raw_signals_used: [],
      };
    }
  }
}