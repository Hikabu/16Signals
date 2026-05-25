// PHASE 6.2 — implement per v5_rewrite_plan.md
import { Injectable } from '@nestjs/common';
import { PrimitiveAssessment, SectionE, AntiGamingFlag } from '../../types/evidence-brief.types';

@Injectable()
export class InterviewProbeGeneratorService {
  constructor() {}

  generate(primitives: Partial<Record<string, PrimitiveAssessment>>, flags: AntiGamingFlag[]): SectionE {
    throw new Error('not implemented');
  }
}
