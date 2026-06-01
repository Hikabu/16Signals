import { Module } from '@nestjs/common';
import { SignalComputeProcessor } from './signal-compute.processor';
import { EmailProcessor } from './email.processor';
import { GithubSyncProcessor } from './github-sync.processor';
import { AnalysisProcessor } from './analysis.processor';
import { PrismaModule } from '../prisma/prisma.module';
import { ScoringModule } from '../modules/scoring/scoring.module';
import { SignalExtractorModule } from '../modules/scoring/signal-extractor/signal-extractor.module';
import { CacheModule } from '../modules/scoring/cache/cache.module';
import { GithubAdapterModule } from '../modules/scoring/github-adapter/github-adapter.module';
import { QueuesModule } from './queues.module';
import { EmailModule } from '../modules/email/email.module';
import { ConfigModule } from '../shared/config/config.module';
// GitIntel new pipeline imports
import { DataCollectorModule } from '../modules/analysis/data-collector/data-collector.module';
import { CorpusModule } from '../modules/analysis/corpus/corpus.module';
import { OrchestrationModule } from '../modules/analysis/orchestration/wave-orchestrator.module';
import { LLMModule } from '../modules/analysis/llm/llm.module';
import { BriefModule } from '../modules/analysis/brief/brief.module';
import { ModulesModule } from '../modules/analysis/modules/module.module';

const isTest = process.env.NODE_ENV === 'test';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    ScoringModule,
    SignalExtractorModule,
    GithubAdapterModule,
    CacheModule,
    EmailModule,
    // GitIntel analysis pipeline modules
    DataCollectorModule,
    CorpusModule,
    OrchestrationModule,
    LLMModule,
    BriefModule,
    ModulesModule,
    ...(isTest ? [] : [QueuesModule]),
  ],
  providers: isTest
    ? []
    : [SignalComputeProcessor, EmailProcessor, GithubSyncProcessor, AnalysisProcessor],
})
export class WorkerModule {}
