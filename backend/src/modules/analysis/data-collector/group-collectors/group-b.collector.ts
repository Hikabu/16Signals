/**
 * Group B Collector — Repository Inventory
 *
 * Fetches: All public repos for a user with key metadata.
 * Uses GraphQL for efficiency. Falls back to REST if GraphQL unavailable.
 * Limits to top 30 repos sorted by push recency.
 *
 * API calls: 1 REST (repos.listForUser) 
 * Output: RepositorySignal[]
 *
 * Reference: corpus.types.ts Group B
 */

import { Injectable } from '@nestjs/common';
import { Octokit } from 'octokit';
import { RepositorySignal } from '../../corpus/corpus.types';
import { CircuitBreakerService } from '../circuit-breaker.service';

const MAX_REPOS = 30;

@Injectable()
export class GroupBCollector {
  async collect(
    octokit: Octokit,
    username: string,
    circuitBreaker: CircuitBreakerService,
  ): Promise<RepositorySignal[]> {
    console.log(
      `	[$1_GroupCollector] phase=collect_start username=${username}`,
    );

    const response = await octokit.rest.repos.listForUser({
      username,
      sort: 'pushed',
      per_page: 100,
      headers: { accept: 'application/vnd.github.mercy-preview+json' },
    });
    circuitBreaker.updateFromHeaders(response.headers as any);

    const rawRepos = (response.data as any[]) || [];
    const repos = rawRepos.slice(0, MAX_REPOS).map((r) => {
      const stars = r.stargazers_count ?? 0;
      const forks = r.forks_count ?? 0;
      const commits = r.size ?? 0; // approximate; size in KB
      const pushedAt = r.pushed_at ? new Date(r.pushed_at) : new Date(0);
      const recencyWeight = this.computeRecencyWeight(pushedAt);

      const qualityScore = Math.min(
        1.0,
        (stars * 0.4 + forks * 0.2 + Math.min(commits, 500) / 500 * 0.2 + recencyWeight * 0.2) / 100,
      );

      return {
        name: r.name,
        full_name: r.full_name ?? `${username}/${r.name}`,
        primary_language: r.language ?? null,
        star_count: stars,
        fork_count: forks,
        commit_count: commits,
        is_fork: r.fork ?? false,
        is_archived: r.archived ?? false,
        is_private: r.private ?? false,
        is_org_repo: false, // Will be corrected in Deep Mode
        pushed_at: r.pushed_at ?? new Date(0).toISOString(),
        has_readme: false, // Requires separate API call; left for Deep Mode
        topics: r.topics ?? [],
        homepage_url: r.homepage ?? null,
        languages: {}, // Populated in Deep Mode or via separate API
        quality_score: qualityScore,
      };
    });

    console.log(
      `	[$1_GroupCollector] phase=collect_complete username=${username} ` +
      `repos=${repos.length}`,
    );

    return repos;
  }

  private computeRecencyWeight(pushedAt: Date): number {
    const daysSincePush =
      (Date.now() - pushedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSincePush < 30) return 1.0;
    if (daysSincePush < 90) return 0.7;
    if (daysSincePush < 365) return 0.4;
    return 0.1;
  }
}