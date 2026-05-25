import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Octokit } from 'octokit';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { RateLimitExhaustedException } from '../errors/rate-limit-exhausted.exception';
import { RawGroupA, RawGroupB, RawGroupC, RawGroupD, RawGroupE, RawGroupF } from '../../../types/primitives.types';
import { RawLightData } from '../../../types/raw-data.types';

// ─── Internal shapes returned by the batched GraphQL query ─────────────────────
interface GqlUser {
  bio: string | null;
  company: string | null;
  websiteUrl: string | null;
  isHireable: boolean;
  location: string | null;
  createdAt: string;
  organizations: {
    nodes: Array<{ login: string }>;
  };
  contributionsCollection: {
    contributionCalendar: {
      weeks: Array<{
        firstDay: string;
        contributionDays: Array<{ contributionCount: number }>;
      }>;
    };
    pullRequestReviewContributions: {
      nodes: Array<{
        occurredAt: string;
        pullRequestReview: {
          body: string;
          createdAt: string;
        } | null;
        repository: {
          owner: {
            login: string;
          };
        };
      }>;
    };
  };
  pullRequests: {
    nodes: Array<{
      number: number;
      title: string;
      bodyText: string;
      additions: number;
      deletions: number;
      mergedAt: string | null;
      merged: boolean;
      author: { login: string } | null;
      mergedBy: { login: string } | null;
      repository: { owner: { login: string } };
    }>;
  };
  pinnedItems: {
    nodes: Array<{ name: string }>;
  };
}

// ─── GraphQL query (batched: profile + calendar + PRs authored + PR reviews + org memberships + pinned) ─
const LIGHT_MODE_QUERY = `
  query LightFetch($login: String!) {
    user(login: $login) {
      bio
      company
      websiteUrl
      isHireable
      location
      createdAt
      organizations(first: 20) {
        nodes { login }
      }
      contributionsCollection {
        contributionCalendar {
          weeks {
            firstDay
            contributionDays { contributionCount }
          }
        }
        pullRequestReviewContributions(first: 30) {
          nodes {
            occurredAt
            pullRequestReview {
              body
              createdAt
            }
            repository {
              owner {
                login
              }
            }
          }
        }
      }
      pullRequests(first: 30, orderBy: { field: CREATED_AT, direction: DESC }, states: [MERGED, OPEN, CLOSED]) {
        nodes {
          number
          title
          bodyText
          additions
          deletions
          mergedAt
          merged
          author { login }
          mergedBy { login }
          repository { owner { login } }
        }
      }
      pinnedItems(first: 6, types: REPOSITORY) {
        nodes {
          ... on Repository { name }
        }
      }
    }
  }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Deduplicate email domains from push events */
function extractEmailDomains(events: any[]): string[] {
  const domains = new Set<string>();
  for (const event of events) {
    if (event.type !== 'PushEvent') continue;
    const commits: any[] = event.payload?.commits ?? [];
    for (const commit of commits) {
      const email: string | undefined = commit.author?.email;
      if (email && email.includes('@')) {
        domains.add(email.split('@')[1].toLowerCase());
      }
    }
  }
  return Array.from(domains);
}

/** Check if a repo has non-trivial candidate activity (not an unmodified fork) */
function isNonTrivialFork(repo: any, username: string): boolean {
  if (!repo.fork) return true; // owned originals always kept
  const pushedAt = new Date(repo.pushed_at).getTime();
  const createdAt = new Date(repo.created_at).getTime();
  return (
    pushedAt > createdAt && (repo.stargazers_count ?? 0) > 0 || (repo.topics?.length ?? 0) > 0
  );
}

/** Map raw hour from ISO timestamp (0–23) */
function hourFromIso(iso: string): number {
  return new Date(iso).getUTCHours();
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class LightFetcherService {
  private readonly logger = new Logger(LightFetcherService.name);

  constructor(
    private readonly rateLimitService: RateLimitService,
    private readonly configService: ConfigService,
  ) {}

  // ── Public entry point ──────────────────────────────────────────────────────

  async fetch(username: string): Promise<RawLightData> {
    const octokit = this.buildOctokit();

    // Phase 1 — parallel: GraphQL batch + REST repos + recent push events
    this.rateLimitService.checkBudget('graphql');
    this.rateLimitService.checkBudget('rest');

    const [gqlData, repos, events] = await Promise.all([
      this.fetchGraphQL(octokit, username),
      this.fetchRepos(octokit, username),
      this.fetchRecentEvents(octokit, username),
    ]);

    this.rateLimitService.consumeRequest('graphql', 1);
    this.rateLimitService.consumeRequest('rest', 2);

    // Phase 2 — sequential: commits + reviews (rate-limit sensitive)
    const topNonForkRepos = repos
      .filter((r) => !r.isFork)
      .sort((a, b) => b.starCount - a.starCount)
      .slice(0, 5);

    const [commitSample, signingRate] = await this.fetchCommitIntelligence(
      octokit,
      username,
      topNonForkRepos,
    );

    // Phase 3 — Group F aggregates
    const groupE = this.buildGroupE(repos);
    const groupF = this.buildGroupF(repos, gqlData);

    // ── Assemble ───────────────────────────────────────────────────────────────
    const groupA = this.buildGroupA(gqlData, events);
    const groupB: RawGroupB = { repos };
    const groupC = this.buildGroupC(gqlData, commitSample, signingRate);

    // Build Group D Pull Requests Authored
    const prsAuthored: RawGroupD['prsAuthored'] = gqlData.pullRequests.nodes.map((pr) => ({
      number: pr.number,
      title: pr.title,
      bodyWordCount: pr.bodyText.split(/\s+/).filter(Boolean).length,
      additions: pr.additions,
      deletions: pr.deletions,
      mergedAt: pr.mergedAt,
      wasSelfMerged:
        pr.merged &&
        pr.mergedBy?.login !== undefined &&
        pr.author?.login !== undefined &&
        pr.mergedBy.login === pr.author.login,
      repoOwner: pr.repository.owner.login,
    }));

    // Build Group D Pull Request Reviews Given from GraphQL data
    const reviewsGiven: RawGroupD['reviewsGiven'] = [];
    if (gqlData.contributionsCollection?.pullRequestReviewContributions?.nodes) {
      for (const node of gqlData.contributionsCollection.pullRequestReviewContributions.nodes) {
        const review = node.pullRequestReview;
        if (!review) continue;
        const body = review.body ?? '';
        reviewsGiven.push({
          body,
          wordCount: body.split(/\s+/).filter(Boolean).length,
          submittedAt: review.createdAt || node.occurredAt,
          prRepoOwner: node.repository.owner.login,
        });
      }
    }

    const groupD: RawGroupD = {
      prsAuthored,
      reviewsGiven,
      externalPRsMerged: prsAuthored.filter(
        (pr) => pr.repoOwner !== username && pr.mergedAt !== null,
      ).length,
      externalPRRepos: Array.from(
        new Set(
          prsAuthored
            .filter((pr) => pr.repoOwner !== username && pr.mergedAt !== null)
            .map((pr) => pr.repoOwner),
        ),
      ),
    };

    return { groupA, groupB, groupC, groupD, groupE, groupF };
  }

  // ── GraphQL ─────────────────────────────────────────────────────────────────

  private async fetchGraphQL(octokit: Octokit, username: string): Promise<GqlUser> {
    try {
      this.rateLimitService.checkBudget('graphql');
      const result: any = await octokit.graphql(LIGHT_MODE_QUERY, { login: username });
      if (!result?.user) {
        throw new Error(`GitHub user not found: ${username}`);
      }
      return result.user as GqlUser;
    } catch (err: any) {
      this.logger.error({ username, err: err.message }, 'graphql_fetch_failed');
      throw err;
    }
  }

  // ── REST: Repos ─────────────────────────────────────────────────────────────

  private async fetchRepos(
    octokit: Octokit,
    username: string,
  ): Promise<RawGroupB['repos']> {
    this.rateLimitService.checkBudget('rest');

    const res = await octokit.rest.repos.listForUser({
      username,
      sort: 'pushed',
      per_page: 100,
      headers: { accept: 'application/vnd.github.mercy-preview+json' }, // include topics
    });

    this.rateLimitService.consumeRequest('rest', 1);
    this.rateLimitService.updateRemaining(
      'rest',
      Number(res.headers?.['x-ratelimit-remaining'] ?? 5000),
    );

    const rawRepos = (res.data as any[]).filter((r) => isNonTrivialFork(r, username));

    // Limit to top 30 repos to match GithubAdapterService constraints and save rate limit budget
    const repos: RawGroupB['repos'] = await Promise.all(
      rawRepos.slice(0, 30).map(async (r): Promise<RawGroupB['repos'][number]> => {
        const hasReadme = await this.checkReadme(octokit, username, r.name);
        const fileTreeSample = await this.fetchRootFileTree(octokit, username, r.name);
        return {
          name: r.name,
          language: r.language ?? null,
          topics: r.topics ?? [],
          hasReadme,
          lastPushedAt: r.pushed_at,
          isFork: r.fork,
          isArchived: r.archived,
          homepageUrl: r.homepage ?? null,
          starCount: r.stargazers_count,
          forkCount: r.forks_count,
          createdAt: r.created_at,
          description: r.description ?? null,
          fileTreeSample,
        };
      }),
    );

    return repos;
  }

  /** HEAD check for README is extremely cheap (uses If-None-Match caching) */
  private async checkReadme(octokit: Octokit, owner: string, repo: string): Promise<boolean> {
    try {
      this.rateLimitService.checkBudget('rest');
      await octokit.rest.repos.getReadme({ owner, repo });
      this.rateLimitService.consumeRequest('rest', 1);
      return true;
    } catch {
      return false;
    }
  }

  /** Fetch root-level file/dir names for heuristic engineering-practice checks */
  private async fetchRootFileTree(octokit: Octokit, owner: string, repo: string): Promise<string[]> {
    try {
      this.rateLimitService.checkBudget('rest');
      const res = await octokit.rest.repos.getContent({ owner, repo, path: '' });
      this.rateLimitService.consumeRequest('rest', 1);
      const items = Array.isArray(res.data) ? res.data : [];
      return items.map((item: any) => item.name as string);
    } catch {
      return [];
    }
  }

  // ── REST: Events (commit email domains) ─────────────────────────────────────

  private async fetchRecentEvents(octokit: Octokit, username: string): Promise<any[]> {
    try {
      this.rateLimitService.checkBudget('rest');
      const res = await octokit.rest.activity.listPublicEventsForUser({
        username,
        per_page: 100,
      });
      this.rateLimitService.consumeRequest('rest', 1);
      this.rateLimitService.updateRemaining(
        'rest',
        Number(res.headers['x-ratelimit-remaining'] ?? 5000),
      );
      return res.data as any[];
    } catch {
      return [];
    }
  }

  // ── REST: Commit intelligence ────────────────────────────────────────────────

  /**
   * Returns [commitSample, signingRate].
   * Samples last 50 commits from the most-starred non-fork repo.
   * Checks commit signing across top-5 repos (20 commits each).
   */
  private async fetchCommitIntelligence(
    octokit: Octokit,
    username: string,
    topRepos: RawGroupB['repos'],
  ): Promise<[RawGroupC['commitSample'], number]> {
    if (topRepos.length === 0) return [[], 0];

    // Sample commits from top repo
    const primaryRepo = topRepos[0];
    const commitSample = await this.fetchCommitSample(octokit, username, primaryRepo.name, 50);

    // Signing rate across top-5 repos
    const signingRates: number[] = [];
    for (const repo of topRepos.slice(0, 5)) {
      try {
        this.rateLimitService.checkBudget('rest');
        const res = await octokit.rest.repos.listCommits({
          owner: username,
          repo: repo.name,
          per_page: 20,
        });
        this.rateLimitService.consumeRequest('rest', 1);
        const commits = res.data as any[];
        if (commits.length === 0) continue;
        const signed = commits.filter((c) => c.commit?.verification?.verified === true).length;
        signingRates.push(signed / commits.length);
      } catch {
        // Rate limit or 404 — skip repo
      }
    }

    const avgSigningRate =
      signingRates.length > 0
        ? signingRates.reduce((a, b) => a + b, 0) / signingRates.length
        : 0;

    return [commitSample, avgSigningRate];
  }

  private async fetchCommitSample(
    octokit: Octokit,
    owner: string,
    repo: string,
    count: number,
  ): Promise<RawGroupC['commitSample']> {
    try {
      this.rateLimitService.checkBudget('rest');
      const res = await octokit.rest.repos.listCommits({
        owner,
        repo,
        per_page: count,
      });
      this.rateLimitService.consumeRequest('rest', 1);
      const rawCommits = res.data as any[];

      return rawCommits.map((c): RawGroupC['commitSample'][number] => {
        const msg: string = c.commit?.message ?? '';
        const isMerge = msg.toLowerCase().startsWith('merge');
        const isDocOnly =
          !isMerge &&
          /^(docs|chore|fix docs|update readme)/i.test(msg);
        const isSigned = c.commit?.verification?.verified === true;
        return {
          sha: c.sha,
          message: msg.split('\n')[0].slice(0, 160), // first line only
          additions: c.stats?.additions ?? 0,
          deletions: c.stats?.deletions ?? 0,
          timestamp: c.commit?.author?.date ?? new Date().toISOString(),
          isMerge,
          isDocOnly,
          isSigned,
        };
      });
    } catch {
      return [];
    }
  }

  // ── Group builders ───────────────────────────────────────────────────────────

  private buildGroupE(repos: RawGroupB['repos']): RawGroupE {
    const ciConfigPresent = repos.some((repo) => this.includesAny(repo.fileTreeSample, ['.github', '.circleci', 'Jenkinsfile']));
    const testDirPresent = repos.some((repo) => this.includesAny(repo.fileTreeSample, ['test', 'tests', '__tests__', 'spec']));
    const dockerfilePresent = repos.some((repo) => this.includesAny(repo.fileTreeSample, ['Dockerfile', 'docker-compose.yml']));
    const iacPresent = repos.some((repo) => this.includesAny(repo.fileTreeSample, ['terraform', 'pulumi', 'cdk']));
    const lintConfigPresent = repos.some((repo) => this.includesAny(repo.fileTreeSample, ['.eslintrc', '.eslintrc.js', 'biome.json', '.golangci.yml']));
    const dependabotEnabled = repos.some((repo) => this.includesAny(repo.fileTreeSample, ['.github/dependabot.yml']));
    const hasSecurityMd = repos.some((repo) => this.includesAny(repo.fileTreeSample, ['SECURITY.md']));
    const aiConfigFiles = repos
      .flatMap((repo) => repo.fileTreeSample)
      .filter((file: string) => ['.cursorrules', 'CLAUDE.md', '.aider.conf.yml', '.github/copilot-instructions.md'].includes(file));

    return {
      ciConfigPresent,
      testDirPresent,
      dockerfilePresent,
      iacPresent,
      lintConfigPresent,
      semanticVersioningRate: 0,
      dependabotEnabled,
      hasSecurityMd,
      aiConfigFiles,
    } as RawGroupE;
  }

  private buildGroupA(gqlData: GqlUser, events: any[]): RawGroupA {
    const emailDomains = extractEmailDomains(events);
    const orgMemberships: RawGroupA['orgMemberships'] = gqlData.organizations.nodes.map((org) => ({
      org: org.login,
      role: 'member' as const,
    }));

    const accountCreatedAt = new Date(gqlData.createdAt);
    const monthsDiff = (new Date().getTime() - accountCreatedAt.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    const accountAgeMonths = Math.max(0, Math.floor(monthsDiff));

    return {
      bio: gqlData.bio,
      company: gqlData.company,
      blog: gqlData.websiteUrl,
      accountAgeMonths,
      hireable: gqlData.isHireable,
      commitEmailDomains: emailDomains,
      orgMemberships,
    };
  }

  private buildGroupC(
    gqlData: GqlUser,
    commitSample: RawGroupC['commitSample'],
    commitSigningRate: number,
  ): RawGroupC {
    // Weekly contributions from GraphQL calendar
    const weeklyContributions = gqlData.contributionsCollection.contributionCalendar.weeks
      .slice(-52)
      .map((w) => ({
        week: w.firstDay,
        total: w.contributionDays.reduce((s, d) => s + d.contributionCount, 0),
      }));

    // Work-hour distribution from commit timestamps
    const workHourDistribution: Record<string, number> = {};
    for (const commit of commitSample) {
      const hour = String(hourFromIso(commit.timestamp));
      workHourDistribution[hour] = (workHourDistribution[hour] ?? 0) + 1;
    }

    return {
      weeklyContributions,
      commitSample,
      workHourDistribution,
      commitSigningRate,
    };
  }

  private buildGroupF(
    repos: RawGroupB['repos'],
    gqlData: GqlUser,
  ): RawGroupF {
    const ownedNonForks = repos.filter((r) => !r.isFork);
    const totalStarsOwned = ownedNonForks.reduce((s, r) => s + r.starCount, 0);
    const totalForksOwned = ownedNonForks.reduce((s, r) => s + r.forkCount, 0);

    const activeWeeks = gqlData.contributionsCollection.contributionCalendar.weeks
      .filter((w) => w.contributionDays.some((d) => d.contributionCount > 0)).length;

    // Package registry presence is a flag only — actual download data fetched by ExternalSignalService
    const packageRegistryPresence: RawGroupF['packageRegistryPresence'] = [];
    for (const repo of ownedNonForks) {
      const topics = repo.topics ?? [];
      if (topics.includes('npm') || repo.fileTreeSample.includes('package.json')) {
        packageRegistryPresence.push({ registry: 'npm', packageName: repo.name });
      } else if (topics.includes('pypi') || repo.fileTreeSample.includes('setup.py') || repo.fileTreeSample.includes('pyproject.toml')) {
        packageRegistryPresence.push({ registry: 'pypi', packageName: repo.name });
      } else if (repo.fileTreeSample.includes('Cargo.toml')) {
        packageRegistryPresence.push({ registry: 'crates', packageName: repo.name });
      }
    }

    return {
      contributionCalendarWeeks: activeWeeks,
      totalStarsOwned,
      totalForksOwned,
      packageRegistryPresence,
    };
  }

  // ── Octokit factory ──────────────────────────────────────────────────────────

  private includesAny(arr: string[], targets: string[]): boolean {
    return targets.some((t) => arr.includes(t));
  }

  private buildOctokit(): Octokit {
    const token = this.configService.get<string>('GITHUB_SYSTEM_TOKEN');
    if (!token) {
      throw new Error('GITHUB_SYSTEM_TOKEN is not configured');
    }
    return new Octokit({
      request: {
        headers: {
          authorization: `token ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    });
  }
}