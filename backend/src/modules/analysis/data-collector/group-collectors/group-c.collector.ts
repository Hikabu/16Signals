/**
 * Group C Collector — Commit Intelligence
 *
 * Fetches: Aggregated commit metrics from owned, non-fork repos.
 * Uses REST API to iterate commits per repo (up to 100 per repo).
 *
 * Computes:
 *   - total_commits_lifetime
 *   - commit_frequency_by_month
 *   - commit_size_histogram, p25/median/small-ratio
 *   - merge_commit_ratio, commit_signing_rate
 *   - work_hour_distribution
 *   - message_quality_raw (sampled for LLM batch)
 *
 * Reference: corpus.types.ts Group C
 */

import { Injectable } from '@nestjs/common';
import { Octokit } from 'octokit';
import { CommitSignals, RepositorySignal } from '../../corpus/corpus.types';
import { CircuitBreakerService } from '../circuit-breaker.service';
import { exit } from 'process';
import { rm } from 'fs';

const MAX_COMMITS_PER_REPO = 100;
const MAX_REPOS_FOR_COMMITS = 10;

@Injectable()
export class GroupCCollector {
  async collect(
    octokit: Octokit,
    username: string,
    repos: RepositorySignal[],
    circuitBreaker: CircuitBreakerService,
  ): Promise<CommitSignals> {
    console.log(
      `\t	[C_GroupCollector] phase=collect_start username=${username}`,
    );

    // Only non-fork, non-archived repos, sorted by quality score
    const targetRepos = repos
      .filter((r) => !r.is_fork && !r.is_archived)
      .sort((a, b) => b.quality_score - a.quality_score)
      .slice(0, MAX_REPOS_FOR_COMMITS);

    const freqByMonth: Record<string, number> = {};
    let totalMergeCommits = 0;
    let totalNonMergeCommits = 0;
    const workHourDist: Record<string, number> = {};
    const messageSamples: string[] = [];
    let totalSigned = 0;
    let totalCommitsSampled = 0;

    for (const repo of targetRepos) {
      if (circuitBreaker.shouldAbort()) break;

      try {
        let page = 1;
        let hasMore = true;

        while (hasMore && page <= 2) {
          const response = await octokit.rest.repos.listCommits({
            owner: username,
            repo: repo.name,
            per_page: 100,
            page,
          });
          circuitBreaker.updateFromHeaders(response.headers as any);

          const commits = response.data as any[];

          for (const commit of commits) {
            totalNonMergeCommits++;
            const isMerge = commit.parents?.length > 1;
            if (isMerge) totalMergeCommits++;

            const author = commit.commit?.author;
            const date = author?.date ? new Date(author.date) : null;

            // Frequency by month
            if (date) {
              const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
              freqByMonth[monthKey] = (freqByMonth[monthKey] || 0) + 1;

              // Work hour distribution (UTC)
              const hourKey = String(date.getUTCHours()).padStart(2, '0');
              workHourDist[hourKey] = (workHourDist[hourKey] || 0) + 1;
            }

            // Signing
            if (commit.commit?.verification?.verified) {
              totalSigned++;
            }
            totalCommitsSampled++;

            // Message quality samples (up to 50 per user)
            if (messageSamples.length < 50) {
              const msg = commit.commit?.message || '';
              if (msg.length > 5) messageSamples.push(msg);
            }
          }

          hasMore = commits.length === 100;
          page++;
        }
      } catch (err: any) {
        console.log(
          `	[C_GroupCollector] phase=repo_error repo=${repo.name} ` +
          `error=${err.message}`,
        );
        // Continue with next repo
      }
    }
    

    const mergeRatio = totalNonMergeCommits > 0
      ? totalMergeCommits / totalNonMergeCommits
      : 0;

    const signingRate = totalCommitsSampled > 0
      ? totalSigned / totalCommitsSampled
      : 0;

    console.log(
      `	\n\n[C_GroupCollector] phase=collect_complete username=${username} ` +
      `\n\ttotalCommits=${totalNonMergeCommits} ` +
            `\n\tmonths=${Object.keys(freqByMonth).length} ` +
      `\n\t merge_commit_ratio =${ mergeRatio}` +
      `\n\t commit_signing_rate=${ signingRate}` +
 `\n\twork_hour_distribution =${workHourDist }` +
 `\n\t message_quality_raw=${ messageSamples.slice(0, 1)}` +
 `\n\tmessage_quality_scores =${Array(messageSamples.length).fill(0) }` 

);

    exit(0);

    return {
      total_commits_lifetime: totalNonMergeCommits,
      commit_frequency_by_month: freqByMonth,
      
      merge_commit_ratio: mergeRatio,
      commit_signing_rate: signingRate,
      work_hour_distribution: workHourDist,
      message_quality_raw: messageSamples,
      message_quality_scores: Array(messageSamples.length).fill(0), // Populated after LLM

      //DEEP MODE
      // per_repo_author_stats: {}, // Deep Mode only
      // complexity_trend_by_year: {}, // Deep Mode only
      // test_to_code_ratio_by_repo: {}, // Deep Mode only
      // commit_size_histogram: [], 
      // p25_commit_size_lines: 0,
      // median_commit_size_lines: 0,
      // sub_5_line_commit_ratio: 0,

    };
  }
}

//TODO:
// -> total_commits_lifetime is incorrect, rename sampled_commits or rm
// -> work_hour_distribution is weak because of geography and who cares when someone is working right so pbb rm
// -> message_quality_raw expand HIGH QUALITY