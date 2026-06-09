import {
  PrimitiveResult,
  FlagOutput,
  InterviewQuestion,
  EvidenceBriefSections,
  CachedScorecard,
  ViewData as CanonicalViewData,
  ScorecardSnapshot as CanonicalSnapshot,
} from '../analysis/llm/llm-response.types';

// Re-export canonical types for the scorecard module
export type ScorecardResult = CachedScorecard;

/**
 * View type requested by the consumer.
 * - 'snapshot': CTO/Public — name, stack, 1-line summary, flag count
 * - 'recruiter': TA/HR — primitives, flags, interview questions
 * - 'deep': Hiring Manager — full sections with evidence
 * - 'public': Candidate/anonymous — snapshot only, safe
 * - 'raw': Admin/Dev — full moduleResults dump
 */
export type ScorecardViewType = 'snapshot' | 'recruiter' | 'deep' | 'public' | 'raw';

/**
 * Analysis mode requested.
 * - 'light': Light Mode results
 * - 'deep': Deep Mode results (falls back to light if deep unavailable)
 * - undefined: latest available mode
 */
export type RequestedMode = 'light' | 'deep' | undefined;

export interface PreviewRequestDto {
  githubUsername: string;
}

// ─── View-specific output types ────────────────────────────────────

/**
 * Snapshot view — safe for public display, always available.
 * Shows identity + tech stack only. No scores, no flags.
 */
export interface SnapshotUiOutput {
  type: 'snapshot';
  username: string;
  avatarUrl?: string;
  techStack: { languages: string[]; tools: string[] };
  archetypeSummary: string;
  analysisMode: string;
  lastAnalyzedAt: string | null;
}

/**
 * Recruiter view — for TA/HR screening.
 * Shows primitives with confidence bars, flags summary, interview questions.
 */
export interface RecruiterUiOutput {
  type: 'recruiter';
  username: string;
  avatarUrl?: string;
  analysisMode: string;
  lastAnalyzedAt: string | null;

  /** At-a-glance summary for quick triaging */
  atAGlance: {
    totalFlags: number;
    hardFlags: number;
    strongPrimitives: number;
    observabilityGaps: number;
    recommendedAction: 'interview' | 'screen' | 'flag_review';
  };

  /** Per-primitive confidence with probes */
  primitives: PrimitiveResult[];

  /** Flags split by type */
  flags: {
    hard: FlagOutput[];
    soft: FlagOutput[];
  };

  /** Interview questions grouped by type */
  interviewQuestions: InterviewQuestion[];
}

/**
 * Deep Dive view — for Hiring Managers.
 * Full sections with evidence narratives.
 */
export interface DeepDiveUiOutput {
  type: 'deep';
  username: string;
  avatarUrl?: string;
  analysisMode: string;
  lastAnalyzedAt: string | null;

  /** Section A: Profile in 90 seconds (narrative) */
  profileSummary: string;

  /** Section B: CV cross-reference */
  cvCrossRef: string;

  /** Section C: Work pattern intelligence */
  workPattern: string;

  /** Section F: Role & Stack Match (null if no JD provided) */
  roleMatch: string | null;

  /** Section G: What this evaluation cannot tell you */
  limitations: string;

  /** Full primitive details */
  primitives: PrimitiveResult[];
  primitiveScores: Record<string, number>;

  /** All flags with full details */
  flags: FlagOutput[];

  /** Interview questions */
  interviewQuestions: InterviewQuestion[];

  /** Metadata */
  metadata: Record<string, unknown>;
}

/**
 * Public view — anonymous-safe, minimal data.
 */
export interface PublicUiOutput {
  type: 'public';
  username: string;
  avatarUrl?: string;
  techStack: { languages: string[]; tools: string[] };
  archetypeSummary: string;
}

/**
 * Raw view — full moduleResults for admin/debug.
 */
export interface RawUiOutput {
  type: 'raw';
  username: string;
  analysisMode: string;
  lastAnalyzedAt: string | null;
  briefMarkdown: string;
  sections: EvidenceBriefSections;
  primitives: PrimitiveResult[];
  primitiveScores: Record<string, number>;
  flags: FlagOutput[];
  interviewQuestions: InterviewQuestion[];
  moduleResults: unknown[];
  metadata: Record<string, unknown>;
}

/** Union of all possible view outputs */
export type ViewSpecificOutput =
  | SnapshotUiOutput
  | RecruiterUiOutput
  | DeepDiveUiOutput
  | PublicUiOutput
  | RawUiOutput;