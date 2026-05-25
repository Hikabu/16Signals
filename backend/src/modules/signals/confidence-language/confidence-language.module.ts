import { Module } from '@nestjs/common';
import { ConfidenceLanguageService } from './confidence-language.service';

@Module({
  providers: [ConfidenceLanguageService],
  exports: [ConfidenceLanguageService],
})
export class ConfidenceLanguageModule {}
