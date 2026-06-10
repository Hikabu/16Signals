/**
 * TraceContextHolder — AsyncLocalStorage-based trace context for module execution.
 *
 * This is THE primary integration point for modules. Instead of constructor injection,
 * modules import this class and call static methods at decision points.
 *
 * HOW IT WORKS:
 *   ModuleRegistry calls TraceContext.startTrace(moduleId) before mod.run()
 *   and TraceContext.endTrace(result) after.
 *
 *   Inside a module, at decision points:
 *     TraceContext.captureThreshold('cadenceMet', ...);
 *     TraceContext.captureBranch('confidence_determination', ...);
 *     TraceContext.captureEarlyExit('pr_reviewer_count < 5', ...);
 *     TraceContext.captureFlagRaised('COMMIT_INFLATION_SOFT', ...);
 *
 *   When no trace context is active (no factory registered, or verbosity='summary'),
 *   all capture*() calls silently no-op via optional chaining on the ALS store.
 *
 * PARALLEL SAFETY:
 *   Uses AsyncLocalStorage. Each module execution gets its own recorder instance.
 *   Wave 1 (AG1, AG2, AG3 in parallel) works correctly because each module's
 *   synchronous run() executes entirely within its own ALS context.
 *
 * USAGE IN A MODULE:
 *   import { TraceContext } from '../../trace/trace-context-holder';
 *
 *   run(corpus, config): ModuleResult {
 *     // ... compute metrics ...
 *     TraceContext.captureThreshold('cadenceMet', activeMonths, 9, '>=', cadenceMet);
 *     // ... determine confidence ...
 *     TraceContext.captureBranch('confidence_determination', 'moderate',
 *       { primarySignalsMet },
 *       [{ branch: 'strong', blockedBy: 'activeMonths=11 < 12' }],
 *     );
 *     // ... return result ...
 *   }
 */
import { AsyncLocalStorage } from 'async_hooks';
import { TraceRecorderFactoryService } from './trace-recorder.service';
import {
  TraceRecorder,
  ModuleDecisionTrace,
  TraceVerbosity,
  ModuleResult,
  BlockedBranch,
} from './trace-recorder.interface';

class TraceContextHolder {
  private static als = new AsyncLocalStorage<TraceRecorder>();
  private static factory: TraceRecorderFactoryService | null = null;
  private static currentVerbosity: TraceVerbosity = 'decision';

  /**
   * Initialize the holder with a factory (called once at app bootstrap).
   * Pass null to disable tracing entirely.
   */
  static init(factory: TraceRecorderFactoryService | null): void {
    this.factory = factory;
  }

  /**
   * Set current verbosity level. Default: 'decision'
   */
  static setVerbosity(verbosity: TraceVerbosity): void {
    this.currentVerbosity = verbosity;
  }

  /** Whether tracing is active (factory registered AND not summary) */
  static get isActive(): boolean {
    return this.factory !== null && this.currentVerbosity !== 'summary';
  }

  /** Whether full tracing is active */
  static get isFull(): boolean {
    return this.factory !== null && this.currentVerbosity === 'full';
  }

  // ─── Lifecycle ──────────────────────────────────────────────────

  /**
   * Start a new trace context for a module execution.
   * Must be called before mod.run() and paired with endTrace() after.
   */
  static startTrace(moduleId: string): void {
    if (!this.factory) return;
    const verbosity = this.currentVerbosity;
    const recorder = this.factory.create(verbosity);
    recorder.startTrace(moduleId);
    this.als.enterWith(recorder);
  }

  /**
   * End the current trace context and return the complete decision trace.
   * Must be called after mod.run().
   */
  static endTrace(result: ModuleResult): ModuleDecisionTrace | null {
    const recorder = this.als.getStore();
    if (!recorder) return null;
    return recorder.endTrace(result);
  }

  // ─── Capture Methods (Modules call these at decision points) ────

  /** Record a determinative threshold that feeds the decision */
  static captureThreshold(
    name: string,
    observedValue: number,
    threshold: number | [number, number],
    operator: '>' | '<' | '>=' | '<=' | 'between',
    triggered: boolean,
    sourceFields?: Array<[string, unknown]>,
  ): void {
    const recorder = this.als.getStore();
    if (!recorder) return;
    recorder.captureThreshold(name, observedValue, threshold, operator, triggered, sourceFields);
  }

  /** Record a decision branch with why-higher-blocked analysis */
  static captureBranch(
    decisionPoint: string,
    branchTaken: string,
    inputs: Record<string, unknown>,
    blockedHigherBranches?: BlockedBranch[],
  ): void {
    const recorder = this.als.getStore();
    if (!recorder) return;
    recorder.captureBranch(decisionPoint, branchTaken, inputs, blockedHigherBranches);
  }

  /** Record an early-exit gate condition */
  static captureEarlyExit(gate: string, condition: boolean, result: string): void {
    const recorder = this.als.getStore();
    if (!recorder) return;
    recorder.captureEarlyExit(gate, condition, result);
  }

  /** Record a flag being raised with trigger metrics */
  static captureFlagRaised(flagId: string, triggerMetrics: Record<string, unknown>): void {
    const recorder = this.als.getStore();
    if (!recorder) return;
    recorder.captureFlagRaised(flagId, triggerMetrics);
  }

  /** Record a derived intermediate metric (FULL level only) */
  static captureMetric(name: string, value: unknown, computation?: string): void {
    const recorder = this.als.getStore();
    if (!recorder) return;
    recorder.captureMetric(name, value, computation);
  }
}

// Export singleton instance
export const TraceContext = TraceContextHolder;
