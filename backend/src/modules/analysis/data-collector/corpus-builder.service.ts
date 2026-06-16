/**
 * CorpusBuilderService — Assembles a complete SignalCorpus from raw collector outputs.
 *
 * Acts as the bridge between the DataCollector layer (7 group collectors)
 * and the Signal Corpus cache. The builders map each group collector's output
 * into the SignalCorpus structure.
 *
 * Architecture: Stateless builder. Each group's data is independently assigned.
 * Missing groups are tracked via groups_present and collection_errors.
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 1
 */

import { Injectable } from '@nestjs/common';
import { SignalCorpus, CorpusGroup, CollectionMode } from '../corpus/corpus.types';
import {
  IdentitySignals,
  RepositorySignal,
  CommitSignals,
  CollaborationSignals,
  EngineeringPracticeSignals,
  AntiGamingInputs,
} from '../corpus/corpus.types';
import { exit } from 'process';

export interface GroupCollectionResult {
  group: CorpusGroup;
  data: any;
  error: string | null;
}

@Injectable()
export class CorpusBuilderService {
  /**
   * Build a complete SignalCorpus from the results of all 7 group collectors.
   *
   * @param username - GitHub username
   * @param collectionMode - Light or Deep
   * @param results - Array of GroupCollectionResult (one per group)
   * @returns Fully assembled SignalCorpus
   */
  build(
    username: string,
    collectionMode: CollectionMode,
    results: GroupCollectionResult[],
  ): SignalCorpus {
    if (results.length > 0)
     exit(0);
    console.log(
      `[CorpusBuilder] phase=build_start username=${username} mode=${collectionMode}`,
    );

    const groupsPresent: CorpusGroup[] = [];
    const errors: string[] = [];

    for (const result of results) {
      if (result.error) {
        errors.push(`Group ${result.group}: ${result.error}`);
        console.log(
          `[CorpusBuilder] phase=group_error group=${result.group} error=${result.error}`,
        );
      } else {
        groupsPresent.push(result.group);
      }
    }

    const corpus: SignalCorpus = {
      corpus_id: this.generateCorpusId(),
      github_username: username,
      collected_at: new Date().toISOString(),
      collection_mode: collectionMode,
      groups_present: groupsPresent,
      collection_errors: errors,

      identity: this.safeGet<IdentitySignals>(results, 'A', {
        account_age_days: 0,
        bio: null,
        company_claim: null,
        linked_urls: [],
        commit_email_domains: [],
        github_org_memberships: [],
        hireable_flag: null,
      }),
      repositories: this.safeGet<RepositorySignal[]>(results, 'B', []),
      commit_signals: this.safeGet<CommitSignals>(results, 'C', {
        sampled_commit_count: 0,
        commit_frequency_by_month: {},
        // commit_size_histogram: [],
        // p25_commit_size_lines: 0,
        // median_commit_size_lines: 0,
        // sub_5_line_commit_ratio: 0,
        merge_commit_ratio: 0,
        message_quality_raw: [],
        message_quality_scores: [],
        // per_repo_author_stats: {},
        // complexity_trend_by_year: {},
        // test_to_code_ratio_by_repo: {},
      }),
      collaboration_signals: this.safeGet<CollaborationSignals>(results, 'D', {
        contribution: {
          pr_count: 0,
          merged_pr_count: 0,
          unique_repo_count: 0,
          external_repo_count: 0,
          avg_pr_description_length_words: 0,
          pr_description_raw: [],
        },
        review: {
          authored_review_count: 0,
          // substantive_authored_review_ratio: 0,
          authored_review_raw: [],

          // Received reviews (IMPORTANT)
          reviews_received_count: 0,
          review_state_distribution: {
            approved: 0,
            changes_requested: 0,
            commented: 0,
          },
          unique_reviewers_count: 0,
          avg_reviews_per_pr: 0,
          received_review_raw: [],
        },
        maintenance: {
          issueParticipationCount: 0,
          issueParticipationRaw: [],
        }
        
      }),
      engineering_practice_signals: this.safeGet<EngineeringPracticeSignals>(
        results,
        'E',
        {
          repos_with_test_dir: 0,
          repos_with_ci_config: 0,
          ci_pass_rate_trajectory: {},
        },
      ),
      anti_gaming_inputs: this.safeGet<AntiGamingInputs>(results, 'G', {
        burst_dormancy_ratio: 1.0,
        burst_triggered_at_evaluation: false,
        fork_dump_ratio: 0,
        code_search_flags: [],
        copyleaks_results: [],
        commit_inflation_ratio: 0,
        ai_pattern_confidence: 0,
        style_discontinuity_events: [],
      }),
    };

    console.log(
      `[CorpusBuilder] phase=build_complete corpusId=${corpus.corpus_id} ` +
      `username=${username} groupsPresent=${groupsPresent.join(',')} ` +
      `errors=${errors.length}`,
    );

    return corpus;
  }

  /**
   * Safe-get a group's data from the results array, returning a default value if missing.
   */
  private safeGet<T>(results: GroupCollectionResult[], group: CorpusGroup, defaultValue: T): T {
    const result = results.find((r) => r.group === group);
    if (result && !result.error && result.data !== undefined && result.data !== null) {
      return result.data as T;
    }
    return defaultValue;
  }

  /**
   * Generate a unique corpus ID.
   */
  private generateCorpusId(): string {
    const crypto = require('crypto');
    return `cor_${crypto.randomBytes(12).toString('hex')}`;
  }
}