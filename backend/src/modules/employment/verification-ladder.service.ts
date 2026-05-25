// PHASE 1.4 — implement per v5_rewrite_plan.md
import { Injectable } from '@nestjs/common';
import { RawGroupA, RawGroupD, EmploymentRungResult } from '../../types/primitives.types';

@Injectable()
export class VerificationLadderService {
  constructor() {}

  async verify(groupA: RawGroupA, groupD?: RawGroupD): Promise<EmploymentRungResult[]> {
    throw new Error('not implemented');
  }
}
