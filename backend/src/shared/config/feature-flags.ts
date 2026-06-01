/**
 * Feature Flags — Central configuration for GitIntel pipeline rollout.
 *
 * Controls which parts of the refactored architecture are active.
 * Allows gradual rollout with safe fallback to legacy pipeline.
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 7 (Rollback Plan)
 */

export interface FeatureFlags {
  /** Use the new v2 pipeline for all analysis requests */
  useNewPipeline: boolean;

  /** Enable Deep Mode analysis (private repo cloning) */
  enableDeepMode: boolean;

  /** Enable LLM calls for Wave 3 & 4 (fallback to deterministic if disabled) */
  llmEnabled: boolean;

  /** Trace level for pipeline logging: 'detailed' | 'summary' | 'off' */
  traceLevel: 'detailed' | 'summary' | 'off';

  /** Enable CV claim extraction from uploaded CVs */
  enableCvVerifier: boolean;
}

/**
 * Load feature flags from environment variables.
 */
export function loadFeatureFlags(): FeatureFlags {
  return {
    useNewPipeline: process.env.USE_NEW_PIPELINE === 'true',
    enableDeepMode: process.env.ENABLE_DEEP_MODE === 'true',
    llmEnabled: process.env.LLM_ENABLED !== 'false',
    traceLevel: (process.env.TRACE_LEVEL as FeatureFlags['traceLevel']) || 'summary',
    enableCvVerifier: process.env.ENABLE_CV_VERIFIER !== 'false',
  };
}

/**
 * Singleton accessor for feature flags.
 * Flags are loaded once at startup and cached.
 */
let cachedFlags: FeatureFlags | null = null;

export function getFeatureFlags(): FeatureFlags {
  if (!cachedFlags) {
    cachedFlags = loadFeatureFlags();
  }
  return cachedFlags;
}

/**
 * Reload flags (useful in tests or for runtime config updates).
 */
export function reloadFeatureFlags(): FeatureFlags {
  cachedFlags = loadFeatureFlags();
  return cachedFlags;
}