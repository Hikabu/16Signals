/**
 * CircuitBreakerService — Prevents resource exhaustion by aborting collection
 * when GitHub API rate limit falls below threshold.
 *
 * Architecture: Tracks rate limit state across multiple collector calls.
 * Collectors check `shouldAbort()` before making API calls.
 * When aborted, partial corpus is saved with the groups collected so far.
 *
 * Threshold: 500 remaining requests (configurable).
 * Resume: Next analysis cycle starts fresh (no auto-reset within a job).
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 4
 */

import { Injectable } from '@nestjs/common';

export interface CircuitBreakerState {
  aborted: boolean;
  remaining: number;
  resetAt: Date | null;
  reason: string | null;
}

@Injectable()
export class CircuitBreakerService {
  private aborted = false;
  private remaining = 5000;
  private resetAt: Date | null = null;
  private reason: string | null = null;
  private readonly abortThreshold: number;

  constructor(abortThreshold = 500) {
    this.abortThreshold = abortThreshold;
  }

  /**
   * Update the circuit breaker state from GitHub API response headers.
   */
  updateFromHeaders(headers: Record<string, string | number | undefined>): void {
    if (this.aborted) return;

    const remaining = headers?.['x-ratelimit-remaining'];
    const reset = headers?.['x-ratelimit-reset'];

    if (remaining !== undefined) {
      const parsed = Number(remaining);
      if (!Number.isNaN(parsed)) {
        this.remaining = parsed;
      }
    }

    if (reset !== undefined) {
      const parsed = Number(reset);
      if (!Number.isNaN(parsed)) {
        this.resetAt = new Date(parsed * 1000);
      }
    }

    if (this.remaining < this.abortThreshold) {
      this.aborted = true;
      this.reason = `Rate limit remaining (${this.remaining}) below threshold (${this.abortThreshold})`;
      console.log(
        `[CircuitBreaker] phase=trip remaining=${this.remaining} ` +
        `threshold=${this.abortThreshold} resetAt=${this.resetAt?.toISOString()}`,
      );
    }
  }

  /**
   * Whether collection should abort.
   */
  shouldAbort(): boolean {
    return this.aborted;
  }

  /**
   * Get current state for tracing.
   */
  getState(): CircuitBreakerState {
    return {
      aborted: this.aborted,
      remaining: this.remaining,
      resetAt: this.resetAt,
      reason: this.reason,
    };
  }

  /**
   * Reset for a new collection cycle.
   */
  reset(): void {
    this.aborted = false;
    this.remaining = 5000;
    this.resetAt = null;
    this.reason = null;
  }
}