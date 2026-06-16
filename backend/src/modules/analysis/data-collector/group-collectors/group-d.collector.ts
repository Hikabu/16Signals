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
import {
  CollaborationSignals,
  ContributionBehaviorSignals,
  MaintenanceBehaviorSignals,
  AuthoredReviewData,
  ReviewBehaviorSignals,
  IssueActivityData,
} from '../../corpus/corpus.types';
import { CircuitBreakerService } from '../circuit-breaker.service';
// import { exit } from 'process';

const MAX_PRS = 50;

@Injectable()
export class GroupDCollector {
  async collect(
    octokit: Octokit,
    username: string,
    circuitBreaker: CircuitBreakerService,
  ): Promise<CollaborationSignals> {
    const prs = await this.fetchAuthoredPRsData(
      octokit,
      username,
      circuitBreaker,
    );

    const mergedIds = await this.fetchMergedStates(octokit, prs);

    const contribution = this.collectContributionSignals(
      prs,
      mergedIds,
      username,
    );
    const reviewData = await this.fetchAuthoredReviewData(
      octokit,
      username,
      circuitBreaker,
    );

    const receivedReviewData = await this.fetchReceivedReviewData(
      octokit,
      prs,
      circuitBreaker,
    );

    const review = this.collectReviewSignals(
      reviewData,
      receivedReviewData,
      contribution.pr_count,
    );

    const issueActivity = await this.fetchIssueActivityData(
      octokit,
      username,
      circuitBreaker,
    );
    const maintenance = this.collectMaintenanceSignals(issueActivity);

    console.log(
      'GROUP D: ',
      '\n CONTRIBUTION: ',
      '\n\t PR count: ',
      contribution.pr_count,
      '\n\t Merged PR count: ',
      contribution.merged_pr_count,
      '\n\t Unique repos contributed to: ',
      contribution.unique_repo_count,
      '\n\t External repos contributed to: ',
      contribution.external_repo_count,
      '\n\t Avg PR description length (words): ',
      contribution.avg_pr_description_length_words,
      '\n\t PR description raw samples: ',
      contribution.pr_description_raw.slice(0, 3).join(' | '),

      '\n REVIEW: ',
      '\n\t Authored review count: ',
      review.authored_review_count,
      // "\n\t Substantive authored ratio: ", review.substantive_authored_review_ratio,
      '\n\t Reviews received: ',
      review.reviews_received_count,
      '\n\t review_state_distribution: ',
      '\n\t\t Approved: ',
      review.review_state_distribution.approved,
      '\n\t\t changesRequested: ',
      review.review_state_distribution.changes_requested,
      '\n\t\t commented: ',
      review.review_state_distribution.commented,

      '\n\t unique_reviewers_count',
      review.unique_reviewers_count,
      '\n\t Avg reviews per PR: ',
      review.avg_reviews_per_pr,
      '\n\t Authored samples: ',
      review.authored_review_raw.slice(0, 3).join(' | '),
      '\n\t Received samples: ',
      review.received_review_raw.slice(0, 3).join(' | '),

      '\n MAINTENANCE: ',
      '\n\t Issue participation count: ',
      maintenance.issueParticipationCount,
      '\n\t Issue participation raw: ',
      maintenance.issueParticipationRaw.slice(0, 3).join(' | '), // "\n\t Issue triage quality score: ", maintenance.issue_triage_quality_score,
    );

    return {
      contribution,
      review,
      maintenance,
    };
  }

  private async fetchAuthoredPRsData(
    octokit: Octokit,
    username: string,
    circuitBreaker: CircuitBreakerService,
  ): Promise<any[]> {
    const prs: any[] = [];

    let page = 1;

    while (page <= 3) {
      const response = await octokit.rest.search.issuesAndPullRequests({
        q: `type:pr author:${username}`,
        sort: 'created',
        order: 'desc',
        per_page: MAX_PRS,
        page,
      });

      circuitBreaker.updateFromHeaders(response.headers as any);

      prs.push(
        ...response.data.items.map((pr: any) => ({
          number: pr.number,
          node_id: pr.node_id,
          body: pr.body,
          repository_url: pr.repository_url,
        })),
      );

      if (
        response.data.items.length < MAX_PRS ||
        circuitBreaker.shouldAbort()
      ) {
        break;
      }

      page++;
    }

    return prs;
  }

  private async fetchMergedStates(
    octokit: Octokit,
    prs: any[],
  ): Promise<Set<string>> {
    const ids = prs.map((pr) => pr.node_id).filter(Boolean);

    if (ids.length === 0) {
      return new Set();
    }

    const query = `
      query($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on PullRequest {
            id
            merged
          }
        }
      }
    `;

    const response: any = await octokit.graphql(query, {
      ids,
    });

    const mergedIds = new Set<string>();

    for (const node of response.nodes ?? []) {
      if (node?.merged) {
        mergedIds.add(node.id);
      }
    }

    return mergedIds;
  }

  private collectContributionSignals(
    prs: any[],
    mergedIds: Set<string>,
    username: string,
  ): ContributionBehaviorSignals {
    let totalWords = 0;

    const descriptions: string[] = [];

    const repoNames = new Set<string>();
    const externalRepos = new Set<string>();

    for (const pr of prs) {
      const body = (pr.body || '').trim();

      totalWords += body.split(/\s+/).filter(Boolean).length;

      if (body) {
        descriptions.push(body.slice(0, 500));
      }

      const repoFullName = pr.repository_url?.replace(
        'https://api.github.com/repos/',
        '',
      );

      if (!repoFullName) {
        continue;
      }

      repoNames.add(repoFullName);

      const owner = repoFullName.split('/')[0];

      if (owner.toLowerCase() !== username.toLowerCase()) {
        externalRepos.add(repoFullName);
      }
    }

    const mergedPrCount = prs.filter((pr) => mergedIds.has(pr.node_id)).length;

    return {
      pr_count: prs.length,

      merged_pr_count: mergedPrCount,
      unique_repo_count: repoNames.size,

      external_repo_count: externalRepos.size,

      avg_pr_description_length_words:
        prs.length > 0 ? Math.round(totalWords / prs.length) : 0,

      pr_description_raw: descriptions.slice(0, 20),
    };
  }

  private async fetchAuthoredReviewData(
    octokit: Octokit,
    username: string,
    circuitBreaker: CircuitBreakerService,
  ): Promise<AuthoredReviewData[]> {
    // TODO pagination using pageInfo.endCursor
    const query = `
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          pullRequestReviewContributions(first: 100) { 
            nodes {
              pullRequestReview {
                body
                state
                createdAt
              }
            }
          }
        }
      }
    }
  `;

    try {
      const response: any = await octokit.graphql(query, {
        login: username,
      });

      // console.log(JSON.stringify(response, null, 2));

      const nodes =
        response?.user?.contributionsCollection?.pullRequestReviewContributions
          ?.nodes ?? [];

      // console.dir(
      // nodes[0],
      // { depth: null },
      // );

      // console.log(
      // 'review nodes:',
      // nodes.length,
      // );

      return nodes.map((node: any) => ({
        body: node.pullRequestReview?.body ?? '',
        state: node.pullRequestReview?.state ?? '',
        created_at: node.pullRequestReview?.createdAt ?? '',
      }));
    } catch {
      return [];
    }
  }

  private async fetchReceivedReviewData(
    octokit: Octokit,
    prs: any[],
    circuitBreaker: CircuitBreakerService,
  ): Promise<any[]> {
    const received: any[] = [];

    for (const pr of prs.slice(0, 30)) {
      // cap cost

      if (circuitBreaker.shouldAbort()) break;

      const repoFullName = pr.repository_url?.replace(
        'https://api.github.com/repos/',
        '',
      );

      if (!repoFullName) continue;

      const [owner, repo] = repoFullName.split('/');

      try {
        const resp = await octokit.rest.pulls.listReviews({
          owner,
          repo,
          pull_number: pr.number,
          per_page: 50,
        });

        circuitBreaker.updateFromHeaders(resp.headers as any);

        received.push(
          ...resp.data.map((r) => ({
            reviewer: r.user?.login,
            body: r.body || '',
            state: r.state,
            pr_number: pr.number,
          })),
        );
      } catch {}
    }

    return received;
  }

  private collectReviewSignals(
    authored: AuthoredReviewData[],
    received: any[],
    totalPrCount: number,
  ): ReviewBehaviorSignals {
    // ---------- authored ----------
    let substantiveAuthored = 0;
    const authoredRaw: string[] = [];

    for (const r of authored) {
      const body = r.body?.trim();
      if (!body) continue;

      authoredRaw.push(body);

      if (body.split(/\s+/).length >= 10) {
        substantiveAuthored++;
      }
    }

    // ---------- received ----------
    const receivedRaw: string[] = [];
    const reviewsByPR = new Map<number, number>();
    let approved = 0;
    let changesRequested = 0;
    let commented = 0;

    for (const r of received) {
      switch (r.state) {
        case 'APPROVED':
          approved++;
          break;

        case 'CHANGES_REQUESTED':
          changesRequested++;
          break;

        case 'COMMENTED':
          commented++;
          break;
      }

      const body = r.body?.trim();

      if (body) {
        receivedRaw.push(body);
      }

      const pr = r.pr_number;
      if (pr != null) {
        reviewsByPR.set(pr, (reviewsByPR.get(pr) ?? 0) + 1);
      }
    }

    const avgReviewsPerPR =
      totalPrCount > 0 ? received.length / totalPrCount : 0; // reviewsByPR.size > 0
    //   ? Array.from(reviewsByPR.values()).reduce((a, b) => a + b, 0) / reviewsByPR.size
    //   : 0;

    const uniqueReviewers = new Set(
      received.map((r) => r.reviewer).filter(Boolean),
    );

    return {
      // authored
      authored_review_count: authored.length,
      // substantive_authored_review_ratio:
      // authored.length > 0 ? substantiveAuthored / authored.length : 0,
      authored_review_raw: authoredRaw.slice(0, 20),

      // received (core signal)
      reviews_received_count: received.length,
      unique_reviewers_count: uniqueReviewers.size,
      review_state_distribution: {
        approved,
        changes_requested: changesRequested,
        commented,
      },
      avg_reviews_per_pr: Number(avgReviewsPerPR.toFixed(2)),
      received_review_raw: receivedRaw.slice(0, 20),
    };
  }

  private async fetchIssueActivityData(
    octokit: Octokit,
    username: string,
    circuitBreaker: CircuitBreakerService,
  ): Promise<IssueActivityData[]> {
    const activities: IssueActivityData[] = [];

    let page = 1;

    while (page <= 3) {
      const response = await octokit.rest.search.issuesAndPullRequests({
        q: `type:issue commenter:${username}`,
        per_page: MAX_PRS,
        page,
      });

      circuitBreaker.updateFromHeaders(response.headers as any);

      activities.push(
        ...response.data.items.map((item: any) => ({
          issue_url: item.html_url ?? '',
          title: item.title ?? '',
          body: item.body ?? '',
        })),
      );

      if (
        response.data.items.length < MAX_PRS ||
        circuitBreaker.shouldAbort()
      ) {
        break;
      }

      page++;
    }

    return activities;
  }

  private collectMaintenanceSignals(
    issues: IssueActivityData[],
  ): MaintenanceBehaviorSignals {
    return {
      issueParticipationCount: issues.length,

      issueParticipationRaw: issues
        .map((i) => i.body || i.title)
        .filter(Boolean)
        .slice(0, 20),
    };
  }
}

// //ENRICH :
// merged_pr_count
// review_comment_count
// issue_triage_quality_score
// review_comment_depth_scores
