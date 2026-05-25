// PHASE 2.4 — implement per v5_rewrite_plan.md
import { Injectable } from '@nestjs/common';
import { PrimitiveAssessment } from '../../../types/evidence-brief.types';
import { P4TechnicalDepthInput } from '../../../types/primitives.types';

@Injectable()
export class P4TechnicalDepthService {
  constructor() {}

  evaluate(input: P4TechnicalDepthInput): PrimitiveAssessment {
    throw new Error('not implemented');
  }
}
