// PHASE 2.3 — implement per v5_rewrite_plan.md
import { Injectable } from '@nestjs/common';
import { PrimitiveAssessment } from '../../../types/evidence-brief.types';
import { P3CollaborationLeverageInput } from '../../../types/primitives.types';
import { ConfidenceLanguageService } from '../confidence-language/confidence-language.service';
import { SeniorityWeightsService } from '../seniority/seniority-weights.service';

@Injectable()
export class P3CollaborationLeverageService {
  constructor(
    // TODO: inject SeniorityWeightsService
    private readonly seniorityWeightsService: SeniorityWeightsService,
    // TODO: inject ConfidenceLanguageService
    private readonly confidenceLanguageService: ConfidenceLanguageService,
  ) {}

  evaluate(input: P3CollaborationLeverageInput): PrimitiveAssessment {
    throw new Error('not implemented');
  }
}
