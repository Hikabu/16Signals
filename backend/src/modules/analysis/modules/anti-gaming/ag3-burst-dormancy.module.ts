/**
 * AG3 — BURST / DORMANCY FINGERPRINTER
 * Detects activity bursts timed to evaluation triggers.
 *
 * Corpus groups: C (Commit Intelligence), G (Anti-Gaming Inputs)
 * Wave 1 module.
 *
 * Reference: Analysys_specs_architecture.md Section 4.AG3
 */

import { Injectable } from '@nestjs/common';
import { AnalysisModule, AnalysisConfig } from '../module.interface';
import { ModuleResult, Evidence, Flag } from '../module-result.types';
import { SignalCorpus, CorpusGroup } from '../../corpus/corpus.types';

@Injectable()
export class AG3BurstDormancyModule implements AnalysisModule {
  readonly module_id = 'ag3_burst_dormancy';
  readonly primitive_id = null;
  readonly required_corpus_groups: readonly CorpusGroup[] = ['C', 'G'];
  readonly required_collection_mode: 'either' = 'either';

  preflight(corpus: SignalCorpus): CorpusGroup[] {
    return this.required_corpus_groups.filter((g) => !corpus.groups_present.includes(g));
  }

  run(corpus: SignalCorpus, config: AnalysisConfig): ModuleResult {
    console.log(`[Module:${this.module_id}] phase=run_start username=${corpus.github_username}`);

    const ag = corpus.anti_gaming_inputs;
    const evidence: Evidence[] = [];
    const flags: Flag[] = [];

    evidence.push({
      signal: 'Burst/dormancy ratio',
      corpus_field: 'anti_gaming_inputs.burst_dormancy_ratio',
      value: ag.burst_dormancy_ratio,
      interpretation: `Last 30d weekly avg is ${ag.burst_dormancy_ratio.toFixed(1)}x trailing 12m weekly avg.`,
    });

    evidence.push({
      signal: 'Burst triggered at evaluation',
      corpus_field: 'anti_gaming_inputs.burst_triggered_at_evaluation',
      value: ag.burst_triggered_at_evaluation,
      interpretation: ag.burst_triggered_at_evaluation
        ? 'Activity burst started within 14 days of evaluation trigger.'
        : 'No evaluation-timed burst detected.',
    });

    console.log(
      `[Module:${this.module_id}] phase=evidence ratio=${ag.burst_dormancy_ratio.toFixed(2)} ` +
      `triggered=${ag.burst_triggered_at_evaluation}`,
    );

    // Hard threshold: ratio > 5.0 AND triggered at evaluation → SOFT flag
    if (ag.burst_dormancy_ratio > 5.0 && ag.burst_triggered_at_evaluation) {
      flags.push({
        flag_id: 'BURST_DORMANCY_SOFT',
        flag_type: 'SOFT',
        severity: 'WARNING',
        module_id: this.module_id,
        description: `Activity burst detected: ${ag.burst_dormancy_ratio.toFixed(1)}x ratio, evaluation-timed.`,
        evidence_paths: [
          'anti_gaming_inputs.burst_dormancy_ratio',
          'anti_gaming_inputs.burst_triggered_at_evaluation',
        ],
        escalate_to_hiring_manager: false,
        clear_without_interview: true,
        auto_reject: false,
        interview_probe: "Your GitHub activity shows a significant spike in the last few weeks — can you tell me what you've been working on? Is this a new project or ongoing work?",
      });

      console.log(
        `[Module:${this.module_id}] phase=flag_raised flagId=BURST_DORMANCY_SOFT ` +
        `ratio=${ag.burst_dormancy_ratio.toFixed(2)} threshold=5.0`,
      );
    }

    // Soft note: ratio > 5.0 but not evaluation-triggered → context only
    if (ag.burst_dormancy_ratio > 5.0 && !ag.burst_triggered_at_evaluation) {
      evidence.push({
        signal: 'Burst context — evaluation-timing note',
        corpus_field: 'anti_gaming_inputs.burst_triggered_at_evaluation',
        value: false,
        interpretation: 'Burst detected but not evaluation-timed. Noted as context. No flag raised.',
      });
    }

    return {
      module_id: this.module_id,
      primitive_id: this.primitive_id,
      confidence: flags.length > 0 ? 'low' : 'strong',
      score_label: flags.length > 0
        ? 'Burst/dormancy flag raised. See Section D.'
        : 'Normal activity pattern — no burst/dormancy flags.',
      evidence,
      flags,
      interview_probe: null,
      raw_signals_used: [
        'anti_gaming_inputs.burst_dormancy_ratio',
        'anti_gaming_inputs.burst_triggered_at_evaluation',
        'commit_signals.commit_frequency_by_month',
      ],
    };
  }
}