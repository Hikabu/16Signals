// PHASE 2.10 — implement per v5_rewrite_plan.md
import { Injectable } from '@nestjs/common';
import { ConfidenceLevel } from '../../../types/evidence-brief.types';

@Injectable()
export class ConfidenceLanguageService {
  constructor() {}

  getText(level: ConfidenceLevel, context?: Record<string, string>): string {
    throw new Error('not implemented');
  }
}
