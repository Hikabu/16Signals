/**
 * JobDispatcherService — Central orchestrator for the Light Mode analysis pipeline.
 *
 * Execution flow with strategic console.log tracing:
 *
 * [JobDispatcher] phase=dispatch jobId=xxx mode=light username=yyy
 *   │
 *   ├─ [CorpusCache] phase=cache_hit|cache_miss
 *   │   (cache hit → skip collection, use cached corpus)
 *   │
 *   ├─ [DataCollector] phase=collect_start (cache miss only)
 *   │   ├─ [DataCollector] phase=group_complete group=A
 *   │   ├─ [DataCollector] phase=group_complete group=B
 *   │   ├─ [DataCollector] phase=group_complete group=C..G
 *   │   └─ [DataCollector] phase=collect_complete
 *   │
 *   ├─ [CorpusCache] phase=corpus_stored (cache miss only)
 *   │
 *   ├─ [WaveOrchestrator] phase=orchestration_start
 *   │   ├─ [WaveOrchestrator] phase=wave_start wave=1 (AG1,AG2,AG3)
 *   │   ├─ [WaveOrchestrator] phase=wave_skip wave=2a (conditional)
 *   │   ├─ [WaveOrchestrator] phase=wave_start wave=2b (P1,P2,P5)
 *   │   ├─ [WaveOrchestrator] phase=wave_start wave=2c (P3)
 *   │   ├─ [WaveOrchestrator] phase=wave_start wave=2d (P4)
 *   │   └─ [WaveOrchestrator] phase=orchestration_complete
 *   │
 *   ├─ [DeepseekLLM] phase=call_start callType=wave3_batch
 *   ├─ [DeepseekLLM] phase=call_start callType=narrative
 *   ├─ [DeepseekLLM] phase=call_start callType=interview_questions
 *   │
 *   └─ [BriefAssembler] phase=assembly_start
 *       ├─ [BriefAssembler] phase=section_complete section=A..G
 *       └─ [BriefAssembler] phase=assembly_complete
 *
 * CV verification flow (via POST /api/v2/analysis/cv-verify):
 *   [CvClaimExtractor] phase=extract_start → extract_complete
 *   Then same as Light Mode above with config.cv_claims populated
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 7
 * Aligned with: USER_FLOWS_AND_GOALS_VERIFICATION.md Section 1
 */

import { Injectable } from '@nestjs/common';
import { Octokit } from 'octokit';
import { CorpusCacheService } from '../corpus/corpus-cache.service';
import { DataCollectorService } from '../data-collector/data-collector.service';
import { WaveOrchestratorService } from './wave-orchestrator.service';
import { BriefAssemblerService } from '../brief/brief-assembler.service';
import { LLMIntegrationService } from '../llm/llm-integration.service';
import { CvClaimExtractorService } from '../brief/cv-claim-extractor.service';
import { AnalysisConfig } from '../modules/module.interface';
import { SignalCorpus } from '../corpus/corpus.types';
import { ModuleResult } from '../modules/module-result.types';

export interface DispatcherResult {
  jobId: string;
  status: 'complete' | 'partial' | 'failed';
  briefMarkdown: string;
  briefJson: Record<string, string>;
  moduleResults: ModuleResult[];
  flags: Array<{
    flag_id: string;
    flag_type: 'SOFT' | 'HARD';
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    module_id: string;
    description: string;
    escalate_to_hiring_manager: boolean;
    clear_without_interview: boolean;
    interview_probe: string | null;
  }>;
  moduleCount: number;
  flagCount: number;
  totalDurationMs: number;
}

@Injectable()
export class JobDispatcherService {
  constructor(
    private readonly corpusCache: CorpusCacheService,
    private readonly dataCollector: DataCollectorService,
    private readonly waveOrchestrator: WaveOrchestratorService,
    private readonly briefAssembler: BriefAssemblerService,
    private readonly llmService: LLMIntegrationService,
    private readonly cvExtractor: CvClaimExtractorService,
  ) {}

  /**
   * Dispatch a Light Mode analysis.
   * 1. Check corpus cache
   * 2. Collect data on cache miss
   * 3. Cache the corpus
   * 4. Run wave orchestration
   * 5. Generate LLM narrative + interview questions
   * 6. Assemble evidence brief
   */
  async dispatchLightMode(
    octokit: Octokit,
    jobId: string,
    username: string,
    config: AnalysisConfig,
  ): Promise<DispatcherResult> {
    const startTime = Date.now();
    console.log(
      `[JobDispatcher] phase=dispatch jobId=${jobId} mode=light ` +
      `username=${username} seniority=${config.seniority} ` +
      `cvClaims=${config.cv_claims?.length ?? 0}`,
    );

    try {
      // ── Phase 1: Corpus Acquisition ──
      console.log(`[JobDispatcher] phase=corpus_acquisition jobId=${jobId} username=${username}`);
      const corpus = await this.acquireCorpus(octokit, username, jobId);

      // ── Phase 2: Wave Orchestration ──
      console.log(
        `[JobDispatcher] phase=wave_orchestration jobId=${jobId} ` +
        `corpusId=${corpus.corpus_id} groups=${corpus.groups_present.join(',')}`,
      );
      const moduleResults = await this.waveOrchestrator.orchestrate(
        corpus,
        config,
        jobId,
        async (wave, state) => {
          console.log(
            `[JobDispatcher] phase=progress jobId=${jobId} wave=${wave} state=${state}`,
          );
        },
      );

      console.log(
        `[JobDispatcher] phase=orchestration_done jobId=${jobId} ` +
        `moduleCount=${moduleResults.length} ` +
        `strong=${moduleResults.filter(r => r.confidence === 'strong').length} ` +
        `moderate=${moduleResults.filter(r => r.confidence === 'moderate').length} ` +
        `low=${moduleResults.filter(r => r.confidence === 'low').length} ` +
        `obsGap=${moduleResults.filter(r => r.confidence === 'observability_gap').length}`,
      );

      // ── Phase 3: LLM Processing ──
      console.log(`[JobDispatcher] phase=llm_batch jobId=${jobId}`);
      const wave3Output = await this.llmService.wave3Batch(corpus, moduleResults);
      console.log(
        `[JobDispatcher] phase=llm_wave3_done jobId=${jobId} ` +
        `aiClassification=${wave3Output.ai_leverage.classification}`,
      );

      const narrative = await this.llmService.generateNarrative(
        moduleResults,
        config,
        corpus,
      );
      console.log(
        `[JobDispatcher] phase=narrative_done jobId=${jobId} ` +
        `sectionALength=${narrative.profile_summary.length}`,
      );

      const interviewQuestions = await this.llmService.generateInterviewQuestions(
        moduleResults,
        corpus,
      );
      console.log(
        `[JobDispatcher] phase=interview_questions_done jobId=${jobId} ` +
        `count=${interviewQuestions.length}`,
      );

      // ── Phase 4: Brief Assembly ──
      console.log(`[JobDispatcher] phase=brief_assembly jobId=${jobId}`);
      const brief = await this.briefAssembler.assemble(
        moduleResults,
        narrative,
        interviewQuestions,
        corpus,
        config,
        jobId,
      );

      const totalDurationMs = Date.now() - startTime;
      console.log(
        `[JobDispatcher] phase=complete jobId=${jobId} ` +
        `totalDurationMs=${totalDurationMs} ` +
        `briefMarkdownLength=${brief.briefMarkdown.length} ` +
        `flags=${brief.redFlags.length} ` +
        `modules=${moduleResults.length}`,
      );

      return {
        jobId,
        status: 'complete',
        briefMarkdown: brief.briefMarkdown,
        briefJson: brief.briefJson as unknown as Record<string, string>,
        moduleResults,
        flags: brief.redFlags,
        moduleCount: moduleResults.length,
        flagCount: brief.redFlags.length,
        totalDurationMs,
      };
    } catch (error) {
      const totalDurationMs = Date.now() - startTime;
      console.log(
        `[JobDispatcher] phase=failed jobId=${jobId} ` +
        `durationMs=${totalDurationMs} error=${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Acquire a SignalCorpus: check cache first, collect if missing.
   */
  private async acquireCorpus(
    octokit: Octokit,
    username: string,
    jobId: string,
  ): Promise<SignalCorpus> {
    // Check cache
    const cachedCorpus = await this.corpusCache.get(username, 'light');

    if (cachedCorpus) {
      console.log(
        `[JobDispatcher] phase=corpus_cache_hit jobId=${jobId} ` +
        `username=${username} corpusId=${cachedCorpus.corpus_id} ` +
        `groups=${cachedCorpus.groups_present.join(',')}`,
      );
      return cachedCorpus;
    }

    // Cache miss — collect data
    console.log(
      `[JobDispatcher] phase=corpus_cache_miss jobId=${jobId} ` +
      `username=${username} starting_collection`,
    );

    const { corpus } = await this.dataCollector.collectLightMode(
      octokit,
      username,
      jobId,
    );

    // Store in cache
    await this.corpusCache.set(corpus);

    console.log(
      `[JobDispatcher] phase=corpus_collected jobId=${jobId} ` +
      `username=${username} corpusId=${corpus.corpus_id} ` +
      `groups=${corpus.groups_present.join(',')} ` +
      `errors=${corpus.collection_errors.length}`,
    );

    return corpus;
  }
}