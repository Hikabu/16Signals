// PHASE 1.2 — implement per v5_rewrite_plan.md
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RateLimitService {
  constructor(
    // TODO: inject ConfigService
    private readonly configService: ConfigService,
  ) {}

  checkBudget(type: 'rest' | 'graphql' | 'search'): void {
    throw new Error('not implemented');
  }

  consumeRequest(type: 'rest' | 'graphql' | 'search', cost?: number): void {
    throw new Error('not implemented');
  }

  getRemainingBudget(): Record<string, number> {
    throw new Error('not implemented');
  }
}
