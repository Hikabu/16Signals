import { z } from 'zod';

/**
 * Per-primitive (P1–P7) assessment schema.
 * Replaces the legacy 3-capability (backend/frontend/devops) model.
 */
export const PrimitiveUiSchema = z.object({
  primitive_id: z.enum(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']).describe(
    'Primitive identifier: p1–p7',
  ),
  module_id: z.string().describe('Full module identifier, e.g. p1_execution_reliability'),
  confidence: z
    .enum(['strong', 'moderate', 'low', 'observability_gap', 'insufficient_data'])
    .describe('Confidence level for this primitive'),
  score_label: z.string().describe('Human-readable assessment label'),
  evidence_count: z.number().int().min(0).describe('Number of evidence items cited'),
  interview_probe: z.string().nullable().describe(
    'Recommended interview probe when confidence < strong',
  ),
});

/**
 * Flag output schema.
 */
export const FlagUiSchema = z.object({
  flag_id: z.string().describe('Unique flag identifier'),
  flag_type: z.enum(['SOFT', 'HARD']).describe('Flag classification'),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).describe('Flag severity'),
  module_id: z.string().describe('Module that raised the flag'),
  description: z.string().describe('Human-readable flag description'),
  escalate_to_hiring_manager: z.boolean().describe(
    'Whether to escalate to hiring manager',
  ),
  clear_without_interview: z.boolean().describe(
    'Whether flag can be cleared without interview',
  ),
  interview_probe: z.string().nullable().describe(
    'Recommended interview probe',
  ),
});

/**
 * Interview question schema.
 */
export const InterviewQuestionSchema = z.object({
  type: z.string().describe('Question type category'),
  question: z.string().describe('The interview question text'),
  source_primitive: z.string().describe('Which primitive triggered this question'),
  evaluation_criteria: z.string().describe('What to evaluate in the answer'),
});

// ═══════════════════════════════════════════════════════════════════
// View-specific schemas
// ═══════════════════════════════════════════════════════════════════

/**
 * Snapshot view — CTO/public quick overview.
 */
export const SnapshotUiSchema = z.object({
  type: z.literal('snapshot'),
  username: z.string(),
  avatarUrl: z.string().optional(),
  techStack: z.object({
    languages: z.array(z.string()),
    tools: z.array(z.string()),
  }),
  archetypeSummary: z.string(),
  analysisMode: z.string(),
  lastAnalyzedAt: z.string().nullable(),
});

/**
 * Recruiter view — TA/HR screening.
 */
export const RecruiterUiSchema = z.object({
  type: z.literal('recruiter'),
  username: z.string(),
  avatarUrl: z.string().optional(),
  analysisMode: z.string(),
  lastAnalyzedAt: z.string().nullable(),
  atAGlance: z.object({
    totalFlags: z.number().int().min(0),
    hardFlags: z.number().int().min(0),
    strongPrimitives: z.number().int().min(0).max(7),
    observabilityGaps: z.number().int().min(0).max(7),
    recommendedAction: z.enum(['interview', 'screen', 'flag_review']),
  }),
  primitives: z.array(PrimitiveUiSchema),
  flags: z.object({
    hard: z.array(FlagUiSchema),
    soft: z.array(FlagUiSchema),
  }),
  interviewQuestions: z.array(InterviewQuestionSchema),
});

/**
 * Deep Dive view — Hiring Manager full brief.
 */
export const DeepDiveUiSchema = z.object({
  type: z.literal('deep'),
  username: z.string(),
  avatarUrl: z.string().optional(),
  analysisMode: z.string(),
  lastAnalyzedAt: z.string().nullable(),
  profileSummary: z.string(),
  cvCrossRef: z.string(),
  workPattern: z.string(),
  roleMatch: z.string().nullable(),
  limitations: z.string(),
  primitives: z.array(PrimitiveUiSchema),
  primitiveScores: z.record(z.string(), z.number()),
  flags: z.array(FlagUiSchema),
  interviewQuestions: z.array(InterviewQuestionSchema),
  metadata: z.record(z.string(), z.unknown()),
});

/**
 * Public view — anonymous-safe, minimal data.
 */
export const PublicUiSchema = z.object({
  type: z.literal('public'),
  username: z.string(),
  avatarUrl: z.string().optional(),
  techStack: z.object({
    languages: z.array(z.string()),
    tools: z.array(z.string()),
  }),
  archetypeSummary: z.string(),
});

/**
 * Raw view — full debug data dump.
 */
export const RawUiSchema = z.object({
  type: z.literal('raw'),
  username: z.string(),
  analysisMode: z.string(),
  lastAnalyzedAt: z.string().nullable(),
  briefMarkdown: z.string(),
  sections: z.object({
    A: z.string(),
    B: z.string(),
    C: z.string(),
    D: z.string(),
    E: z.string(),
    F: z.string().nullable(),
    G: z.string(),
  }),
  primitives: z.array(PrimitiveUiSchema),
  primitiveScores: z.record(z.string(), z.number()),
  flags: z.array(FlagUiSchema),
  interviewQuestions: z.array(InterviewQuestionSchema),
  moduleResults: z.array(z.unknown()),
  metadata: z.record(z.string(), z.unknown()),
});

/**
 * View-specific output union — matches ViewSpecificOutput type.
 */
export const ScorecardUiSchema = z.union([
  SnapshotUiSchema,
  RecruiterUiSchema,
  DeepDiveUiSchema,
  PublicUiSchema,
  RawUiSchema,
]);

/**
 * Preview / internal request.
 */
export const ScorecardPreviewRequestSchema = z.object({
  githubUsername: z.string().min(1),
});

// ── Response wrapper ──────────────────────────────────────────────

export const ScorecardResponseSchema = z.object({
  ui: ScorecardUiSchema,
  raw: z.any().optional(),
});

// ── Legacy re-exports for backward compatibility ──────────────────

/** @deprecated Use PrimitiveUiSchema instead */
export const CapabilityItemSchema = z.object({
  key: z.enum(['backend', 'frontend', 'devops']),
  label: z.string(),
  score: z.number().min(0).max(1),
  displayScore: z.number().min(0).max(100),
  confidence: z.string(),
  strength: z.enum(['strong', 'moderate', 'weak']),
});

export type ScorecardUiDto = z.infer<typeof ScorecardUiSchema>;
export type CapabilityItem = z.infer<typeof CapabilityItemSchema>;