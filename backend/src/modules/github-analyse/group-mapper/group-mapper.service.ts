import { Injectable } from '@nestjs/common';
import { PrimitiveInputMap, RawGroupA, RawGroupB, RawGroupC, RawGroupD, RawGroupE, RawGroupF } from '../../../types/primitives.types';

/**
 * Shape of the raw data collected from Octokit / GitHub API calls.
 */
export interface OctokitRawResponse {
  userProfile: any; // GET /users/:username response
  repos: any[]; // GET /users/:username/repos response items
  contributions: any; // GraphQL contributionsCollection response
  pullRequests: any[]; // GraphQL pullRequests nodes
  reviews: any[]; // GraphQL pullRequestReviews nodes
  orgMemberships: any[]; // GraphQL organizations nodes
  commitSamples: Record<string, any[]>; // repoName -> commits array
}

/**
 * Pure transformation service – no external calls, no side‑effects.
 * Maps the raw Octokit payload into the strongly‑typed primitive groups.
 */
@Injectable()
export class GroupMapperService {
  /**
   * Main entry point.
   * @param githubUsername the username of the candidate (needed for external PR detection)
   * @param raw the aggregated Octokit responses
   */
  map(githubUsername: string, raw: OctokitRawResponse): PrimitiveInputMap {
    const groupA = this.buildGroupA(raw);
    const groupB = this.buildGroupB(raw);
    const groupC = this.buildGroupC(raw);
    const groupD = this.buildGroupD(githubUsername, raw);
    const groupE = this.buildGroupE(raw);
    const groupF = this.buildGroupF(groupB, groupC);

    return { p1: { groupC, groupE }, p2: { groupB, groupC }, p3: { groupD, seniorityTarget: 'senior' as any }, p4: { groupB, groupC, groupD, groupF }, p5: { groupE, groupB }, p6: { groupB, groupC }, p7: { groupA, groupG: { commitInflationRate: null, forkDumpRate: null, burstRatio: null, launderingFlagged: false, credentialLeakDetected: false }, employmentRungs: [] } };
  }

  // ---------------------------------------------------------------------
  // Group A – Identity & Profile
  // ---------------------------------------------------------------------
  private buildGroupA(raw: OctokitRawResponse): RawGroupA {
    const profile = raw.userProfile || {};
    const accountCreated = new Date(profile.created_at || Date.now());
    const now = new Date();
    const monthsDiff = (now.getTime() - accountCreated.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    const accountAgeMonths = Math.max(0, Math.floor(monthsDiff));

    // extract commit email domains from all commit samples
    const domains = new Set<string>();
    Object.values(raw.commitSamples).forEach((commits) => {
      (commits || []).forEach((c) => {
        const email = c?.commit?.author?.email;
        if (email && typeof email === 'string' && email.includes('@')) {
          domains.add(email.split('@')[1].toLowerCase());
        }
      });
    });

    const orgMemberships = (raw.orgMemberships || []).map((o) => ({
      org: o.login,
      role: o.viewerIsAMember ? 'member' : 'owner',
    }));

    const company = typeof profile.company === 'string' ? profile.company.replace(/^@/, '') : null;

    return {
      bio: profile.bio ?? null,
      company,
      blog: profile.blog ?? null,
      accountAgeMonths,
      hireable: profile.hireable ?? null,
      commitEmailDomains: Array.from(domains),
      orgMemberships,
    } as RawGroupA;
  }

  // ---------------------------------------------------------------------
  // Group B – Repository Inventory
  // ---------------------------------------------------------------------
  private buildGroupB(raw: OctokitRawResponse): RawGroupB {
    return {
      repos: (raw.repos || []).map((repo) => ({
        name: repo.name,
        language: repo.language ?? null,
        topics: repo.topics ?? [],
        hasReadme: !!repo.has_readme,
        lastPushedAt: repo.pushed_at,
        isFork: !!repo.fork,
        isArchived: !!repo.archived,
        homepageUrl: repo.homepage || null,
        starCount: repo.stargazers_count ?? 0,
        forkCount: repo.forks_count ?? 0,
        createdAt: repo.created_at,
        description: repo.description ?? null,
        fileTreeSample: [], // populated later by deeper analysis
      })),
    } as RawGroupB;
  }

  // ---------------------------------------------------------------------
  // Group C – Commit Intelligence
  // ---------------------------------------------------------------------
  private buildGroupC(raw: OctokitRawResponse): RawGroupC {
    // Weekly contributions
    const weeks = (raw.contributions?.contributionCalendar?.weeks ?? []).map((w: any) => ({
      week: w.firstDay,
      total: (w.contributionDays || []).reduce((s: number, d: any) => s + d.contributionCount, 0),
    }));

    // Flatten commit samples
    const allCommits: any[] = [];
    Object.values(raw.commitSamples).forEach((list) => {
      (list || []).forEach((c) => allCommits.push(c));
    });

    const commitSample = allCommits.map((c) => {
      const isMerge = Array.isArray(c.parents) && c.parents.length > 1;
      const files = c.files || [];
      const isDocOnly = files.length > 0 ? files.every((f: any) => /\.(md|txt|rst|mdx)$/i.test(f.filename)) : false;
      const isSigned = !!c.commit?.verification?.verified;
      return {
        sha: c.sha,
        message: (c.commit?.message || '').split('\n')[0].slice(0, 160),
        additions: c.stats?.additions ?? 0,
        deletions: c.stats?.deletions ?? 0,
        timestamp: c.commit?.author?.date ?? new Date().toISOString(),
        isMerge,
        isDocOnly,
        isSigned,
      };
    });

    // Work hour distribution
    const workHourDistribution: Record<string, number> = {};
    commitSample.forEach((c) => {
      const hour = new Date(c.timestamp).getUTCHours().toString();
      workHourDistribution[hour] = (workHourDistribution[hour] ?? 0) + 1;
    });

    const commitSigningRate = commitSample.length > 0 ? commitSample.filter((c) => c.isSigned).length / commitSample.length : 0;

    return {
      weeklyContributions: weeks,
      commitSample,
      workHourDistribution,
      commitSigningRate,
    } as RawGroupC;
  }

  // ---------------------------------------------------------------------
  // Group D – Collaboration & Review
  // ---------------------------------------------------------------------
  private buildGroupD(githubUsername: string, raw: OctokitRawResponse): RawGroupD {
    const prsAuthored = (raw.pullRequests || []).map((pr) => ({
      number: pr.number,
      title: pr.title,
      bodyWordCount: (pr.body || '').split(/\s+/).filter(Boolean).length,
      additions: pr.additions ?? 0,
      deletions: pr.deletions ?? 0,
      mergedAt: pr.mergedAt ?? null,
      wasSelfMerged: pr.mergedBy?.login === pr.author?.login,
      repoOwner: pr.repository?.owner?.login ?? '',
    }));

    const reviewsGiven = (raw.reviews || []).map((rev) => ({
      body: rev.body ?? '',
      wordCount: (rev.body || '').split(/\s+/).filter(Boolean).length,
      submittedAt: rev.submittedAt,
      prRepoOwner: rev.pullRequest?.repository?.owner?.login ?? '',
    }));

    const externalPRsMerged = prsAuthored.filter((pr) => pr.repoOwner && pr.repoOwner.toLowerCase() !== githubUsername.toLowerCase() && !!pr.mergedAt).length;
    const externalPRReposSet = new Set<string>();
    prsAuthored.forEach((pr) => {
      if (pr.repoOwner && pr.repoOwner.toLowerCase() !== githubUsername.toLowerCase()) {
        externalPRReposSet.add(pr.repoOwner);
      }
    });

    return {
      prsAuthored,
      reviewsGiven,
      externalPRsMerged,
      externalPRRepos: Array.from(externalPRReposSet),
    } as RawGroupD;
  }

  // ---------------------------------------------------------------------
  // Group E – Engineering Practices (Light Mode heuristics)
  // ---------------------------------------------------------------------
  private buildGroupE(raw: OctokitRawResponse): RawGroupE {
    const ciConfigPresent = raw.repos.some((repo) => this.includesAny(repo.fileTreeSample, ['.github', '.circleci', 'Jenkinsfile']));
    const testDirPresent = raw.repos.some((repo) => this.includesAny(repo.fileTreeSample, ['test', 'tests', '__tests__', 'spec']));
    const dockerfilePresent = raw.repos.some((repo) => this.includesAny(repo.fileTreeSample, ['Dockerfile', 'docker-compose.yml']));
    const iacPresent = raw.repos.some((repo) => this.includesAny(repo.fileTreeSample, ['terraform', 'pulumi', 'cdk']));
    const lintConfigPresent = raw.repos.some((repo) => this.includesAny(repo.fileTreeSample, ['.eslintrc', '.eslintrc.js', 'biome.json', '.golangci.yml']));
    const dependabotEnabled = raw.repos.some((repo) => this.includesAny(repo.fileTreeSample, ['.github/dependabot.yml']));
    const hasSecurityMd = raw.repos.some((repo) => this.includesAny(repo.fileTreeSample, ['SECURITY.md']));
    const aiConfigFiles = raw.repos
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

  private includesAny(sample: string[], needles: string[]): boolean {
    return (sample || []).some((item) => needles.some((n) => item.includes(n)));
  }

  // ---------------------------------------------------------------------
  // Group F – Impact & External Signals (defaults; external data added later)
  // ---------------------------------------------------------------------
  private buildGroupF(groupB: RawGroupB, groupC: RawGroupC): RawGroupF {
    const contributionCalendarWeeks = (groupC.weeklyContributions || []).filter((w) => w.total > 0).length;
    const ownedNonForks = (groupB.repos || []).filter((r) => !r.isFork);
    const totalStarsOwned = ownedNonForks.reduce((s, r) => s + (r.starCount ?? 0), 0);
    const totalForksOwned = ownedNonForks.reduce((s, r) => s + (r.forkCount ?? 0), 0);
    return {
      contributionCalendarWeeks,
      totalStarsOwned,
      totalForksOwned,
      packageRegistryPresence: [],
    } as RawGroupF;
  }
}
