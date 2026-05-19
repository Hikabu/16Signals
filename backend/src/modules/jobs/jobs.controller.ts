import {
  Controller,
  Post,
  Patch,
  Get,
  Body,
  Param,
  Req,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';

import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { ParseJobDescriptionDto } from './dto/parse-jd.dto';
import {
  ParsedJobRequirementsSwaggerDto,
  ParsedJobRequirementsDto,
  ParsedJobRequirementsSchema,
} from './dto/confirm-requirements.dto';
import { GetJobsQueryDto } from './dto/getJobsQuery.dto';
import { GetMyJobsQueryDto } from './dto/get-my-jobs-query.dto';
import { JobDescriptionParserService } from '../scoring/gap-analysis/job-description-parser.service';
import { diffParsedRequirements } from '../scoring/gap-analysis/jd-diff.util';
import { BaseController } from '../../shared/base.controller';
import { JwtAuthGuard } from '../auth-employer/guards/jwt-auth.guard';
import { Public } from '../auth-employer/decorators/public.decorator';
import { ErrorResponseDto } from './dto/errorResponse.dto';
import { JobResponseDto } from './dto/jobResponse.dto';
import { ParseJdResponseDto } from './dto/parseJdResponse.dto';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('Jobs')
@Controller('jobs')
export class JobsController extends BaseController {
  private readonly logger = new Logger(JobsController.name);

  constructor(
    private readonly jobsService: JobsService,
    private readonly parserService: JobDescriptionParserService,
  ) {
    super();
  }

  // ─────────────────────────────
  // PUBLIC: BROWSE JOBS
  // ─────────────────────────────

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Browse open jobs (Public)',
    description:
      'Returns a list of published jobs with filtering and pagination.',
  })
  @Get()
async getPublicJobs(@Query() query: GetJobsQueryDto) {
  const jobs = await this.jobsService.getPublicJobs({
    search: query.search,
    roleType: query.roleType,
    seniority: query.seniority,
    isWeb3: query.isWeb3,
    isEscrowFunded: query.isEscrowFunded,        
    isVerifiedPayer: query.isVerifiedPayer,    
    page: query.page,
    limit: query.limit,
  });

  return this.handleSuccess(jobs);
}

  // ─────────────────────────────
  // COMPANY JOBS
  // ─────────────────────────────

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt-employer'))
  @ApiOperation({
    summary: 'Get all jobs created by the authenticated company',
    description:
      'Returns all job posts owned by the authenticated company, ordered by newest first.\n\n' +
      'Useful for dashboards and job management views.',
  })
  @ApiOkResponse({
    description: 'List of jobs',
    type: [JobResponseDto],
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'job_1',
            title: 'Backend Engineer',
            status: 'ACTIVE',
          },
        ],
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
    type: ErrorResponseDto,
  })
  async getMyJobs(@Req() req: any, @Query() query: GetMyJobsQueryDto) {
    const jobs = await this.jobsService.findMyJobs(
      req.user.id,
      query.status ?? 'all',
    );
    return this.handleSuccess(jobs);
  }

  // ─────────────────────────────
  // CREATE JOB (canonical + legacy draft URL)
  // ─────────────────────────────

  @Post()
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt-employer'))
  @ApiOperation({
    summary: 'Create a new job post (draft)',
    description:
      'Same as POST /jobs/draft. Creates a DRAFT job for the authenticated company.',
  })
  @ApiBody({ type: CreateJobDto })
  @ApiCreatedResponse({
    description: 'Job created successfully',
    type: JobResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid JWT token',
    type: ErrorResponseDto,
  })
  async createAtRoot(@Req() req: any, @Body() dto: CreateJobDto) {
    const job = await this.jobsService.create(req.user.id, dto);
    return this.handleCreated(job, 'Job created successfully');
  }

 // ─────────────────────────────
  // PUBLIC:DRAFT
  // ─────────────────────────────

  @Public()
  @Post('draft')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt-employer'))
  @ApiOperation({
    summary: 'Create a new job post draft',
    description:
      'Creates a job in DRAFT status for the authenticated company.\n\n' +
      'Use this endpoint when a company wants to start drafting a job listing before publishing it.',
  })
  @ApiBody({ type: CreateJobDto })
  @ApiCreatedResponse({
    description: 'Job created successfully',
    type: JobResponseDto,
    schema: {
      example: {
        success: true,
        message: 'Job created successfully',
        data: {
          id: 'cma9x1k2p0000qwert123',
          title: 'Senior Backend Engineer',
          description: 'We are hiring...',
          status: 'DRAFT',
          companyId: 'company_123',
          createdAt: '2026-04-27T10:00:00.000Z',
          updatedAt: '2026-04-27T10:00:00.000Z',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid job payload',
    type: ErrorResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid JWT token',
    type: ErrorResponseDto,
  })
  async create(@Req() req: any, @Body() dto: CreateJobDto) {
    const job = await this.jobsService.create(req.user.id, dto);
    return this.handleCreated(job, 'Job created successfully');
  }

  // ─────────────────────────────
  // UPDATE DRAFT JOB
  // ─────────────────────────────

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt-employer'))
  @ApiOperation({
    summary: 'Update an existing draft job',
    description:
      'Updates fields of a DRAFT job owned by the authenticated company. This is used by the job creation wizard autosave flow.',
  })
  @ApiParam({
    name: 'id',
    description: 'Job ID',
    example: 'cma9x1k2p0000qwert123',
  })
  @ApiBody({ type: CreateJobDto })
  async updateDraft(@Req() req: any, @Param('id') id: string, @Body() dto: CreateJobDto) {
    const job = await this.jobsService.updateDraft(id, req.user.id, dto);
    return this.handleSuccess(job, 'Job updated successfully');
  }

  // ─────────────────────────────
  // PUBLIC: JOB DETAILS
  // ─────────────────────────────

  @Get(':id')
  @ApiOperation({
    summary: 'Get job details (Public)',
    description: 'Returns detailed information about a published job.',
  })
  async getPublicJobById(@Param('id') id: string) {
    const job = await this.jobsService.getPublicJobById(id);
    return this.handleSuccess(job);
  }
 


  // ─────────────────────────────
  // PARSE JD
  // ─────────────────────────────

  @Post(':id/parse-jd')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt-employer'))
  @ApiOperation({
    summary: 'Parse job description into structured requirements',
    description:
      'Uses AI to extract structured requirements (skills, seniority, weights).\n\n' +
      'Frontend should use this for preview before confirming requirements.',
  })
  @ApiParam({
    name: 'id',
    description: 'Job ID',
    example: 'cma9x1k2p0000qwert123',
  })
  @ApiBody({ type: ParseJobDescriptionDto })
  @ApiOkResponse({
    description: 'Parsed job requirements preview',
    type: ParseJdResponseDto,
  })
  async parseJd(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: ParseJobDescriptionDto,
  ) {
    await this.jobsService.verifyOwnership(id, req.user.id);

    const parsed = await this.parserService.parse(body.jdText);
    const diff = diffParsedRequirements(parsed);

    return this.handleSuccess({
      parsed,
      requiresReview: parsed.parserConfidence < 0.75,
      diff,
    });
  }

  // ─────────────────────────────
  // CONFIRM REQUIREMENTS
  // ─────────────────────────────

  @Post(':id/confirm-requirements')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt-employer'))
  @ApiOperation({
    summary: 'Confirm parsed job requirements',
    description:
      'Persists AI-parsed requirements into the job.\n\n' +
      'This step finalizes the structured scoring configuration.',
  })
  @ApiParam({
    name: 'id',
    description: 'Job ID',
    example: 'cma9x1k2p0000qwert123',
  })
  @ApiBody({ type: ParsedJobRequirementsSwaggerDto })
  @ApiOkResponse({
    description: 'Requirements confirmed and saved',
    type: JobResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Validation failed',
    type: ErrorResponseDto,
  })
  async confirmRequirements(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: ParsedJobRequirementsDto,
  ) {
    const job = await this.jobsService.verifyOwnership(id, req.user.id);

    if (
      job.parsedRequirements &&
      JSON.stringify(job.parsedRequirements) === JSON.stringify(body)
    ) {
      return this.handleSuccess(job, 'Job requirements confirmed and updated');
    }

    const updatedJob = await this.jobsService.confirmRequirements(
      id,
      req.user.id,
      body,
    );

    this.logger.log(
      `AUDIT_LOG: { entityType: 'Job', entityId: '${id}', action: 'REQUIREMENTS_CONFIRMED' }`,
    );

    return this.handleSuccess(
      updatedJob,
      'Job requirements confirmed and updated',
    );
  }
  // ─────────────────────────────
  // PUBLISH JOB
  // ─────────────────────────────

  @Post(':id/publish')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt-employer'))
  @ApiOperation({
    summary: 'Publish a job',
    description:
      'Changes job status from DRAFT to ACTIVE.\n\n' +
      'Once published, the job becomes visible to candidates.',
  })
  @ApiParam({
    name: 'id',
    description: 'Job ID',
    example: 'cma9x1k2p0000qwert123',
  })
  @ApiOkResponse({
    description: 'Job published',
    type: JobResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Job not found or does not belong to user',
    type: ErrorResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Forbidden',
    type: ErrorResponseDto,
  })
  async publish(@Req() req: any, @Param('id') id: string) {
    const job = await this.jobsService.publish(id, req.user.id);
    return this.handleSuccess(job, 'Job published successfully');
  }

  @Patch(':id/publish')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt-employer'))
  @ApiOperation({
    summary: 'Publish a job (PATCH)',
    description: 'Same as POST /jobs/:id/publish.',
  })
  @ApiParam({
    name: 'id',
    description: 'Job ID',
    example: 'cma9x1k2p0000qwert123',
  })
  @ApiOkResponse({
    description: 'Job published',
    type: JobResponseDto,
  })
  async publishPatch(@Req() req: any, @Param('id') id: string) {
    const job = await this.jobsService.publish(id, req.user.id);
    return this.handleSuccess(job, 'Job published successfully');
  }

  // ─────────────────────────────
  // CLOSE JOB
  // ─────────────────────────────

  @Post(':id/close')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt-employer'))
  @ApiOperation({
    summary: 'Close a job',
    description:
      'Marks the job as CLOSED.\n\n' +
      'Closed jobs are no longer visible or accepting applications.',
  })
  @ApiParam({
    name: 'id',
    description: 'Job ID',
    example: 'cma9x1k2p0000qwert123',
  })
  @ApiOkResponse({
    description: 'Job closed',
    type: JobResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Job not found',
    type: ErrorResponseDto,
  })
  async close(@Req() req: any, @Param('id') id: string) {
    const job = await this.jobsService.close(id, req.user.id);
    return this.handleSuccess(job, 'Job closed successfully');
  }
}
