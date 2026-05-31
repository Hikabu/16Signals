/**
 * AG2 — FORK DUMP DETECTOR
 * Detects profiles padded with unmodified forked repos.
 *
 * Corpus groups: B (Repository Inventory)
 * Wave 1 module.
 *
 * Reference: Analysys_specs_architecture.md Section 4.AG2
 */

import { Injectable } from '@nestjs/common';
import { AnalysisModule, AnalysisConfig } from '../module.interface';
import { ModuleResult, Evidence, Flag } from '../module-result.types';
import { SignalCorpus, CorpusGroup } from '../../corpus/corpus.types';

@Injectable()
export class AG2ForkDumpModule implements AnalysisModule {
  readonly module_id = 'ag2_fork_dump';
  readonly primitive_id = null;
  readonly required_corpus_groups: readonly CorpusGroup[] = ['B'];
  readonly required_collection_mode: 'either' = 'either';

  preflight(corpus: SignalCorpus): CorpusGroup[] {
    return this.required_corpus_groups.filter((g) => !corpus.groups_present.includes(g));
  }

  run(corpus: SignalCorpus, config: AnalysisConfig): ModuleResult {
    console.log(`[Module:${this.module_id}] phase=run_start username=${corpus.github_username}`);

    const repos = corpus.repositories;
    const evidence: Evidence[] = [];
    const flags: Flag[] = [];

    const totalRepos = repos.length;
    const forks = repos.filter((r) => r.is_fork);
    const forkCount = forks.length;
    const forkRatio = totalRepos > 0 ? forkCount / totalRepos : 0;

    evidence.push({
      signal: 'Fork ratio',
      corpus_field: 'repositories[].is_fork',
      value: { totalRepos, forkCount, forkRatio },
      interpretation: `${forkCount} of ${totalRepos} repos are forks (${(forkRatio * 100).toFixed(0)}%).`,
    });

    // Light Mode: count forks with zero commit activity from candidate
    const unmodifiedForks = forks.filter((r) => r.commit_count === 0).length;
    const unmodifiedRatio = forks.length > 0 ? unmodifiedForks / forks.length : 0;

    // Omit unmodified forks from repo inventory if ratio > 0.50
    if (forkRatio > 0.50) {
      console.log(
        `[Module:${this.module_id}] phase=inventory_adjustment forkRatio=${forkRatio.toFixed(2)} ` +
        `unmodifiedForks=${unmodifiedForks} action=exclude_forks`,
      );
    }

    evidence.push({
      signal: 'Unmodified fork count',
      corpus_field: 'repositories[].commit_count',
      value: { unmodifiedForks, unmodifiedRatio },
      interpretation: unmodifiedRatio > 0.50
        ? `${unmodifiedRatio.toFixed(0)}% of forks show no candidate commits.`
        : `${unmodifiedForks} fork(s) with no candidate commits.`,
    });

    if (forkRatio > 0.70) {
      flags.push({
        flag_id: 'FORK_DUMP_SOFT',
        flag_type: 'SOFT',
        severity: 'INFO',
        module_id: this.module_id,
        description: `${forkCount} of ${totalRepos} repos are forks — ratio exceeds 70%.`,
        evidence_paths: ['repositories[].is_fork'],
        escalate_to_hiring_manager: false,
        clear_without_interview: true,
        auto_reject: false,
        interview_probe: "I see you have a large number of forked repositories — can you tell me which of these you've actively contributed to versus which you forked for reference?",
      });

      console.log(
        `[Module:${this.module_id}] phase=flag_raised flagId=FORK_DUMP_SOFT ` +
        `forkRatio=${forkRatio.toFixed(2)} threshold=0.70`,
      );
    }

    return {
      module_id: this.module_id,
      primitive_id: this.primitive_id,
      confidence: flags.length > 0 ? 'low' : 'strong',
      score_label: forkRatio > 0.50
        ? `${forkCount} of ${totalRepos} forks. Fork ratio noted.`
        : 'Normal fork-to-owned ratio.',
      evidence,
      flags,
      interview_probe: null,
      raw_signals_used: ['repositories[].is_fork', 'repositories[].commit_count'],
    };
  }
}