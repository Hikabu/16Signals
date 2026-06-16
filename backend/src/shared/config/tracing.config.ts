/**
 * Tracing Configuration Utility
 * Enables strategic console.log tracing across all architectural boundaries.
 * Set TRACING_LEVEL env var: 'detailed' | 'summary' | 'off'
 *
 * Usage:
 *   import { trace } from '../shared/config/tracing.config';
 *   trace('DataCollector', `phase=collect_start username=${username}`);
 */

export interface TracingConfig {
  level: 'detailed' | 'summary' | 'off';
  components: string[];
  includeTiming: boolean;
}

function loadTracingConfig(): TracingConfig {
  return {
    level: (process.env.TRACING_LEVEL as TracingConfig['level']) || 'summary',
    components: (process.env.TRACING_COMPONENTS || '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean),
    includeTiming: process.env.TRACING_TIMING !== 'false',
  };
}

let config: TracingConfig | null = null;

function getConfig(): TracingConfig {
  if (!config) {
    config = loadTracingConfig();
  }
  return config;
}

export function shouldTrace(
  component: string,
  level: 'detailed' | 'summary',
): boolean {
  const cfg = getConfig();
  if (cfg.level === 'off') return false;
  if (cfg.components.length > 0 && !cfg.components.includes(component)) {
    return false;
  }
  if (cfg.level === 'summary' && level === 'detailed') return false;
  return true;
}

export function trace(
  component: string,
  message: string,
  level: 'detailed' | 'summary' = 'summary',
): void {
  if (!shouldTrace(component, level)) return;
  console.log(`[${component}] ${message}`);
}

/**
 * Reload config at runtime (useful for dynamic reconfiguration).
 */
export function reloadTracingConfig(): TracingConfig {
  config = loadTracingConfig();
  console.log(
    `[TracingConfig] phase=reload level=${config.level} components=${config.components.join(',') || 'all'}`,
  );
  return config;
}
