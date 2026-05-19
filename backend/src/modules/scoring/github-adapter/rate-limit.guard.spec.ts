import { RateLimitGuard } from './rate-limit.guard';

describe('RateLimitGuard', () => {
  it('aborts when remaining requests drop below the minimum', () => {
    const guard = new RateLimitGuard();

    guard.updateFromHeaders({
      'x-ratelimit-remaining': '45',
      'x-ratelimit-reset': '1700000000',
    });

    expect(guard.shouldAbort(50)).toBe(true);
    expect(guard.getStatus()).toEqual({
      remaining: 45,
      resetAt: new Date(1700000000 * 1000),
    });
  });
});
