/**
 * DataCollectorModule — Wires all 7 group collectors + Deep collector + CircuitBreaker
 * + CorpusBuilder + CloneWorkerManager into the NestJS DI container.
 *
 * Exports DataCollectorService, DeepCollectorService, CloneWorkerManager,
 * CircuitBreakerService, and CorpusBuilderService for use by the controller
 * module (AnalysisV2Module) and worker module (WorkerModule).
 */

import { Module } from '@nestjs/common';
import { CorpusModule } from '../corpus/corpus.module';
import { DataCollectorService } from './data-collector.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { CorpusBuilderService } from './corpus-builder.service';
import { DeepCollectorService } from './deep/deep-collector.service';
import { CloneWorkerManager } from './deep/clone-worker-manager';
import { GroupACollector } from './group-collectors/group-a.collector';
import { GroupBCollector } from './group-collectors/group-b.collector';
import { GroupCCollector } from './group-collectors/group-c.collector';
import { GroupDCollector } from './group-collectors/group-d.collector';
import { GroupECollector } from './group-collectors/group-e.collector';
import { GroupFCollector } from './group-collectors/group-f.collector';
import { GroupGCollector } from './group-collectors/group-g.collector';

@Module({
  imports: [CorpusModule],
  providers: [
    DataCollectorService,
    CircuitBreakerService,
    CorpusBuilderService,
    DeepCollectorService,
    CloneWorkerManager,
    GroupACollector,
    GroupBCollector,
    GroupCCollector,
    GroupDCollector,
    GroupECollector,
    GroupFCollector,
    GroupGCollector,
  ],
  exports: [
    DataCollectorService,
    CircuitBreakerService,
    CorpusBuilderService,
    DeepCollectorService,
    CloneWorkerManager,
  ],
})
export class DataCollectorModule {}