/**
 * WaveOrchestratorService — Wave-based execution engine for the analysis pipeline.
 *
 * Architecture:
 *   Wave 1:   AG1, AG2, AG3 (parallel) — anti-gaming pre-check
 *   Wave 2a:  AG4 (conditional on AG1/AG3 flags) — repository laundering
 *   Wave 2b:  P1, P2, P5 (parallel) — execution, evolution, maturity
 *   Wave 2c:  P3 (parallel with 2b/2d) — collaboration leverage
 *   Wave 2d:  P4 (parallel with 2b/2c) — technical depth
 *   Wave 3:   P6, AG5 (LLM-dependent) — AI leverage + generation detection
 *   Wave 4:   Brief assembly + narrative (handled by BriefAssembler in Stage 6)
 *
 * Each wave executes all modules in parallel via Promise.all.
 * Wave 2a is conditional: runs only if AG1 or AG3 raised flags.
 * Tracing logs emit at every wave boundary for real-time debugging.
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 3
 */

import { Injectable, Logger } from '@nestjs/common';
import { ModuleRegistry } from '../modules/module-registry';
import { AnalysisModule, AnalysisConfig } from '../modules/module.interface';
import { ModuleResult } from '../modules/module-result.types';
import { SignalCorpus, CorpusGroup } from '../corpus/corpus.types';
import { AnalysisState } from './analysis-state-machine';

@Injectable()
export class WaveOrchestratorService {
  private readonly logger = new Logger(WaveOrchestratorService.name);

  constructor(private readonly moduleRegistry: ModuleRegistry) {}

  /**
   * Execute the full wave orchestration for a given SignalCorpus.
   *
   * @param corpus - The assembled Signal Corpus
   * @param config - Analysis configuration (seniority, role archetype, JD)
   * @param jobId - The analysis job ID (for tracing)
   * @param progressCallback - Optional callback to update job state after each wave
   * @returns All ModuleResults from every executed wave
   */
  async orchestrate(
    corpus: SignalCorpus,
    config: AnalysisConfig,
    jobId: string,
    progressCallback?: (
      wave: string,
      state: AnalysisState,
    ) => Promise<void>,
  ): Promise<ModuleResult[]> {
    const startTime = Date.now();
    console.log(
      `[WaveOrchestrator] phase=orchestration_start jobId=${jobId} ` +
      `corpusId=${corpus.corpus_id} mode=${corpus.collection_mode} ` +
      `username=${corpus.github_username}`,
    );

    const allResults: ModuleResult[] = [];

    try {
      // ── Wave 1: Anti-gaming (AG1, AG2, AG3) in parallel ──
      await progressCallback?.('wave_1', 'wave_1');
      const wave1Results = await this.executeWave('wave_1', corpus, config, jobId);
      allResults.push(...wave1Results);

      // ── Wave 2a: Repository Laundering (conditional) ──
      const shouldRunWave2a = this.moduleRegistry.shouldRunWave2a(wave1Results);

      if (shouldRunWave2a) {
        await progressCallback?.('wave_2a', 'wave_2a');
        console.log(
          `[WaveOrchestrator] phase=wave_start jobId=${jobId} wave=2a modules=AG4 reason=triggers_fired`,
        );
        const wave2aResults = await this.executeWave('wave_2a', corpus, config, jobId);
        allResults.push(...wave2aResults);
      } else {
        console.log(
          `[WaveOrchestrator] phase=wave_skip jobId=${jobId} wave=2a reason=no_triggers`,
        );
      }

      // ── Waves 2b, 2c, 2d: Run in parallel ──
      // Per the spec (Section 1.6), these waves have no inter-dependencies
      // so they execute concurrently.
      await progressCallback?.('wave_2b', 'wave_2b');
      const [wave2bResults, wave2cResults, wave2dResults] = await Promise.all([
        this.executeWave('wave_2b', corpus, config, jobId),
        this.executeWave('wave_2c', corpus, config, jobId),
        this.executeWave('wave_2d', corpus, config, jobId),
      ]);
      allResults.push(...wave2bResults, ...wave2cResults, ...wave2dResults);

      // ── Wave 3: LLM-dependent modules (P6, AG5) ──
      // Note: In Stage 3, P6 and AG5 return stub/traditional results.
      // In Stage 5, LLMIntegrationService pre-computes inputs for these modules.
      await progressCallback?.('wave_3', 'wave_3');
      const wave3Results = await this.executeWave('wave_3', corpus, config, jobId);
      allResults.push(...wave3Results);

      // Wave 4 is handled by the BriefAssembler in Stage 6
      // For now, mark as complete
      await progressCallback?.('wave_4', 'complete');

      const totalMs = Date.now() - startTime;
      console.log(
        `[WaveOrchestrator] phase=orchestration_complete jobId=${jobId} ` +
        `totalDurationMs=${totalMs} totalModules=${allResults.length} ` +
        `wavesExecuted=${this.countWavesExecuted(allResults, shouldRunWave2a)}`,
      );

      return allResults;
    } catch (error) {
      const totalMs = Date.now() - startTime;
      const errMsg = (error as Error).message;
      console.log(
        `[WaveOrchestrator] phase=orchestration_error jobId=${jobId} ` +
        `durationMs=${totalMs} error=${errMsg}`,
      );

      // Attempt to mark as failed
      await progressCallback?.('failed', 'failed').catch(() => {});

      // Re-throw so the caller can handle the failure
      throw error;
    }
  }

  /**
   * Execute all modules in a given wave in parallel.
   *
   * @param wave - Wave identifier (e.g. 'wave_1', 'wave_2b')
   * @param corpus - The Signal Corpus
   * @param config - Analysis configuration
   * @param jobId - Job ID for tracing
   * @returns Array of ModuleResults for the wave
   */
  private async executeWave(
    wave: string,
    corpus: SignalCorpus,
    config: AnalysisConfig,
    jobId: string,
  ): Promise<ModuleResult[]> {
    const modules = this.moduleRegistry.getWaveModules(wave);

    if (modules.length === 0) {
      console.log(
        `[WaveOrchestrator] phase=wave_empty jobId=${jobId} wave=${wave}`,
      );
      return [];
    }

    console.log(
      `[WaveOrchestrator] phase=wave_start jobId=${jobId} wave=${wave} ` +
      `modules=${modules.map((m) => m.module_id).join(',')} ` +
      `count=${modules.length}`,
    );

    const waveStartTime = Date.now();

    // Execute all modules in the wave in parallel
    const results = await Promise.all(
      modules.map(async (mod) => this.executeSingleModule(mod, corpus, config)),
    );

    const waveMs = Date.now() - waveStartTime;
    console.log(
      `[WaveOrchestrator] phase=wave_complete jobId=${jobId} wave=${wave} ` +
      `durationMs=${waveMs} results=${results.length}`,
    );

    return results;
  }

  /**
   * Execute a single module with preflight, tracing, and error boundaries.
   * Delegates the actual execution to ModuleRegistry.executeModule
   * which handles preflight checks, timing, and error handling.
   */
  private executeSingleModule(
    mod: AnalysisModule,
    corpus: SignalCorpus,
    config: AnalysisConfig,
  ): ModuleResult {
    console.log(
      `[WaveOrchestrator] phase=module_dispatch jobId=... ` +
      `moduleId=${mod.module_id} requiredGroups=${mod.required_corpus_groups.join(',')}`,
    );

    // Delegate to ModuleRegistry which handles preflight, execution, and error recovery
    return this.moduleRegistry.executeModule(mod.module_id, corpus, config);
  }

  /**
   * Count how many waves were actually executed (for tracing).
   */
  private countWavesExecuted(
    results: ModuleResult[],
    wave2aRan: boolean,
  ): number {
    const waveCount = 4; // waves 1, 2b, 2c, 2d always run
    return wave2aRan ? waveCount + 1 : waveCount;
  }

  /**
   * Execute P7 (Authenticity Confidence) as a summary module.
   * P7 is an aggregator that consumes results from AG1–AG6 and EV.
   * It should be called after all other waves complete.
   * This is optional — the BriefAssembler can also invoke P7 during assembly.
   */
  executeP7Summary(
    corpus: SignalCorpus,
    config: AnalysisConfig,
    priorModuleResults: ModuleResult[],
  ): ModuleResult {
    console.log(
      `[WaveOrchestrator] phase=p7_summary username=${corpus.github_username}`,
    );

    const p7 = this.moduleRegistry.get('p7_authenticity_confidence');
    if (!p7) {
      console.log(
        `[WaveOrchestrator] phase=p7_summary_error reason=p7_not_found`,
      );
      return {
        module_id: 'p7_authenticity_confidence',
        primitive_id: 'p7',
        confidence: 'insufficient_data',
        score_label: 'P7 module not available.',
        evidence: [],
        flags: [],
        interview_probe: null,
        raw_signals_used: [],
      };
    }

    const preflight = p7.preflight(corpus);
    if (preflight.length > 0) {
      console.log(
        `[WaveOrchestrator] phase=p7_skip missingGroups=${preflight.join(',')}`,
      );
      return {
        module_id: 'p7_authenticity_confidence',
        primitive_id: 'p7',
        confidence: 'observability_gap',
        score_label:
          'No public evidence for authenticity assessment — likely private or enterprise context. Do not penalise.',
        evidence: [],
        flags: [],
        interview_probe: null,
        raw_signals_used: [],
      };
    }

    const startMs = Date.now();
    try {
      const result = p7.run(corpus, config);
      const durationMs = Date.now() - startMs;
      console.log(
        `[WaveOrchestrator] phase=p7_complete confidence=${result.confidence} durationMs=${durationMs}`,
      );
      return result;
    } catch (error) {
      const durationMs = Date.now() - startMs;
      console.log(
        `[WaveOrchestrator] phase=p7_error durationMs=${durationMs} error=${(error as Error).message}`,
      );
      return {
        module_id: 'p7_authenticity_confidence',
        primitive_id: 'p7',
        confidence: 'insufficient_data',
        score_label: 'Module execution error.',
        evidence: [],
        flags: [],
        interview_probe: null,
        raw_signals_used: [],
      };
    }
  }
}