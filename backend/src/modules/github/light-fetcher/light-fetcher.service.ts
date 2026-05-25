// PHASE 1.1 — implement per v5_rewrite_plan.md
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { RawGroupA, RawGroupB, RawGroupC, RawGroupD, RawGroupF } from '../../../types/primitives.types';

export interface RawLightData {
  groupA: RawGroupA;
  groupB: RawGroupB;
  groupC: RawGroupC;
  groupD: RawGroupD;
  groupF: RawGroupF;
}

@Injectable()
export class LightFetcherService {
  constructor(
    // TODO: inject RateLimitService
    private readonly rateLimitService: RateLimitService,
    // TODO: inject ConfigService
    private readonly configService: ConfigService,
  ) {}

  async fetch(username: string): Promise<RawLightData> {
    throw new Error('not implemented');
  }
}
