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
import { exit } from 'process';

const MAX_REPOS = 30;

@Injectable()
export class GroupBCollector {
  async collect(
    octokit: Octokit,
    username: string,
    circuitBreaker: CircuitBreakerService,
  ): Promise<RepositorySignal[]> {
    console.log(
      `	[B_GroupCollector] phase=collect_start username=${username}`,
    );


    const response = await octokit.rest.repos.listForUser({
      username,
      sort: 'pushed',
      per_page: 100,
      headers: { accept: 'application/vnd.github.mercy-preview+json' },
    });
    circuitBreaker.updateFromHeaders(response.headers as any);

    const rawRepos = (response.data as any[]) || [];

    const reposOrdered = this.filterRepos(rawRepos, username)
      .map((r) => ({
        ...r,
        quality_score: this.computeQuality(r),
      }))
      .sort((a, b) => b.quality_score - a.quality_score)
      .slice(0, MAX_REPOS);

    // Enrich top repos with has_readme and languages via additional API calls.
    // We do this for the top 5 repos (by quality) to avoid rate limiting.
    const enrichedRepos = await Promise.all(
      reposOrdered.map(async (r, index) => {
        console.log("repo :", r);

        // Determine org repo: if owner login differs from username
        const repoOwner = r.owner?.login ?? username;
        const isOrgRepo = repoOwner !== username;

        // Only enrich the top repos (by index/significance) to limit API calls
        let hasReadme = false;
        let languages: Record<string, number> = {};

        console.log("index : ", index);
        if (index < 5 && !circuitBreaker.shouldAbort()) {
          console.log("deep check ", index);
          const enrichment = await this.enrichRepository(
            octokit,
            repoOwner,
            r.name,
            circuitBreaker,
          );

          hasReadme = enrichment.hasReadme;
          languages = enrichment.languages;
        }

        return {
          name: r.name,
          full_name: r.full_name ?? `${username}/${r.name}`,
          primary_language: r.language ?? null,
          star_count: r.stargazers_count ?? 0,
          fork_count: r.forks_count ?? 0,
          size_kb: r.size ?? 0,
          is_fork: r.fork ?? false,
          is_archived: r.archived ?? false,
          is_private: r.private ?? false,
          is_org_repo: isOrgRepo,
          pushed_at: r.pushed_at ?? new Date(0).toISOString(),
          has_readme: hasReadme,
          topics: r.topics ?? [],
          homepage_url: r.homepage ?? null,
          languages: languages,
          quality_score: r.quality_score,
        };
      }),
    );


    console.log(
      `	[B_GroupCollector] phase=collect_complete username=${username} ` +
      `repos=${enrichedRepos.length} readmesChecked=${enrichedRepos.filter((r) => r.has_readme).length}`,
    );
    console.log("enrichedRepos : ", enrichedRepos);
    exit(0);
    return enrichedRepos;
  }

  private filterRepos(repos: any[], username: string): any[] {
    return repos
      .filter((r) => !this.isProfileReadmeRepo(r, username))
      .slice(0, MAX_REPOS);
  }

  private isProfileReadmeRepo(
    repo: any,
    username: string,
  ): boolean {
    return (
      repo.owner?.login === username &&
      repo.name === username
    );
  }

  private computeQuality(repo: any): number {
    const stars = repo.stargazers_count ?? 0;
    const forks = repo.forks_count ?? 0;

    const recencyWeight = this.computeRecencyWeight(
      new Date(repo.pushed_at)
    );

    return (
      stars * 0.4 +
      forks * 0.2 +
      recencyWeight * 100 * 0.4
    );
  }

  private computeRecencyWeight(pushedAt: Date): number {
    const daysSincePush =
      (Date.now() - pushedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSincePush < 30) return 1.0;
    if (daysSincePush < 90) return 0.7;
    if (daysSincePush < 365) return 0.4;
    return 0.1;
  }

  private async enrichRepository(
    octokit: Octokit,
    owner: string,
    repo: string,
    circuitBreaker: CircuitBreakerService,
  ): Promise<{ hasReadme: boolean; languages: Record<string, number> }> {
    return {
      hasReadme: await this.hasReadme(octokit, owner, repo, circuitBreaker),
      languages: await this.getLanguages(octokit, owner, repo, circuitBreaker),
    };
  }

  private async hasReadme(
    octokit: Octokit,
    owner: string,
    repo: string,
    circuitBreaker: CircuitBreakerService,
  ): Promise<boolean> {
    try {
      const response = await octokit.rest.repos.getReadme({
        owner,
        repo,
      });

      circuitBreaker.updateFromHeaders(response.headers as any);

      return true;
    } catch {
      return false;
    }
  }

  private async getLanguages(
    octokit: Octokit,
    owner: string,
    repo: string,
    circuitBreaker: CircuitBreakerService,
  ): Promise<Record<string, number>> {
    try {
      const response =
        await octokit.rest.repos.listLanguages({
          owner,
          repo,
        });

      circuitBreaker.updateFromHeaders(response.headers as any);

      return response.data as Record<string, number>;
    } catch {
      return {};
    }
  }
}