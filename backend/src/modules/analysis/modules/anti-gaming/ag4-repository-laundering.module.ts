/**
 * AG4 — REPOSITORY LAUNDERING DETECTOR
 * Detects repos that may be copied from other developers and presented as original work.
 * Conditional: runs only if AG1, AG3 fire, or repo shows laundering characteristics.
 *
 * Corpus groups: B (Repository Inventory), G (Anti-Gaming Inputs)
 * Wave 2a module. Conditional.
 *
 * Reference: Analysys_specs_architecture.md Section 4.AG4
 */

import { Injectable } from '@nestjs/common';
import { AnalysisModule, AnalysisConfig } from '../module.interface';
import { ModuleResult, Evidence, Flag } from '../module-result.types';
import { SignalCorpus, CorpusGroup } from '../../corpus/corpus.types';

@Injectable()
export class AG4RepositoryLaunderingModule implements AnalysisModule {
  readonly module_id = 'ag4_repository_laundering';
  readonly primitive_id = null;
  readonly required_corpus_groups: readonly CorpusGroup[] = ['B', 'G'];
  readonly required_collection_mode: 'either' = 'either';

  preflight(corpus: SignalCorpus): CorpusGroup[] {
    return this.required_corpus_groups.filter((g) => !corpus.groups_present.includes(g));
  }

  run(corpus: SignalCorpus, config: AnalysisConfig): ModuleResult {
    console.log(`[Module:${this.module_id}] phase=run_start username=${corpus.github_username}`);

    const ag = corpus.anti_gaming_inputs;
    const evidence: Evidence[] = [];
    const flags: Flag[] = [];

    // Code search flags from corpus G
    if (ag.code_search_flags.length > 0) {
      for (const flag of ag.code_search_flags) {
        evidence.push({
          signal: 'Code search similarity',
          corpus_field: 'anti_gaming_inputs.code_search_flags',
          value: { repo: flag.repo, similarity: flag.similarity_ratio, matchedRepos: flag.matched_repos },
          interpretation: `Repo ${flag.repo}: ${(flag.similarity_ratio * 100).toFixed(0)}% similarity with ${flag.matched_repos.length} other repos.`,
        });
      }

      // Light Mode: SOFT flag only (Copyleaks not called)
      flags.push({
        flag_id: 'REPO_LAUNDERING_LIGHT',
        flag_type: 'SOFT',
        severity: 'WARNING',
        module_id: this.module_id,
        description: `Code similarity detected in ${ag.code_search_flags.length} repo(s). Deep Mode recommended for confirmation.`,
        evidence_paths: ag.code_search_flags.map((f) => `anti_gaming_inputs.code_search_flags[${f.repo}]`),
        escalate_to_hiring_manager: false,
        clear_without_interview: true,
        auto_reject: false,
        interview_probe: `I'd like to discuss some of your repositories — can you walk me through the origin of [repo] and what your specific contributions were?`,
      });

      console.log(
        `[Module:${this.module_id}] phase=flag_raised flagId=REPO_LAUNDERING_LIGHT ` +
        `codeSearchFlags=${ag.code_search_flags.length} note=Light_Mode_no_Copyleaks`,
      );
    } else {
      evidence.push({
        signal: 'Code search similarity',
        corpus_field: 'anti_gaming_inputs.code_search_flags',
        value: [],
        interpretation: 'No code similarity flags detected.',
      });
    }

    // Copyleaks results (Deep Mode only)
    if (ag.copyleaks_results.length > 0) {
      const confirmed = ag.copyleaks_results.filter((r) => r.confirmed);
      if (confirmed.length > 0) {
        flags.push({
          flag_id: 'REPO_LAUNDERING_CONFIRMED',
          flag_type: 'HARD',
          severity: 'CRITICAL',
          module_id: this.module_id,
          description: `${confirmed.length} repo(s) confirmed as copied by Copyleaks.`,
          evidence_paths: confirmed.map((r) => `anti_gaming_inputs.copyleaks_results[${r.repo}]`),
          escalate_to_hiring_manager: true,
          clear_without_interview: false,
          auto_reject: false,
          interview_probe: `I'd like to discuss [repo] — can you walk me through the origin of this code and what your specific contributions were?`,
        });

        console.log(
          `[Module:${this.module_id}] phase=flag_raised flagId=REPO_LAUNDERING_CONFIRMED ` +
          `confirmedRepos=${confirmed.length}`,
        );
      }
    }

    return {
      module_id: this.module_id,
      primitive_id: this.primitive_id,
      confidence: flags.length > 0 ? 'low' : 'strong',
      score_label: flags.length > 0
        ? 'Repository laundering flag raised. See Section D.'
        : 'No repository laundering detected.',
      evidence,
      flags,
      interview_probe: null,
      raw_signals_used: [
        'anti_gaming_inputs.code_search_flags',
        'anti_gaming_inputs.copyleaks_results',
      ],
    };
  }
}