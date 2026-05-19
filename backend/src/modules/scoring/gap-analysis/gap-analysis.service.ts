import { Injectable } from '@nestjs/common';
import { AnalysisResult } from '../types/result.types';
import { ParsedJobRequirements } from './parsed-job-requirements.inteface';
import { RoleType, Seniority } from '@prisma/client';

export interface Gap {
  dimension: string;
  severity: 'DEALBREAKER' | 'SIGNIFICANT' | 'MINOR';
  actual: string;
  expected: string;
  mitigatingContext: string | null;
  probeQuestion: string | null; // populated for SIGNIFICANT and DEALBREAKER only
}

export interface GapReport {
  overallVerdict: 'LIKELY_FIT' | 'POSSIBLE_FIT' | 'UNLIKELY_FIT';
  gaps: Gap[];
  technologyFitScore: number;
  missingTechnologies: string[];
  matchedTechnologies: string[];
}

@Injectable()
export class GapAnalysisService {
  compute(analysisResult: AnalysisResult, job: any): GapReport {
    const parsedReqs: ParsedJobRequirements = job.parsedRequirements as any;
    const gaps: Gap[] = [];

    // Step 1, Technology matching
    const requiredTechs = parsedReqs?.requiredSkills?.length
      ? parsedReqs.requiredSkills
      : job.requiredSkills || [];
    const candidateTechs = [
      ...(analysisResult.stack?.languages ?? []),
      ...(analysisResult.stack?.tools ?? []),
      analysisResult.web3?.ecosystem,
    ]
      .filter((t): t is string => Boolean(t))
      .map((t) => t.toLowerCase());

    const matchedTechnologies: string[] = [];
    const missingTechnologies: string[] = [];

    requiredTechs.forEach((req) => {
      if (candidateTechs.includes(req.toLowerCase())) {
        matchedTechnologies.push(req);
      } else {
        missingTechnologies.push(req);
        gaps.push({
          dimension: `Technology: ${req}`,
          severity: 'DEALBREAKER',
          actual: 'Not detected in open source history',
          expected: 'Required',
          mitigatingContext: this.buildMitigatingContext(analysisResult),
          probeQuestion: `Tell me about your production experience with ${req}. What did you build and what trade-offs did you make?`,
        });
      }
    });

    const technologyFitScore =
      requiredTechs.length > 0
        ? Math.min(
            100,
            Math.round(
              (matchedTechnologies.length / requiredTechs.length) * 100,
            ),
          )
        : 100;

    // Step 2, Capability threshold gaps
    const seniority = parsedReqs?.seniorityLevel || Seniority.MID;
    const thresholds: Record<Seniority, number> = {
      [Seniority.JUNIOR]: 30,
      [Seniority.MID]: 50,
      [Seniority.SENIOR]: 70,
      [Seniority.LEAD]: 75,
    };
    const threshold = thresholds[seniority];

    const dimensions = this.getRelevantDimensions(
      parsedReqs?.requiredRoleType ?? job.roleType,
    );

    dimensions.forEach((dim) => {
      const capability = analysisResult.capabilities?.[dim];
      if (!capability) return;

      const score = this.toPercentScore(capability.score);
      const delta = threshold - score;

      if (delta > 0) {
        let severity: Gap['severity'] = 'MINOR';
        if (delta > 20) severity = 'DEALBREAKER';
        else if (delta > 10) severity = 'SIGNIFICANT';

        const mitigatingContext = this.buildMitigatingContext(analysisResult);

        let probeQuestion: string | null = null;
        if (severity === 'DEALBREAKER' || severity === 'SIGNIFICANT') {
          probeQuestion = `Walk me through the most complex ${dim} system you have built. What were the key design decisions?`;
        }

        gaps.push({
          dimension: dim.toUpperCase(),
          severity,
          actual: `${score}/100`,
          expected: `${threshold}/100`,
          mitigatingContext,
          probeQuestion,
        });
      }
    });

    const ownershipGap = this.buildOwnershipGap(analysisResult, parsedReqs);
    if (ownershipGap) gaps.push(ownershipGap);

    const impactGap = this.buildImpactGap(analysisResult, parsedReqs);
    if (impactGap) gaps.push(impactGap);

    const web3Gap = this.buildWeb3Gap(analysisResult, parsedReqs, job);
    if (web3Gap) gaps.push(web3Gap);

    // Step 3, overallVerdict
    let overallVerdict: GapReport['overallVerdict'] = 'LIKELY_FIT';
    const hasDealbreaker = gaps.some((g) => g.severity === 'DEALBREAKER');
    const hasSignificant = gaps.some((g) => g.severity === 'SIGNIFICANT');

    if (hasDealbreaker) {
      overallVerdict = 'UNLIKELY_FIT';
    } else if (hasSignificant) {
      overallVerdict = 'POSSIBLE_FIT';
    }

    // Step 4, return GapReport
    return {
      overallVerdict,
      gaps,
      technologyFitScore,
      missingTechnologies,
      matchedTechnologies,
    };
  }

  private toPercentScore(score: number): number {
    return score <= 1 ? Math.round(score * 100) : Math.round(score);
  }

  private getRelevantDimensions(
    roleType?: RoleType | keyof typeof RoleType | null,
  ): (keyof AnalysisResult['capabilities'])[] {
    switch (roleType) {
      case RoleType.BACKEND:
      case RoleType.DATA_ML:
      case RoleType.WEB3_BACKEND:
      case RoleType.SMART_CONTRACT:
      case RoleType.DEFI_PROTOCOL:
        return ['backend'];
      case RoleType.FRONTEND:
      case RoleType.WEB3_FRONTEND:
        return ['frontend'];
      case RoleType.FULLSTACK:
      case RoleType.WEB3_FULLSTACK:
        return ['backend', 'frontend'];
      case RoleType.INFRASTRUCTURE:
      case RoleType.SECURITY:
      case RoleType.SECURITY_WEB3:
        return ['backend', 'devops'];
      default:
        return ['backend', 'frontend', 'devops'];
    }
  }

  private buildOwnershipGap(
    analysisResult: AnalysisResult,
    parsedReqs?: ParsedJobRequirements,
  ): Gap | null {
    const ownershipWeight = parsedReqs?.ownershipWeight ?? 'MEDIUM';
    const seniority = parsedReqs?.seniorityLevel ?? Seniority.MID;
    const expected =
      ownershipWeight === 'HIGH' || seniority === Seniority.LEAD
        ? 3
        : seniority === Seniority.SENIOR
          ? 2
          : 1;

    const activelyMaintained =
      analysisResult.ownership?.activelyMaintained ?? 0;
    if (activelyMaintained >= expected) return null;

    return {
      dimension: 'OWNERSHIP',
      severity:
        ownershipWeight === 'HIGH' && activelyMaintained === 0
          ? 'SIGNIFICANT'
          : 'MINOR',
      actual: `${activelyMaintained} actively maintained projects`,
      expected: `${expected}+ actively maintained projects`,
      mitigatingContext: this.buildMitigatingContext(analysisResult),
      probeQuestion:
        'Describe a project you owned end-to-end. What did you maintain after launch?',
    };
  }

  private buildImpactGap(
    analysisResult: AnalysisResult,
    parsedReqs?: ParsedJobRequirements,
  ): Gap | null {
    if (
      parsedReqs?.collaborationWeight !== 'HIGH' ||
      analysisResult.impact?.activityLevel !== 'low'
    ) {
      return null;
    }

    return {
      dimension: 'IMPACT',
      severity: 'SIGNIFICANT',
      actual: 'Low public activity signal',
      expected: 'Visible collaboration or contribution activity',
      mitigatingContext: this.buildMitigatingContext(analysisResult),
      probeQuestion:
        'Walk me through a recent collaboration-heavy project and your specific contribution.',
    };
  }

  private buildWeb3Gap(
    analysisResult: AnalysisResult,
    parsedReqs?: ParsedJobRequirements,
    job?: any,
  ): Gap | null {
    const isWeb3Role = parsedReqs?.isWeb3Role ?? job?.isWeb3Role ?? false;
    if (!isWeb3Role) return null;

    const web3 = analysisResult.web3;
    const hasWeb3Signal = Boolean(
      web3?.ecosystem ||
      web3?.ecosystemPRs ||
      (web3?.deployedPrograms?.length ?? 0) > 0,
    );
    if (hasWeb3Signal) return null;

    return {
      dimension: 'WEB3',
      severity: 'SIGNIFICANT',
      actual: 'No web3 ecosystem signal detected',
      expected: 'Relevant web3 or on-chain development signal',
      mitigatingContext: this.buildMitigatingContext(analysisResult),
      probeQuestion:
        'What web3 systems have you built or contributed to, and how were they verified or deployed?',
    };
  }

  private buildMitigatingContext(
    analysisResult: AnalysisResult,
  ): string | null {
    const contexts: string[] = [];

    if (analysisResult.privateWorkNote) {
      contexts.push('Private work indicator detected');
    }

    const verifiedVouches = analysisResult.reputation?.verifiedVouchCount ?? 0;
    if (verifiedVouches > 0) {
      contexts.push(`${verifiedVouches} verified vouch(es)`);
    }

    if (analysisResult.organizations?.some((org) => org.confirmedContributor)) {
      contexts.push('Confirmed organization contribution');
    }

    return contexts.length ? contexts.join('. ') + '.' : null;
  }
}
