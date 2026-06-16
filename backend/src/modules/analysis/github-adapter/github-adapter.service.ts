import { Injectable, Inject, Logger } from '@nestjs/common';
import { Octokit } from 'octokit';
import Redis from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service';
import { decrypt } from '../../../shared/utils/crypto.utils';
import { SyncStatus } from '@prisma/client';
import {
  GitHubRawData,
  GitHubRepo,
  GitHubUserProfile,
  GitHubContributionData,
  GitHubExternalPRData,
  ManifestResult,
  OrgRepoSummary,
  OrgSummary,
  RepoSummary,
  StarredRepoSummary,
} from './github-data.types';
import { RateLimitGuard } from './rate-limit.guard';

const MAX_REPOS = 30;
const MAX_ORGS = 10;
const ORG_REPO_RECENCY_YEARS = 3;
const STARRED_REPOS_PER_PAGE = 30;
const MAX_STARRED_PAGES = 2;
const SYSTEM_RATE_LIMIT_COUNTER_PREFIX = 'ratelimit:github:system';

type ManifestContentResult = {
  content: string | null;
  skippedRateLimit: boolean;
};

@Injectable()
export class GithubAdapterService {
  private readonly logger = new Logger(GithubAdapterService.name);
  private readonly defaultManifestLimit = 10;
  private readonly defaultManifestDelayMs = 100;

  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS') private readonly redis: Redis,
  ) {}


  /**
   * Fetches the minimal audited data required for scoring.
   */
  async fetchRawData(
    octokit: Octokit,
    githubUsername: string,
    jobId?: string,
  ): Promise<GitHubRawData> {
    return this.withCache(`github:v4:raw:${githubUsername}`, async () => {
      const rateLimitGuard = new RateLimitGuard();

      // Batch 1: independent user-owned signals.
      const [profileData, repos, contributions] = await Promise.all([
        this.fetchProfile(octokit, githubUsername, jobId, rateLimitGuard),
        this.fetchRepos(octokit, githubUsername, jobId, rateLimitGuard),
        this.fetchGraphQLData(octokit, githubUsername, rateLimitGuard),
      ]);

      // Batch 2: public memberships and interactions, fetched after profile data.
      const [orgs, starredRepos] = await Promise.all([
        this.fetchOrgs(githubUsername, octokit, rateLimitGuard),
        this.fetchStarred(
          githubUsername,
          { pages: 1 },
          octokit,
          rateLimitGuard,
        ),
      ]);

      const manifestKeys = await this.fetchManifests(
        octokit,
        githubUsername,
        repos,
        jobId,
        rateLimitGuard,
      );
      const manifests = await this.fetchManifestsSequentialWithOctokit(
        octokit,
        repos.map((repo) => ({ ...repo, owner: githubUsername })),
        {
          limit: this.defaultManifestLimit,
          delayMs: this.defaultManifestDelayMs,
        },
        jobId,
        rateLimitGuard,
      );

      const externalPRs = await this.fetchExternalPRs(octokit, githubUsername);
      const orgRepos = await this.fetchOrgPublicReposSequential(
        orgs,
        octokit,
        githubUsername,
        rateLimitGuard,
      );

      return {
        profile: profileData,
        repos,
        contributions,
        externalPRs,
        orgs,
        orgRepos,
        starredRepos,
        manifestKeys,
        manifests,
        fetchedAt: new Date(),
      };
    });
  }

  private async fetchProfile(
    octokit: Octokit,
    username: string,
    jobId?: string,
    rateLimitGuard?: RateLimitGuard,
  ): Promise<GitHubUserProfile> {
    let res: any;
    try {
      res = await this.withRetry(
        () => octokit.rest.users.getByUsername({ username }),
        2,
        () => this.trackSystemTokenCall(octokit),
      );
    } catch (err: any) {
      if (this.isRateLimitError(err)) {
        this.logger.warn({
          event: 'github_profile_skipped',
          username,
          reason: 'rate_limit',
        });
        return {
          username,
          accountCreatedAt: new Date(),
          accountAge: 0,
          publicRepos: 0,
          followers: 0,
        };
      }
      throw err;
    }
    rateLimitGuard?.updateFromHeaders((res as any).headers ?? {});
    this.logRateLimit(res, 'users.getByUsername', jobId);
    const data = res.data;

    const accountCreatedAt = new Date(data.created_at);
    const monthsDiff =
      (new Date().getTime() - accountCreatedAt.getTime()) /
      (1000 * 60 * 60 * 24 * 30.44);

    return {
      username: data.login,
      accountCreatedAt: new Date(data.created_at),
      accountAge: Math.floor(monthsDiff),
      publicRepos: data.public_repos,
      followers: data.followers,
    };
  }

  private async fetchRepos(
    octokit: Octokit,
    username: string,
    jobId?: string,
    rateLimitGuard?: RateLimitGuard,
  ): Promise<GitHubRepo[]> {
    let res: any;
    try {
      res = await this.withRetry(
        () =>
          octokit.rest.repos.listForUser({
            username,
            sort: 'pushed',
            per_page: 100, // We fetch 100 but only take MAX_REPOS
            headers: {
              accept: 'application/vnd.github.mercy-preview+json',
            },
          }),
        2,
        () => this.trackSystemTokenCall(octokit),
      );
    } catch (err: any) {
      if (this.isRateLimitError(err)) {
        this.logger.warn({
          event: 'github_repos_skipped',
          username,
          reason: 'rate_limit',
        });
        return [];
      }
      throw err;
    }
    rateLimitGuard?.updateFromHeaders((res as any).headers ?? {});
    this.logRateLimit(res, 'repos.listForUser', jobId);

    const rawRepos = res.data as any[];
    return rawRepos.slice(0, MAX_REPOS).map((r) => ({
      name: r.name,
      owner: username,
      language: r.language,
      stars: r.stargazers_count,
      forks: r.forks_count,
      topics: r.topics || [],
      createdAt: new Date(r.created_at),
      pushedAt: new Date(r.pushed_at),
      isFork: r.fork,
      description: r.description,
    }));
  }

  async fetchOrgs(
    username: string,
// octokit: Octokit = new Octokit(),
    octokit: Octokit,
        rateLimitGuard?: RateLimitGuard,
  ): Promise<OrgSummary[]> {
    try {
      const res = await this.withRetry(
        () =>
          octokit.request('GET /users/{username}/orgs', {
            username,
            per_page: MAX_ORGS,
          }),
        2,
        () => this.trackSystemTokenCall(octokit),
      );
      rateLimitGuard?.updateFromHeaders((res as any).headers ?? {});

      return ((res as any).data || []).slice(0, MAX_ORGS).map((org: any) => ({
        login: org.login,
        description: org.description || '',
        publicRepos: org.public_repos || 0,
      }));
    } catch (err: any) {
      if (this.isRateLimitError(err) || err.status === 404) {
        this.logger.warn({
          event: 'github_orgs_skipped',
          username,
          reason: err.status === 404 ? 'not_found' : 'rate_limit',
        });
        return [];
      }
      throw err;
    }
  }

  async fetchOrgPublicRepos(
    orgLogin: string,
// octokit: Octokit = new Octokit(),
    octokit: Octokit,
        rateLimitGuard?: RateLimitGuard,
    username?: string,
  ): Promise<OrgRepoSummary[]> {
    if (rateLimitGuard?.shouldAbort(50)) {
      const status = rateLimitGuard.getStatus();
      this.logger.warn({
        event: 'github_ratelimit_low',
        remaining: status.remaining,
        resetAt: status.resetAt.toISOString(),
        username,
      });
      return [];
    }

    try {
      const res = await this.withRetry(
        () =>
          octokit.rest.repos.listForOrg({
            org: orgLogin,
            type: 'public',
            sort: 'pushed',
            per_page: 30,
          }),
        2,
        () => this.trackSystemTokenCall(octokit),
      );
      rateLimitGuard?.updateFromHeaders((res as any).headers ?? {});
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - ORG_REPO_RECENCY_YEARS);

      return ((res as any).data || [])
        .filter((repo: any) => {
          if (!repo.pushed_at) return false;
          return new Date(repo.pushed_at).getTime() >= cutoff.getTime();
        })
        .map((repo: any) => ({
          name: repo.name,
          pushedAt: repo.pushed_at,
          language: repo.language || null,
        }));
    } catch (err: any) {
      if (err.status === 403 || err.status === 404 || err.status === 429) {
        this.logger.warn(
          { orgLogin, err: err.status },
          'org_public_repos_fetch_skipped',
        );
        return [];
      }

      throw err;
    }
  }

  async fetchStarred(
    username: string,
    options: { pages?: number } = { pages: 1 },
    // octokit: Octokit = new Octokit(),
    octokit: Octokit,
    rateLimitGuard?: RateLimitGuard,
  ): Promise<StarredRepoSummary[]> {
    const pages = Math.max(1, Math.min(options.pages ?? 1, MAX_STARRED_PAGES));
    const starredRepos: StarredRepoSummary[] = [];

    for (let page = 1; page <= pages; page++) {
      try {
        const res = await this.withRetry(
          () =>
            octokit.request('GET /users/{username}/starred', {
              username,
              per_page: STARRED_REPOS_PER_PAGE,
              page,
              headers: {
                accept: 'application/vnd.github.mercy-preview+json',
              },
            }),
          2,
          () => this.trackSystemTokenCall(octokit),
        );
        rateLimitGuard?.updateFromHeaders((res as any).headers ?? {});
        const repos = ((res as any).data || []) as any[];

        if (repos.length === 0) {
          break;
        }

        starredRepos.push(
          ...repos.map((repo) => ({
            language: repo.language || null,
            topics: Array.isArray(repo.topics) ? repo.topics : [],
          })),
        );
      } catch (err: any) {
        if (err.status === 403 || err.status === 404 || err.status === 429) {
          return [];
        }

        throw err;
      }
    }

    return starredRepos;
  }

  private async fetchOrgPublicReposSequential(
    orgs: OrgSummary[],
    octokit: Octokit,
    username?: string,
    rateLimitGuard?: RateLimitGuard,
  ): Promise<Record<string, OrgRepoSummary[]>> {
    const results: Record<string, OrgRepoSummary[]> = {};

    for (let i = 0; i < orgs.length; i++) {
      const org = orgs[i];
      results[org.login] = await this.fetchOrgPublicRepos(
        org.login,
        octokit,
        rateLimitGuard,
        username,
      );

      if (i < orgs.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  private async fetchGraphQLData(
    octokit: Octokit,
    username: string,
    rateLimitGuard?: RateLimitGuard,
  ): Promise<GitHubContributionData> {
    const query = `
      query($login: String!) {
        user(login: $login) {
          contributionsCollection {
            contributionCalendar {
              weeks {
                contributionDays {
                  contributionCount
                }
              }
            }
          }
        }
      }
    `;

    let result: any;
    try {
      result = await this.withRetry(
        () =>
          octokit.graphql(query, {
            login: username,
          }),
        2,
        () => this.trackSystemTokenCall(octokit),
      );
      rateLimitGuard?.updateFromHeaders((result as any).headers ?? {});
    } catch (err: any) {
      if (this.isRateLimitError(err)) {
        this.logger.warn({
          event: 'github_contributions_skipped',
          username,
          reason: 'rate_limit',
        });
        return {
          weeklyTotals: Array(52).fill(0),
          activeWeeksCount: 0,
        };
      }
      throw err;
    }

    const user = result.user;

    // Process Contributions
    const weeklyTotals: number[] = (
      user.contributionsCollection.contributionCalendar.weeks || []
    )
      .map((week: any) =>
        week.contributionDays.reduce(
          (sum: number, day: any) => sum + day.contributionCount,
          0,
        ),
      )
      .slice(-52); // Ensure exactly 52 weeks

    // Pad if fewer than 52 weeks returned
    while (weeklyTotals.length < 52) {
      weeklyTotals.unshift(0);
    }

    const activeWeeksCount = weeklyTotals.filter((total) => total > 0).length;

    return {
      weeklyTotals,
      activeWeeksCount,
    };
  }

  private async fetchExternalPRsFromApi(
    octokit: Octokit,
    username: string,
  ): Promise<{ repo: string; merged: boolean }[]> {
    const MAX_RETRIES = 2;
    let attempt = 0;

    while (attempt <= MAX_RETRIES) {
      try {
        await this.trackSystemTokenCall(octokit);
        const result = await octokit.rest.search.issuesAndPullRequests({
          q: `type:pr author:${username} is:merged -user:${username}`,
          per_page: 50,
          sort: 'created',
          order: 'desc',
        });
        return result.data.items.map((pr) => ({
          repo: pr.repository_url.replace('https://api.github.com/repos/', ''),
          merged: true,
        }));
      } catch (err: any) {
        const retryAfterSeconds = this.getRetryAfterSeconds(err);
        if (
          this.isRateLimitError(err) &&
          retryAfterSeconds !== null &&
          retryAfterSeconds < 30 &&
          attempt < 1
        ) {
          await new Promise((resolve) =>
            setTimeout(resolve, retryAfterSeconds * 1000),
          );
          attempt++;
          continue;
        }

        if (
          err.status === 403 &&
          err.response?.headers?.['x-ratelimit-remaining'] === '0'
        ) {
          // Search API rate limit specifically
          const resetMs =
            Number(err.response.headers['x-ratelimit-reset']) * 1000;
          const waitMs = Math.min(resetMs - Date.now() + 1000, 65000); // max 65s wait

          this.logger.warn(
            {
              username,
              waitMs,
              attempt,
            },
            'github_search_rate_limited',
          );

          if (attempt < MAX_RETRIES) {
            await new Promise((resolve) => setTimeout(resolve, waitMs));
            attempt++;
            continue;
          }
        }
        // Non-rate-limit error OR retries exhausted:
        // Return empty array, external PRs are signal, not required
        this.logger.warn(
          { username, err: err.status },
          'external_pr_fetch_failed',
        );
        return [];
      }
    }
    return [];
  }

  private async fetchExternalPRs(
    octokit: Octokit,
    username: string,
  ): Promise<GitHubExternalPRData> {
    const prCacheKey = `github:prs:${username}`;
    let prs: { repo: string; merged: boolean }[] = [];

    const cached = await this.redis.get(prCacheKey);
    if (cached) {
      prs = JSON.parse(cached);
    } else {
      prs = await this.fetchExternalPRsFromApi(octokit, username);
      await this.redis.set(prCacheKey, JSON.stringify(prs), 'EX', 1800);
    }

    return {
      mergedExternalPRCount: prs.length,
      externalRepoNames: Array.from(new Set(prs.map((pr) => pr.repo))),
    };
  }

  public decryptToken(encryptedToken: string): string {
    // console.log(
    //   `Decrypting token, length: ${encryptedToken.length}, startsWith v1: ${encryptedToken.startsWith('v1:')}`,
    // );
    const key = process.env.AUTH_ENCRYPTION_KEY;
    if (!key) throw new Error('AUTH_ENCRYPTION_KEY not set');

    const data = encryptedToken.startsWith('v1:')
      ? encryptedToken.substring(3)
      : encryptedToken;

    const decripted = decrypt(data, key);
    // console.log(`Decrypted token, length: ${decripted.length}`);
    return decripted;
  }

  private async withCache<T>(
    key: string,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.redis.get(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Revive dates if necessary (simplified here, but works for plain data)
      return parsed;
    }
    const result = await fetcher();
    await this.redis.set(key, JSON.stringify(result), 'EX', 24 * 60 * 60);
    return result;
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    attempts = 2,
    beforeAttempt?: () => Promise<void>,
  ): Promise<T> {
    try {
      await beforeAttempt?.();
      return await fn();
    } catch (error: any) {
      const retryAfterSeconds = this.getRetryAfterSeconds(error);

      if (
        attempts > 1 &&
        this.isRateLimitError(error) &&
        retryAfterSeconds !== null &&
        retryAfterSeconds < 30
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, retryAfterSeconds * 1000),
        );
        return this.withRetry(fn, attempts - 1, beforeAttempt);
      }

      throw error;
    }
  }

  private isRateLimitError(error: any): boolean {
    const status = error?.status || error?.response?.status;
    return status === 429 || status === 403;
  }

  private getRetryAfterSeconds(error: any): number | null {
    const retryAfter =
      error?.response?.headers?.['retry-after'] ??
      error?.response?.headers?.['Retry-After'];

    if (retryAfter === undefined) return null;

    const seconds = Number(retryAfter);
    return Number.isNaN(seconds) ? null : seconds;
  }

  private async trackSystemTokenCall(octokit: Octokit): Promise<void> {
    if ((octokit as any).__githubTokenSource !== 'system') {
      return;
    }

    const now = new Date();
    const key =
      `${SYSTEM_RATE_LIMIT_COUNTER_PREFIX}:` +
      `${now.getUTCFullYear()}` +
      `${String(now.getUTCMonth() + 1).padStart(2, '0')}` +
      `${String(now.getUTCDate()).padStart(2, '0')}` +
      `${String(now.getUTCHours()).padStart(2, '0')}` +
      `${String(now.getUTCMinutes()).padStart(2, '0')}`;

    await this.redis.incr(key);
    await this.redis.expire(key, 120);
  }

  private parsePackageJsonKeys(content: string): string[] {
    try {
      const parsed = JSON.parse(content);
      return Object.keys(parsed.dependencies || {}).concat(
        Object.keys(parsed.devDependencies || {}),
      );
    } catch (e) {
      return [];
    }
  }

  private parseCargoTomlKeys(content: string): string[] {
    const dependenciesSection = content.match(
      /^\[dependencies\]([\s\S]*?)(?=\n\[|(?![\s\S]))/m,
    );

    if (!dependenciesSection) return [];

    return dependenciesSection[1]
      .split('\n')
      .map((line) => line.replace(/#.*/, '').trim())
      .filter(Boolean)
      .map((line) => line.match(/^"?([A-Za-z0-9_.:-]+)"?\s*=/)?.[1])
      .filter((key): key is string => Boolean(key));
  }

  async fetchManifestsSequential(
    repos: RepoSummary[],
    options: { limit?: number; delayMs?: number } = {},
  ): Promise<ManifestResult[]> {
    return this.fetchManifestsSequentialWithOctokit(
      new Octokit(),
      repos,
      options,
    );
  }

  private async fetchManifestsSequentialWithOctokit(
    octokit: Octokit,
    repos: RepoSummary[],
    options: { limit?: number; delayMs?: number } = {},
    jobId?: string,
    rateLimitGuard: RateLimitGuard = new RateLimitGuard(),
  ): Promise<ManifestResult[]> {
    const limit = options.limit ?? this.defaultManifestLimit;
    const delayMs = options.delayMs ?? this.defaultManifestDelayMs;
    const results: ManifestResult[] = [];
    const reposToFetch = [...repos]
      .sort((a, b) => {
        if (a.isFork !== b.isFork) return a.isFork ? 1 : -1;
        return (b.stars ?? 0) - (a.stars ?? 0);
      })
      .slice(0, limit);

    for (let i = 0; i < reposToFetch.length; i++) {
      const repo = reposToFetch[i];

      try {
        if (rateLimitGuard.shouldAbort(50)) {
          this.logRateLimitLow(rateLimitGuard, repo.owner);
          break;
        }

        const packageContent = await this.fetchManifestContent(
          octokit,
          repo.owner,
          repo.name,
          'package.json',
          jobId,
          rateLimitGuard,
        );

        if (packageContent.skippedRateLimit) {
          this.logger.log({
            event: 'github_manifest_skipped',
            repo: repo.name,
            reason: 'rate_limit',
          });
          break;
        }

        if (packageContent.content !== null) {
          results.push({
            repo: repo.name,
            deps: this.parsePackageJsonKeys(packageContent.content),
            type: 'npm',
          });
        } else {
          if (rateLimitGuard.shouldAbort(50)) {
            this.logRateLimitLow(rateLimitGuard, repo.owner);
            break;
          }

          const cargoContent = await this.fetchManifestContent(
            octokit,
            repo.owner,
            repo.name,
            'Cargo.toml',
            jobId,
            rateLimitGuard,
          );

          if (cargoContent.skippedRateLimit) {
            this.logger.log({
              event: 'github_manifest_skipped',
              repo: repo.name,
              reason: 'rate_limit',
            });
            break;
          }

          if (cargoContent.content !== null) {
            results.push({
              repo: repo.name,
              deps: this.parseCargoTomlKeys(cargoContent.content),
              type: 'cargo',
            });
          }
        }
      } catch (err: any) {
        if (err.status === 403 || err.status === 429) {
          this.logger.warn(
            {
              event: 'github_ratelimit_low',
              repo: repo.name,
              remaining: err.response?.headers?.['x-ratelimit-remaining'],
              status: err.status,
              jobId,
            },
            'manifest_fetch_rate_limited_stopping',
          );
          break;
        }

        this.logger.debug(
          { repo: repo.name, err: err.status, jobId },
          'manifest_fetch_skipped',
        );
      }

      if (delayMs > 0 && i < reposToFetch.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }

  private async fetchManifestContent(
    octokit: Octokit,
    owner: string,
    repo: string,
    filename: 'package.json' | 'Cargo.toml',
    jobId?: string,
    rateLimitGuard?: RateLimitGuard,
  ): Promise<ManifestContentResult> {
    try {
      await this.trackSystemTokenCall(octokit);
      const response = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: filename,
      });
      rateLimitGuard?.updateFromHeaders((response as any).headers ?? {});
      this.logRateLimit(response, `repos.getContent:${filename}`, jobId);

      if (
        !Array.isArray(response.data) &&
        response.data.type === 'file' &&
        'content' in response.data &&
        response.data.content
      ) {
        return {
          content: Buffer.from(response.data.content, 'base64').toString(
            'utf8',
          ),
          skippedRateLimit: false,
        };
      }

      return { content: null, skippedRateLimit: false };
    } catch (err: any) {
      if (err.status === 404) return { content: null, skippedRateLimit: false };
      if (this.isRateLimitError(err)) {
        const retryAfterSeconds = this.getRetryAfterSeconds(err);
        if (retryAfterSeconds !== null && retryAfterSeconds < 30) {
          await new Promise((resolve) =>
            setTimeout(resolve, retryAfterSeconds * 1000),
          );
          try {
            await this.trackSystemTokenCall(octokit);
            const response = await octokit.rest.repos.getContent({
              owner,
              repo,
              path: filename,
            });
            rateLimitGuard?.updateFromHeaders((response as any).headers ?? {});
            this.logRateLimit(response, `repos.getContent:${filename}`, jobId);

            if (
              !Array.isArray(response.data) &&
              response.data.type === 'file' &&
              'content' in response.data &&
              response.data.content
            ) {
              return {
                content: Buffer.from(response.data.content, 'base64').toString(
                  'utf8',
                ),
                skippedRateLimit: false,
              };
            }

            return { content: null, skippedRateLimit: false };
          } catch (retryErr: any) {
            if (this.isRateLimitError(retryErr)) {
              return { content: null, skippedRateLimit: true };
            }
            throw retryErr;
          }
        }

        return { content: null, skippedRateLimit: true };
      }
      throw err;
    }
  }

  private async fetchManifest(
    octokit: Octokit,
    owner: string,
    repo: string,
    filename: 'package.json' | 'Cargo.toml',
    jobId?: string,
  ): Promise<string[] | null> {
    const cacheKey = `github:manifest:${owner}:${repo}:${filename}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached !== null) {
        const parsed = JSON.parse(cached);
        return parsed.length === 0 ? null : parsed;
      }
    } catch {}

    try {
      await this.trackSystemTokenCall(octokit);
      const response = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: filename,
      });
      this.logRateLimit(response, `repos.getContent:${filename}`, jobId);

      if (
        !Array.isArray(response.data) &&
        response.data.type === 'file' &&
        response.data.content
      ) {
        const contentStr = Buffer.from(
          response.data.content,
          'base64',
        ).toString('utf8');

        const depKeys =
          filename === 'package.json'
            ? this.parsePackageJsonKeys(contentStr)
            : this.parseCargoTomlKeys(contentStr);

        await this.redis.set(cacheKey, JSON.stringify(depKeys), 'EX', 172800);
        return depKeys;
      }
      return null;
    } catch (err: any) {
      if (err.status === 404) {
        await this.redis.set(cacheKey, JSON.stringify([]), 'EX', 21600);
        return null;
      }
      if (this.isRateLimitError(err)) {
        const retryAfterSeconds = this.getRetryAfterSeconds(err);
        if (retryAfterSeconds !== null && retryAfterSeconds < 30) {
          await new Promise((resolve) =>
            setTimeout(resolve, retryAfterSeconds * 1000),
          );
          try {
            await this.trackSystemTokenCall(octokit);
            const response = await octokit.rest.repos.getContent({
              owner,
              repo,
              path: filename,
            });
            this.logRateLimit(response, `repos.getContent:${filename}`, jobId);

            if (
              !Array.isArray(response.data) &&
              response.data.type === 'file' &&
              response.data.content
            ) {
              const contentStr = Buffer.from(
                response.data.content,
                'base64',
              ).toString('utf8');

              const depKeys =
                filename === 'package.json'
                  ? this.parsePackageJsonKeys(contentStr)
                  : this.parseCargoTomlKeys(contentStr);

              await this.redis.set(
                cacheKey,
                JSON.stringify(depKeys),
                'EX',
                172800,
              );
              return depKeys;
            }
          } catch (retryErr: any) {
            if (!this.isRateLimitError(retryErr)) {
              throw retryErr;
            }
          }
        }

        this.logger.log({
          event: 'github_manifest_skipped',
          repo,
          reason: 'rate_limit',
        });
        return null;
      }
      throw err;
    }
  }

  private async fetchManifests(
    octokit: Octokit,
    username: string,
    repos: GitHubRepo[],
    jobId?: string,
    rateLimitGuard?: RateLimitGuard,
  ): Promise<Record<string, string[]>> {
    const manifestKeys: Record<string, string[]> = {};
    const reposToScan = repos
      .filter((r) => !r.isFork)
      .sort((a, b) => b.stars - a.stars)
      .slice(0, 10);

    for (const repo of reposToScan) {
      try {
        if (rateLimitGuard?.shouldAbort(50)) {
          this.logRateLimitLow(rateLimitGuard, username);
          break;
        }

        const pkgKeys = await this.fetchManifest(
          octokit,
          username,
          repo.name,
          'package.json',
          jobId,
        );
        const cargoKeys = await this.fetchManifest(
          octokit,
          username,
          repo.name,
          'Cargo.toml',
          jobId,
        );

        if (pkgKeys) {
          manifestKeys[repo.name] = [
            ...(manifestKeys[repo.name] ?? []),
            ...pkgKeys,
          ];
        }
        if (rateLimitGuard?.shouldAbort(50)) {
          this.logRateLimitLow(rateLimitGuard, username);
          break;
        }
        if (cargoKeys) {
          manifestKeys[repo.name] = [
            ...(manifestKeys[repo.name] ?? []),
            ...cargoKeys,
          ];
        }
      } catch (err: any) {
        if (err.status === 403 || err.status === 429) {
          this.logger.warn(
            {
              event: 'github_ratelimit_low',
              repo: repo.name,
              username,
            },
            'manifest_fetch_rate_limited_stopping',
          );
          break;
        }
        this.logger.debug(
          { repo: repo.name, err: err.status },
          'manifest_fetch_skipped',
        );
      }
    }

    return manifestKeys;
  }

  async getRateLimitRemaining(octokit: Octokit): Promise<number> {
    await this.trackSystemTokenCall(octokit);
    const r = await octokit.rest.rateLimit.get();
    return r.data.rate.remaining;
  }

  private logRateLimitLow(rateLimitGuard: RateLimitGuard, username?: string) {
    const status = rateLimitGuard.getStatus();
    this.logger.warn({
      event: 'github_ratelimit_low',
      remaining: status.remaining,
      resetAt: status.resetAt.toISOString(),
      username,
    });
    this.logger.warn('Manifest fetch aborted, low rate limit');
  }

  private logRateLimit(response: any, endpoint: string, jobId?: string) {
    if (!response || !response.headers) return;
    const remaining = response.headers['x-ratelimit-remaining'];
    const limit = response.headers['x-ratelimit-limit'];
    const reset = response.headers['x-ratelimit-reset'];
    const resetAt = reset
      ? new Date(Number(reset) * 1000).toISOString()
      : undefined;
    const tokenHint = response.headers['x-oauth-scopes']
      ? 'oauth-token'
      : response.headers['x-ratelimit-limit'] === '60'
        ? 'unauthenticated'
        : 'pat-or-system-token';

    this.logger.debug(
      {
        endpoint,
        remaining: Number(remaining),
        limit: Number(limit),
        resetAt,
        tokenType: tokenHint,
        jobId,
      },
      'github_api_call',
    );

    if (Number(remaining) < 100) {
      this.logger.warn(
        {
          remaining: Number(remaining),
          resetAt,
          jobId,
        },
        'github_rate_limit_low',
      );
    }
  }
}
