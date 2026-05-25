import { Module } from '@nestjs/common';
import { ExternalSignalService } from './external-signals.service';

@Module({
  providers: [ExternalSignalService],
  exports: [ExternalSignalService],
})
export class ExternalSignalsModule {}
