import { Injectable, HttpException, HttpStatus, Logger, Scope } from '@nestjs/common';
import { Octokit } from 'octokit';

export class RateLimitExhaustedException extends HttpException {
  constructor(public readonly retryAfterMs: number = 0) {
    super(
      {
        message: 'GitHub API rate limit exhausted (remaining < 500)',
        retryAfterMs,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

type ApiType = 'rest' | 'graphql' | 'search';

// Choice: We use Scope.TRANSIENT so that each job can instantiate its own isolated RateLimitService
// via the ModuleRef or standard DI, and then call `init(octokit)` with its specific authenticated Octokit client.
// This is safer than Scope.REQUEST because background jobs don't always have an HTTP request context,
// and it avoids the complexity of passing tokens through custom providers.
@Injectable({ scope: Scope.TRANSIENT })
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private octokit!: Octokit;

  private remaining: Record<ApiType, number> = {
    rest: 5000,
    graphql: 5000,
    search: 30,
  };

  private resetTimes: Record<ApiType, number> = {
    rest: 0,
    graphql: 0,
    search: 0,
  };

  private thresholdsCrossed: Record<ApiType, { 2000: boolean; 1000: boolean; 500: boolean }> = {
    rest: { 2000: false, 1000: false, 500: false },
    graphql: { 2000: false, 1000: false, 500: false },
    search: { 2000: false, 1000: false, 500: false },
  };

  /**
   * Initialize the service with an authenticated Octokit client and fetch current limits.
   */
  async init(octokit: Octokit): Promise<void> {
    this.octokit = octokit;
    await this.fetchCurrentBudget();
  }

  /**
   * Fetches the current budget from the GitHub API (/rate_limit endpoint).
   * Call this on init and when a 401/403 rate limit error is encountered.
   */
  async fetchCurrentBudget(): Promise<void> {
    if (!this.octokit) {
      this.logger.warn('fetchCurrentBudget called before init()');
      return;
    }

    try {
      const response = await this.octokit.rest.rateLimit.get();
      const { resources } = response.data;

      if (resources.core) {
        this.remaining.rest = resources.core.remaining;
        this.resetTimes.rest = resources.core.reset;
      }
      if (resources.graphql) {
        this.remaining.graphql = resources.graphql.remaining;
        this.resetTimes.graphql = resources.graphql.reset;
      }
      if (resources.search) {
        this.remaining.search = resources.search.remaining;
        this.resetTimes.search = resources.search.reset;
      }

      this.resetThresholds();
      this.logger.debug({ remaining: this.remaining }, 'GitHub rate limits fetched');
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to fetch GitHub rate limits');
    }
  }

  /**
   * Circuit breaker: throws if remaining budget for the specified API type is below the safety threshold.
   */
  checkBudget(type: ApiType): void {
    const threshold = type === 'search' ? 5 : 500;
    
    if (this.remaining[type] < threshold) {
      const resetTimeSec = this.resetTimes[type];
      const nowSec = Math.floor(Date.now() / 1000);
      const retryAfterMs = Math.max(0, (resetTimeSec - nowSec) * 1000);
      
      this.logger.warn({ type, remaining: this.remaining[type], retryAfterMs }, 'Rate limit exhausted');
      throw new RateLimitExhaustedException(retryAfterMs);
    }
  }

  /**
   * Optimistically consume requests from the in-memory tracker.
   */
  consumeRequest(type: ApiType, cost: number = 1): void {
    this.remaining[type] = Math.max(0, this.remaining[type] - cost);
    this.checkThresholdsAndLog(type);
  }

  /**
   * Return the current optimistic remaining budget.
   */
  getRemainingBudget(): Record<ApiType, number> {
    return { ...this.remaining };
  }

  /**
   * Resets the budget window optimistically.
   */
  resetWindow(): void {
    this.remaining.rest = 5000;
    this.remaining.graphql = 5000;
    this.remaining.search = 30;
    this.resetThresholds();
    this.logger.debug('Rate limit window reset optimistically');
  }

  /**
   * Backward compatibility for old fetchers that manually update the rest limit.
   */
  updateRemaining(typeOrRemaining: ApiType | number, remaining?: number): void {
    let type: ApiType = 'rest';
    let val: number;
    if (typeof typeOrRemaining === 'number') {
      val = typeOrRemaining;
    } else {
      type = typeOrRemaining;
      val = remaining as number;
    }
    this.remaining[type] = val;
    this.checkThresholdsAndLog(type);
  }

  private checkThresholdsAndLog(type: ApiType): void {
    const remaining = this.remaining[type];
    const thresholds = this.thresholdsCrossed[type];

    if (remaining < 500 && !thresholds[500]) {
      this.logger.warn({ type, remaining }, `GitHub ${type} budget crossed <500 threshold`);
      thresholds[500] = true;
    } else if (remaining < 1000 && !thresholds[1000]) {
      this.logger.warn({ type, remaining }, `GitHub ${type} budget crossed <1000 threshold`);
      thresholds[1000] = true;
    } else if (remaining < 2000 && !thresholds[2000]) {
      this.logger.log({ type, remaining }, `GitHub ${type} budget crossed <2000 threshold`);
      thresholds[2000] = true;
    }
  }

  private resetThresholds(): void {
    this.thresholdsCrossed = {
      rest: { 2000: false, 1000: false, 500: false },
      graphql: { 2000: false, 1000: false, 500: false },
      search: { 2000: false, 1000: false, 500: false },
    };
  }
}
