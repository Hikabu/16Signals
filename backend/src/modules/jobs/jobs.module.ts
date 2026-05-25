import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';

// import { JobDescriptionParserService } from '../scoring/gap-analysis/job-description-parser.service';

@Module({
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
  // providers: [JobsService, JobDescriptionParserService],
  // exports: [JobsService, JobDescriptionParserService],
})
export class JobsModule {}
