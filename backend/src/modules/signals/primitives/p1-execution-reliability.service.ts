// PHASE 2.1 — implement per v5_rewrite_plan.md
import { Injectable } from '@nestjs/common';
import { PrimitiveAssessment } from '../../../types/evidence-brief.types';
import { P1ExecutionReliabilityInput } from '../../../types/primitives.types';
import { ConfidenceLanguageService } from '../confidence-language/confidence-language.service';

@Injectable()
export class P1ExecutionReliabilityService {
  constructor(
    // TODO: inject ConfidenceLanguageService
    private readonly confidenceLanguageService: ConfidenceLanguageService,
  ) {}

  evaluate(input: P1ExecutionReliabilityInput): PrimitiveAssessment {
    throw new Error('not implemented');
  }
}