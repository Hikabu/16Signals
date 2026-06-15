/**
 * P6 — AI LEVERAGE QUALITY
 * Can this engineer effectively direct AI to produce quality outcomes?
 *
 * Corpus groups: C (Commit Intelligence), E (Engineering Practices)
 * Requires LLM Wave 3 output. Stub until Stage 5.
 *
 * Reference: Analysys_specs_architecture.md Section 3.P6
 */

import { Injectable } from '@nestjs/common';
import { AnalysisModule, AnalysisConfig } from '../module.interface';
import { ModuleResult, Evidence } from '../module-result.types';
import { SignalCorpus, CorpusGroup } from '../../corpus/corpus.types';

@Injectable()
export class P6AILeverageModule implements AnalysisModule {
  readonly module_id = 'p6_ai_leverage';
  readonly primitive_id = 'p6';
  readonly required_corpus_groups: readonly CorpusGroup[] = ['C', 'E'];
  readonly required_collection_mode: 'either' = 'either';

  preflight(corpus: SignalCorpus): CorpusGroup[] {
    return this.required_corpus_groups.filter((g) => !corpus.groups_present.includes(g));
  }

  run(corpus: SignalCorpus, config: AnalysisConfig): ModuleResult {
    console.log(`[Module:${this.module_id}] phase=run_start username=${corpus.github_username}`);

    // const aiConfigFiles = corpus.engineering_practice_signals.ai_config_files_present;
    const aiConfidence = corpus.anti_gaming_inputs.ai_pattern_confidence;

    const evidence: Evidence[] = [];

    // evidence.push({
    //   signal: 'AI config files detected',
    //   corpus_field: 'engineering_practice_signals.ai_config_files_present',
    //   value: aiConfigFiles,
    //   interpretation: aiConfigFiles.length > 0
    //     ? `${aiConfigFiles.length} AI config file(s) found: ${aiConfigFiles.join(', ')}`
    //     : 'No AI config files detected.',
    // });

    evidence.push({
      signal: 'AI pattern confidence (LLM)',
      corpus_field: 'anti_gaming_inputs.ai_pattern_confidence',
      value: aiConfidence,
      interpretation: aiConfidence > 70
        ? 'High AI pattern confidence — LLM has detected patterns consistent with AI generation.'
        : `AI pattern confidence: ${aiConfidence}/100.`,
    });

    console.log(
      // `[Module:${this.module_id}] phase=evidence aiConfigFiles=${aiConfigFiles.length} aiConfidence=${aiConfidence}`,
    );

    // Stub: returns 'traditional' until Stage 5 (LLM integration)
    const classification = 'traditional';

    console.log(
      `[Module:${this.module_id}] phase=run_complete classification=${classification} ` +
      `note=LLM_Wave_3_stub_active`,
    );

    return {
      module_id: this.module_id,
      primitive_id: this.primitive_id,
      confidence: 'observability_gap',
      score_label: 'AI Leverage analysis requires Wave 3 LLM batch. Currently using default classification.',
      evidence,
      flags: [],
      interview_probe: null,
      raw_signals_used: [
        'anti_gaming_inputs.ai_pattern_confidence',
        'commit_signals.message_quality_raw',
        'anti_gaming_inputs.style_discontinuity_events',
      ],
    };
  }
}