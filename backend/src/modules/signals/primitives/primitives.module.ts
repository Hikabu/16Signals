import { Module } from '@nestjs/common';
import { P1ExecutionReliabilityService } from './p1-execution-reliability.service';
import { P2SystemsEvolutionService } from './p2-systems-evolution.service';
import { P3CollaborationLeverageService } from './p3-collaboration-leverage.service';
import { P4TechnicalDepthService } from './p4-technical-depth.service';
import { P5OperationalMaturityService } from './p5-operational-maturity.service';
import { P6AILeverageService } from './p6-ai-leverage.service';
import { P7AuthenticityConfidenceService } from './p7-authenticity-confidence.service';
import { SeniorityModule } from '../seniority/seniority.module';
import { ConfidenceLanguageModule } from '../confidence-language/confidence-language.module';

@Module({
  imports: [SeniorityModule, ConfidenceLanguageModule],
  providers: [
    P1ExecutionReliabilityService,
    P2SystemsEvolutionService,
    P3CollaborationLeverageService,
    P4TechnicalDepthService,
    P5OperationalMaturityService,
    P6AILeverageService,
    P7AuthenticityConfidenceService,
  ],
  exports: [
    P1ExecutionReliabilityService,
    P2SystemsEvolutionService,
    P3CollaborationLeverageService,
    P4TechnicalDepthService,
    P5OperationalMaturityService,
    P6AILeverageService,
    P7AuthenticityConfidenceService,
  ],
})
export class PrimitivesModule {}
