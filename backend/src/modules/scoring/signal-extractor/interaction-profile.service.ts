import { Injectable } from '@nestjs/common';
import { StarredRepoSummary } from '../github-adapter/github-data.types';
import { SOLANA_TOPICS } from './ecosystem-clarifier.service';

export interface InteractionProfile {
  topicAffinity: string[];
  languageAffinity: string[];
  ecosystemAffinity: 'solana' | null;
}

@Injectable()
export class InteractionProfileService {
  compute(starredRepos: StarredRepoSummary[]): InteractionProfile | null {
    if (!starredRepos?.length) {
      return null;
    }

    const topicAffinity = this.topValues(
      starredRepos.flatMap((repo) =>
        (repo.topics ?? []).map((topic) => topic.toLowerCase()),
      ),
      5,
    );
    const languageAffinity = this.topValues(
      starredRepos
        .map((repo) => repo.language)
        .filter((language): language is string => Boolean(language)),
      3,
    );
    const solanaTopics = new Set(
      SOLANA_TOPICS.map((topic) => topic.toLowerCase()),
    );
    const hasSolanaTopicAffinity = topicAffinity.some((topic) =>
      solanaTopics.has(topic),
    );
    const hasRustSolanaStar = starredRepos.some(
      (repo) =>
        repo.language?.toLowerCase() === 'rust' &&
        (repo.topics ?? []).some((topic) =>
          solanaTopics.has(topic.toLowerCase()),
        ),
    );

    return {
      topicAffinity,
      languageAffinity,
      ecosystemAffinity:
        hasSolanaTopicAffinity || hasRustSolanaStar ? 'solana' : null,
    };
  }

  private topValues(values: string[], limit: number): string[] {
    const counts = new Map<string, number>();

    for (const value of values) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    return [...counts.entries()]
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
      })
      .slice(0, limit)
      .map(([value]) => value);
  }
}
