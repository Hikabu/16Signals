// PHASE 2.7 — implement per v5_rewrite_plan.md
import { Injectable } from '@nestjs/common';
import { PrimitiveAssessment } from '../../../types/evidence-brief.types';
import { P7AuthenticityConfidenceInput } from '../../../types/primitives.types';

@Injectable()
export class P7AuthenticityConfidenceService {
  constructor() {}

  evaluate(input: P7AuthenticityConfidenceInput): PrimitiveAssessment {
    throw new Error('not implemented');
  }
}
