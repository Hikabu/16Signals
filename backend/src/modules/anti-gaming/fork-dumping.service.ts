// PHASE 3.2 — implement per v5_rewrite_plan.md
import { Injectable } from '@nestjs/common';
import { RawGroupB } from '../../types/primitives.types';
import { AntiGamingFlag } from '../../types/evidence-brief.types';

@Injectable()
export class ForkDumpingService {
  constructor() {}

  analyze(repos: RawGroupB['repos']): { flag: AntiGamingFlag | null; adjustedRepos: RawGroupB['repos'] } {
    throw new Error('not implemented');
  }
}
