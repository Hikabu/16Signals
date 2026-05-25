// PHASE 3.1 — implement per v5_rewrite_plan.md
import { Injectable } from '@nestjs/common';
import { RawGroupC } from '../../types/primitives.types';
import { AntiGamingFlag } from '../../types/evidence-brief.types';

@Injectable()
export class CommitInflationService {
  constructor() {}

  analyze(commits: RawGroupC['commitSample']): AntiGamingFlag | null {
    throw new Error('not implemented');
  }
}
