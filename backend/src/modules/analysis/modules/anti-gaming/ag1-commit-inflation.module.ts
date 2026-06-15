/**
 * AG1 — COMMIT INFLATION DETECTOR
 * Detects patterns of artificially inflated commit counts via tiny commits.
 *
 * Corpus groups: C (Commit Intelligence)
 * Wave 1 module. Runs in parallel with AG2, AG3.
 *
 * Reference: Analysys_specs_architecture.md Section 4.AG1
 */

import { Injectable } from '@nestjs/common';
import { AnalysisModule, AnalysisConfig } from '../module.interface';
import { ModuleResult, Evidence, Flag } from '../module-result.types';
import { SignalCorpus, CorpusGroup } from '../../corpus/corpus.types';

@Injectable()
export class AG1CommitInflationModule implements AnalysisModule {
  readonly module_id = 'ag1_commit_inflation';
  readonly primitive_id = null;
  readonly required_corpus_groups: readonly CorpusGroup[] = ['C'];
  readonly required_collection_mode: 'either' = 'either';

  preflight(corpus: SignalCorpus): CorpusGroup[] {
    return this.required_corpus_groups.filter((g) => !corpus.groups_present.includes(g));
  }

  run(corpus: SignalCorpus, config: AnalysisConfig): ModuleResult {
    console.log(`[Module:${this.module_id}] phase=run_start username=${corpus.github_username}`);

    const cs = corpus.commit_signals;
    const evidence: Evidence[] = [];
    const flags: Flag[] = [];

    // evidence.push({
    //   signal: 'Sub-5-line commit ratio',
    //   corpus_field: 'commit_signals.sub_5_line_commit_ratio',
    //   value: cs.sub_5_line_commit_ratio,
    //   interpretation: `${(cs.sub_5_line_commit_ratio * 100).toFixed(1)}% of commits are <5 lines (excl. merge/doc/bot).`,
    // });

    // evidence.push({
    //   signal: 'P25 commit size',
    //   corpus_field: 'commit_signals.p25_commit_size_lines',
    //   value: cs.p25_commit_size_lines,
    //   interpretation: `25th percentile commit size: ${cs.p25_commit_size_lines} lines.`,
    // });

    // // Hard threshold: sub_5_line_ratio > 0.30 AND p25 < 3 → SOFT flag
    // if (cs.sub_5_line_commit_ratio > 0.30 && cs.p25_commit_size_lines < 3) {
    //   flags.push({
    //     flag_id: 'COMMIT_INFLATION_SOFT',
    //     flag_type: 'SOFT',
    //     severity: 'WARNING',
    //     module_id: this.module_id,
    //     description: 'High proportion of very small commits suggests commit inflation.',
    //     evidence_paths: [
    //       'commit_signals.sub_5_line_commit_ratio',
    //       'commit_signals.p25_commit_size_lines',
    //     ],
    //     escalate_to_hiring_manager: false,
    //     clear_without_interview: true,
    //     auto_reject: false,
    //     interview_probe: "I noticed your commit history has a high proportion of very small commits — can you walk me through your typical commit workflow? Do you use interactive rebase or squash before pushing?",
    //   });

    //   console.log(
    //     `[Module:${this.module_id}] phase=flag_raised flagId=COMMIT_INFLATION_SOFT ` +
    //     `sub5=${cs.sub_5_line_commit_ratio.toFixed(3)} p25=${cs.p25_commit_size_lines}`,
    //   );
    // }

    // // Soft note: 0.15–0.30 → noted in brief, no flag
    // if (cs.sub_5_line_commit_ratio >= 0.15 && cs.sub_5_line_commit_ratio <= 0.30) {
    //   evidence.push({
    //     signal: 'Commit inflation — context note',
    //     corpus_field: 'commit_signals.sub_5_line_commit_ratio',
    //     value: cs.sub_5_line_commit_ratio,
    //     interpretation: 'Sub-5-line ratio between 0.15–0.30. Noted as context. No flag raised.',
    //   });
    // }

    return {
      module_id: this.module_id,
      primitive_id: this.primitive_id,
      confidence: flags.length > 0 ? 'low' : 'strong',
      score_label: flags.length > 0
        ? 'Commit inflation flag raised. See Section D.'
        : 'No commit inflation detected.',
      evidence,
      flags,
      interview_probe: null,
      raw_signals_used: [
        'commit_signals.sub_5_line_commit_ratio',
        'commit_signals.p25_commit_size_lines',
        'commit_signals.commit_size_histogram',
      ],
    };
  }
}