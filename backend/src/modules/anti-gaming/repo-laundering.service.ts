// PHASE 3.4 — implement per v5_rewrite_plan.md
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RateLimitService } from '../github-analyse/rate-limit/rate-limit.service';
import { RawGroupB } from '../../types/primitives.types';
import { AntiGamingFlag } from '../../types/evidence-brief.types';

@Injectable()
export class RepoLaunderingService {
  constructor(
    // TODO: inject RateLimitService
    private readonly rateLimitService: RateLimitService,
    // TODO: inject ConfigService
    private readonly configService: ConfigService,
  ) { }

  async analyze(repos: RawGroupB['repos']): Promise<AntiGamingFlag | null> {
    throw new Error('not implemented');
  }
}
