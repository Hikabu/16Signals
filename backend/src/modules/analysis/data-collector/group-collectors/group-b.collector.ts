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
    const reposSlice = rawRepos.slice(0, MAX_REPOS);

    // Enrich top repos with has_readme and languages via additional API calls.
    // We do this for the top 5 repos (by quality) to avoid rate limiting.
    const enrichedRepos = await Promise.all(
      reposSlice.map(async (r, index) => {
        const stars = r.stargazers_count ?? 0;
        const forks = r.forks_count ?? 0;
        const commits = r.size ?? 0;
        const pushedAt = r.pushed_at ? new Date(r.pushed_at) : new Date(0);
        const recencyWeight = this.computeRecencyWeight(pushedAt);

        const qualityScore = Math.min(
          1.0,
          (stars * 0.4 + forks * 0.2 + Math.min(commits, 500) / 500 * 0.2 + recencyWeight * 0.2) / 100,
        );

        // Determine org repo: if owner login differs from username
        const repoOwner = r.owner?.login ?? username;
        const isOrgRepo = repoOwner !== username;

        // Only enrich the top repos (by index/significance) to limit API calls
        let hasReadme = false;
        let languages: Record<string, number> = {};

        if (index < 5 && !circuitBreaker.shouldAbort()) {
          // Check for README
          try {
            const readmeResp = await octokit.rest.repos.getReadme({
              owner: repoOwner,
              repo: r.name,
            });
            circuitBreaker.updateFromHeaders(readmeResp.headers as any);
            hasReadme = true;
          } catch {
            // No README or access denied
          }

          // Fetch language breakdown
          try {
            const langResp = await octokit.rest.repos.listLanguages({
              owner: repoOwner,
              repo: r.name,
            });
            circuitBreaker.updateFromHeaders(langResp.headers as any);
            languages = langResp.data as Record<string, number>;
          } catch {
            // Languages unavailable
          }
        }

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
          is_org_repo: isOrgRepo,
          pushed_at: r.pushed_at ?? new Date(0).toISOString(),
          has_readme: hasReadme,
          topics: r.topics ?? [],
          homepage_url: r.homepage ?? null,
          languages: languages,
          quality_score: qualityScore,
        };
      }),
    );

    console.log(
      `	[$1_GroupCollector] phase=collect_complete username=${username} ` +
      `repos=${enrichedRepos.length} readmesChecked=${enrichedRepos.filter((r) => r.has_readme).length}`,
    );

    return enrichedRepos;
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