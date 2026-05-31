/**
 * Group D Collector — Collaboration & Review
 *
 * Fetches: PR activity, review patterns, issue triage signals.
 * Uses GitHub search API for cross-repo PR data.
 *
 * API calls: 1 search (issuesAndPullRequests) + pagination
 * Output: CollaborationSignals
 *
 * Reference: corpus.types.ts Group D
 */

import { Injectable } from '@nestjs/common';
import { Octokit } from 'octokit';
import { CollaborationSignals } from '../../corpus/corpus.types';
import { CircuitBreakerService } from '../circuit-breaker.service';

const MAX_PRS = 50;

@Injectable()
export class GroupDCollector {
  async collect(
    octokit: Octokit,
    username: string,
    circuitBreaker: CircuitBreakerService,
  ): Promise<CollaborationSignals> {
    console.log(
      `[GroupDCollector] phase=collect_start username=${username}`,
    );

    const prAuthors = new Set<string>();
    const prReviewers = new Set<string>();
    let substantiveReviews = 0;
    let totalReviews = 0;
    let selfMerges = 0;
    let totalMerges = 0;
    let totalPrDescriptions = 0;
    let totalDescriptionWords = 0;
    const prSizes: number[] = [];
    const prDescriptions: string[] = [];
    const reviewComments: string[] = [];
    let crossRepoComments = 0;
    let totalTimeToMergeHours = 0;
    let mergesWithTime = 0;

    try {
      let page = 1;
      let hasMore = true;

      while (hasMore && page <= 3) {
        const response = await octokit.rest.search.issuesAndPullRequests({
          q: `type:pr author:${username}`,
          sort: 'created',
          order: 'desc',
          per_page: MAX_PRS,
          page,
        });
        circuitBreaker.updateFromHeaders(response.headers as any);

        const items = response.data.items as any[];

        for (const pr of items) {
          if (pr.user?.login) prAuthors.add(pr.user.login);
          totalPrDescriptions++;

          const bodyLength = (pr.body || '').split(/\s+/).filter(Boolean).length;
          totalDescriptionWords += bodyLength;
          if (pr.body) prDescriptions.push(pr.body.slice(0, 500));

          // PR size estimation
          const additions = pr.additions ?? 0;
          const deletions = pr.deletions ?? 0;
          prSizes.push(additions + deletions);

          // Merge time
          if (pr.merged_at && pr.created_at) {
            const created = new Date(pr.created_at);
            const merged = new Date(pr.merged_at);
            const hours = (merged.getTime() - created.getTime()) / (1000 * 60 * 60);
            totalTimeToMergeHours += hours;
            mergesWithTime++;
            totalMerges++;

            if (pr.merged_by?.login === username) {
              selfMerges++;
            }
          }

          // Review comments
          const commentCount = pr.comments ?? 0;
          crossRepoComments += commentCount;
        }

        hasMore = items.length === MAX_PRS;
        page++;
      }
    } catch (err: any) {
      // Search API can be rate-limited; degrade gracefully
      console.log(
        `[GroupDCollector] phase=search_error username=${username} error=${err.message}`,
      );
    }

    // Fetch reviews for the PRs (separate call for depth)
    try {
      const reviewResponse = await octokit.rest.search.issuesAndPullRequests({
        q: `type:pr reviewed-by:${username}`,
        per_page: 30,
      });
      circuitBreaker.updateFromHeaders(reviewResponse.headers as any);

      const reviewItems = (reviewResponse.data.items as any[]) || [];
      for (const item of reviewItems) {
        const reviewers = item.requested_reviewers || [];
        for (const reviewer of reviewers) {
          if (reviewer.login) prReviewers.add(reviewer.login);
        }
      }
    } catch {
      // Non-critical; degrade gracefully
    }

    const avgDescriptionWords =
      totalPrDescriptions > 0
        ? Math.round(totalDescriptionWords / totalPrDescriptions)
        : 0;

    const avgTimeToMerge =
      mergesWithTime > 0
        ? Math.round((totalTimeToMergeHours / mergesWithTime) * 10) / 10
        : 0;

    const selfMergeRate = totalMerges > 0 ? selfMerges / totalMerges : 0;

    console.log(
      `[GroupDCollector] phase=collect_complete username=${username} ` +
      `prAuthors=${prAuthors.size} reviewers=${prReviewers.size} ` +
      `prs=${totalPrDescriptions} selfMergeRate=${selfMergeRate.toFixed(2)}`,
    );

    return {
      pr_author_count: prAuthors.size,
      pr_reviewer_count: prReviewers.size,
      substantive_review_ratio: totalReviews > 0
        ? substantiveReviews / totalReviews
        : 0,
      self_merge_rate: selfMergeRate,
      avg_pr_description_length_words: avgDescriptionWords,
      pr_size_distribution: prSizes.slice(0, 100),
      pr_description_raw: prDescriptions.slice(0, 20),
      review_comment_raw: reviewComments.slice(0, 50),
      review_comment_depth_scores: Array(reviewComments.length).fill(0), // Populated after LLM
      cross_repo_comment_count: crossRepoComments,
      issue_triage_quality_score: null, // Requires deeper analysis
      avg_time_to_merge_hours: avgTimeToMerge,
    };
  }
}