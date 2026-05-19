import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
  Query,
  BadRequestException,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { BaseController } from '../../shared/base.controller';
import { JwtAuthGuard } from '../auth-employer/guards/jwt-auth.guard';
import { CandidateListResponseDto } from './dto/candidateListResponse.dto';
import { ShortlistResponseDto } from './dto/shortListResponse.dto';
import { UpdateShortlistStatusDto } from './dto/updateStatus.dto';
import { UpdateShortlistResponseDto } from './dto/updateStatusResponse.dto';
import { ApplicantsService } from './applicants.service';
import { ScorecardRendererService } from './scorecard-renderer.service';
import { VerifiedAuth } from '../../shared/decorators/verified.decorator';
import { UserRole, PipelineStage, FitTier } from '@prisma/client';
import { JwtAuthGuard as HrAuthGuard } from '../auth-employer/guards/jwt-auth.guard';
import { ApplyResponseDto } from './dto/applyResponse.dto';
import { ErrorResponseDto } from './dto/common.dto';
import { AdvanceStageDto } from './dto/advanceStage.dto';
import { ApplicationFiltersDto } from './dto/applicationFilter.dto';
import { ApplyDecisionDto } from './dto/applyDecision.dto';

@ApiTags('Applications')
@ApiBearerAuth('Authorization')
@Controller('applications')
export class ApplicantsController extends BaseController {
  constructor(
    private readonly applicantsService: ApplicantsService,
    private readonly scorecardRendererService: ScorecardRendererService,
  ) {
    super();
  }
  // ─────────────────────────────
  // CANDIDATE: GAP PREVIEW
  // ─────────────────────────────

  @Get('me/gap-preview')
  @VerifiedAuth(UserRole.CANDIDATE)
  @ApiOperation({
    summary: 'Preview gap analysis',
    description:
      'Returns gap analysis BEFORE applying.\n\n' + 'Does not persist data.',
  })
  @ApiQuery({
    name: 'jobId',
    required: true,
    description: 'Job to preview gap analysis against',
    example: 'job_123',
  })
  @ApiBadRequestResponse({
    description: 'Missing jobId',
    type: ErrorResponseDto,
  })
  @ApiOkResponse({
    description:
      'Gap preview with updated scorecard, skills gap, and review outcome.',
    schema: {
      example: {
        success: true,
        data: {
          jobId: 'job_123',
          fitTier: 'PROBE',
          reviewOutcome: 'NEEDS_REVIEW',
          roleFitScore: 72,
          gapSummary:
            'Review-recommended candidate. High backend capability. Missing Rust experience.',
          matchedTechnologies: ['Solana'],
          missingTechnologies: ['Rust'],
          skillsGap: {
            requiredSkills: ['Rust', 'Solana'],
            matchedTechnologies: ['Solana'],
            missingTechnologies: ['Rust'],
            gaps: [{ skill: 'Rust', severity: 'DEALBREAKER' }],
          },
          scorecard: {
            summary: 'Backend-focused developer with Solana activity.',
            capabilities: {
              backend: { score: 0.82, confidence: 'high' },
              frontend: { score: 0.42, confidence: 'medium' },
              devops: { score: 0.51, confidence: 'medium' },
            },
            ownership: {
              ownedProjects: 5,
              activelyMaintained: 3,
              confidence: 'high',
            },
            impact: {
              activityLevel: 'high',
              consistency: 'strong',
              externalContributions: 12,
              confidence: 'high',
            },
            reputation: null,
            organizations: [],
            interactionProfile: null,
            stack: { languages: ['TypeScript'], tools: ['Anchor'] },
            web3: { ecosystem: 'solana', ecosystemPRs: 2 },
          },
        },
      },
    },
  })
  async getGapPreview(@Req() req: any, @Query('jobId') jobId: string) {
    if (!jobId) throw new BadRequestException('jobId is required');

    const preview = await this.applicantsService.getGapPreview(
      jobId,
      req.user.id,
    );
    return this.handleSuccess(preview);
  }

  // ─────────────────────────────
  // APPLY (CANDIDATE)
  // ─────────────────────────────

  @Post('me/:jobId')
  @VerifiedAuth(UserRole.CANDIDATE)
  @ApiOperation({
    summary: 'Apply for a job',
    description:
      'Allows an authenticated candidate to apply for an ACTIVE job.\n\n' +
      'This triggers:\n' +
      '- Gap analysis\n' +
      '- Decision card generation\n' +
      '- Initial pipeline stage = APPLIED',
  })
  @ApiParam({
    name: 'jobId',
    description: 'Job ID',
    example: 'job_123',
  })
  @ApiCreatedResponse({
    description: 'Application submitted successfully',
    type: ApplyResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Already applied OR missing analysis',
    type: ErrorResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid JWT token',
    type: ErrorResponseDto,
  })
  async apply(@Req() req: any, @Param('jobId') jobId: string) {
    const application = await this.applicantsService.apply(jobId, req.user.id);
    return this.handleCreated(
      application,
      'Application submitted successfully',
    );
  }

  // ─────────────────────────────
  // CANDIDATE: MY APPLICATIONS
  // ─────────────────────────────

  @Get('me')
  @VerifiedAuth(UserRole.CANDIDATE)
  @ApiOperation({
    summary: 'Get my applications',
    description:
      'Returns candidate applications with human-readable pipeline stages.',
  })
  async getMyApplications(@Req() req: any) {
    const list = await this.applicantsService.findCandidateApplications(
      req.user.id,
    );
    return this.handleSuccess(list);
  }

  // ─────────────────────────────
  // HR: LIST APPLICATIONS
  // ─────────────────────────────

  @Get('hr/jobs/:jobId')
  @UseGuards(HrAuthGuard)
  @ApiOperation({
    summary: 'List job applications (HR)',
    description:
      'Returns all applications for a job including:\n' +
      '- HR decision view\n' +
      '- Technical evaluation\n' +
      '- Candidate info\n\n' +
      'Supports filtering.',
  })
  @ApiParam({
    name: 'jobId',
    example: 'job_123',
  })
  @ApiQuery({
    name: 'fitTier',
    required: false,
    enum: FitTier,
    example: 'STRONG',
  })
  @ApiQuery({
    name: 'minScore',
    required: false,
    example: 70,
  })
  @ApiQuery({
    name: 'pipelineStage',
    required: false,
    enum: PipelineStage,
  })
  @ApiOkResponse({
    description: 'Applications retrieved successfully',
  })
  async getJobApplications(
    @Req() req: any,
    @Param('jobId') jobId: string,
    @Query() filters: ApplicationFiltersDto,
  ) {
    const list = await this.applicantsService.findByJob(
      jobId,
      req.user.id,
      filters,
    );
    return this.handleSuccess(list);
  }

  // ─────────────────────────────
  // HR: APPLICATION DETAIL
  // ─────────────────────────────

  @Get('hr/:appId')
  @UseGuards(HrAuthGuard)
  @ApiOperation({
    summary: 'Get application FULL details',
    description:
      'Returns full application data including:\n' +
      '- Decision card\n' +
      '- Gap report\n' +
      '- Candidate profiles\n' +
      '- Interview questions',
  })
  @ApiParam({
    name: 'appId',
    example: 'app_123',
  })
  @ApiOkResponse({
    description: 'Returns application detail with dual-view shape (HR vs CTO)',
    schema: {
      example: {
        id: 'app_123',
        hrView: {
          verdict: 'PROCEED',
          reviewOutcome: 'OK',
          hrSummary: 'Strong candidate with clear career growth',
          reputationNote: 'Verified by 5 peers on-chain',
          appliedAt: '2026-04-20T10:00:00Z',
          pipelineStage: 'INTERVIEW_TECHNICAL',
          candidate: { name: 'Alice Smith', username: 'alice_dev' },
        },
        technicalView: {
          technicalSummary:
            'Expert in React and Node.js. Missing Rust experience.',
          strengths: ['Architecture', 'Testing'],
          risks: ['No experience with high-scale DBs'],
          roleFitScore: 85,
          fitTier: 'STRONG',
          scorecard: {
            summary: 'Full-stack developer with strong backend capability.',
            capabilities: {
              backend: { score: 0.82, confidence: 'high' },
              frontend: { score: 0.68, confidence: 'medium' },
              devops: { score: 0.44, confidence: 'medium' },
            },
            ownership: {
              ownedProjects: 5,
              activelyMaintained: 3,
              confidence: 'medium',
            },
            impact: {
              activityLevel: 'high',
              consistency: 'strong',
              externalContributions: 12,
              confidence: 'high',
            },
            reputation: null,
            organizations: [],
            interactionProfile: null,
            stack: {
              languages: ['TypeScript'],
              tools: ['NestJS', 'PostgreSQL'],
            },
            web3: null,
          },
          skillsGap: {
            requiredSkills: ['Rust', 'Solana'],
            matchedTechnologies: ['Solana'],
            missingTechnologies: ['Rust'],
            gaps: [{ skill: 'Rust', severity: 'DEALBREAKER' }],
          },
        },
        decisionCard: {
          verdict: 'PROCEED',
          hrSummary: '...',
          technicalSummary: '...',
          gapDetail: {
            overallVerdict: 'PROCEED',
            technologyFitScore: 0.85,
            gaps: [{ dimension: 'Rust', severity: 'SIGNIFICANT' }],
          },
        },
        interviewQuestions: {
          stage: 'INTERVIEW_TECHNICAL',
          questions: [{ question: 'Explain X', priority: 'MUST_ASK' }],
        },
        notObservable: ['Communication quality'],
        pipelineStageHistory: [{ stage: 'APPLIED', movedAt: '...' }],
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Application not found',
    type: ErrorResponseDto,
  })
  async getApplicationDetail(@Req() req: any, @Param('appId') appId: string) {
    const detail = await this.applicantsService.findById(appId, req.user.id);
    return this.handleSuccess(detail);
  }

  // ─────────────────────────────
  // HR: APPLY DECISION (SHORTLIST/REJECT)
  // ─────────────────────────────
  @Patch('hr/:appId/decision')
  @UseGuards(HrAuthGuard)
  @ApiOperation({
    summary: 'Apply review decision',
    description: 'Marks an application as SHORTLISTED, REJECTED, or REVIEWED.',
  })
  @ApiParam({ name: 'appId', example: 'app_123' })
  @ApiBody({ type: ApplyDecisionDto })
  @ApiOkResponse({ description: 'Decision applied successfully' })
  async applyDecision(
    @Req() req: any,
    @Param('appId') appId: string,
    @Body() body: ApplyDecisionDto,
  ) {
    const updated = await this.applicantsService.applyDecision(
      appId,
      body.status,
      req.user.id,
    );
    return this.handleSuccess(updated, 'Decision applied successfully');
  }

  // ─────────────────────────────
  // HR: EXPORT SCORECARD (HTML)
  // ─────────────────────────────
  @Get('hr/:appId/scorecard')
  @UseGuards(HrAuthGuard)
  @ApiOperation({
    summary: 'Export candidate scorecard (HTML)',
    description: 'Generates a printable HTML scorecard for external sharing.',
  })
  @ApiParam({ name: 'appId', example: 'app_123' })
  @ApiOkResponse({ description: 'HTML scorecard generated' })
  async getScorecard(
    @Req() req: any,
    @Param('appId') appId: string,
    @Res() res: Response,
  ) {
    const application = await this.applicantsService.findRawById(
      appId,
      req.user.id,
    );
    if (!application) throw new NotFoundException('Application not found');

    const html = this.scorecardRendererService.render(application);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }

  // ─────────────────────────────
  // HR: ADVANCE STAGE
  // ─────────────────────────────
  @Patch('hr/:appId/stage')
  @UseGuards(HrAuthGuard)
  @ApiOperation({
    summary: 'Advance pipeline stage',
    description:
      'Moves candidate forward in hiring pipeline.\n\n' +
      'Validates transitions and may generate interview questions.',
  })
  @ApiParam({ name: 'appId', example: 'app_123' })
  @ApiBody({ type: AdvanceStageDto })
  @ApiOkResponse({ description: 'Stage updated successfully' })
  async advanceApplicationStage(
    @Req() req: any,
    @Param('appId') appId: string,
    @Body() body: AdvanceStageDto,
  ) {
    const updated = await this.applicantsService.advanceStage(
      appId,
      req.user.id,
      body.stage,
      body.note,
    );

    return this.handleSuccess(updated, 'Pipeline stage advanced');
  }

  // ─────────────────────────────
  // HR: INTERVIEW QUESTIONS
  // ─────────────────────────────

  @Get('hr/:appId/interview-questions')
  @UseGuards(HrAuthGuard)
  @ApiOperation({
    summary: 'Get interview questions',
    description:
      'Returns generated interview questions.\n\n' +
      'Includes the frozen final scorecard and skills gap context used for technical probing.\n\n' +
      'Optional:\n' +
      '- Filter by stage\n' +
      '- Defaults to latest set',
  })
  @ApiParam({ name: 'appId', example: 'app_123' })
  @ApiQuery({
    name: 'stage',
    required: false,
    enum: PipelineStage,
  })
  @ApiOkResponse({
    description:
      'Interview question set with scorecard and skills gap context.',
    schema: {
      example: {
        success: true,
        data: {
          stage: 'INTERVIEW_TECHNICAL',
          audienceType: 'technical',
          questions: [
            {
              question: 'How would you design a Rust service for this role?',
              rationale: 'Rust is a required gap.',
              dimension: 'Technology: Rust',
              priority: 'MUST_ASK',
            },
          ],
          scorecard: {
            capabilities: {
              backend: { score: 0.82, confidence: 'high' },
              frontend: { score: 0.42, confidence: 'medium' },
              devops: { score: 0.51, confidence: 'medium' },
            },
            stack: { languages: ['TypeScript'], tools: ['Anchor'] },
            web3: { ecosystem: 'solana' },
          },
          skillsGap: {
            requiredSkills: ['Rust', 'Solana'],
            matchedTechnologies: ['Solana'],
            missingTechnologies: ['Rust'],
          },
        },
      },
    },
  })
  async getInterviewQuestions(
    @Req() req: any,
    @Param('appId') appId: string,
    @Query('stage') stage?: string,
  ) {
    const app = await this.applicantsService.findById(appId, req.user.id);

    const rawApp = await this.applicantsService['prisma'].shortlist.findUnique({
      where: { id: appId },
      select: { interviewQuestions: true },
    });

    const interviewQuestions = (rawApp as any)?.interviewQuestions || [];
    const scorecardContext = {
      scorecard: (app as any).technicalView?.scorecard ?? null,
      skillsGap: (app as any).technicalView?.skillsGap ?? null,
    };

    if (!interviewQuestions.length) {
      return this.handleSuccess({ questionsFound: false, ...scorecardContext });
    }

    if (stage) {
      const match = interviewQuestions.find((q: any) => q.stage === stage);
      if (match) return this.handleSuccess({ ...match, ...scorecardContext });
    }

    return this.handleSuccess({
      ...interviewQuestions[interviewQuestions.length - 1],
      ...scorecardContext,
    });
  }
}
