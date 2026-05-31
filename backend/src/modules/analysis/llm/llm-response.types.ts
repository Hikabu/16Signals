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

// ─── Evidence Brief Output (assembled) ──────────────────────────────

/** The structured output of the Brief Assembler */
export interface EvidenceBriefOutput {
  /** Rendered Markdown brief */
  briefMarkdown: string;
  /** Structured JSON brief */
  briefJson: Record<string, unknown>;
  /** Primitive scores keyed by primitive_id */
  primitiveScores: Record<string, number>;
  /** All flags from all modules */
  redFlags: Array<{
    flag_id: string;
    flag_type: 'SOFT' | 'HARD';
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    module_id: string;
    description: string;
  }>;
  /** Generated interview questions */
  interviewQuestions: InterviewQuestion[];
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
      'Work pattern analysis unavailable. Review primitive scores and flags for detailed assessment.',
  };
}