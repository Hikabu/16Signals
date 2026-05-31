/**
 * Analysis State Machine — Defines valid states and transitions
 * for the GitIntel wave-based analysis pipeline.
 *
 * Architecture: Deterministic finite state machine.
 * Each analysis job progresses through defined wave states.
 * States are stored in AnalysisJob.status (Prisma).
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 3
 */

/**
 * All valid analysis states for the wave pipeline.
 * These correspond to AnalysisJob.status values.
 */
export type AnalysisState =
  | 'queued'
  | 'collecting'
  | 'corpus_built'
  | 'wave_1'
  | 'wave_2a'
  | 'wave_2b'
  | 'wave_2c'
  | 'wave_2d'
  | 'wave_3'
  | 'llm_pending'
  | 'wave_4'
  | 'complete'
  | 'partial'
  | 'failed';

/**
 * Valid state transitions.
 * Maps each state to the set of states it can transition to.
 * Used for validation in development and testing.
 */
export const STATE_TRANSITIONS: Record<AnalysisState, AnalysisState[]> = {
  queued: ['collecting', 'failed'],
  collecting: ['corpus_built', 'failed'],
  corpus_built: ['wave_1', 'failed'],
  wave_1: ['wave_2a', 'wave_2b', 'wave_2c', 'wave_2d', 'failed'],
  wave_2a: ['wave_2b', 'failed'],
  wave_2b: ['wave_3', 'failed'],
  wave_2c: ['wave_3', 'failed'],
  wave_2d: ['wave_3', 'failed'],
  wave_3: ['llm_pending', 'wave_4', 'failed'],
  llm_pending: ['wave_3', 'wave_4', 'failed'],
  wave_4: ['complete', 'partial', 'failed'],
  complete: [],
  partial: [],
  failed: [],
};

/**
 * Validates whether a state transition is allowed.
 * Emits a tracing log on invalid transitions.
 *
 * @param from - Current state
 * @param to - Target state
 * @returns true if transition is valid, false otherwise
 */
export function isValidTransition(
  from: AnalysisState,
  to: AnalysisState,
): boolean {
  const allowed = STATE_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/**
 * Human-readable labels for each analysis state.
 */
export const STATE_LABELS: Record<AnalysisState, string> = {
  queued: 'Analysis queued — waiting for worker',
  collecting: 'Collecting GitHub data',
  corpus_built: 'Corpus assembled — starting wave orchestration',
  wave_1: 'Wave 1 — Anti-gaming detection (AG1, AG2, AG3)',
  wave_2a: 'Wave 2a — Repository laundering check (AG4, conditional)',
  wave_2b: 'Wave 2b — Execution, evolution, maturity (P1, P2, P5)',
  wave_2c: 'Wave 2c — Collaboration leverage (P3)',
  wave_2d: 'Wave 2d — Technical depth (P4)',
  wave_3: 'Wave 3 — AI leverage + AI generation detection',
  llm_pending: 'LLM batch analysis in progress',
  wave_4: 'Wave 4 — Brief assembly + narrative generation',
  complete: 'Analysis complete — Evidence Brief ready',
  partial: 'Analysis partial — some modules skipped',
  failed: 'Analysis failed',
};

/**
 * Returns the wave number from a state name.
 * @returns wave number (1–4) or 0 for non-wave states
 */
export function stateToWaveNumber(state: AnalysisState): number {
  switch (state) {
    case 'wave_1':
      return 1;
    case 'wave_2a':
    case 'wave_2b':
    case 'wave_2c':
    case 'wave_2d':
      return 2;
    case 'wave_3':
    case 'llm_pending':
      return 3;
    case 'wave_4':
      return 4;
    default:
      return 0;
  }
}