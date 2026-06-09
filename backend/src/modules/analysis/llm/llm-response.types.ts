/**
 * LLM Response Types — Typed interfaces for Deepseek v4 response data.
 *
 * Each response type corresponds to a specific LLM call in Waves 3 & 4:
 *   Wave 3 Batch:  5 analysis tasks in a single LLM call
 *   Wave 4:        Narrative generation + Interview questions
 *
 * All types include fallback defaults for graceful degradation.
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 5
 */

// ─── Wave 3: Batch Analysis Output ──────────────────────────────────

/** AI leverage classification for P6 module */
export interface AILeverageClassification {
  classification:
    | 'ai_architect'
    | 'ai_operator'
    | 'ai_passenger'
    | 'traditional'
    | 'disclosure_flag';
  confidence_0_to_100: number;
  reasoning: string;
  key_evidence: string[];
}

/** Output of the single Wave 3 batch LLM call */
export interface Wave3BatchOutput {
  /** Commit message quality scores (0–100), same order as input */
  commit_quality: number[];
  /** PR description quality scores (0–100) */
  pr_description_quality: number[];
  /** Review depth classification per comment */
  review_depth: Array<'LGTM_only' | 'surface' | 'root_cause' | 'architectural'>;
  /** Hard problem classification per commit/PR */
  hard_problem_detection: Array<'hard_problem' | 'moderate' | 'routine' | 'unclear'>;
  /** AI leverage classification */
  ai_leverage: AILeverageClassification;
}

// ─── Wave 4: Narrative Output ───────────────────────────────────────

/** Narrative section text for the Evidence Brief */
export interface NarrativeOutput {
  /** Section A: Profile in 90 Seconds (2-3 paragraphs) */
  profile_summary: string;
  /** Section B: Tech Reality vs CV Claims (bullet-point cross-ref) */
  cv_cross_reference: string;
  /** Section C: Work Pattern Intelligence (1-2 paragraphs) */
  work_pattern_intelligence: string;
}

// ─── Wave 4: Interview Questions ────────────────────────────────────

export type InterviewQuestionType =
  | 'experience_depth'
  | 'problem_solving'
  | 'team_collaboration'
  | 'technical_judgment';

/** A single interview question generated from module results */
export interface InterviewQuestion {
  type: InterviewQuestionType;
  question: string;
  /** Which primitive/module triggered this question (e.g. 'p1', 'ag1') */
  source_primitive: string;
  /** Context for the interviewer: what to listen for in the answer */
  evaluation_criteria: string;
}

// ─── Flag Output (standardized across the system) ────────────────────

export interface FlagOutput {
  flag_id: string;
  flag_type: 'SOFT' | 'HARD';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  module_id: string;
  description: string;
  escalate_to_hiring_manager: boolean;
  clear_without_interview: boolean;
  interview_probe: string | null;
}

// ─── Primitive Result (canonical per-primitive output) ───────────────

export interface PrimitiveResult {
  primitive_id: string;        // e.g. 'p1', 'p2', ... 'p7'
  module_id: string;           // e.g. 'p1_execution_reliability'
  confidence: 'strong' | 'moderate' | 'low' | 'observability_gap' | 'insufficient_data';
  score_label: string;
  evidence_count: number;
  interview_probe: string | null;
}

// ─── Evidence Brief Output (canonical, the single source of truth) ───

export interface EvidenceBriefSections {
  A: string;   // Profile in 90 Seconds
  B: string;   // Tech Reality vs CV Claims
  C: string;   // Work Pattern Intelligence
  D: string;   // Red Flags & Verification Gaps
  E: string;   // Interview Intelligence
  F: string | null;  // Role & Stack Match (conditional on JD)
  G: string;   // What This Evaluation Cannot Tell You
}

export interface BriefMetadata {
  username: string;
  mode: string;
  generatedAt: string;
  schemaVersion: string;
  seniority?: string;
  roleArchetype?: string;
  cvClaimsCount?: number;
}

/**
 * The canonical Evidence Brief output produced by BriefAssemblerService.
 * This is the single source of truth — all consumers (controller, scorecard,
 * cache) derive their views from this shape.
 */
export interface EvidenceBriefOutput {
  /** Unique job identifier */
  jobId: string;
  /** Final status */
  status: 'complete' | 'partial' | 'failed';

  /** Rendered full Markdown brief (all sections A–G + raw appendix) */
  briefMarkdown: string;

  /** Structured sections for programmatic consumption */
  sections: EvidenceBriefSections;

  /** Per-primitive (P1–P7) assessment summaries */
  primitives: PrimitiveResult[];

  /** Quick lookup map: { p1: 90, p2: 65, ... } */
  primitiveScores: Record<string, number>;

  /** All flags raised across all modules, sorted HARD first */
  flags: FlagOutput[];
  flagCount: number;

  /** Generated interview questions (3–5 per analysis) */
  interviewQuestions: InterviewQuestion[];

  /** Full raw module results — for admin/debug inspection */
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

  /** Metadata */
  metadata: BriefMetadata;

  /** Total pipeline duration in milliseconds */
  totalDurationMs: number;
}

// ─── Scorecard Cached Display Types ──────────────────────────────────

/** Snapshot data — safe for public display, always available */
export interface ScorecardSnapshot {
  username: string;
  avatarUrl?: string;
  techStack: { languages: string[]; tools: string[] };
  archetypeSummary: string;
  aiLeverageClassification?: string;
  evRung: number;
}

/** Per-mode cached view data stored on GithubProfile.scorecard */
export interface ViewData {
  jobId: string;
  analyzedAt: string;
  primitives: PrimitiveResult[];
  primitiveScores: Record<string, number>;
  flags: FlagOutput[];
  flagCount: number;
  sections: EvidenceBriefSections;
  interviewQuestions: InterviewQuestion[];
  metadata: BriefMetadata & { totalDurationMs: number };
}

/** The structure stored in GithubProfile.scorecard JSONB */
export interface CachedScorecard {
  lastAnalysisJobId: string;
  lastAnalysisMode: 'light' | 'deep';
  lastAnalyzedAt: string;
  snapshot: ScorecardSnapshot;
  light: ViewData | null;
  deep: ViewData | null;
}

// ─── Fallback / Default Values ───────────────────────────────────────

/** Fallback output when Wave 3 LLM call fails */
export function defaultWave3BatchOutput(): Wave3BatchOutput {
  return {
    commit_quality: [],
    pr_description_quality: [],
    review_depth: [],
    hard_problem_detection: [],
    ai_leverage: {
      classification: 'traditional',
      confidence_0_to_100: 0,
      reasoning: 'LLM service unavailable — conservative fallback applied',
      key_evidence: ['llm_fallback_triggered'],
    },
  };
}

/** Fallback narrative when Wave 4 LLM call fails */
export function defaultNarrativeOutput(): NarrativeOutput {
  return {
    profile_summary:
      'Narrative generation unavailable. Review the Evidence Brief sections below for structured assessment.',
    cv_cross_reference:
      'CV cross-reference unavailable. The module-level evidence items below provide signal-level assessment.',
    work_pattern_intelligence:
      'Work pattern intelligence unavailable. Review primitive scores and flags for detailed assessment.',
  };
}