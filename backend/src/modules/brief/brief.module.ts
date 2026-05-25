import { Module } from '@nestjs/common';
import { BriefAssemblerService } from './brief-assembler.service';
import { InterviewProbeGeneratorService } from './interview-probe-generator.service';
import { PrimitivesModule } from '../signals/primitives/primitives.module';
import { ConfidenceLanguageModule } from '../signals/confidence-language/confidence-language.module';

@Module({
  imports: [PrimitivesModule, ConfidenceLanguageModule],
  providers: [BriefAssemblerService, InterviewProbeGeneratorService],
  exports: [BriefAssemblerService, InterviewProbeGeneratorService],
})
export class BriefModule {}
