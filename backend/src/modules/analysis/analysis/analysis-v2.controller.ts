/**
 * Analysis v2 Controller — REST API endpoints for the GitIntel analysis pipeline.
 *
 * Endpoints:
 *   POST /api/v2/analysis/light        — Light Mode analysis (synchronous)
 *   POST /api/v2/analysis/cv-verify    — Light Mode + CV claims cross-reference
 *   GET  /api/v2/analysis/status       — Status check (always returns healthy)
 *
 * Architecture: Direct controller → JobDispatcher flow (synchronous for now).
 * BullMQ integration is optional and can be added later for async processing.
 *
 * Tracing: Every request emits structured console.log with jobId for tracing
 * across the full pipeline (corpus → waves → LLM → brief).
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 7
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
import { Octokit } from 'octokit';
import { JobDispatcherService } from '../orchestration/job-dispatcher.service';
import { CvClaimExtractorService } from '../brief/cv-claim-extractor.service';
import { OctokitFactory } from '../../scoring/github-adapter/octokit.factory';
import {
  CreateLightAnalysisDto,
  CreateCvVerifyDto,
  AnalysisCreateResponseDto,
  AnalysisStatusResponseDto,
  buildAnalysisConfig,
} from './analysis-v2.dto';
import { AnalysisConfig } from '../modules/module.interface';

@Controller('api/v2/analysis')
export class AnalysisV2Controller {
  constructor(
    private readonly jobDispatcher: JobDispatcherService,
    private readonly cvExtractor: CvClaimExtractorService,
    private readonly octokitFactory: OctokitFactory,
  ) {}

  /**
   * POST /api/v2/analysis/light
   * Run a Light Mode analysis on a GitHub username.
   * Returns the complete Evidence Brief synchronously.
   */
  @Post('light')
  async createLightAnalysis(
    @Body() dto: CreateLightAnalysisDto,
  ): Promise<AnalysisCreateResponseDto> {
    const jobId = this.generateJobId('light');
    console.log(
      `[AnalysisV2Controller] phase=light_request jobId=${jobId} ` +
      `username=${dto.githubUsername} seniority=${dto.config.seniority}`,
    );

    try {
      const config = buildAnalysisConfig(dto);
      const octokit = await this.octokitFactory.forJob(null);

      const result = await this.jobDispatcher.dispatchLightMode(
        octokit,
        jobId,
        dto.githubUsername,
        config,
      );

      console.log(
        `[AnalysisV2Controller] phase=light_complete jobId=${jobId} ` +
        `status=${result.status} durationMs=${result.totalDurationMs}`,
      );

      return {
        jobId,
        status: result.status === 'complete' ? 'queued' : 'failed',
      };
    } catch (error) {
      console.log(
        `[AnalysisV2Controller] phase=light_error jobId=${jobId} ` +
        `error=${(error as Error).message}`,
      );
      throw new HttpException(
        (error as Error).message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /api/v2/analysis/cv-verify
   * Run Light Mode analysis enriched with CV claims cross-reference.
   * 1. Extracts structured claims from CV text
   * 2. Injects claims into AnalysisConfig.cv_claims
   * 3. Calls dispatchLightMode with enriched config
   *
   * Works with cached corpus — CV claims are NOT cached, they are
   * passed in config and consumed by the EV module + Brief Assembler.
   */
  @Post('cv-verify')
  async createCvVerify(
    @Body() dto: CreateCvVerifyDto,
  ): Promise<AnalysisCreateResponseDto> {
    const jobId = this.generateJobId('cv_verify');
    console.log(
      `[AnalysisV2Controller] phase=cv_request jobId=${jobId} ` +
      `username=${dto.githubUsername} cvTextLength=${dto.cvText.length}`,
    );

    try {
      // 1. Extract CV claims
      const extraction = this.cvExtractor.extractFromText(dto.cvText);
      console.log(
        `[AnalysisV2Controller] phase=cv_extracted jobId=${jobId} ` +
        `claims=${extraction.claims.length} ` +
        `method=${extraction.extractionMethod} ` +
        `companies=${extraction.claims.filter(c => c.type === 'company').length} ` +
        `roles=${extraction.claims.filter(c => c.type === 'role').length}`,
      );

      // 2. Build config with CV claims
      const config: AnalysisConfig = {
        seniority: dto.config.seniority,
        role_archetype: dto.config.role_archetype,
        jd_text: dto.config.jd_text,
        cv_claims: extraction.claims,
      };

      // 3. Run Light Mode with enriched config
      const octokit = await this.octokitFactory.forJob(null);
      const result = await this.jobDispatcher.dispatchLightMode(
        octokit,
        jobId,
        dto.githubUsername,
        config,
      );

      console.log(
        `[AnalysisV2Controller] phase=cv_complete jobId=${jobId} ` +
        `status=${result.status} durationMs=${result.totalDurationMs} ` +
        `claims=${extraction.claims.length}`,
      );

      return {
        jobId,
        status: result.status === 'complete' ? 'queued' : 'failed',
      };
    } catch (error) {
      console.log(
        `[AnalysisV2Controller] phase=cv_error jobId=${jobId} ` +
        `error=${(error as Error).message}`,
      );
      throw new HttpException(
        (error as Error).message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /api/v2/analysis/:jobId/result
   * Retrieve the full result of a completed analysis.
   * This is a simplified endpoint — in production this would
   * query a database table (evidence_briefs).
   */
  @Get(':jobId/result')
  async getResult(@Param('jobId') jobId: string) {
    console.log(
      `[AnalysisV2Controller] phase=result_request jobId=${jobId}`,
    );

    // Note: Full result persistence requires Stage 7 database integration.
    // For now, this returns a placeholder indicating the sync endpoint.
    return {
      jobId,
      status: 'complete',
      message: 'Result persistence coming in Stage 7 database integration. ' +
        'Use the /api/v2/analysis/light or /cv-verify endpoints for synchronous results.',
    };
  }

  /**
   * Generate a unique job ID for tracing.
   */
  private generateJobId(prefix: string): string {
    const crypto = require('crypto');
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `${prefix}_${timestamp}_${random}`;
  }
}