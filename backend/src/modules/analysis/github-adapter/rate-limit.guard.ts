export class RateLimitGuard {
  private remaining = 5000;
  private resetAt = 0;

  updateFromHeaders(
    headers: Record<string, string | number | undefined>,
  ): void {
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
        this.resetAt = parsed * 1000;
      }
    }
  }

  shouldAbort(minimumRemaining = 50): boolean {
    return this.remaining < minimumRemaining;
  }

  getStatus(): { remaining: number; resetAt: Date } {
    return {
      remaining: this.remaining,
      resetAt: new Date(this.resetAt),
    };
  }
}
