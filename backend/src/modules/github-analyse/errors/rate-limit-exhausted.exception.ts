import { HttpException, HttpStatus } from '@nestjs/common';

export class RateLimitExhaustedException extends HttpException {
  constructor(public readonly retryAfterMs: number = 0) {
    super({ message: 'GitHub API rate limit exhausted (remaining < 500)', retryAfterMs }, HttpStatus.TOO_MANY_REQUESTS);
  }
}
