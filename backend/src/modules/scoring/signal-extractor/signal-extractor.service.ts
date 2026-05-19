import { Injectable } from '@nestjs/common';
import {
  GitHubRawData,
  GitHubContributionData,
  GitHubRepo,
} from '../github-adapter/github-data.types';
import { ExtractedSignals } from '../types/result.types';

@Injectable()
export class SignalExtractorService {
  /**
   * Main entry point for signal extraction.
   * Deterministically transforms raw GitHub data into a normalized set of signals.
   */
  extract(data: GitHubRawData): ExtractedSignals {
    const s1 = this.calculateS1(data);
    const s2 = this.calculateS2(data);
    const s3 = this.calculateS3(data.contributions);
    const s4 = this.calculateS4(data.repos);
    const s5 = this.calculateS5(data.externalPRs);
    const s6 = this.calculateS6(data.repos);
    const s7 = this.calculateS7(data.repos);
    const s8 = this.calculateS8(data.profile, data.contributions);

    return {
      ownershipDepth: s1,
      projectLongevity: s2,
      activityConsistency: s3,
      techStackBreadth: s4,
      externalContributions: s5,
      projectMeaningfulness: s6,
      stackIdentity: s7,
      dataCompleteness: s8,
    };
  }

  /**
   * S1: Ownership Depth (Integer)
   * Count of non-fork repos that were created > 3 months ago and pushed to in last 3 months.
   */
  private calculateS1(data: GitHubRawData): number {
    const fetchedAt = new Date(data.fetchedAt);
    const thresholdMs = 90 * 24 * 60 * 60 * 1000; // 90 days

    return data.repos.filter((repo: GitHubRepo) => {
      if (repo.isFork) return false;

      const createdAt = new Date(repo.createdAt);
      const pushedAt = new Date(repo.pushedAt);

      const isOldEnough =
        fetchedAt.getTime() - createdAt.getTime() > thresholdMs;
      const isRecentlyPushed =
        fetchedAt.getTime() - pushedAt.getTime() < thresholdMs;

      return isOldEnough && isRecentlyPushed;
    }).length;
  }

  /**
   * S2: Project Longevity (Average age in months)
   * Average age of non-fork repos that are > 3 months old and pushed to in last 6 months.
   */
  private calculateS2(data: GitHubRawData): number {
    const fetchedAt = new Date(data.fetchedAt);
    const ageThresholdMs = 90 * 24 * 60 * 60 * 1000; // 3 months
    const activityThresholdMs = 180 * 24 * 60 * 60 * 1000; // 6 months
    const DAYS_PER_MONTH = 30.44;

    const qualifyingRepos = data.repos.filter((repo: GitHubRepo) => {
      if (repo.isFork) return false;

      const createdAt = new Date(repo.createdAt);
      const pushedAt = new Date(repo.pushedAt);

      const isOldEnough =
        fetchedAt.getTime() - createdAt.getTime() > ageThresholdMs;
      const wasRecentlyMaintained =
        fetchedAt.getTime() - pushedAt.getTime() < activityThresholdMs;

      return isOldEnough && wasRecentlyMaintained;
    });

    if (qualifyingRepos.length === 0) return 0;

    const totalMonths = qualifyingRepos.reduce((acc, repo) => {
      const createdAt = new Date(repo.createdAt);
      const ageDays =
        (fetchedAt.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000);
      return acc + ageDays / DAYS_PER_MONTH;
    }, 0);

    return Math.round((totalMonths / qualifyingRepos.length) * 10) / 10;
  }

  /**
   * S3: Activity Consistency (Ratio 0.0 - 1.0)
   * Ratio of active weeks over the last year.
   */
  private calculateS3(contributions: GitHubContributionData): number {
    if (contributions.activeWeeksCount === 0) return 0;

    const ratio = contributions.activeWeeksCount / 52;
    const clamped = Math.min(Math.max(ratio, 0.0), 1.0);

    return Math.round(clamped * 1000) / 1000;
  }

  /**
   * S4: Tech Stack Breadth (Integer)
   * Count of unique non-null languages across non-fork repos (case-insensitive deduplication).
   */
  private calculateS4(repos: GitHubRepo[]): number {
    const uniqueLanguages = new Set<string>();
    repos.forEach((repo) => {
      if (!repo.isFork && repo.language) {
        uniqueLanguages.add(repo.language.toLowerCase());
      }
    });
    return uniqueLanguages.size;
  }

  /**
   * S5: External Contributions (Integer)
   * Merged external PR count.
   */
  private calculateS5(externalPRs: any): number {
    if (Array.isArray(externalPRs)) {
      return externalPRs.length;
    }

    return externalPRs?.mergedExternalPRCount || 0;
  }

  /**
   * S6: Project Meaningfulness (Normalised Composite 0.0-1.0)
   * Based on stars, forks, and topics on non-fork repos.
   */
  private calculateS6(repos: GitHubRepo[]): number {
    const nonForkRepos = repos.filter((r) => !r.isFork);
    if (nonForkRepos.length === 0) return 0;

    const totalRawScore = nonForkRepos.reduce((acc, repo) => {
      const starScore = Math.log((repo.stars || 0) + 1) * 2;
      const forkScore = Math.log((repo.forks || 0) + 1) * 1.5;
      const topicScore = repo.topics && repo.topics.length > 0 ? 1 : 0;
      return acc + starScore + forkScore + topicScore;
    }, 0);

    const normalized = totalRawScore / (nonForkRepos.length * 10);
    const clamped = Math.min(Math.max(normalized, 0.0), 1.0);
    return Math.round(clamped * 1000) / 1000;
  }

  /**
   * S7: Stack Identity (String array)
   * Top 2 languages across non-fork repos by count.
   */
  private calculateS7(repos: GitHubRepo[]): string[] {
    const counts: Record<string, number> = {};
    repos.forEach((repo) => {
      if (!repo.isFork && repo.language) {
        // We use the language as provided by GitHub but count consistently
        counts[repo.language] = (counts[repo.language] || 0) + 1;
      }
    });

    return Object.entries(counts)
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]); // Alphabetical tie-breaking
      })
      .slice(0, 2)
      .map((entry) => entry[0]);
  }

  /**
   * S8: Data Completeness (Normalised Composite 0.0-1.0)
   * Based on public repo count, account age, and active weeks.
   * Calibrated for high signal on public artifact density.
   */
  private calculateS8(
    profile: any,
    contributions: GitHubContributionData,
  ): number {
    // Factor A: Public repo count (weight 0.7)
    let factorA = 0.0;
    if (profile.publicRepos >= 10) factorA = 1.0;
    else if (profile.publicRepos >= 6) factorA = 0.5;
    else if (profile.publicRepos >= 2) factorA = 0.1;

    // Factor B: Account age in months (weight 0.15)
    let factorB = 0.2;
    if (profile.accountAge > 24) factorB = 1.0;
    else if (profile.accountAge >= 12) factorB = 0.6;

    // Factor C: Graph visibility - active weeks (weight 0.15)
    let factorC = 0.1;
    if (contributions.activeWeeksCount > 12) factorC = 1.0;
    else if (contributions.activeWeeksCount >= 4) factorC = 0.5;

    const score = factorA * 0.7 + factorB * 0.15 + factorC * 0.15;
    return Math.round(Math.min(Math.max(score, 0.0), 1.0) * 1000) / 1000;
  }

  /**
   * Helper to detect indicators of private work.
   */
  detectPrivateWorkIndicators(signals: ExtractedSignals): boolean {
    return signals.activityConsistency > 0.5 && signals.dataCompleteness < 0.4;
  }

  /**
   * Trend analysis for S3: 'ascending' | 'declining' | 'stable'
   * Splits 52 weeks into [17, 18, 17] and compares first and last blocks.
   */
  getTrend(
    contributions: GitHubContributionData,
  ): 'ascending' | 'declining' | 'stable' {
    const weeklyTotals = contributions.weeklyTotals;
    if (!weeklyTotals || weeklyTotals.length !== 52) return 'stable';

    const firstBlock = weeklyTotals.slice(0, 17);
    const lastBlock = weeklyTotals.slice(35); // 52 - 17 = 35

    const firstAvg = firstBlock.reduce((a, b) => a + b, 0) / 17;
    const lastAvg = lastBlock.reduce((a, b) => a + b, 0) / 17;

    if (firstAvg === 0) {
      return lastAvg > 0 ? 'ascending' : 'stable';
    }

    if (lastAvg > firstAvg * 1.2) return 'ascending';
    if (lastAvg < firstAvg * 0.8) return 'declining';
    return 'stable';
  }
}
