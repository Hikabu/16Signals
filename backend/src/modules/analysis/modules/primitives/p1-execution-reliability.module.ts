/**
 * P1 — EXECUTION RELIABILITY
 * Can this engineer ship safely and consistently?
 *
 * Corpus groups: C (Commit Intelligence), E (Engineering Practices)
 * Minimum mode: Light. Full confidence: Deep only.
 *
 * Signals: commit cadence consistency, commit size discipline,
 * CI pass rate trajectory, test-to-code ratio (Deep), semantic versioning,
 * dependabot response time.
 *
 * Reference: Analysys_specs_architecture.md Section 3.P1
 */

import { Injectable } from '@nestjs/common';
import { AnalysisModule, AnalysisConfig } from '../module.interface';
import { ModuleResult, Evidence, Flag } from '../module-result.types';
import { SignalCorpus, CommitSignals, EngineeringPracticeSignals } from '../../corpus/corpus.types';
import { TraceContext } from '../../trace/trace-context-holder';

@Injectable()
export class P1ExecutionReliabilityModule implements AnalysisModule {
  readonly module_id = 'p1_execution_reliability';
  readonly primitive_id = 'p1';
  readonly required_corpus_groups = ['C', 'E'] as const;
  readonly required_collection_mode: 'either' = 'either';

  preflight(corpus: SignalCorpus): any[] {
    return this.required_corpus_groups.filter(
      (g) => !corpus.groups_present.includes(g),
    );
  }

  run(corpus: SignalCorpus, config: AnalysisConfig): ModuleResult {
    console.log(
      `[Module:${this.module_id}] phase=run_start ` +
      `username=${corpus.github_username} seniority=${config.seniority}`,
    );

    const cs = corpus.commit_signals;
    const ep = corpus.engineering_practice_signals;
    const evidence: Evidence[] = [];
    const flags: Flag[] = [];
    let primarySignalsMet = 0;

    // ── 1. Commit cadence consistency ──
    const activeMonths = Object.keys(cs.commit_frequency_by_month).length;
    const hasGaps = this.detectCadenceGaps(cs.commit_frequency_by_month);
    const cadenceMet = activeMonths >= 9 && !hasGaps;
    if (cadenceMet) primarySignalsMet++;

    TraceContext.captureThreshold(
      'cadenceMet', activeMonths, 9, '>=', cadenceMet,
      [['commit_signals.commit_frequency_by_month', cs.commit_frequency_by_month]],
    );

    evidence.push({
      signal: 'Commit cadence consistency',
      corpus_field: 'commit_signals.commit_frequency_by_month',
      value: { activeMonths, hasGaps },
      interpretation: cadenceMet
        ? `Active in ${activeMonths} of trailing 12 months. No gap > 8 consecutive weeks.`
        : `Active in ${activeMonths} of trailing months. ${
            hasGaps ? 'Has gaps > 8 weeks.' : ''
          }`,
    });

    console.log(
      `[Module:${this.module_id}] phase=evidence signal="Commit cadence consistency" ` +
      `activeMonths=${activeMonths} met=${cadenceMet}`,
    );

    // ── 2. Commit size discipline ──
    // const sizeMet =
    //   cs.median_commit_size_lines >= 20 &&
    //   cs.median_commit_size_lines <= 400 &&
    //   cs.sub_5_line_commit_ratio < 0.30;
    // if (sizeMet) primarySignalsMet++;

    // TraceContext.captureThreshold(
    //   'sizeDiscipline', cs.median_commit_size_lines, [20, 400], 'between', sizeMet,
    //   [['commit_signals.median_commit_size_lines', cs.median_commit_size_lines]],
    // );

    // evidence.push({
    //   signal: 'Commit size discipline',
    //   corpus_field: 'commit_signals.median_commit_size_lines',
    //   value: {
    //     median: cs.median_commit_size_lines,
    //     p25: cs.p25_commit_size_lines,
    //     sub5Ratio: cs.sub_5_line_commit_ratio,
    //   },
    //   interpretation: sizeMet
    //     ? `Median commit size ${cs.median_commit_size_lines} lines (target 20–400). ` +
    //       `Sub-5-line ratio ${(cs.sub_5_line_commit_ratio * 100).toFixed(1)}% (target < 30%).`
    //     : `Median commit size ${cs.median_commit_size_lines} lines outside target range 20–400.`,
    // });

    // console.log(
    //   `[Module:${this.module_id}] phase=evidence signal="Commit size discipline" ` +
    //   `median=${cs.median_commit_size_lines} sub5=${cs.sub_5_line_commit_ratio.toFixed(3)} met=${sizeMet}`,
    // );

    // ── 3. CI pass rate trajectory ──
    const quarters = Object.entries(ep.ci_pass_rate_trajectory);
    const quartersCount = quarters.length;
    const allAbove80 = quarters.every(([, rate]) => rate >= 0.8);
    const ciMet = quartersCount >= 2 && allAbove80;
    if (ciMet) primarySignalsMet++;

    TraceContext.captureThreshold(
      'ciPassRate', quartersCount, 2, '>=', ciMet,
      [['engineering_practice_signals.ci_pass_rate_trajectory', ep.ci_pass_rate_trajectory]],
    );

    evidence.push({
      signal: 'CI pass rate trajectory',
      corpus_field: 'engineering_practice_signals.ci_pass_rate_trajectory',
      value: { quarters: ep.ci_pass_rate_trajectory },
      interpretation: ciMet
        ? `CI pass rate ≥80% across ${quartersCount} quarters.`
        : quartersCount === 0
          ? 'No CI config detected — likely private or enterprise context.'
          : `CI present but ${allAbove80 ? '' : 'not all quarters ≥80%'}.`,
    });

    console.log(
      `[Module:${this.module_id}] phase=evidence signal="CI pass rate trajectory" ` +
      `quarters=${quartersCount} allAbove80=${allAbove80} met=${ciMet}`,
    );

    // ── 4. Test-to-code ratio (signal only, not primary) ──
    // evidence.push({
    //   signal: 'Test-to-code ratio',
    //   corpus_field: 'commit_signals.test_to_code_ratio_by_repo',
    //   value: { repos: cs.test_to_code_ratio_by_repo },
    //   interpretation:
    //     ep.repos_with_test_dir > 0
    //       ? `${ep.repos_with_test_dir} repos with test directories.`
    //       : 'No test directories detected.',
    // });

    // ── 5. Semantic versioning ──
    evidence.push({
      signal: 'Semantic versioning discipline',
      corpus_field: 'engineering_practice_signals.semantic_versioning_discipline',
      value: ep.semantic_versioning_discipline,
      interpretation: ep.semantic_versioning_discipline
        ? 'Semantic versioning detected (vMAJOR.MINOR.PATCH).'
        : 'No semantic versioning pattern detected.',
    });

    // ── Seniority adjustments ──
    const isJunior = config.seniority === 'intern' || config.seniority === 'junior';
    const adjustedPrimaryMet = isJunior
      ? // For Juniors: CI pass rate and test ratio not expected
        Math.min(primarySignalsMet, 2)
      : primarySignalsMet;

    // ── Confidence determination ──
    const confidence = this.determineConfidence(adjustedPrimaryMet, cs, config);

    // Trace the confidence branch decision
    const traceBlocked: Array<{ branch: string; blockedBy: string }> = [];
    if (confidence === 'moderate' || confidence === 'low') {
      traceBlocked.push({ branch: 'strong', blockedBy: `primarySignalsMet=${adjustedPrimaryMet} < 3` });
    }
    if (confidence === 'low') {
      traceBlocked.push({ branch: 'moderate', blockedBy: `primarySignalsMet=${adjustedPrimaryMet} < 2` });
    }
    TraceContext.captureBranch('confidence_determination', confidence,
      { primarySignalsMet: adjustedPrimaryMet, activeMonths, isJunior, totalCommits: cs.total_commits_lifetime },
      traceBlocked,
    );

    // ── Interview probe ──
    const interviewProbe =
      confidence !== 'strong'
        ? this.generateInterviewProbe(primarySignalsMet, config)
        : null;

    if (interviewProbe) {
      console.log(
        `[Module:${this.module_id}] phase=probe_generated confidence=${confidence} ` +
        `probe="${interviewProbe.slice(0, 80)}..."`,
      );
    }

    const result: ModuleResult = {
      module_id: this.module_id,
      primitive_id: this.primitive_id,
      confidence,
      score_label: this.buildScoreLabel(confidence, config.seniority),
      evidence,
      flags,
      interview_probe: interviewProbe,
      raw_signals_used: [
        'commit_signals.commit_frequency_by_month',
        'commit_signals.median_commit_size_lines',
        'commit_signals.p25_commit_size_lines',
        'commit_signals.sub_5_line_commit_ratio',
        'engineering_practice_signals.ci_pass_rate_trajectory',
        'engineering_practice_signals.repos_with_test_dir',
        'engineering_practice_signals.semantic_versioning_discipline',
        'engineering_practice_signals.avg_dependabot_resolution_days',
      ],
    };

    console.log(
      `[Module:${this.module_id}] phase=run_complete confidence=${result.confidence} ` +
      `primarySignalsMet=${primarySignalsMet}/${3} adjusted=${adjustedPrimaryMet}`,
    );

    return result;
  }

  private detectCadenceGaps(
    freqByMonth: Record<string, number>,
  ): boolean {
    const months = Object.keys(freqByMonth).sort();
    if (months.length === 0) return true;
    const last = new Date(months[months.length - 1] + '-01');
    const first = new Date(months[0] + '-01');
    const totalMonths =
      (last.getFullYear() - first.getFullYear()) * 12 +
      last.getMonth() -
      first.getMonth() +
      1;
    // Gap exists if we have months with zero activity > 2 consecutive
    return totalMonths - months.length > 2;
  }

  private determineConfidence(
    primaryMet: number,
    cs: CommitSignals,
    config: AnalysisConfig,
  ): ModuleResult['confidence'] {
    const isJunior =
      config.seniority === 'intern' || config.seniority === 'junior';
    const activeMonths = Object.keys(cs.commit_frequency_by_month).length;

    if (primaryMet >= 3) return activeMonths >= 12 ? 'strong' : 'moderate';
    if (primaryMet >= 2) return activeMonths >= 6 ? 'moderate' : 'low';
    if (primaryMet >= 1) return 'low';

    // No primary signals met
    if (isJunior && cs.total_commits_lifetime > 0) return 'low';
    return 'observability_gap';
  }

  private buildScoreLabel(
    confidence: ModuleResult['confidence'],
    seniority: string,
  ): string {
    switch (confidence) {
      case 'strong':
        return 'Demonstrated across multiple repositories — high confidence in shipping reliability.';
      case 'moderate':
        return 'Evidenced in limited context — probe in interview to confirm depth.';
      case 'low':
        return 'One instance detected — insufficient to score. Treat as unconfirmed in hiring decision.';
      case 'observability_gap':
        return 'No public evidence of commit discipline — likely private or enterprise context. Do not penalise.';
      case 'insufficient_data':
        return 'This profile cannot be assessed from available public signals.';
    }
  }

  private generateInterviewProbe(
    primaryMet: number,
    config: AnalysisConfig,
  ): string {
    if (primaryMet === 0) {
      return 'I noticed limited public commit activity — can you walk me through your typical development workflow and how you manage version control in your current role?';
    }
    if (primaryMet < 2) {
      return 'Can you describe your approach to keeping commits well-sized and maintaining a consistent shipping cadence?';
    }
    return 'I want to better understand your CI/CD workflow — how do you balance shipping velocity with quality assurance?';
  }
}