/**
 * DataCollectorService — Orchestrates all 7 group collectors to produce a SignalCorpus.
 *
 * Architecture:
 *   Group A: Identity & Profile (1 REST call)
 *   Group B: Repository Inventory (1 REST call)
 *   Group C: Commit Intelligence (N REST calls, depends on B)
 *   Group D: Collaboration & Review (search API, independent)
 *   Group E: Engineering Practices (file checks, depends on B)
 *   Group F: Impact & External Signals (search + GraphQL + registries)
 *   Group G: Anti-Gaming Raw Inputs (purely computational, depends on B + C)
 *
 * Each collector checks the CircuitBreaker before making API calls.
 * Groups without inter-dependencies run in parallel.
 * Partial collections are supported: groups_present tracks what was collected.
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 4
 */

import { Injectable } from '@nestjs/common';
import { Octokit } from 'octokit';
import { SignalCorpus, CorpusGroup } from '../corpus/corpus.types';
import { CircuitBreakerService } from './circuit-breaker.service';
import { CorpusBuilderService, GroupCollectionResult } from './corpus-builder.service';
import { GroupACollector } from './group-collectors/group-a.collector';
import { GroupBCollector } from './group-collectors/group-b.collector';
import { GroupCCollector } from './group-collectors/group-c.collector';
import { GroupDCollector } from './group-collectors/group-d.collector';
import { GroupECollector } from './group-collectors/group-e.collector';
import { GroupFCollector } from './group-collectors/group-f.collector';
import { GroupGCollector } from './group-collectors/group-g.collector';

export interface DataCollectorOutput {
  corpus: SignalCorpus;
  groupsCollected: CorpusGroup[];
  errors: string[];
  totalDurationMs: number;
}

@Injectable()
export class DataCollectorService {
  constructor(
    private readonly groupA: GroupACollector,
    private readonly groupB: GroupBCollector,
    private readonly groupC: GroupCCollector,
    private readonly groupD: GroupDCollector,
    private readonly groupE: GroupECollector,
    private readonly groupF: GroupFCollector,
    private readonly groupG: GroupGCollector,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly corpusBuilder: CorpusBuilderService,
  ) {}

  /**
   * Collect all 7 groups for Light Mode analysis.
   * Groups with no inter-dependencies run in parallel.
   * Groups B & C have a dependency: C requires B's repo list.
   * Group G is purely computational and runs last.
   */
  async collectLightMode(
    octokit: Octokit,
    username: string,
    jobId: string,
  ): Promise<DataCollectorOutput> {
    const startTime = Date.now();
    console.log(
      `[DataCollector] phase=collect_start jobId=${jobId} username=${username} mode=light`,
    );

    // Reset circuit breaker for this collection cycle
    this.circuitBreaker.reset();

    // ── Phase 1: Independent groups (A, B, D, F) ──
    const phase1Results = await this.safeCollectParallel([
      { group: 'A' as CorpusGroup, collector: () => this.groupA.collect(octokit, username, this.circuitBreaker) },
      { group: 'B' as CorpusGroup, collector: () => this.groupB.collect(octokit, username, this.circuitBreaker) },
      { group: 'D' as CorpusGroup, collector: () => this.groupD.collect(octokit, username, this.circuitBreaker) },
      { group: 'F' as CorpusGroup, collector: () => this.groupF.collect(octokit, username, [], this.circuitBreaker) },
    ]);

    const groupA = phase1Results.find((r) => r.group === 'A');
    const groupB = phase1Results.find((r) => r.group === 'B');
    const groupD = phase1Results.find((r) => r.group === 'D');
    const groupF = phase1Results.find((r) => r.group === 'F');

    const repos = groupB?.data ?? [];
    const errors: string[] = [];
    const collectedGroups: CorpusGroup[] = [];

    // Track what we have so far
    for (const result of phase1Results) {
      if (!result.error && result.data !== null) {
        collectedGroups.push(result.group);
      } else if (result.error) {
        errors.push(result.error);
      }
    }

    // Check circuit breaker after phase 1
    if (this.circuitBreaker.shouldAbort()) {
      const state = this.circuitBreaker.getState();
      console.log(
        `[DataCollector] phase=circuit_break jobId=${jobId} reason=rate_limit ` +
        `remaining=${state.remaining}`,
      );
      errors.push(`Circuit breaker fired: ${state.reason}`);
      return this.finalize(startTime, username, collectedGroups, errors, phase1Results);
    }

    // ── Phase 2: Groups dependent on B (C, E) ──
    const phase2Results = await this.safeCollectParallel([
      { group: 'C' as CorpusGroup, collector: () => this.groupC.collect(octokit, username, repos, this.circuitBreaker) },
      { group: 'E' as CorpusGroup, collector: () => this.groupE.collect(octokit, username, repos, this.circuitBreaker) },
    ]);

    for (const result of phase2Results) {
      if (!result.error && result.data !== null) {
        collectedGroups.push(result.group);
      } else if (result.error) {
        errors.push(result.error);
      }
    }

    const commitSignals = phase2Results.find((r) => r.group === 'C')?.data;

    // ── Phase 3: Group G (computational, depends on B + C) ──
    if (!this.circuitBreaker.shouldAbort()) {
      const antiGamingData = this.groupG.collectLight(commitSignals, repos);
      phase2Results.push({
        group: 'G',
        data: antiGamingData,
        error: null,
      });
      collectedGroups.push('G');
    }

    // Combine all results
    const allResults = [...phase1Results, ...phase2Results];

    // Build corpus
    const corpus = this.corpusBuilder.build(username, 'light', allResults);

    return this.finalize(
      startTime,
      username,
      collectedGroups,
      errors,
      allResults,
      corpus,
    );
  }

  /**
   * Execute multiple collectors in parallel with error handling.
   */
  private async safeCollectParallel(
    tasks: { group: CorpusGroup; collector: () => Promise<any> }[],
  ): Promise<GroupCollectionResult[]> {
    const results = await Promise.allSettled(
      tasks.map(async ({ group, collector }) => {
        if (this.circuitBreaker.shouldAbort()) {
          return {
            group,
            data: null,
            error: `Circuit breaker fired before collecting group ${group}`,
          } as GroupCollectionResult;
        }

        const startMs = Date.now();
        try {
          const data = await collector();
          const durationMs = Date.now() - startMs;
          console.log(
            `[DataCollector] phase=group_complete group=${group} durationMs=${durationMs}`,
          );
          return { group, data, error: null } as GroupCollectionResult;
        } catch (error) {
          const errMsg = (error as Error).message;
          console.log(
            `[DataCollector] phase=group_error group=${group} error=${errMsg}`,
          );
          return { group, data: null, error: errMsg } as GroupCollectionResult;
        }
      }),
    );

    return results.map((r) =>
      r.status === 'fulfilled'
        ? r.value
        : { group: 'A' as CorpusGroup, data: null, error: r.reason?.message ?? 'Unknown error' },
    );
  }

  /**
   * Finalize collection: build output and log completion.
   */
  private finalize(
    startTime: number,
    username: string,
    groupsCollected: CorpusGroup[],
    errors: string[],
    results: GroupCollectionResult[],
    corpus?: SignalCorpus,
  ): DataCollectorOutput {
    const totalDurationMs = Date.now() - startTime;

    console.log(
      `[DataCollector] phase=collect_complete username=${username} ` +
      `totalDurationMs=${totalDurationMs} groupsCollected=${groupsCollected.join(',')} ` +
      `errors=${errors.length}`,
    );

    // Build corpus if not already built
    const finalCorpus =
      corpus ??
      this.corpusBuilder.build(username, 'light_partial', results);

    return {
      corpus: finalCorpus,
      groupsCollected,
      errors,
      totalDurationMs,
    };
  }
}