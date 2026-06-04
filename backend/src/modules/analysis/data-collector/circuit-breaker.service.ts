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
  limit: number;
  remaining: number;
  used: number;
  resetAt: Date | null;
  reason: string | null;
}

@Injectable()
export class CircuitBreakerService {
  private aborted = false;
  private limit = 0;
private used = 0;
  private remaining = 500;
  private resetAt: Date | null = null;
  private reason: string | null = null;
  private readonly abortThreshold = 10;

  /**
   * Update the circuit breaker state from GitHub API response headers.
   */
  updateFromHeaders(headers: Record<string, string | number | undefined>): void {
  if (this.aborted) return;

  const limit = headers?.['x-ratelimit-limit'];
  const remaining = headers?.['x-ratelimit-remaining'];
  const used = headers?.['x-ratelimit-used'];
  const reset = headers?.['x-ratelimit-reset'];

  if (limit !== undefined) {
    this.limit = Number(limit);
  }

  if (remaining !== undefined) {
    this.remaining = Number(remaining);
  }

  if (used !== undefined) {
    this.used = Number(used);
  }

  if (reset !== undefined) {
    this.resetAt = new Date(Number(reset) * 1000);
  }

  console.log(
    `\t\t[GitHubRateLimit] limit=${this.limit} ` +
    `used=${this.used} ` +
    `remaining=${this.remaining} ` +
    `resetAt=${this.resetAt?.toISOString()}`
  );

  if (this.remaining < this.abortThreshold) {
    this.aborted = true;
    this.reason =
      `Rate limit remaining (${this.remaining}) below threshold (${this.abortThreshold})`;

    console.log(
      `[CircuitBreaker] phase=trip remaining=${this.remaining} ` +
      `threshold=${this.abortThreshold}`
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
      limit: this.limit,
      used: this.used,
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
    this.limit = 0;
    this.used = 0;
    this.remaining = 500;
    this.resetAt = null;
    this.reason = null;
  }
}