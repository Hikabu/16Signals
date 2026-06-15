/**
 * P7 — AUTHENTICITY CONFIDENCE
 * Is the evidence trustworthy and the identity coherent?
 *
 * P7 is an aggregator — it does not score independently.
 * It aggregates results from AG1–AG6 and EV modules.
 * Its confidence level reflects overall corpus trustworthiness.
 *
 * Reference: Analysys_specs_architecture.md Section 3.P7
 */

import { Injectable } from '@nestjs/common';
import { AnalysisModule, AnalysisConfig } from '../module.interface';
import { ModuleResult, Evidence, Flag } from '../module-result.types';
import { SignalCorpus, CorpusGroup } from '../../corpus/corpus.types';

@Injectable()
export class P7AuthenticityConfidenceModule implements AnalysisModule {
  readonly module_id = 'p7_authenticity_confidence';
  readonly primitive_id = 'p7';
  readonly required_corpus_groups: readonly CorpusGroup[] = ['G', 'A'];
  readonly required_collection_mode: 'either' = 'either';

  preflight(corpus: SignalCorpus): CorpusGroup[] {
    return this.required_corpus_groups.filter((g) => !corpus.groups_present.includes(g));
  }

  /**
   * P7 accepts external module results from AG1-AG6 and EV.
   * When run standalone (no prior wave results), it scores from corpus G only.
   */
  run(corpus: SignalCorpus, config: AnalysisConfig): ModuleResult {
    console.log(`[Module:${this.module_id}] phase=run_start username=${corpus.github_username}`);

    const ag = corpus.anti_gaming_inputs;
    const evidence: Evidence[] = [];

    // Profile-level gate: check if 4+ primitives would return observability_gap
    const observabilityCount = this.countObservabilityGaps(corpus);

    if (observabilityCount >= 4) {
      console.log(
        `[Module:${this.module_id}] phase=profile_gate_fired observabilityCount=${observabilityCount} ` +
        `threshold=4`,
      );

      return {
        module_id: this.module_id,
        primitive_id: this.primitive_id,
        confidence: 'insufficient_data',
        score_label: 'This profile pattern is consistent with enterprise or regulated-industry contexts where public evidence is structurally absent. Proceed directly to technical interview.',
        evidence: [{
          signal: 'Profile-level gate triggered',
          corpus_field: 'groups_present',
          value: { groupsPresent: corpus.groups_present, observabilityCount },
          interpretation: '4+ primitives return observability_gap. Typical for enterprise engineers.',
        }],
        flags: [],
        interview_probe: null,
        raw_signals_used: ['groups_present'],
      };
    }

    // Burst/dormancy assessment
    const burstFlag = ag.burst_dormancy_ratio > 5.0;
    evidence.push({
      signal: 'Burst/dormancy ratio',
      corpus_field: 'anti_gaming_inputs.burst_dormancy_ratio',
      value: ag.burst_dormancy_ratio,
      interpretation: burstFlag
        ? `Burst/dormancy ratio ${ag.burst_dormancy_ratio.toFixed(1)}x — elevated.`
        : `Burst/dormancy ratio ${ag.burst_dormancy_ratio.toFixed(1)}x — normal.`,
    });

    // Fork dump assessment
    evidence.push({
      signal: 'Fork dump ratio',
      corpus_field: 'anti_gaming_inputs.fork_dump_ratio',
      value: ag.fork_dump_ratio,
      interpretation: ag.fork_dump_ratio > 0.5
        ? `${(ag.fork_dump_ratio * 100).toFixed(0)}% forks unmodified.`
        : `${(ag.fork_dump_ratio * 100).toFixed(0)}% forks — reasonable.`,
    });

    // Commit inflation
    evidence.push({
      signal: 'Commit inflation ratio',
      corpus_field: 'anti_gaming_inputs.commit_inflation_ratio',
      value: ag.commit_inflation_ratio,
      interpretation: ag.commit_inflation_ratio > 0.3
        ? 'Elevated proportion of very small commits.'
        : 'Normal commit size distribution.',
    });

    // Code search flags
    if (ag.code_search_flags.length > 0) {
      evidence.push({
        signal: 'Code search similarity flags',
        corpus_field: 'anti_gaming_inputs.code_search_flags',
        value: ag.code_search_flags.length,
        interpretation: `${ag.code_search_flags.length} repo(s) with code similarity flags.`,
      });
    }

    console.log(
      `[Module:${this.module_id}] phase=evidence burst=${burstFlag} fork=${ag.fork_dump_ratio.toFixed(2)} ` +
      `inflation=${ag.commit_inflation_ratio.toFixed(2)} codeSearch=${ag.code_search_flags.length}`,
    );

    const confidence = this.determineConfidence(ag, burstFlag);

    return {
      module_id: this.module_id,
      primitive_id: this.primitive_id,
      confidence,
      score_label: this.buildScoreLabel(confidence),
      evidence,
      flags: [],
      interview_probe: confidence === 'strong' ? null : 'I noticed some patterns in your commit history I wanted to clarify — can you walk me through your typical workflow?',
      raw_signals_used: [
        'anti_gaming_inputs.burst_dormancy_ratio',
        'anti_gaming_inputs.fork_dump_ratio',
        'anti_gaming_inputs.commit_inflation_ratio',
        'anti_gaming_inputs.code_search_flags',
        'anti_gaming_inputs.style_discontinuity_events',
      ],
    };
  }

  private countObservabilityGaps(corpus: SignalCorpus): number {
    let count = 0;
    if (!corpus.groups_present.includes('C') || corpus.commit_signals.sampled_commit_count < 5) count++;
    // if (!corpus.groups_present.includes('D') || corpus.collaboration_signals.pr_reviewer_count < 2) count++;
    if (!corpus.groups_present.includes('E') || corpus.engineering_practice_signals.repos_with_ci_config === 0) count++;
    // if (!corpus.groups_present.includes('F') || corpus.impact_signals.external_oss_contribution_count === 0) count++;
    return count;
  }

  private determineConfidence(ag: SignalCorpus['anti_gaming_inputs'], burstFlag: boolean): ModuleResult['confidence'] {
    let softFlags = 0;
    if (burstFlag) softFlags++;
    if (ag.fork_dump_ratio > 0.7) softFlags++;
    if (ag.commit_inflation_ratio > 0.3) softFlags++;
    if (ag.code_search_flags.length > 0) softFlags++;

    if (softFlags === 0) return 'strong';
    if (softFlags <= 1) return 'moderate';
    if (softFlags >= 2) return 'low';
    return 'moderate';
  }

  private buildScoreLabel(confidence: ModuleResult['confidence']): string {
    switch (confidence) {
      case 'strong': return 'No authenticity flags detected. High confidence in profile authenticity.';
      case 'moderate': return '0–1 soft flags detected. Moderate confidence.';
      case 'low': return '2+ soft flags detected. Review flags in Section D.';
      case 'observability_gap': return 'Limited data for authenticity assessment.';
      case 'insufficient_data': return 'This profile pattern is consistent with enterprise or regulated-industry contexts. Proceed directly to technical interview.';
    }
  }
}