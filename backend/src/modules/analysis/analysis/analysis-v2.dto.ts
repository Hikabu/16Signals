/**
 * Analysis v2 DTOs — Request/Response types for the GitIntel analysis API.
 *
 * These DTOs use proper class structures with @ApiProperty for Swagger AND
 * class-validator decorators for runtime validation (required by global
 * ValidationPipe with whitelist+forbidNonWhitelisted).
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 7
 * Aligned with: USER_FLOWS_AND_GOALS_VERIFICATION.md Section 1
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  MinLength,
  IsEnum,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { CvClaim } from '../modules/module.interface';

// ─── Nested config class ───────────────────────────────────────────

/** Analysis configuration with seniority and role archetype */
export class AnalysisConfigDto {
  @ApiProperty({
    description: 'Candidate seniority level',
    enum: ['intern', 'junior', 'mid', 'senior', 'staff', 'principal'],
    example: 'senior',
  })
  @IsEnum(['intern', 'junior', 'mid', 'senior', 'staff', 'principal'])
  seniority: 'intern' | 'junior' | 'mid' | 'senior' | 'staff' | 'principal';

  @ApiProperty({
    description: 'Role archetype / specialization',
    enum: ['backend', 'frontend', 'platform', 'data_ml', 'security', 'mobile', 'generalist'],
    example: 'backend',
  })
  @IsEnum(['backend', 'frontend', 'platform', 'data_ml', 'security', 'mobile', 'generalist'])
  role_archetype: 'backend' | 'frontend' | 'platform' | 'data_ml' | 'security' | 'mobile' | 'generalist';

  @ApiPropertyOptional({
    description: 'Job description text for Section F role matching',
    example: 'We are looking for a Senior Backend Engineer with 5+ years of experience in Node.js...',
  })
  @IsOptional()
  @IsString()
  jd_text?: string;
}

// ─── Light Analysis DTO ────────────────────────────────────────────

export class CreateLightAnalysisDto {
  @ApiProperty({
    description: 'GitHub username to analyze',
    example: 'torvalds',
  })
  @IsString()
  @MinLength(1)
  githubUsername: string;

  @ApiProperty({
    description: 'Analysis configuration',
    type: () => AnalysisConfigDto,
  })
  @ValidateNested()
  @Type(() => AnalysisConfigDto)
  config: AnalysisConfigDto;
}

// ─── CV Verify DTO ─────────────────────────────────────────────────

export class CreateCvVerifyDto {
  @ApiProperty({
    description: 'GitHub username to analyze',
    example: 'torvalds',
  })
  @IsString()
  @MinLength(1)
  githubUsername: string;

  @ApiProperty({
    description: 'Raw CV text (paste from CV or ATS)',
    example: 'Senior Backend Engineer at Acme Corp (2020-2025)\n' +
      'Led the development of microservices architecture...',
  })
  @IsString()
  @MinLength(1)
  cvText: string;

  @ApiProperty({
    description: 'Analysis configuration',
    type: () => AnalysisConfigDto,
  })
  @ValidateNested()
  @Type(() => AnalysisConfigDto)
  config: AnalysisConfigDto;
}

// ─── Deep Analysis DTO ─────────────────────────────────────────────

export class CreateDeepAnalysisDto {
  @ApiProperty({
    description: 'GitHub username to analyze',
    example: 'torvalds',
  })
  @IsString()
  @MinLength(1)
  githubUsername: string;

  @ApiProperty({
    description: 'Analysis configuration',
    type: () => AnalysisConfigDto,
  })
  @ValidateNested()
  @Type(() => AnalysisConfigDto)
  config: AnalysisConfigDto;
}

// ─── Response DTOs ─────────────────────────────────────────────────

/** Job creation response returned immediately by POST endpoints */
export class AnalysisCreateResponseDto {
  @ApiProperty({
    description: 'The analysis job ID for status polling',
    example: 'light_a1b2c3_7f4e2d1a',
  })
  @IsString()
  jobId: string;

  @ApiProperty({
    description: 'Initial job status',
    enum: ['queued', 'cached', 'failed'],
    example: 'queued',
  })
  @IsEnum(['queued', 'cached', 'failed'])
  status: 'queued' | 'cached' | 'failed';
}

/**
 * Full analysis result returned when status === 'completed'.
 * Maps to the canonical EvidenceBriefOutput stored in AnalysisJob.result.
 * Response-only DTO — no runtime validation needed on the way out.
 */
export class AnalysisResultDto {
  @ApiProperty({
    description: 'Unique job identifier',
    example: 'light_a1b2c3_7f4e2d1a',
  })
  jobId: string;

  @ApiProperty({
    description: 'Final job status',
    example: 'complete',
  })
  status: string;

  @ApiProperty({
    description: 'Full Evidence Brief in Markdown format (includes raw debug appendix)',
    example: '# Evidence Brief: @torvalds\n\n## A. Profile in 90 Seconds\n...',
  })
  briefMarkdown: string;

  @ApiProperty({
    description: 'Structured sections A–G for programmatic consumption',
  })
  sections: {
    A: string;
    B: string;
    C: string;
    D: string;
    E: string;
    F: string | null;
    G: string;
  };

  @ApiProperty({
    description: 'Per-primitive (P1–P7) assessment summaries',
  })
  primitives: Array<{
    primitive_id: string;
    module_id: string;
    confidence: string;
    score_label: string;
    evidence_count: number;
    interview_probe: string | null;
  }>;

  @ApiProperty({
    description: 'Quick lookup map of primitive_id → numeric score (0–90)',
    example: { p1: 90, p2: 65, p3: 35 },
  })
  primitiveScores: Record<string, number>;

  @ApiProperty({
    description: 'All flags raised across all modules, sorted HARD first',
  })
  flags: Array<{
    flag_id: string;
    flag_type: string;
    severity: string;
    module_id: string;
    description: string;
    escalate_to_hiring_manager: boolean;
    clear_without_interview: boolean;
    interview_probe: string | null;
  }>;

  @ApiProperty({
    description: 'Total number of flags raised',
    example: 2,
  })
  flagCount: number;

  @ApiProperty({
    description: 'Generated interview questions (3–5)',
  })
  interviewQuestions: Array<{
    type: string;
    question: string;
    source_primitive: string;
    evaluation_criteria: string;
  }>;

  @ApiProperty({
    description: 'All module results with full evidence chains — for debug',
  })
  moduleResults: Array<{
    module_id: string;
    primitive_id: string | null;
    confidence: string;
    score_label: string;
    evidence: Array<{
      signal: string;
      corpus_field: string;
      value: unknown;
      interpretation: string;
    }>;
    flags: Array<{
      flag_id: string;
      flag_type: string;
      severity: string;
      module_id: string;
      description: string;
      escalate_to_hiring_manager: boolean;
      clear_without_interview: boolean;
      interview_probe: string | null;
    }>;
    interview_probe: string | null;
    raw_signals_used: string[];
  }>;

  @ApiProperty({
    description: 'Number of modules executed',
    example: 14,
  })
  moduleCount: number;

  @ApiProperty({
    description: 'Job metadata',
  })
  metadata: {
    username: string;
    mode: string;
    generatedAt: string;
    schemaVersion: string;
    seniority?: string;
    roleArchetype?: string;
    cvClaimsCount?: number;
  };

  @ApiProperty({
    description: 'Total analysis duration in milliseconds',
    example: 45200,
  })
  totalDurationMs: number;

  @ApiPropertyOptional({
    description: 'Deep Mode clone statistics (only present for Deep Mode analyses)',
  })
  cloneStats?: {
    reposCloned: number;
    reposSucceeded: number;
    reposFailed: number;
    totalCloneTimeMs: number;
    secretLeaksFound: number;
  };
}

/**
 * Job status response returned by GET /api/v2/analysis/:jobId.
 * Status transitions: queued → wave_1 → wave_2a(cond) → wave_2b/c/d → wave_3 → wave_4 → completed.
 */
export class AnalysisStatusResponseDto {
  @ApiProperty({
    description: 'The analysis job ID',
    example: 'light_a1b2c3_7f4e2d1a',
  })
  jobId: string;

  @ApiProperty({
    description: 'Current pipeline stage',
    enum: [
      'queued',
      'wave_1',
      'wave_2a',
      'wave_2b',
      'wave_2c',
      'wave_2d',
      'wave_3',
      'wave_4',
      'completed',
      'failed',
    ],
    example: 'completed',
  })
  status:
    | 'queued'
    | 'wave_1'
    | 'wave_2a'
    | 'wave_2b'
    | 'wave_2c'
    | 'wave_2d'
    | 'wave_3'
    | 'wave_4'
    | 'completed'
    | 'failed';

  @ApiProperty({
    description: 'Progress percentage (0-100)',
    example: 100,
  })
  progress: number;

  @ApiPropertyOptional({
    description: 'Analysis result (present when status === "completed")',
    type: () => AnalysisResultDto,
  })
  result?: AnalysisResultDto;

  @ApiPropertyOptional({
    description: 'Error message (present when status === "failed")',
    example: 'GitHub user not found',
  })
  error?: string;
}

// ─── Helper ─────────────────────────────────────────────────────────

/** Build AnalysisConfig from DTO config for internal use */
export function buildAnalysisConfig(
  dto: CreateLightAnalysisDto | CreateCvVerifyDto,
): {
  seniority: 'intern' | 'junior' | 'mid' | 'senior' | 'staff' | 'principal';
  role_archetype: 'backend' | 'frontend' | 'platform' | 'data_ml' | 'security' | 'mobile' | 'generalist';
  jd_text?: string;
  cv_claims?: CvClaim[];
} {
  return {
    seniority: dto.config.seniority,
    role_archetype: dto.config.role_archetype,
    jd_text: dto.config.jd_text,
  };
}