import { Module } from '@nestjs/common';
import { SeniorityWeightsService } from './seniority-weights.service';

@Module({
  providers: [SeniorityWeightsService],
  exports: [SeniorityWeightsService],
})
export class SeniorityModule {}
