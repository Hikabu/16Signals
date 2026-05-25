import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DecisionCardService } from '../scoring/decision-card/decision-card.service';
import { InterviewQuestionService } from './interview-question.service';
import {
  JobStatus,
  PipelineStage,
  ShortlistStatus,
  Prisma,
} from '@prisma/client';
import { AnalysisResult } from '../scoring/types/result.types';
import { INTERVIEW_STAGES } from './interviewStages.set';
import { ScorecardService } from '../scorecard/scorecard.service';
import { buildFrozenScorecard } from './helpers/freeze';
import { buildHrView, buildTechnicalView } from './helpers/view-builder';

@Injectable()
export class ApplicantsService {
  private readonly logger = new Logger(ApplicantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly decisionCardService: DecisionCardService,
    private readonly interviewQuestionService: InterviewQuestionService,
  ) {}

  async findByJob(
    jobId: string,
    companyId: string,
    filters: {
      minScore?: number;
      pipelineStage?: PipelineStage;
    },
  ) {
    const applications = await this.prisma.shortlist.findMany({
      where: {
        jobPostId: jobId,
        jobPost: { companyId },
        ...(filters.minScore && {
          roleFitScore: { gte: Number(filters.minScore) },
        }),
        ...(filters.pipelineStage && { pipelineStage: filters.pipelineStage }),
      },
      // orderBy: { roleFitScore: 'desc' },
      include: {
        candidate: {
          include: {
            user: {
              select: { firstName: true, lastName: true, username: true },
            },
          },
        },
      },
    });

    return applications.map((app) => ({
      id: app.id,
      hrView: buildHrView(app),
      technicalView: buildTechnicalView(app),
    }));
  }

  async findById(appId: string, companyId: string) {
    const app = await this.prisma.shortlist.findUnique({
      where: { id: appId },
      include: {
        candidate: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                username: true,
                email: true,
              },
            },
            devProfile: {
              include: {
                githubProfile: true,
                web3Profile: true,
              },
            } as any,
          },
        },
        jobPost: {
          include: {
            company: { select: { name: true } },
          },
        },
      },
    });

    if (!app || app.jobPost.companyId !== companyId) {
      throw new BadRequestException('Application not found or access denied');
    }

    return {
      id: app.id,
      hrView: buildHrView(app),
      technicalView: buildTechnicalView(app),

      // Full detail fields (HR only, never returned on candidate endpoints)
      pipelineStageHistory: (app as any).pipelineStageHistory ?? [],
      interviewQuestions: (app as any).interviewQuestions ?? [],

      // Job context
      job: {
        id: app.jobPost?.id,
        title: (app as any).jobPost?.title,
      },

      // Meta
      appliedAt: app.appliedAt,
      frozenAt: ((app as any).frozenScorecard as any)?.capturedAt ?? null,
    };
  }

  async findRawById(appId: string, companyId: string) {
    const app = await this.prisma.shortlist.findUnique({
      where: { id: appId },
      include: {
        candidate: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                username: true,
                email: true,
              },
            },
          },
        },
        jobPost: true,
      },
    });

    if (!app || app.jobPost.companyId !== companyId) {
      throw new NotFoundException('Application not found or access denied');
    }

    return app;
  }

  async updateDecision(appId: string, companyId: string, status: string) {
    const app = await this.prisma.shortlist.findUnique({
      where: { id: appId },
      include: { jobPost: { select: { companyId: true } } },
    });
    if (!app || app.jobPost.companyId !== companyId) {
      throw new BadRequestException('Application not found or access denied');
    }

    const updated = await this.prisma.shortlist.update({
      where: { id: appId },
      data: {
        status: status as ShortlistStatus,
        pipelineStageHistory: [
          ...((app.pipelineStageHistory as any[]) || []),
          {
            stage: status,
            changedAt: new Date(),
            changedBy: `HR:${companyId}`,
          },
        ] as any,
      },
    });

    this.logger.log(
      `AUDIT_LOG: { entityType: 'Application', entityId: '${appId}', action: 'STATUS_UPDATED', actorId: 'HR:${companyId}', after: '${status}' }`,
    );

    return updated;
  }

  async advanceStage(
    appId: string,
    companyId: string,
    nextStage: PipelineStage,
    note?: string,
  ) {
    const app = await this.prisma.shortlist.findUnique({
      where: { id: appId },
      include: {
        jobPost: { select: { companyId: true } },
        candidate: { include: { user: true } },
      },
    });

    if (!app || app.jobPost.companyId !== companyId) {
      throw new BadRequestException('Application not found or access denied');
    }

    const currentStage = app.pipelineStage;

    // 1. FORWARD-ONLY VALIDATION
    const stageOrder: Record<PipelineStage, number> = {
      [PipelineStage.APPLIED]: 0,
      [PipelineStage.REVIEWED]: 1,
      [PipelineStage.SHORTLISTED]: 2,
      [PipelineStage.INTERVIEW_HR]: 3,
      [PipelineStage.INTERVIEW_TECHNICAL]: 4,
      [PipelineStage.INTERVIEW_FINAL]: 5,
      [PipelineStage.OFFER]: 6,
      [PipelineStage.HIRED]: 7,
      [PipelineStage.REJECTED]: 8,
    };

    if (stageOrder[nextStage] <= stageOrder[currentStage as PipelineStage]) {
      // Exception: allow moving to REJECTED from anywhere except HIRED/REJECTED
      if (nextStage !== PipelineStage.REJECTED) {
        throw new BadRequestException(
          `Cannot move stage backwards from ${currentStage} to ${nextStage}`,
        );
      }
    }

    // 2. INTERVIEW QUESTION TRIGGER (Fire and forget)
    if (nextStage.startsWith('INTERVIEW_')) {
      this.interviewQuestionService
        .generateForApplication(appId, nextStage)
        .catch((err) =>
          this.logger.error(
            `Deferred question generation failed for ${appId}: ${err.message}`,
          ),
        );
    }

    // 3. PIPELINE STAGE HISTORY APPEND & UPDATE
    const updated = await this.prisma.shortlist.update({
      where: { id: appId },
      data: {
        pipelineStage: nextStage,
        pipelineStageHistory: [
          ...(((app as any).pipelineStageHistory as any[]) || []),
          {
            stage: nextStage,
            movedAt: new Date(),
            movedBy: `HR:${companyId}`,
            note: note ?? null,
          },
        ] as any,
      },
    });

    this.logger.log(
      `AUDIT_LOG: { entityType: 'Application', entityId: '${appId}', action: 'STAGE_UPDATED', actorId: 'HR:${companyId}', after: '${nextStage}' }`,
    );

    return updated;
  }

  async findCandidateApplications(candidateUserId: string) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { userId: candidateUserId },
    });

    if (!candidate) return [];

    const applications = await this.prisma.shortlist.findMany({
      where: { candidateId: candidate.id },
      include: {
        jobPost: {
          select: {
            id: true,
            title: true,
            company: { select: { name: true } },
          },
        },
      },
      orderBy: { appliedAt: 'desc' },
    });

    return applications.map((app) => ({
      id: app.id,
      jobId: app.jobPost.id,
      jobTitle: app.jobPost.title,
      companyName: app.jobPost.company?.name || 'Unknown Company',
      pipelineStage: app.pipelineStage,
      appliedAt: app.appliedAt,
      // fitTier: app.fitTier,
      // roleFitScore: app.roleFitScore,
      status: app.status,
    }));
  }

  async getGapPreview(jobId: string, candidateUserId: string) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { userId: candidateUserId },
      include: {
        user: true,
        devProfile: {
          include: {
            githubProfile: true,
            web3Profile: true,
          },
        },
      },
    });
    if (!candidate)
      throw new BadRequestException('Candidate profile not found');

    const job = await this.prisma.jobPost.findUnique({ where: { id: jobId } });
    if (!job || job.status !== JobStatus.ACTIVE) {
      throw new NotFoundException('Job not found or not open for applications');
    }

    const latestAnalysis = await this.prisma.analysisJob.findFirst({
      where: { candidateId: candidate.id, status: 'completed' },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestAnalysis || !latestAnalysis.result) {
      return { analysisRequired: true };
    }

    const analysisResult = latestAnalysis.result as unknown as AnalysisResult;
    // const gapReport = this.gapAnalysisService.compute(analysisResult, job);
    const gapReport = 0;
    const decisionCard = this.decisionCardService.generate(
      gapReport,
      analysisResult,
    );


    const roleFitScore = this.computeRoleFitScore(gapReport, analysisResult);

    // const safeGaps = gapReport.gaps.map((g) => ({
    //   dimension: g.dimension,
    //   severity: g.severity,
    //   description: `${g.actual} vs required ${g.expected}${g.mitigatingContext ? '. ' + g.mitigatingContext : ''}`,
    // }));
    const safeGaps = [];

    return {
      jobId,
      // fitTier,
      reviewOutcome: (decisionCard as any).reviewOutcome,
      roleFitScore,
      gapSummary: decisionCard.hrSummary,
      // matchedTechnologies: gapReport.matchedTechnologies,
      // missingTechnologies: gapReport.missingTechnologies,
      gaps: safeGaps,
      skillsGap: this.buildSkillsGap(gapReport, job),
      scorecard: buildFrozenScorecard(analysisResult, candidate),
    };
  }

  async apply(jobId: string, candidateUserId: string) {
    // 1. Resolve candidate from user ID
    const candidate = await this.prisma.candidate.findUnique({
      where: { userId: candidateUserId },
      include: {
        user: true,
        devProfile: {
          include: {
            githubProfile: true,
            web3Profile: true,
          },
        },
      },
    });
    if (!candidate)
      throw new BadRequestException('Candidate profile not found');

    const candidateId = candidate.id;

    // 2. Load job
    const job = await this.prisma.jobPost.findUnique({ where: { id: jobId } });
    if (!job || job.status !== JobStatus.ACTIVE) {
      throw new BadRequestException(
        'Job not found or not open for applications',
      );
    }

    // 3. Duplicate check
    const existing = await this.prisma.shortlist.findFirst({
      where: { jobPostId: jobId, candidateId },
    });
    if (existing) throw new BadRequestException('Already applied');

    // 4. Load candidate's latest completed AnalysisJob
    const latestAnalysis = await this.prisma.analysisJob.findFirst({
      where: { candidateId: candidate.id, status: 'completed' },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestAnalysis || !latestAnalysis.result) {
      throw new BadRequestException(
        'No completed analysis found. Run an analysis first.',
      );
    }

    const analysisResult = latestAnalysis.result as unknown as AnalysisResult;

    // 5. Gap Analysis
    // const gapReport = this.gapAnalysisService.compute(analysisResult, job);
const gapReport = 0;
    // 6. Decision Card
    const decisionCard = this.decisionCardService.generate(
      gapReport,
      analysisResult,
    );

    // 7. Map verdict → FitTier
    // const verdictMap: Record<string, FitTier> = {
    //   PROCEED: FitTier.STRONG,
    //   REVIEW: FitTier.PROBE,
    //   REJECT: FitTier.PASS,
    // };
    // const fitTier = verdictMap[decisionCard.verdict] || FitTier.PASS;

    // 8. roleFitScore
    const roleFitScore = this.computeRoleFitScore(gapReport, analysisResult);

    // 8.5 Build frozenScorecard
    const frozenScorecard = buildFrozenScorecard(analysisResult, candidate);
    const skillsGap = this.buildSkillsGap(gapReport, job);

    // 9. Create application (Shortlist model)
    const application = await this.prisma.shortlist.create({
      data: {
        jobPostId: jobId,
        candidateId,
        // roleFitScore,
        // fitTier,
        // confidenceTier: (analysisResult as any).confidenceTier ?? null,
        // fraudTier: (analysisResult as any).fraudTier ?? 'CLEAN',
        // behaviorPattern: (analysisResult as any).behaviorPattern ?? null,
        frozenScorecard: frozenScorecard as any,
        decisionCard: decisionCard as unknown as Prisma.JsonObject,
        gapReport: gapReport as unknown as Prisma.JsonObject,
        pipelineStage: PipelineStage.APPLIED,
        pipelineStageHistory: [
          { stage: 'APPLIED', changedAt: new Date(), changedBy: 'system' },
        ] as any,
        status: ShortlistStatus.PENDING,
      },
    });

    return {
      ...application,
      scorecard: frozenScorecard,
      skillsGap,
      reviewOutcome: (decisionCard as any).reviewOutcome,
    };
  }

  private computeRoleFitScore(
    gapReport: any,
    analysisResult: AnalysisResult,
  ): number {
    const counts = {
      DEALBREAKER: 0,
      SIGNIFICANT: 0,
      MINOR: 0,
    };

    gapReport.gaps.forEach((g: any) => {
      if (counts.hasOwnProperty(g.severity)) {
        counts[g.severity as keyof typeof counts]++;
      }
    });

    const capabilityScores = Object.values(
      analysisResult.capabilities ?? {},
    ).map((cap: any) => this.toPercentScore(cap.score));
    const averageCapability = capabilityScores.length
      ? capabilityScores.reduce((sum, score) => sum + score, 0) /
        capabilityScores.length
      : 0;
    const ownershipScore = Math.min(
      100,
      (analysisResult.ownership?.activelyMaintained ?? 0) * 20 +
        (analysisResult.ownership?.ownedProjects ?? 0) * 10,
    );
    const impactScore =
      analysisResult.impact?.activityLevel === 'high'
        ? 100
        : analysisResult.impact?.activityLevel === 'medium'
          ? 70
          : 35;
    const reputationBonus = Math.min(
      8,
      (analysisResult.reputation?.verifiedVouchCount ?? 0) * 4,
    );
    const web3Bonus = analysisResult.web3?.ecosystem ? 4 : 0;
    const baseScore =
      (gapReport.technologyFitScore ?? 100) * 0.35 +
      averageCapability * 0.35 +
      ownershipScore * 0.15 +
      impactScore * 0.15;

    const score =
      baseScore +
      reputationBonus +
      web3Bonus -
      counts.DEALBREAKER * 30 -
      counts.SIGNIFICANT * 10 -
      counts.MINOR * 3;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private toPercentScore(score: number): number {
    return score <= 1 ? Math.round(score * 100) : Math.round(score);
  }

  private buildSkillsGap(gapReport: any, job: any) {
    const parsedReqs = job?.parsedRequirements as any;
    const requiredSkills =
      parsedReqs?.requiredSkills ?? job?.requiredSkills ?? [];

    if (!requiredSkills.length) {
      return null;
    }

    return {
      requiredSkills,
      matchedTechnologies: gapReport.matchedTechnologies ?? [],
      missingTechnologies: gapReport.missingTechnologies ?? [],
      gaps: (gapReport.gaps ?? [])
        .filter((gap: any) => gap.dimension?.startsWith('Technology: '))
        .map((gap: any) => ({
          skill: gap.dimension.replace('Technology: ', ''),
          severity: gap.severity,
          actual: gap.actual,
          expected: gap.expected,
          mitigatingContext: gap.mitigatingContext ?? null,
        })),
    };
  }

  async applyDecision(appId: string, status: string, companyId: string) {
    const application = await this.prisma.shortlist.findUnique({
      where: { id: appId },
      include: {
        jobPost: {
          select: { companyId: true },
        },
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (application.jobPost.companyId !== companyId) {
      throw new ForbiddenException(
        'Access denied: application belongs to another company',
      );
    }

    const updated = await this.prisma.shortlist.update({
      where: { id: appId },
      data: {
        status: status as ShortlistStatus,
      },
    });

    this.logger.log(
      `AUDIT_LOG: { entityType: 'Application', entityId: '${appId}', action: 'DECISION_APPLIED', actorId: 'HR:${companyId}', after: { status: '${status}' } }`,
    );

    return updated;
  }
}
