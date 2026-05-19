import { Injectable } from '@nestjs/common';
import { AnalysisResult } from '../types/result.types';
import { GapReport } from '../gap-analysis/gap-analysis.service';

export interface DecisionCard {
  verdict: 'PROCEED' | 'REVIEW' | 'REJECT';
  reviewOutcome: 'OK' | 'NEEDS_REVIEW' | 'INSUFFICIENT';
  strengths: string[];
  risks: string[];
  reputationNote: string | null;
  hrSummary: string; // 1 plain-english sentence for HR (non-technical language)
  technicalSummary: string; // 1 dense sentence for CTO / technical reviewer (scores + metrics)
}

@Injectable()
export class DecisionCardService {
  generate(gapReport: GapReport, analysisResult: AnalysisResult): DecisionCard {
    const verdict = this.computeVerdict(gapReport, analysisResult);
    const strengths = this.extractStrengths(analysisResult);
    const risks = this.extractRisks(gapReport, analysisResult);
    const reputationNote = this.generateReputationNote(analysisResult);

    const hrSummary = this.generateHrSummary(
      verdict,
      strengths,
      gapsToRisksNames(gapReport.gaps),
    );
    const technicalSummary = this.generateTechnicalSummary(
      gapReport,
      analysisResult,
    );

    return {
      verdict,
      reviewOutcome: this.mapReviewOutcome(verdict),
      strengths,
      risks,
      reputationNote,
      hrSummary,
      technicalSummary,
    };
  }

  private mapReviewOutcome(
    verdict: DecisionCard['verdict'],
  ): DecisionCard['reviewOutcome'] {
    if (verdict === 'PROCEED') return 'OK';
    if (verdict === 'REVIEW') return 'NEEDS_REVIEW';
    return 'INSUFFICIENT';
  }

  private computeVerdict(
    gapReport: GapReport,
    analysisResult: AnalysisResult,
  ): DecisionCard['verdict'] {
    const hasLowConfidence = Object.values(analysisResult.capabilities).some(
      (c) => c.confidence === 'low',
    );
    const hasDealbreaker = gapReport.gaps.some(
      (g) => g.severity === 'DEALBREAKER',
    );
    const hasVerifiedReputation =
      (analysisResult.reputation?.verifiedVouchCount ?? 0) > 0;
    const hasPrivateWorkContext = Boolean(analysisResult.privateWorkNote);
    const hasOrgContribution = Boolean(
      analysisResult.organizations?.some((org) => org.confirmedContributor),
    );
    const isDataCompletenessLow =
      analysisResult.impact.confidence === 'low' ||
      analysisResult.ownership.confidence === 'low';
    const hasMitigatingSignal =
      hasVerifiedReputation || hasPrivateWorkContext || hasOrgContribution;

    if (gapReport.overallVerdict === 'UNLIKELY_FIT' && !hasMitigatingSignal) {
      return 'REJECT';
    }

    if (
      gapReport.overallVerdict === 'UNLIKELY_FIT' ||
      gapReport.overallVerdict === 'POSSIBLE_FIT' ||
      isDataCompletenessLow ||
      hasLowConfidence ||
      hasDealbreaker
    ) {
      return 'REVIEW';
    }

    return 'PROCEED';
  }

  private extractStrengths(analysisResult: AnalysisResult): string[] {
    const strengths: string[] = [];

    // 1. Capability score ≥ 70
    Object.entries(analysisResult.capabilities).forEach(([dim, cap]) => {
      const score = this.toPercentScore(cap.score);
      if (score >= 70 && cap.confidence !== 'low') {
        strengths.push(`High ${dim} capability (${score}/100)`);
      }
    });

    // 2. Deployed programs
    const deploys = analysisResult.web3?.deployedPrograms.length || 0;
    if (deploys > 0) {
      strengths.push('Shipped Solana programs to mainnet');
    }

    // 3. Impact
    if (analysisResult.impact.externalContributions > 5) {
      strengths.push(
        `Strong external contribution record (${analysisResult.impact.externalContributions} PRs)`,
      );
    }

    if ((analysisResult.reputation?.verifiedVouchCount ?? 0) >= 2) {
      strengths.push(
        `${analysisResult.reputation?.verifiedVouchCount} verified developer vouches`,
      );
    }

    if (analysisResult.organizations?.some((org) => org.confirmedContributor)) {
      strengths.push('Confirmed organization contribution history');
    }

    return strengths.slice(0, 3);
  }

  private extractRisks(
    gapReport: GapReport,
    analysisResult: AnalysisResult,
  ): string[] {
    const risks: string[] = [];

    // 1. DEALBREAKER first
    gapReport.gaps
      .filter((g) => g.severity === 'DEALBREAKER')
      .forEach((g) => {
        risks.push(
          `Missing ${g.dimension}: ${g.actual} vs required ${g.expected}`,
        );
      });

    // 2. SIGNIFICANT
    gapReport.gaps
      .filter((g) => g.severity === 'SIGNIFICANT')
      .forEach((g) => {
        risks.push(`${g.dimension} gap: ${g.actual} vs required ${g.expected}`);
      });

    // 3. Low confidence
    Object.entries(analysisResult.capabilities).forEach(([dim, cap]) => {
      if (cap.confidence === 'low') {
        risks.push(`Low signal for ${dim} capability`);
      }
    });

    return risks.slice(0, 3);
  }

  private generateReputationNote(
    analysisResult: AnalysisResult,
  ): string | null {
    const count = analysisResult.reputation?.verifiedVouchCount || 0;
    return count >= 2 ? `Vouched for by ${count} verified developers.` : null;
  }

  private generateHrSummary(
    verdict: string,
    strengths: string[],
    riskDimensions: string[],
  ): string {
    const verdictReasonMap: Record<string, string> = {
      PROCEED: 'Strong',
      REVIEW: 'Review-recommended',
      REJECT: 'Under-qualified',
    };

    const rawTopStrength = strengths[0] || 'consistent open-source presence';
    const topStrength = rawTopStrength.replace(/\s*\(\d+[^)]*\)/g, '');
    const topRisk = riskDimensions[0]
      ? `Missing ${riskDimensions[0]} experience`
      : 'No major gaps detected';

    return `${verdictReasonMap[verdict]} candidate. ${topStrength}. ${topRisk}.`;
  }

  private generateTechnicalSummary(
    gapReport: GapReport,
    analysisResult: AnalysisResult,
  ): string {
    const caps = analysisResult.capabilities;
    const b = caps.backend ? this.toPercentScore(caps.backend.score) : 'N/A';
    const f = caps.frontend ? this.toPercentScore(caps.frontend.score) : 'N/A';
    const d = caps.devops ? this.toPercentScore(caps.devops.score) : 'N/A';

    const matched = gapReport.matchedTechnologies.length;
    const total = matched + gapReport.missingTechnologies.length;
    const deploys = analysisResult.web3?.deployedPrograms.length || 0;
    const verifiedVouches = analysisResult.reputation?.verifiedVouchCount ?? 0;

    // Aggregate confidence
    const confLevels = [
      ...Object.values(caps).map((c) => c.confidence),
      analysisResult.ownership.confidence,
      analysisResult.impact.confidence,
    ];
    const overallConf = confLevels.includes('low')
      ? 'low'
      : confLevels.includes('medium')
        ? 'medium'
        : 'high';

    return `backend:${b} frontend:${f} devops:${d} | ${matched}/${total} techs matched | ${deploys} deploys | ${verifiedVouches} verified vouches | confidence:${overallConf}`;
  }

  private toPercentScore(score: number): number {
    return score <= 1 ? Math.round(score * 100) : Math.round(score);
  }
}

function gapsToRisksNames(gaps: any[]): string[] {
  return gaps
    .filter((g) => g.severity === 'DEALBREAKER' || g.severity === 'SIGNIFICANT')
    .map((g) => g.dimension.replace('Technology: ', ''));
}
