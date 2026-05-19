import { Injectable } from '@nestjs/common';
import { AnalysisResult } from '../types/result.types';

@Injectable()
export class SummaryGeneratorService {
  /**
   * Generates a 1-2 sentence professional summary based on the analysis results.
   */
  generate(result: AnalysisResult, ownedRepoTopics: string[] = []): string {
    const { capabilities, ownership } = result;

    // 1. Determine focus
    const roles = [
      { name: 'backend', score: capabilities.backend.score },
      { name: 'frontend', score: capabilities.frontend.score },
      { name: 'devops', score: capabilities.devops.score },
    ].sort((a, b) => b.score - a.score);

    const topRole = roles[0].name;
    const topScore = roles[0].score;
    const secondRole = roles[1].name;
    const secondScore = roles[1].score;

    let focus = '';
    if (topScore > 0.6 && topScore - secondScore > 0.3) {
      focus = `${this.capitalize(topRole)}-focused developer`;
    } else if (topScore > 0.4 && secondScore > 0.4) {
      focus = `Full-stack developer with strong ${topRole} and ${secondRole} capabilities`;
    } else {
      focus = `Developer with a focus on ${topRole}`;
    }

    // 2. Add impact/ownership context
    let context = '';
    if (ownership.activelyMaintained >= 3) {
      context = `who actively maintains a solid portfolio of ${ownership.activelyMaintained} projects`;
    } else if (result.impact.activityLevel === 'high') {
      context = `with a very high level of consistent contribution activity`;
    } else {
      context = `with a consistent open-source presence`;
    }

    let summary = `${focus} ${context}.`;

    if (result.web3?.ecosystem === 'solana') {
      summary += ' Active in the Solana ecosystem.';
    }

    if (
      this.commonTopicCount(
        result.interactionProfile?.topicAffinity ?? [],
        ownedRepoTopics,
      ) >= 3
    ) {
      summary += ` Consistent topic focus across owned and starred repositories.`;
    }

    if (result.reputation && result.reputation.verifiedVouchCount >= 2) {
      summary += ` Vouched for by ${result.reputation.verifiedVouchCount} verified developers.`;
    }

    return summary;
  }

  private capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  private commonTopicCount(a: string[], b: string[]): number {
    const topics = new Set(b.map((topic) => topic.toLowerCase()));
    return a.filter((topic) => topics.has(topic.toLowerCase())).length;
  }
}
