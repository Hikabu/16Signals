/**
 * Group F Collector — Impact & External Signals
 *
 * Fetches: External OSS contributions, npm/pypi/cargo package stats,
 *          StackOverflow reputation.
 *
 * API calls: GitHub search (external PRs) + package registry lookups
 *            + StackExchange API (optional)
 * Output: ImpactSignals
 *
 * Reference: corpus.types.ts Group F
 */

import { Injectable } from '@nestjs/common';
import { Octokit } from 'octokit';
import { ImpactSignals, PackageRegistryEntry } from '../../corpus/corpus.types';
import { CircuitBreakerService } from '../circuit-breaker.service';

@Injectable()
export class GroupFCollector {
  async collect(
    octokit: Octokit,
    username: string,
    repos: any[],
    circuitBreaker: CircuitBreakerService,
    stackoverflowUserId?: number,
  ): Promise<ImpactSignals> {
    console.log(
      `	[F_GroupCollector] phase=collect_start username=${username}`,
    );

    // External PR contributions — search for PRs by user in repos they don't own
    let externalContributionCount = 0;
    try {
      const extPrResponse = await octokit.rest.search.issuesAndPullRequests({
        q: `type:pr author:${username} is:merged -user:${username}`,
        per_page: 30,
        sort: 'created',
        order: 'desc',
      });
      circuitBreaker.updateFromHeaders(extPrResponse.headers as any);
      externalContributionCount = (extPrResponse.data as any).total_count ?? 0;
    } catch {
      console.log(
        `	[F_GroupCollector] phase=external_prs_skipped username=${username}`,
      );
    }

    // Contribution calendar activity (from GraphQL)
    let activeWeeksLast12m = 0;
    try {
      const graphQLQuery = `
        query($login: String!) {
          user(login: $login) {
            contributionsCollection {
              contributionCalendar {
                weeks {
                  contributionDays { contributionCount }
                }
              }
            }
          }
        }
      `;
      const gqlResponse: any = await octokit.graphql(graphQLQuery, {
        login: username,
      });

      const weeks =
        gqlResponse?.user?.contributionsCollection?.contributionCalendar
          ?.weeks || [];

      const last52Weeks = weeks.slice(-52);
      activeWeeksLast12m = last52Weeks.filter((week: any) =>
        week.contributionDays.some(
          (day: any) => day.contributionCount > 0,
        ),
      ).length;
    } catch {
      console.log(
        `	[F_GroupCollector] phase=graphql_skipped username=${username}`,
      );
    }

    // Package registry lookups (simplified — real data from Deep Mode)
    const npmPackages: PackageRegistryEntry[] = [];
    const pypiPackages: PackageRegistryEntry[] = [];
    const cargoPackages: PackageRegistryEntry[] = [];

    // Try to find npm packages from repo names
    for (const repo of repos.slice(0, 5)) {
      try {
        const pkgResp = await fetch(
          `https://registry.npmjs.org/${encodeURIComponent(repo.name)}`,
        );
        if (pkgResp.ok) {
          const pkgData: any = await pkgResp.json();
          npmPackages.push({
            name: repo.name,
            downloads: pkgData.downloads?.lastMonth ?? 0,
            dependents: Object.keys(pkgData.versions || {}).length,
          });
        }
      } catch {
        // Not on npm
      }
    }

    // ── StackOverflow profile lookup ──
    // Uses the StackExchange API 2.3 (no key required for basic queries, throttled).
    // If stackoverflowUserId is provided, fetch by ID; otherwise try display name.
    let stackoverflowRep = 0;
    let stackoverflowAcceptRate: number | null = null;
    const stackoverflowTopTags: string[] = [];

    try {
      const soSearchUrl = stackoverflowUserId
        ? `https://api.stackexchange.com/2.3/users/${stackoverflowUserId}?order=desc&sort=reputation&site=stackoverflow`
        : `https://api.stackexchange.com/2.3/users?order=desc&sort=reputation&inname=${encodeURIComponent(username)}&site=stackoverflow`;

      const soResp = await fetch(soSearchUrl, {
        signal: AbortSignal.timeout(5000),
      });

      if (soResp.ok) {
        const soData: any = await soResp.json();
        const users = soData.items || [];
        if (users.length > 0) {
          const topUser = users[0];
          stackoverflowRep = topUser.reputation ?? 0;
          stackoverflowAcceptRate = topUser.accept_rate ?? null;

          // Fetch top tags for the user
          if (topUser.user_id) {
            try {
              const tagsResp = await fetch(
                `https://api.stackexchange.com/2.3/users/${topUser.user_id}/tags?order=desc&sort=popular&site=stackoverflow`,
                { signal: AbortSignal.timeout(5000) },
              );
              if (tagsResp.ok) {
                const tagsData: any = await tagsResp.json();
                stackoverflowTopTags.push(
                  ...(tagsData.items || []).slice(0, 10).map((t: any) => t.name),
                );
              }
            } catch {
              // Tags fetch is best-effort
            }
          }
        }
      }
    } catch {
      console.log(
        `	[F_GroupCollector] phase=stackoverflow_skipped username=${username}`,
      );
    }

    console.log(
      `	[F_GroupCollector] phase=collect_complete username=${username} ` +
      `externalPRs=${externalContributionCount} activeWeeks=${activeWeeksLast12m} ` +
      `npmPackages=${npmPackages.length} ` +
      `soRep=${stackoverflowRep} soTags=${stackoverflowTopTags.length}`,
    );

    return {
      external_oss_contribution_count: externalContributionCount,
      contribution_calendar_active_weeks_12m: activeWeeksLast12m,
      npm_packages: npmPackages,
      pypi_packages: pypiPackages,
      cargo_packages: cargoPackages,
      stackoverflow_reputation: stackoverflowRep,
      stackoverflow_accepted_answer_rate: stackoverflowAcceptRate,
      stackoverflow_top_tags: stackoverflowTopTags,
    };
  }
}
