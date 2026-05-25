// PHASE 7.1 — implement per v5_rewrite_plan.md
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';

export interface DeepAnalysisJobData {
  username: string;
  reposToClone: string[];
}

@Processor('deep-analysis')
export class DeepAnalysisProcessor {
  constructor() {}

  async process(job: Job<DeepAnalysisJobData>): Promise<void> {
    throw new Error('not implemented');
  }
}
