/**
 * AG5 — AI-GENERATION DISCLOSURE GAP DETECTOR
 * Reads P6 module output to produce Flag when classification is 'disclosure_flag'.
 * Does NOT make an independent LLM call — relies on P6 output.
 *
 * Corpus groups: C (Commit Intelligence), G (Anti-Gaming Inputs)
 * Wave 3 module. Requires LLM Wave 3 output (P6 classification).
 *
 * Reference: Analysys_specs_architecture.md Section 4.AG5
 */

import { Injectable } from '@nestjs/common';
import { AnalysisModule, AnalysisConfig } from '../module.interface';
import { ModuleResult, Evidence, Flag } from '../module-result.types';
import { SignalCorpus, CorpusGroup } from '../../corpus/corpus.types';

@Injectable()
export class AG5AIGenerationDetectionModule implements AnalysisModule {
  readonly module_id = 'ag5_ai_generation_detection';
  readonly primitive_id = null;
  readonly required_corpus_groups: readonly CorpusGroup[] = ['C', 'G'];
  readonly required_collection_mode: 'either' = 'either';

  preflight(corpus: SignalCorpus): CorpusGroup[] {
    return this.required_corpus_groups.filter((g) => !corpus.groups_present.includes(g));
  }

  run(corpus: SignalCorpus, config: AnalysisConfig): ModuleResult {
    console.log(`[Module:${this.module_id}] phase=run_start username=${corpus.github_username}`);

    const evidence: Evidence[] = [];
    const flags: Flag[] = [];

    // Style discontinuity events
    const styleEvents = corpus.anti_gaming_inputs.style_discontinuity_events;
    evidence.push({
      signal: 'Style discontinuity events',
      corpus_field: 'anti_gaming_inputs.style_discontinuity_events',
      value: styleEvents.length,
      interpretation: `${styleEvents.length} style discontinuity event(s) detected.`,
    });

    // AI pattern confidence
    const aiConfidence = corpus.anti_gaming_inputs.ai_pattern_confidence;
    evidence.push({
      signal: 'AI pattern confidence',
      corpus_field: 'anti_gaming_inputs.ai_pattern_confidence',
      value: aiConfidence,
      interpretation: aiConfidence > 70
        ? `High AI pattern confidence (${aiConfidence}/100).`
        : `AI pattern confidence: ${aiConfidence}/100.`,
    });

    // AI config files
    // const aiConfigFiles = corpus.engineering_practice_signals.ai_config_files_present;
    // evidence.push({
    //   signal: 'AI config files',
    //   corpus_field: 'engineering_practice_signals.ai_config_files_present',
    //   value: aiConfigFiles,
    //   interpretation: aiConfigFiles.length > 0
    //     ? `${aiConfigFiles.length} AI config file(s) found.`
    //     : 'No AI config files detected.',
    // });

    // console.log(
    //   `[Module:${this.module_id}] phase=evidence styleEvents=${styleEvents.length} ` +
    //   `aiConfidence=${aiConfidence} aiConfigs=${aiConfigFiles.length}`,
    // );

    // Stub: P6 classification not available until Stage 5
    // In production, this module reads P6's output from the Wave 3 results
    // For now, no flag is raised (conservative default)
    console.log(
      `[Module:${this.module_id}] phase=stub note=P6_classification_not_available_yet ` +
      `default=no_flag`,
    );

    return {
      module_id: this.module_id,
      primitive_id: this.primitive_id,
      confidence: 'observability_gap',
      score_label: 'AI generation detection requires Wave 3 LLM batch output. Currently using conservative default.',
      evidence,
      flags,
      interview_probe: null,
      raw_signals_used: [
        'anti_gaming_inputs.style_discontinuity_events',
        'anti_gaming_inputs.ai_pattern_confidence',
        'engineering_practice_signals.ai_config_files_present',
      ],
    };
  }
}