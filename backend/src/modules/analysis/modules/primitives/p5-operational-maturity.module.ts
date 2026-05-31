/**
 * P5 — OPERATIONAL MATURITY
 * Can this engineer handle production reality?
 *
 * Corpus groups: E (Engineering Practices), C (Commit Intelligence)
 * Deep Mode required for secret scanning and SAST.
 * Secret leak is the only automatic hard flag.
 *
 * Reference: Analysys_specs_architecture.md Section 3.P5
 */

import { Injectable } from '@nestjs/common';
import { AnalysisModule, AnalysisConfig } from '../module.interface';
import { ModuleResult, Evidence, Flag } from '../module-result.types';
import { SignalCorpus, CorpusGroup } from '../../corpus/corpus.types';

@Injectable()
export class P5OperationalMaturityModule implements AnalysisModule {
  readonly module_id = 'p5_operational_maturity';
  readonly primitive_id = 'p5';
  readonly required_corpus_groups: readonly CorpusGroup[] = ['E', 'C'];
  readonly required_collection_mode: 'light' = 'light';

  preflight(corpus: SignalCorpus): CorpusGroup[] {
    return this.required_corpus_groups.filter((g) => !corpus.groups_present.includes(g));
  }

  run(corpus: SignalCorpus, config: AnalysisConfig): ModuleResult {
    console.log(`[Module:${this.module_id}] phase=run_start username=${corpus.github_username}`);

    const ep = corpus.engineering_practice_signals;
    const evidence: Evidence[] = [];
    const flags: Flag[] = [];

    // Secret management — HARD flag if detected
    if (ep.secret_leak_detected) {
      const hardLeaks = ep.secret_leak_details.filter(
        (d) => !/test\/|fixture\/|example\/|mock\//.test(d.file_path),
      );
      if (hardLeaks.length > 0) {
        flags.push({
          flag_id: 'SECRET_LEAK_HARD',
          flag_type: 'HARD',
          severity: 'CRITICAL',
          module_id: this.module_id,
          description: `${hardLeaks.length} credential(s) detected in repository code.`,
          evidence_paths: hardLeaks.map((l) => `engineering_practice_signals.secret_leak_details[${l.file_path}]`),
          escalate_to_hiring_manager: true,
          clear_without_interview: false,
          auto_reject: false,
          interview_probe: `I noticed a credential was committed to your repository. Can you walk me through what happened and how you handled the remediation?`,
        });
        console.log(`[Module:${this.module_id}] phase=flag_raised flagId=SECRET_LEAK_HARD count=${hardLeaks.length}`);
      }
    }

    evidence.push({
      signal: 'Secret management',
      corpus_field: 'engineering_practice_signals.secret_leak_detected',
      value: { detected: ep.secret_leak_detected, detailCount: ep.secret_leak_details.length },
      interpretation: ep.secret_leak_detected ? 'Credentials detected — requires interview clarification.' : 'No credentials detected.',
    });

    // Observability tooling
    evidence.push({
      signal: 'Observability tooling',
      corpus_field: 'engineering_practice_signals.observability_markers_present',
      value: ep.observability_markers_present,
      interpretation: ep.observability_markers_present.length >= 2
        ? `${ep.observability_markers_present.length} observability markers.`
        : 'Limited observability markers.',
    });

    // IaC presence
    evidence.push({
      signal: 'IaC presence',
      corpus_field: 'engineering_practice_signals.repos_with_iac',
      value: ep.repos_with_iac,
      interpretation: ep.repos_with_iac >= 2
        ? `${ep.repos_with_iac} repos with IaC (Terraform/Pulumi/CDK).`
        : `${ep.repos_with_iac} repos with IaC.`,
    });

    console.log(`[Module:${this.module_id}] phase=evidence observability=${ep.observability_markers_present.length} iac=${ep.repos_with_iac}`);

    const confidence = flags.length > 0 ? 'low' : this.determineConfidence(ep);

    return {
      module_id: this.module_id,
      primitive_id: this.primitive_id,
      confidence,
      score_label: this.buildScoreLabel(confidence, flags.length),
      evidence,
      flags,
      interview_probe: flags.length > 0 ? null : 'How do you handle production incidents and observability in your current role?',
      raw_signals_used: [
        'engineering_practice_signals.secret_leak_detected',
        'engineering_practice_signals.secret_leak_details',
        'engineering_practice_signals.observability_markers_present',
        'engineering_practice_signals.repos_with_iac',
        'engineering_practice_signals.feature_flag_usage_detected',
        'engineering_practice_signals.sast_finding_density',
        'engineering_practice_signals.avg_dependabot_resolution_days',
      ],
    };
  }

  private determineConfidence(ep: SignalCorpus['engineering_practice_signals']): ModuleResult['confidence'] {
    let score = 0;
    if (ep.repos_with_docker > 0) score++;
    if (ep.repos_with_ci_config > 0) score++;
    if (ep.observability_markers_present.length >= 2) score++;
    if (ep.repos_with_iac >= 2) score++;
    if (score >= 3) return 'strong';
    if (score >= 2) return 'moderate';
    if (score >= 1) return 'low';
    return 'observability_gap';
  }

  private buildScoreLabel(confidence: ModuleResult['confidence'], flagCount: number): string {
    if (flagCount > 0) return 'Secret leak detected — score capped at LOW. Interview required.';
    switch (confidence) {
      case 'strong': return 'Strong operational maturity signals across multiple dimensions.';
      case 'moderate': return 'Moderate operational maturity signals — probe in interview.';
      case 'low': return 'Limited operational maturity signals.';
      case 'observability_gap': return 'No public operational signals — likely enterprise context.';
      case 'insufficient_data': return 'Cannot assess from available signals.';
    }
  }
}