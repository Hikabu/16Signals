/**
 * P2 — SYSTEMS EVOLUTION
 * Do systems improve under this engineer's stewardship over time?
 *
 * Corpus groups: C (Commit Intelligence), E (Engineering Practices)
 * Minimum mode: Light (limited). Full confidence: Deep only.
 * Marked 'Not expected' for Intern and Junior.
 *
 * Reference: Analysys_specs_architecture.md Section 3.P2
 */

import { Injectable } from '@nestjs/common';
import { AnalysisModule, AnalysisConfig } from '../module.interface';
import { ModuleResult, Evidence } from '../module-result.types';
import { SignalCorpus, CorpusGroup } from '../../corpus/corpus.types';

@Injectable()
export class P2SystemsEvolutionModule implements AnalysisModule {
  readonly module_id = 'p2_systems_evolution';
  readonly primitive_id = 'p2';
  readonly required_corpus_groups: readonly CorpusGroup[] = ['C', 'E'];
  readonly required_collection_mode: 'light' = 'light';

  preflight(corpus: SignalCorpus): CorpusGroup[] {
    return this.required_corpus_groups.filter(
      (g) => !corpus.groups_present.includes(g),
    );
  }

  run(corpus: SignalCorpus, config: AnalysisConfig): ModuleResult {
    console.log(
      `[Module:${this.module_id}] phase=run_start username=${corpus.github_username} seniority=${config.seniority}`,
    );

    const isJunior = config.seniority === 'intern' || config.seniority === 'junior';
    const evidence: Evidence[] = [];

    // For Juniors: not expected, but still score and note
    if (isJunior) {
      evidence.push({
        signal: 'Systems evolution — Junior adjustment',
        corpus_field: 'commit_signals.total_commits_lifetime',
        value: corpus.commit_signals.total_commits_lifetime,
        interpretation: 'Systems evolution signals not expected at Junior level. Score is informational only.',
      });

      console.log(
        `[Module:${this.module_id}] phase=seniority_adjustment seniority=${config.seniority} ` +
        `action=not_expected`,
      );

      return {
        module_id: this.module_id,
        primitive_id: this.primitive_id,
        confidence: 'observability_gap',
        score_label: 'Not expected at this seniority. Systems evolution is tracked but not penalised.',
        evidence,
        flags: [],
        interview_probe: null,
        raw_signals_used: ['commit_signals.complexity_trend_by_year'],
      };
    }

    // Complexity trajectory (Light Mode: limited signal)
    // const complexityYears = Object.keys(corpus.commit_signals.complexity_trend_by_year);
    // if (complexityYears.length >= 2) {
    //   const values = complexityYears.map((y) => corpus.commit_signals.complexity_trend_by_year[y]);
    //   const isFlatOrDecreasing = values[values.length - 1] <= values[0];

      // evidence.push({
      //   signal: 'Complexity trajectory',
      //   corpus_field: 'commit_signals.complexity_trend_by_year',
      //   value: corpus.commit_signals.complexity_trend_by_year,
      //   interpretation: isFlatOrDecreasing
      //     ? `Complexity flat or decreasing over ${complexityYears.length} years. Strong signal.`
      //     : `Complexity increasing over ${complexityYears.length} years. Light Mode — limited depth.`,
      // });

    //   console.log(
    //     `[Module:${this.module_id}] phase=evidence signal="Complexity trajectory" ` +
    //     `years=${complexityYears.length} trend=${isFlatOrDecreasing ? 'stable/improving' : 'increasing'}`,
    //   );
    // } else {
    //   evidence.push({
    //     signal: 'Complexity trajectory',
    //     corpus_field: 'commit_signals.complexity_trend_by_year',
    //     value: complexityYears.length,
    //     interpretation: 'Deep Mode required for complexity trajectory analysis. Light Mode: insufficient data.',
    //   });

    //   console.log(
    //     `[Module:${this.module_id}] phase=evidence signal="Complexity trajectory" ` +
    //     `reason=deep_mode_required complexityYears=${complexityYears.length}`,
    //   );
    // }

    // Refactor commit evidence from message quality
    const refactorSignals = corpus.commit_signals.message_quality_raw.filter(
      (msg) =>
        /refactor|simplify|extract|consolidate|decompose|clean.?up/i.test(msg),
    ).length;

    evidence.push({
      signal: 'Refactor commit evidence',
      corpus_field: 'commit_signals.message_quality_raw',
      value: { refactorSignals, total: corpus.commit_signals.message_quality_raw.length },
      interpretation: refactorSignals >= 5
        ? `${refactorSignals} refactor-intent commits detected — strong evidence of code stewardship.`
        : `${refactorSignals} refactor-intent commits detected.`,
    });

    console.log(
      `[Module:${this.module_id}] phase=evidence signal="Refactor commit evidence" ` +
      `count=${refactorSignals}`,
    );

    // Long-lived code survival (Deep Mode)
    // const reposWithAuthorStats = Object.keys(corpus.commit_signals.per_repo_author_stats);
    // const longLivedRepos = reposWithAuthorStats.filter(
    //   (repo) => corpus.commit_signals.per_repo_author_stats[repo].authorship_pct >= 0.3,
    // ).length;

    // evidence.push({
    //   signal: 'Long-lived code survival',
    //   corpus_field: 'commit_signals.per_repo_author_stats',
    //   value: { totalRepos: reposWithAuthorStats.length, longLivedRepos },
    //   interpretation: reposWithAuthorStats.length > 0
    //     ? longLivedRepos >= 2
    //       ? `${longLivedRepos} repos with ≥30% authorship — strong stewardship signal.`
    //       : `${longLivedRepos} repo(s) with ≥30% authorship.`
    //     : 'Deep Mode required for authorship analysis.',
    // });

    // console.log(
    //   `[Module:${this.module_id}] phase=evidence signal="Long-lived code survival" ` +
    //   `longLivedRepos=${longLivedRepos} totalRepos=${reposWithAuthorStats.length}`,
    // );

    // Confidence determination
    const confidence = this.determineConfidence(0, refactorSignals, 0);

    console.log(
      `[Module:${this.module_id}] phase=run_complete confidence=${confidence}`,
    );

    return {
      module_id: this.module_id,
      primitive_id: this.primitive_id,
      confidence,
      score_label: this.buildScoreLabel(confidence),
      evidence,
      flags: [],
      interview_probe: confidence === 'strong' ? null : 'Can you walk me through a time you refactored a significant piece of a codebase? What drove the decision?',
      raw_signals_used: [
        'commit_signals.complexity_trend_by_year',
        'commit_signals.message_quality_raw',
        'commit_signals.per_repo_author_stats',
        'engineering_practice_signals.feature_flag_usage_detected',
      ],
    };
  }

  private determineConfidence(
    complexityYears: number,
    refactorSignals: number,
    longLivedRepos: number,
  ): ModuleResult['confidence'] {
    let score = 0;
    if (complexityYears >= 2) score++;
    if (refactorSignals >= 5) score++;
    if (longLivedRepos >= 2) score++;
    if (score >= 2) return 'moderate';
    if (score >= 1) return 'low';
    return 'observability_gap';
  }

  private buildScoreLabel(confidence: ModuleResult['confidence']): string {
    switch (confidence) {
      case 'strong': return 'Demonstrated across multiple repos — high confidence in codebase stewardship.';
      case 'moderate': return 'Evidenced in limited context — probe in interview to confirm depth.';
      case 'low': return 'One instance detected — insufficient to score. Treat as unconfirmed.';
      case 'observability_gap': return 'No public evidence — likely private or enterprise context. Do not penalise.';
      case 'insufficient_data': return 'Cannot assess from available signals.';
    }
  }
}