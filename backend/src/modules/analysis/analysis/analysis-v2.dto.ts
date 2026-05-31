/**
 * Analysis v2 DTOs — Request/Response types for the new GitIntel API.
 *
 * These DTOs replace the legacy CreateAnalysisDto & AnalysisResponseDto.
 * They support Light Mode, CV verification, and cached corpus lookups.
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 7
 */

import { AnalysisConfig, CvClaim } from '../modules/module.interface';

// ─── Request DTOs ───────────────────────────────────────────────────

/** DTO for POST /api/v2/analysis/light */
export class CreateLightAnalysisDto {
  /** GitHub username to analyze */
  githubUsername: string;

  /** Analysis configuration */
  config: {
    seniority: 'intern' | 'junior' | 'mid' | 'senior' | 'staff' | 'principal';
    role_archetype: 'backend' | 'frontend' | 'platform' | 'data_ml' | 'security' | 'mobile' | 'generalist';
    jd_text?: string;
    cv_claims?: CvClaim[];
  };
}

/** DTO for POST /api/v2/analysis/cv-verify */
export class CreateCvVerifyDto {
  /** GitHub username to analyze */
  githubUsername: string;

  /** Raw CV text (extracted from PDF or pasted) */
  cvText: string;

  /** Analysis configuration */
  config: {
    seniority: 'intern' | 'junior' | 'mid' | 'senior' | 'staff' | 'principal';
    role_archetype: 'backend' | 'frontend' | 'platform' | 'data_ml' | 'security' | 'mobile' | 'generalist';
    jd_text?: string;
  };
}

// ─── Response DTOs ─────────────────────────────────────────────────

/** Response for analysis creation endpoints */
export class AnalysisCreateResponseDto {
  /** The analysis job ID */
  jobId: string;

  /** Initial status */
  status: 'queued' | 'cached' | 'failed';
}

/** Response for analysis status/result endpoints */
export class AnalysisStatusResponseDto {
  jobId: string;
  status: 'queued' | 'collecting' | 'processing' | 'complete' | 'failed';
  progress: number;

  /** Present only when status === 'complete' */
  result?: {
    briefMarkdown: string;
    moduleCount: number;
    flagCount: number;
    totalDurationMs: number;
  };

  /** Present only when status === 'failed' */
  error?: string;
}

// ─── Helper ─────────────────────────────────────────────────────────

/** Build AnalysisConfig from DTO config */
export function buildAnalysisConfig(dto: CreateLightAnalysisDto | CreateCvVerifyDto): AnalysisConfig {
  return {
    seniority: dto.config.seniority,
    role_archetype: dto.config.role_archetype,
    jd_text: dto.config.jd_text,
    cv_claims: 'cv_claims' in dto.config ? dto.config.cv_claims : undefined,
  };
}