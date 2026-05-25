// PHASE 2.8 — implement per v5_rewrite_plan.md
import { Injectable } from '@nestjs/common';
import { SeniorityTier } from '../../../types/evidence-brief.types';

@Injectable()
export class SeniorityWeightsService {
  constructor() {}

  getWeights(tier: SeniorityTier): Record<string, number> {
    throw new Error('not implemented');
  }
}
