/**
 * TraceRecorder — Decision-trace interface for the analysis pipeline.
 *
 * Provides three verbosity levels:
 *   summary   → No trace calls. Only ModuleResult. Zero overhead.
 *   decision  → Gates, determinative thresholds, branch selection with blocked-higher analysis, flags.
 *   full      → Decision + all derived metrics + threshold-linked raw corpus inputs.
 *
 * Modules inject TraceRecorderFactory via @Optional() and call trace?.method() at
 * every gate, determinative threshold, branch decision, and flag raise.
 * All calls use optional chaining — zero production impact when not activated.
 */
import { ModuleResult } from '../modules/module-result.types';

// ─── Verbosity ──────────────────────────────────────────────────────

export type TraceVerbosity = 'summary' | 'decision' | 'full';

// ─── Blocked Branch ─────────────────────────────────────────────────

/** Why a higher-confidence branch was not taken */
export interface BlockedBranch {
  /** The higher branch that was blocked, e.g. 'strong' */
  branch: string;
  /** The specific condition(s) that prevented it, e.g. 'activeMonths=11 < 12' */
  blockedBy: string;
}

// ─── Threshold Event ────────────────────────────────────────────────

/** A single determinative threshold crossing (feeds into a decision) */
export interface ThresholdEvent {
  /** Human-readable metric name, e.g. 'cadenceMet' */
  name: string;
  /** The observed value at time of check */
  observedValue: number | boolean;
  /** The threshold compared against (number, range, or boolean condition) */
  threshold: number | [number, number] | boolean;
  /** Comparison operator */
  operator: '>' | '<' | '>=' | '<=' | 'between';
  /** Whether the threshold was met */
  triggered: boolean;
}

// ─── Threshold-Linked Raw Input ─────────────────────────────────────

/** A raw corpus field read that fed into a specific threshold (FULL verbosity only) */
export interface RawSignalRead {
  /** Corpus field path, e.g. 'commit_signals.commit_frequency_by_month' */
  field: string;
  /** The raw value from the corpus */
  value: unknown;
  /** Which threshold this input feeds (links input -> threshold) */
  linkedToThreshold?: string;
}

// ─── Derived Metric ─────────────────────────────────────────────────

/** A computed intermediate value (FULL verbosity only) */
export interface DerivedMetric {
  /** Metric name, e.g. 'activeMonths' */
  name: string;
  /** The computed value */
  value: unknown;
  /** Optional computation description */
  computation?: string;
}

// ─── Decision Branch ────────────────────────────────────────────────

/** A recorded decision point with the branch taken and why higher branches were blocked */
export interface DecisionBranch {
  /** Human-readable decision name, e.g. 'confidence_determination' */
  decisionPoint: string;
  /** Which outcome was selected */
  branchTaken: string;
  /** Input values that drove the decision */
  inputs: Record<string, unknown>;
  /** Higher branches and what blocked them (empty array if already at max) */
  blockedHigherBranches?: BlockedBranch[];
}

// ─── Early Exit ─────────────────────────────────────────────────────

/** A gate condition that caused the module to return early */
export interface EarlyExit {
  /** Gate name, e.g. 'pr_reviewer_count < 5' */
  gate: string;
  /** Whether the gate triggered */
  condition: boolean;
  /** The result returned, e.g. 'observability_gap' */
  result: string;
}

// ─── Flag Raise ─────────────────────────────────────────────────────

/** A flag raised by the module, with the trigger metrics that caused it */
export interface FlagRaised {
  /** Flag identifier, e.g. 'COMMIT_INFLATION_SOFT' */
  flagId: string;
  /** The observed metrics that triggered the flag */
  triggerMetrics: Record<string, unknown>;
}

// ─── Module Decision Trace ──────────────────────────────────────────

/** Complete decision-chain trace for a single module execution */
export interface ModuleDecisionTrace {
  /** Module identifier, e.g. 'p1_execution_reliability' */
  moduleId: string;
  /** Verbosity level at which this trace was collected */
  verbosity: TraceVerbosity;
  /** Early-exit gates (decision level) */
  earlyExits: EarlyExit[];
  /** Determinative threshold crossings that feed the decision (decision level) */
  thresholdEvents: ThresholdEvent[];
  /** Decision branches with blocked-higher analysis (decision level) */
  decisionBranches: DecisionBranch[];
  /** Flags raised with trigger metrics (decision level) */
  flagsRaised: FlagRaised[];
  /** All derived metrics computed (FULL level only) */
  derivedMetrics: DerivedMetric[];
  /** Raw corpus field values linked to thresholds (FULL level only) */
  rawSignalReads: RawSignalRead[];
  /** The final ModuleResult produced */
  finalResult: ModuleResult;
}

// ─── TraceRecorder Interface ────────────────────────────────────────

/**
 * Each module execution creates an isolated TraceRecorder instance via the factory.
 * All calls are fire-and-forget — the trace is captured but never blocks or throws.
 */
export interface TraceRecorder {
  /** Start a new trace for a module execution */
  startTrace(moduleId: string): void;

  /** Record a determinative threshold that feeds the decision (decision level) */
  captureThreshold(
    name: string,
    observedValue: number,
    threshold: number | [number, number],
    operator: '>' | '<' | '>=' | '<=' | 'between',
    triggered: boolean,
    /** Full-verbosity: link raw corpus field to this threshold */
    sourceFields?: Array<[string, unknown]>,
  ): void;

  /** Record a decision branch with why-higher-blocked analysis (decision level) */
  captureBranch(
    decisionPoint: string,
    branchTaken: string,
    inputs: Record<string, unknown>,
    blockedHigherBranches?: BlockedBranch[],
  ): void;

  /** Record an early-exit gate condition (decision level) */
  captureEarlyExit(gate: string, condition: boolean, result: string): void;

  /** Record a flag being raised with trigger metrics (decision level) */
  captureFlagRaised(flagId: string, triggerMetrics: Record<string, unknown>): void;

  /** Record a derived intermediate metric (FULL level only) */
  captureMetric(name: string, value: unknown, computation?: string): void;

  /** Finalize and return the complete decision chain */
  endTrace(result: ModuleResult): ModuleDecisionTrace;
}

// ─── TraceRecorderFactory Interface ─────────────────────────────────

/** Injectable token for the TraceRecorderFactory */
export const TRACE_RECORDER_FACTORY = 'TRACE_RECORDER_FACTORY';

/**
 * Factory that creates isolated TraceRecorder instances.
 * One instance per module execution — parallel-safe for Wave 1 concurrency.
 * Production default: creates a no-op recorder or factory is not registered at all.
 */
export interface TraceRecorderFactory {
  create(verbosity?: TraceVerbosity): TraceRecorder;
}
