/**
 * DataCollectorModule — Wires all 7 group collectors + CircuitBreaker + CorpusBuilder
 * into the NestJS DI container.
 *
 * Provides DataCollectorService which the JobDispatcher (Stage 7) depends on.
 */

import { Module } from '@nestjs/common';
import { DataCollectorService } from './data-collector.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { CorpusBuilderService } from './corpus-builder.service';
import { GroupACollector } from './group-collectors/group-a.collector';
import { GroupBCollector } from './group-collectors/group-b.collector';
import { GroupCCollector } from './group-collectors/group-c.collector';
import { GroupDCollector } from './group-collectors/group-d.collector';
import { GroupECollector } from './group-collectors/group-e.collector';
import { GroupFCollector } from './group-collectors/group-f.collector';
import { GroupGCollector } from './group-collectors/group-g.collector';

@Module({
  providers: [
    DataCollectorService,
    CircuitBreakerService,
    CorpusBuilderService,
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
  ],
})
export class DataCollectorModule {}