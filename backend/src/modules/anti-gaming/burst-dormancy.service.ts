// PHASE 3.3 — implement per v5_rewrite_plan.md
import { Injectable } from '@nestjs/common';
import { RawGroupC } from '../../types/primitives.types';
import { AntiGamingFlag } from '../../types/evidence-brief.types';

@Injectable()
export class BurstDormancyService {
  constructor() {}

  analyze(weekly: RawGroupC['weeklyContributions']): AntiGamingFlag | null {
    throw new Error('not implemented');
  }
}
