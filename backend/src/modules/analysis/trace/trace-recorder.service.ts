/**
 * TraceRecorderService — Factory + IsolatedTraceRecorder + verbosity gating.
 *
 * Architecture:
 *   TraceRecorderFactory.create(verbosity?)
 *     └─> IsolatedTraceRecorder instance (one per module execution)
 *           ├─> All capture*() methods guarded: return immediately if verbosity='summary'
 *           ├─> captureMetric() guarded: only records at verbosity='full'
 *           └─> sourceFields on captureThreshold(): only recorded at verbosity='full'
 *
 * Thread-safety: IsolatedTraceRecorder is stateless per-instance. Each Wave 1
 * parallel module gets its own instance. No shared mutable state.
 *
 * Integration: Modules inject the factory via @Optional() and call trace?.method().
 * If the factory is not provided (production default), the optional chain skips silently.
 */
import { Injectable, Optional } from '@nestjs/common';
import {
  TraceVerbosity,
  TraceRecorder,
  TraceRecorderFactory,
  ModuleDecisionTrace,
  BlockedBranch,
  ThresholdEvent,
  DecisionBranch,
  EarlyExit,
  FlagRaised,
  DerivedMetric,
  RawSignalRead,
  TRACE_RECORDER_FACTORY,
} from './trace-recorder.interface';
import { ModuleResult } from '../modules/module-result.types';

// ─── IsolatedTraceRecorder ──────────────────────────────────────────

/**
 * One instance per module execution. All capture*() methods are light
 * appends to internal arrays — no I/O, no blocking.
 */
class IsolatedTraceRecorder implements TraceRecorder {
  private moduleId = '';
  private readonly verbosity: TraceVerbosity;

  private earlyExits: EarlyExit[] = [];
  private thresholdEvents: ThresholdEvent[] = [];
  private decisionBranches: DecisionBranch[] = [];
  private flagsRaised: FlagRaised[] = [];
  private derivedMetrics: DerivedMetric[] = [];
  private rawSignalReads: RawSignalRead[] = [];
  private started = false;

  constructor(verbosity: TraceVerbosity = 'decision') {
    this.verbosity = verbosity;
  }

  startTrace(moduleId: string): void {
    if (!this.started) {
      this.moduleId = moduleId;
      this.started = true;
    }
  }

  captureThreshold(
    name: string,
    observedValue: number,
    threshold: number | [number, number],
    operator: '>' | '<' | '>=' | '<=' | 'between',
    triggered: boolean,
    sourceFields?: Array<[string, unknown]>,
  ): void {
    if (this.verbosity === 'summary') return;
    this.thresholdEvents.push({ name, observedValue, threshold, operator, triggered });

    // Full verbosity: link raw corpus fields to the threshold
    if (this.verbosity === 'full' && sourceFields) {
      for (const [field, value] of sourceFields) {
        this.rawSignalReads.push({ field, value, linkedToThreshold: name });
      }
    }
  }

  captureBranch(
    decisionPoint: string,
    branchTaken: string,
    inputs: Record<string, unknown>,
    blockedHigherBranches?: BlockedBranch[],
  ): void {
    if (this.verbosity === 'summary') return;
    this.decisionBranches.push({ decisionPoint, branchTaken, inputs, blockedHigherBranches });
  }

  captureEarlyExit(gate: string, condition: boolean, result: string): void {
    if (this.verbosity === 'summary') return;
    this.earlyExits.push({ gate, condition, result });
  }

  captureFlagRaised(flagId: string, triggerMetrics: Record<string, unknown>): void {
    if (this.verbosity === 'summary') return;
    this.flagsRaised.push({ flagId, triggerMetrics });
  }

  captureMetric(name: string, value: unknown, computation?: string): void {
    if (this.verbosity !== 'full') return; // FULL level only
    this.derivedMetrics.push({ name, value, computation });
  }

  endTrace(result: ModuleResult): ModuleDecisionTrace {
    const trace: ModuleDecisionTrace = {
      moduleId: this.moduleId,
      verbosity: this.verbosity,
      earlyExits: this.earlyExits,
      thresholdEvents: this.thresholdEvents,
      decisionBranches: this.decisionBranches,
      flagsRaised: this.flagsRaised,
      derivedMetrics: this.derivedMetrics,
      rawSignalReads: this.rawSignalReads,
      finalResult: result,
    };

    // Reset for potential reuse (though current usage creates one instance per execution)
    this.earlyExits = [];
    this.thresholdEvents = [];
    this.decisionBranches = [];
    this.flagsRaised = [];
    this.derivedMetrics = [];
    this.rawSignalReads = [];
    this.started = false;

    return trace;
  }
}

// ─── TraceRecorderFactory Implementation ────────────────────────────

@Injectable()
export class TraceRecorderFactoryService implements TraceRecorderFactory {
  private globalVerbosity: TraceVerbosity;

  constructor(@Optional() verbosity?: TraceVerbosity) {
    this.globalVerbosity = verbosity ?? 'decision';
  }

  /**
   * Create a new isolated recorder for a single module execution.
   * The instance verbosity can override the global setting.
   */
  create(verbosity?: TraceVerbosity): TraceRecorder {
    return new IsolatedTraceRecorder(verbosity ?? this.globalVerbosity);
  }
}

// ─── Re-export token for convenience ────────────────────────────────

export { TRACE_RECORDER_FACTORY } from './trace-recorder.interface';
