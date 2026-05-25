import { Module } from '@nestjs/common';
import { ApplicantsController } from './applicants.controller';
import { ApplicantsService } from './applicants.service';
import { DecisionCardModule } from '../scoring/decision-card/decision-card.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { ScorecardRendererService } from './scorecard-renderer.service';
import { InterviewQuestionService } from './interview-question.service';
import { ScorecardModule } from '../scorecard/scorecard.module';

@Module({
  imports: [
    PrismaModule,
    DecisionCardModule,
    ScorecardModule,
  ],
  controllers: [ApplicantsController],
  providers: [
    ApplicantsService,
    ScorecardRendererService,
    InterviewQuestionService,
  ],
  exports: [ApplicantsService],
})
export class ApplicantsModule {}
