/**
 * Module Result Type Definitions
 *
 * Every analysis module returns a ModuleResult containing structured
 * evidence, confidence levels, flags, and optional interview probes.
 *
 * Reference: Analysys_specs_architecture.md Section 1.3
 */

/** Confidence levels for module results */
export type ModuleConfidence =
  | 'strong'
  | 'moderate'
  | 'low'
  | 'observability_gap'
  | 'insufficient_data';

/** Flag severity levels */
export type FlagSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

/** Flag type */
export type FlagType = 'SOFT' | 'HARD';

/**
 * A single piece of evidence cited from the Signal Corpus.
 * Each evidence item cites an exact corpus field path and value.
 */
export interface Evidence {
  /** Human-readable signal name */
  signal: string;
  /** Exact corpus field path, e.g. 'commit_signals.median_commit_size_lines' */
  corpus_field: string;
  /** Observed value */
  value: unknown;
  /** What this value means in context */
  interpretation: string;
}

/**
 * A flag raised by an analysis module (anti-gaming, security, etc.).
 * Flags are surfaced in Evidence Brief Section D.
 */
export interface Flag {
  /** Unique flag identifier, e.g. 'SECRET_LEAK_HARD' */
  flag_id: string;
  /** SOFT or HARD */
  flag_type: FlagType;
  /** Severity level */
  severity: FlagSeverity;
  /** Module that raised this flag */
  module_id: string;
  /** Human-readable description of the flag */
  description: string;
  /** Corpus field paths that support this flag */
  evidence_paths: string[];
  /** Whether this flag should be escalated to the hiring manager */
  escalate_to_hiring_manager: boolean;
  /** Whether this flag can be cleared without an interview */
  clear_without_interview: boolean;
  /** NEVER true — system never auto-rejects */
  auto_reject: false;
  /** Recommended interview probe for this flag, if applicable */
  interview_probe: string | null;
}

/**
 * The structured output of a single analysis module.
 * Contains confidence assessment, evidence citations, flags, and probes.
 */
export interface ModuleResult {
  /** Module identifier, e.g. 'p1_execution_reliability' */
  module_id: string;
  /** Primitive ID ('p1'–'p7') or null for anti-gaming/EV modules */
  primitive_id: string | null;
  /** Overall confidence for this module's assessment */
  confidence: ModuleConfidence;
  /** Mandatory score label (uses CONFIDENCE_LANGUAGE constants) */
  score_label: string;
  /** Evidence items, each citing a corpus field path + value */
  evidence: Evidence[];
  /** Flags raised by this module (empty if none) */
  flags: Flag[];
  /** Interview probe generated when confidence < 'strong', null otherwise */
  interview_probe: string | null;
  /** Corpus field paths consumed by this module */
  raw_signals_used: string[];
}