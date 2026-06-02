/**
 * Analysis v2 Controller — REST API endpoints for the GitIntel analysis pipeline.
 *
 * Endpoints (all callable from Swagger UI at /api/docs):
 *   POST /api/v2/analysis/light        — Light Mode analysis
 *   POST /api/v2/analysis/cv-verify    — Light Mode + CV claims
 *   POST /api/v2/analysis/deep         — Deep Mode with private repos
 *   GET  /api/v2/analysis/:jobId       — Poll for result
 *   GET  /api/v2/analysis/status       — Health check
 *
 * Two execution modes:
 *   USE_SYNC_PIPELINE=true  → runs synchronously (dev/demo)
 *   otherwise               → enqueues to BullMQ 'analysis' queue (production)
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiExtraModels,
} from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JobDispatcherService } from '../orchestration/job-dispatcher.service';
import { CvClaimExtractorService } from '../brief/cv-claim-extractor.service';
import { OctokitFactory } from '../../scoring/github-adapter/octokit.factory';
import {
  CreateLightAnalysisDto,
  CreateCvVerifyDto,
  CreateDeepAnalysisDto,
  AnalysisConfigDto,
  AnalysisCreateResponseDto,
  AnalysisStatusResponseDto,
  AnalysisResultDto,
  buildAnalysisConfig,
} from './analysis-v2.dto';
import { DeepCollectorService } from '../data-collector/deep/deep-collector.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AnalysisConfig } from '../modules/module.interface';
import { ModuleResult } from '../modules/module-result.types';

async function resolveGithubProfileId(
  prisma: PrismaService,
  username: string,
): Promise<string> {
  const existing = await prisma.githubProfile.findUnique({
    where: { githubUsername: username },
    select: { id: true },
  });
  if (existing) return existing.id;

  const newProfile = await prisma.githubProfile.create({
    data: {
      githubUsername: username,
      githubUserId: `anon_${username}_${Date.now()}`,
      encryptedToken: '',
      scopes: [],
    },
  });
  return newProfile.id;
}

function buildFullResult(
  briefMarkdown: string,
  briefJson: Record<string, string>,
  moduleResults: ModuleResult[],
  flags: Array<{
    flag_id: string;
    flag_type: 'SOFT' | 'HARD';
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    module_id: string;
    description: string;
    escalate_to_hiring_manager: boolean;
    clear_without_interview: boolean;
    interview_probe: string | null;
  }>,
  totalDurationMs: number,
) {
  return {
    briefMarkdown,
    briefJson,
    moduleResults: moduleResults.map((r) => ({
      module_id: r.module_id,
      primitive_id: r.primitive_id,
      confidence: r.confidence,
      score_label: r.score_label,
      evidence: r.evidence,
      flags: r.flags,
      interview_probe: r.interview_probe,
      raw_signals_used: r.raw_signals_used,
    })),
    flags,
    moduleCount: moduleResults.length,
    flagCount: flags.length,
    totalDurationMs,
  } as any;
}

@ApiTags('Analysis v2')
@ApiExtraModels(
  AnalysisConfigDto,
  AnalysisResultDto,
  CreateLightAnalysisDto,
  CreateCvVerifyDto,
  CreateDeepAnalysisDto,
  AnalysisCreateResponseDto,
  AnalysisStatusResponseDto,
)
@Controller('api/v2/analysis')
export class AnalysisV2Controller {
  constructor(
    private readonly jobDispatcher: JobDispatcherService,
    private readonly cvExtractor: CvClaimExtractorService,
    private readonly octokitFactory: OctokitFactory,
    private readonly deepCollector: DeepCollectorService,
    private readonly prisma: PrismaService,
    @InjectQueue('analysis') private readonly analysisQueue: Queue,
  ) {}

  @Post('light')
  @ApiOperation({
    summary: 'Create Light Mode analysis',
    description:
      'Analyze a GitHub profile using public signals only. ' +
      'Returns a jobId immediately. Poll GET /api/v2/analysis/:jobId to get results.\n\n' +
      '**Pipeline:** Corpus acquisition → Wave orchestration (14 modules) → LLM processing → Evidence Brief\n\n' +
      '**Status flow:** queued → wave_1 → wave_2a(cond) → wave_2b/c/d → wave_3 → wave_4 → completed',
  })
  @ApiBody({ type: CreateLightAnalysisDto })
  @ApiResponse({ status: 201, description: 'Analysis job created', type: AnalysisCreateResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async createLightAnalysis(@Body() dto: CreateLightAnalysisDto): Promise<AnalysisCreateResponseDto> {
    const jobId = this.generateJobId('light');
    console.log(`[AnalysisV2Controller] phase=light_request jobId=${jobId} username=${dto.githubUsername}`);

    try {
      const profileId = await resolveGithubProfileId(this.prisma, dto.githubUsername);
      await this.prisma.analysisJob.create({
        data: {
          id: jobId,
          githubProfileId: profileId,
          status: 'queued',
          progress: 0,
          input: { githubUsername: dto.githubUsername, mode: 'light', config: dto.config } as any,
        },
      });

      if (process.env.USE_SYNC_PIPELINE === 'true') {
        // Synchronous path (dev/demo)
        const config = buildAnalysisConfig(dto);
        const octokit = await this.octokitFactory.forJob(null);
        const result = await this.jobDispatcher.dispatchLightMode(octokit, jobId, dto.githubUsername, config);
        await this.prisma.analysisJob.update({
          where: { id: jobId },
          data: {
            status: 'completed',
            progress: 100,
            result: buildFullResult(result.briefMarkdown, result.briefJson, result.moduleResults, result.flags, result.totalDurationMs),
          },
        });
        console.log(`[AnalysisV2Controller] phase=light_complete jobId=${jobId} durationMs=${result.totalDurationMs}`);
      } else {
        // Production path: enqueue to BullMQ
        await this.analysisQueue.add('light', {
          jobId,
          githubUsername: dto.githubUsername,
          config: buildAnalysisConfig(dto),
        });
        console.log(`[AnalysisV2Controller] phase=light_enqueued jobId=${jobId} queue=analysis`);
      }

      return { jobId, status: 'queued' };
    } catch (error) {
      console.log(`[AnalysisV2Controller] phase=light_error jobId=${jobId} error=${(error as Error).message}`);
      await this.prisma.analysisJob.update({ where: { id: jobId }, data: { status: 'failed', error: (error as Error).message } }).catch(() => {});
      throw new HttpException((error as Error).message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('cv-verify')
  @ApiOperation({
    summary: 'CV Verification analysis',
    description:
      'Extract structured claims from CV text, then run Light Mode analysis enriched with those claims.\n\n' +
      '**Status flow:** queued → wave_1 → wave_2a(cond) → wave_2b/c/d → wave_3 → wave_4 → completed',
  })
  @ApiBody({ type: CreateCvVerifyDto })
  @ApiResponse({ status: 201, description: 'CV Verification job created', type: AnalysisCreateResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async createCvVerify(@Body() dto: CreateCvVerifyDto): Promise<AnalysisCreateResponseDto> {
    const jobId = this.generateJobId('cv_verify');
    console.log(`[AnalysisV2Controller] phase=cv_request jobId=${jobId} username=${dto.githubUsername}`);

    try {
      const extraction = this.cvExtractor.extractFromText(dto.cvText);
      console.log(`[AnalysisV2Controller] phase=cv_extracted jobId=${jobId} claims=${extraction.claims.length}`);

      const config: AnalysisConfig = {
        seniority: dto.config.seniority,
        role_archetype: dto.config.role_archetype,
        jd_text: dto.config.jd_text,
        cv_claims: extraction.claims,
      };

      const profileId = await resolveGithubProfileId(this.prisma, dto.githubUsername);
      await this.prisma.analysisJob.create({
        data: {
          id: jobId,
          githubProfileId: profileId,
          status: 'queued',
          progress: 0,
          input: { githubUsername: dto.githubUsername, mode: 'cv_verify', config, claimsExtracted: extraction.claims.length } as any,
        },
      });

      if (process.env.USE_SYNC_PIPELINE === 'true') {
        const octokit = await this.octokitFactory.forJob(null);
        const result = await this.jobDispatcher.dispatchLightMode(octokit, jobId, dto.githubUsername, config);
        await this.prisma.analysisJob.update({
          where: { id: jobId },
          data: {
            status: 'completed',
            progress: 100,
            result: { ...buildFullResult(result.briefMarkdown, result.briefJson, result.moduleResults, result.flags, result.totalDurationMs), claimsExtracted: extraction.claims.length } as any,
          },
        });
      } else {
        await this.analysisQueue.add('cv-verify', {
          jobId,
          githubUsername: dto.githubUsername,
          cvText: dto.cvText,
          config,
        });
        console.log(`[AnalysisV2Controller] phase=cv_enqueued jobId=${jobId} queue=analysis`);
      }

      return { jobId, status: 'queued' };
    } catch (error) {
      console.log(`[AnalysisV2Controller] phase=cv_error jobId=${jobId} error=${(error as Error).message}`);
      throw new HttpException((error as Error).message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('deep')
  @ApiOperation({
    summary: 'Create Deep Mode analysis',
    description:
      'Analyze a GitHub profile with private repo access via GitHub App installation.\n\n' +
      '**SLA:** 5–10 minutes. Poll GET /api/v2/analysis/:jobId for results.\n\n' +
      '**Status flow:** queued → wave_1 → wave_2a(cond) → wave_2b/c/d → wave_3 → wave_4 → completed',
  })
  @ApiBody({ type: CreateDeepAnalysisDto })
  @ApiResponse({ status: 201, description: 'Deep Mode analysis job created', type: AnalysisCreateResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'GitHub App installation not authorized' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async createDeepAnalysis(@Body() dto: CreateDeepAnalysisDto): Promise<AnalysisCreateResponseDto> {
    const jobId = this.generateJobId('deep');
    console.log(`[AnalysisV2Controller] phase=deep_request jobId=${jobId} username=${dto.githubUsername}`);

    try {
      const profileId = await resolveGithubProfileId(this.prisma, dto.githubUsername);
      await this.prisma.analysisJob.create({
        data: {
          id: jobId,
          githubProfileId: profileId,
          status: 'queued',
          progress: 0,
          input: { githubUsername: dto.githubUsername, mode: 'deep', installationId: dto.installationId, config: dto.config } as any,
        },
      });

      if (process.env.USE_SYNC_PIPELINE === 'true') {
        const octokit = await this.octokitFactory.forJob(null);
        const deepResult = await this.deepCollector.collectDeepMode(octokit, octokit, dto.githubUsername, dto.installationId, jobId);
        const config = { seniority: dto.config.seniority, role_archetype: dto.config.role_archetype, jd_text: dto.config.jd_text };
        const dispatchResult = await this.jobDispatcher.dispatchLightMode(octokit, jobId, dto.githubUsername, config);
        await this.prisma.analysisJob.update({
          where: { id: jobId },
          data: {
            status: 'completed',
            progress: 100,
            result: {
              ...buildFullResult(dispatchResult.briefMarkdown, dispatchResult.briefJson, dispatchResult.moduleResults, dispatchResult.flags, dispatchResult.totalDurationMs),
              cloneStats: { reposCloned: deepResult.reposCloned, reposSucceeded: deepResult.reposSucceeded, reposFailed: deepResult.reposFailed, totalCloneTimeMs: deepResult.totalDurationMs, secretLeaksFound: deepResult.secretLeaksFound ?? 0 },
            } as any,
          },
        });
        console.log(`[AnalysisV2Controller] phase=deep_complete jobId=${jobId}`);
      } else {
        await this.analysisQueue.add('deep', {
          jobId,
          githubUsername: dto.githubUsername,
          installationId: dto.installationId,
          config: { seniority: dto.config.seniority, role_archetype: dto.config.role_archetype, jd_text: dto.config.jd_text },
        });
        console.log(`[AnalysisV2Controller] phase=deep_enqueued jobId=${jobId} queue=analysis`);
      }

      return { jobId, status: 'queued' };
    } catch (error) {
      console.log(`[AnalysisV2Controller] phase=deep_error jobId=${jobId} error=${(error as Error).message}`);
      throw new HttpException((error as Error).message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':jobId')
  @ApiOperation({
    summary: 'Get analysis status and result',
    description:
      'Poll this endpoint with the jobId returned from POST endpoints.\n\n' +
      '**Status transitions:** queued → wave_1 → wave_2a(cond) → wave_2b → wave_2c → wave_2d → wave_3 → wave_4 → completed',
  })
  @ApiParam({ name: 'jobId', description: 'Job ID from POST endpoint', example: 'light_a1b2c3_7f4e2d1a', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Analysis status and result', type: AnalysisStatusResponseDto })
  @ApiResponse({ status: 404, description: 'Job ID not found' })
  async getResult(@Param('jobId') jobId: string): Promise<AnalysisStatusResponseDto> {
    console.log(`[AnalysisV2Controller] phase=result_request jobId=${jobId}`);

    const job = await this.prisma.analysisJob.findUnique({ where: { id: jobId } });
    if (!job) throw new HttpException('Job not found', HttpStatus.NOT_FOUND);

    const response: AnalysisStatusResponseDto = {
      jobId: job.id,
      status: this.normalizeStatus(job.status),
      progress: job.progress ?? 0,
    };

    if ((job.status === 'completed' || job.status === 'complete') && job.result) {
      const r = job.result as Record<string, unknown>;
      response.result = {
        briefMarkdown: (r.briefMarkdown as string) || '',
        briefJson: (r.briefJson as Record<string, string>) || {},
        moduleResults: (r.moduleResults as any) || [],
        flags: (r.flags as any) || [],
        moduleCount: (r.moduleCount as number) || 0,
        flagCount: (r.flagCount as number) || 0,
        totalDurationMs: (r.totalDurationMs as number) || 0,
      };
    }

    if (job.status === 'failed' && job.error) response.error = job.error;
    return response;
  }

  @Get('status')
  @ApiOperation({ summary: 'API health check', operationId: 'analysisV2HealthCheck' })
  @ApiResponse({ status: 200, description: 'Service is healthy', schema: { type: 'object', properties: { status: { type: 'string', example: 'healthy' }, timestamp: { type: 'string', example: '2026-06-01T04:00:00.000Z' }, serviceVersion: { type: 'string', example: '2.0.0' } } } })
  getStatus(): { status: string; timestamp: string; serviceVersion: string } {
    return { status: 'healthy', timestamp: new Date().toISOString(), serviceVersion: '2.0.0' };
  }

  private normalizeStatus(status: string): AnalysisStatusResponseDto['status'] {
    if (status === 'complete') return 'completed';
    const valid = ['queued', 'wave_1', 'wave_2a', 'wave_2b', 'wave_2c', 'wave_2d', 'wave_3', 'wave_4', 'completed', 'failed'];
    if (valid.includes(status)) return status as any;
    const map: Record<string, string> = { collecting: 'wave_1', corpus_built: 'wave_1', llm_pending: 'wave_3', processing: 'wave_2b' };
    return (map[status] as any) ?? 'queued';
  }

  private generateJobId(prefix: string): string {
    const crypto = require('crypto');
    return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
  }
}