// PHASE 1.5 — implement per v5_rewrite_plan.md
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';

export interface LightAnalysisJobData {
  username: string;
  seniorityTarget: string;
  archetypeTarget: string;
}

@Processor('light-analysis')
export class LightAnalysisProcessor {
  constructor() {}

  async process(job: Job<LightAnalysisJobData>): Promise<void> {
    throw new Error('not implemented');
  }
}
