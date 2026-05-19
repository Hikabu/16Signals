import { Module } from '@nestjs/common';
import { InteractionProfileService } from './interaction-profile.service';
import { OrgAnalyserService } from './org-analyser.service';
import { SignalExtractorService } from './signal-extractor.service';
import { StackFingerprintService } from './stack-fingerprint.service';

@Module({
  providers: [
    SignalExtractorService,
    StackFingerprintService,
    OrgAnalyserService,
    InteractionProfileService,
  ],
  exports: [
    SignalExtractorService,
    StackFingerprintService,
    OrgAnalyserService,
    InteractionProfileService,
  ],
})
export class SignalExtractorModule {}
