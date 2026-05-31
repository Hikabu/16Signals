/**
 * P3 — COLLABORATION LEVERAGE
 * Does this engineer amplify the people around them?
 *
 * Corpus groups: D (Collaboration & Review)
 * Minimum mode: Light.
 * CRITICAL: When absent or thin (< 5 PRs reviewed), it carries ZERO negative
 * weight for enterprise, security, or embedded engineers.
 *
 * Reference: Analysys_specs_architecture.md Section 3.P3
 */

import { Injectable } from '@nestjs/common';
import { AnalysisModule, AnalysisConfig } from '../module.interface';
import { ModuleResult, Evidence } from '../module-result.types';
import { SignalCorpus, CorpusGroup } from '../../corpus/corpus.types';

@Injectable()
export class P3CollaborationLeverageModule implements AnalysisModule {
  readonly module_id = 'p3_collaboration_leverage';
  readonly primitive_id = 'p3';
  readonly required_corpus_groups: readonly CorpusGroup[] = ['D'];
  readonly required_collection_mode: 'either' = 'either';

  preflight(corpus: SignalCorpus): CorpusGroup[] {
    return this.required_corpus_groups.filter(
      (g) => !corpus.groups_present.includes(g),
    );
  }

  run(corpus: SignalCorpus, config: AnalysisConfig): ModuleResult {
    console.log(
      `[Module:${this.module_id}] phase=run_start username=${corpus.github_username}`,
    );

    const cd = corpus.collaboration_signals;
    const evidence: Evidence[] = [];

    // CRITICAL: If pr_reviewer_count < 5, output observability_gap, not low
    if (cd.pr_reviewer_count < 5) {
      evidence.push({
        signal: 'Review activity threshold',
        corpus_field: 'collaboration_signals.pr_reviewer_count',
        value: cd.pr_reviewer_count,
        interpretation: 'Fewer than 5 PRs reviewed. Likely private/enterprise context. No negative weight applied.',
      });

      console.log(
        `[Module:${this.module_id}] phase=signal_threshold signal=review_activity ` +
        `count=${cd.pr_reviewer_count} threshold=5 result=observability_gap`,
      );

      return {
        module_id: this.module_id,
        primitive_id: this.primitive_id,
        confidence: 'observability_gap',
        score_label: 'No public evidence — likely private or enterprise context. Do not penalise.',
        evidence,
        flags: [],
        interview_probe: "Can you describe how code review works in your current team? How do you approach reviewing others' code?",
        raw_signals_used: ['collaboration_signals.pr_reviewer_count'],
      };
    }

    // Substantive review rate
    evidence.push({
      signal: 'Substantive review rate',
      corpus_field: 'collaboration_signals.substantive_review_ratio',
      value: cd.substantive_review_ratio,
      interpretation: cd.substantive_review_ratio >= 0.4
        ? `${(cd.substantive_review_ratio * 100).toFixed(0)}% substantive reviews — strong engagement.`
        : `${(cd.substantive_review_ratio * 100).toFixed(0)}% substantive reviews.`,
    });

    console.log(
      `[Module:${this.module_id}] phase=evidence signal="Substantive review rate" ` +
      `ratio=${cd.substantive_review_ratio.toFixed(3)}`,
    );

    // PR author/reviewer ratio
    const ratioMet = cd.pr_reviewer_count >= cd.pr_author_count * 0.5;
    evidence.push({
      signal: 'PR author/reviewer ratio',
      corpus_field: 'collaboration_signals.pr_reviewer_count',
      value: { authorCount: cd.pr_author_count, reviewerCount: cd.pr_reviewer_count },
      interpretation: ratioMet
        ? 'Balanced author/reviewer ratio — reciprocates reviews.'
        : 'Authors more PRs than reviews. May indicate solo contribution context.',
    });

    // Self-merge rate
    const selfMergeAcceptable = cd.self_merge_rate < (config.seniority === 'senior' || config.seniority === 'staff' ? 0.1 : 0.2);
    evidence.push({
      signal: 'Self-merge rate',
      corpus_field: 'collaboration_signals.self_merge_rate',
      value: cd.self_merge_rate,
      interpretation: selfMergeAcceptable
        ? `Self-merge rate ${(cd.self_merge_rate * 100).toFixed(0)}% — within acceptable range.`
        : `Self-merge rate ${(cd.self_merge_rate * 100).toFixed(0)}% — elevated for this seniority.`,
    });

    console.log(
      `[Module:${this.module_id}] phase=evidence signal="Self-merge rate" ` +
      `rate=${cd.self_merge_rate.toFixed(3)} acceptable=${selfMergeAcceptable}`,
    );

    // PR description quality
    evidence.push({
      signal: 'PR description quality',
      corpus_field: 'collaboration_signals.avg_pr_description_length_words',
      value: { avgWords: cd.avg_pr_description_length_words, depthScore: cd.review_comment_depth_scores },
      interpretation: cd.avg_pr_description_length_words >= 80
        ? `Average PR description ${cd.avg_pr_description_length_words.toFixed(0)} words — thorough context provided.`
        : `Average PR description ${cd.avg_pr_description_length_words.toFixed(0)} words.`,
    });

    // Cross-repo engagement
    evidence.push({
      signal: 'Cross-repo engagement',
      corpus_field: 'collaboration_signals.cross_repo_comment_count',
      value: cd.cross_repo_comment_count,
      interpretation: cd.cross_repo_comment_count >= 10
        ? `${cd.cross_repo_comment_count} cross-repo comments — engages beyond own repos.`
        : `${cd.cross_repo_comment_count} cross-repo comments.`,
    });

    const confidence = this.determineConfidence(cd);

    console.log(
      `[Module:${this.module_id}] phase=run_complete confidence=${confidence} ` +
      `prReviewerCount=${cd.pr_reviewer_count}`,
    );

    return {
      module_id: this.module_id,
      primitive_id: this.primitive_id,
      confidence,
      score_label: this.buildScoreLabel(confidence),
      evidence,
      flags: [],
      interview_probe: confidence === 'strong' ? null : 'Can you walk me through a recent code review where you caught something important?',
      raw_signals_used: [
        'collaboration_signals.pr_reviewer_count',
        'collaboration_signals.substantive_review_ratio',
        'collaboration_signals.self_merge_rate',
        'collaboration_signals.avg_pr_description_length_words',
        'collaboration_signals.cross_repo_comment_count',
      ],
    };
  }

  private determineConfidence(cd: SignalCorpus['collaboration_signals']): ModuleResult['confidence'] {
    let score = 0;
    if (cd.substantive_review_ratio >= 0.4) score++;
    if (cd.pr_reviewer_count >= cd.pr_author_count * 0.5) score++;
    if (cd.self_merge_rate < 0.2) score++;
    if (cd.cross_repo_comment_count >= 10) score++;
    if (score >= 3) return 'strong';
    if (score >= 2) return 'moderate';
    return 'low';
  }

  private buildScoreLabel(confidence: ModuleResult['confidence']): string {
    switch (confidence) {
      case 'strong': return 'Demonstrated across multiple reviews — high confidence in collaborative practices.';
      case 'moderate': return 'Evidenced in limited context — probe in interview to confirm depth.';
      case 'low': return 'Limited collaboration signals — insufficient to score.';
      case 'observability_gap': return 'No public evidence — likely private or enterprise context. Do not penalise.';
      case 'insufficient_data': return 'Cannot assess from available signals.';
    }
  }
}