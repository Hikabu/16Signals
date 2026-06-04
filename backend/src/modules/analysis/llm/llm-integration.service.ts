/**
 * LLMIntegrationService — Orchestrates all LLM calls for Waves 3 & 4.
 *
 * Responsibilities:
 *   Wave 3: Batches 5 analysis tasks (commit quality, PR quality, review depth,
 *           hard problem detection, AI leverage) into a single LLM call.
 *           Injects outputs into the corpus for P6 and AG5 module consumption.
 *   Wave 4: Generates narrative text (Section A/B/C) and interview questions
 *           after all modules have completed.
 *
 * Graceful degradation: Every LLM call has a fallback output that never
 * crashes the pipeline. If the LLM is down, all dependent modules get
 * conservative default values.
 *
 * Swappable LLM: The LLM provider is injected via the LLM_CLIENT token.
 * To switch providers, change the binding in LLMModule — no changes
 * needed in this service.
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 5
 */

import { Injectable, Inject } from '@nestjs/common';
import { LLM_CLIENT, LlmClient } from './llm-client.interface';
import { LLMPromptTemplates } from './llm-prompt-templates';
import {
  Wave3BatchOutput,
  NarrativeOutput,
  InterviewQuestion,
  defaultWave3BatchOutput,
  defaultNarrativeOutput,
} from './llm-response.types';
import { SignalCorpus } from '../corpus/corpus.types';
import { ModuleResult } from '../modules/module-result.types';
import { AnalysisConfig } from '../modules/module.interface';

@Injectable()
export class LLMIntegrationService {
  constructor(
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
    private readonly prompts: LLMPromptTemplates,
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // Wave 3: Batch Analysis
  // ──────────────────────────────────────────────────────────────────

  /**
   * Execute the Wave 3 batch LLM call — 5 analysis tasks in one request.
   *
   * @param corpus - The Signal Corpus (commit messages, PRs, reviews, AI config)
   * @param previousResults - Module results from Waves 1-2 (for context)
   * @returns Parsed Wave3BatchOutput with all 5 task outputs
   */
  async wave3Batch(
    corpus: SignalCorpus,
    previousResults: ModuleResult[],
  ): Promise<Wave3BatchOutput> {
    console.log(
      `[LLMIntegration] phase=call_start callType=wave3_batch ` +
      `tokenEstimate=3500 username=${corpus.github_username}`,
    );

    const userPrompt = this.prompts.buildWave3BatchPrompt(corpus);

    try {
      const rawResponse = await this.llm.chatCompletionWithRetry(
        this.prompts.WAVE_3_SYSTEM_PROMPT,
        userPrompt,
        { requireJson: true, maxTokens: 3000 },
      );

      const parsed = this.parseWave3Response(rawResponse);
      console.log(
        `[LLMIntegration] phase=wave3_parsed ` +
        `commitQuality=${parsed.commit_quality.length} ` +
        `prQuality=${parsed.pr_description_quality.length} ` +
        `reviewDepth=${parsed.review_depth.length} ` +
        `hardProblems=${parsed.hard_problem_detection.length} ` +
        `aiClassification=${parsed.ai_leverage.classification}`,
      );

      return parsed;
    } catch (error) {
      console.log(
        `[LLMIntegration] phase=fallback callType=wave3_batch ` +
        `reason=${(error as Error).message}`,
      );
      return defaultWave3BatchOutput();
    }
  }

  /**
   * Parse the raw JSON response from the Wave 3 batch call.
   * Handles malformed JSON, markdown fences, and missing fields.
   */
  private parseWave3Response(raw: string): Wave3BatchOutput {
    // Strip markdown fences if present
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    }

    // Extract JSON object
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log(`[LLMIntegration] phase=json_parse_error error=no_json_found`);
      return defaultWave3BatchOutput();
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);

      return {
        commit_quality: Array.isArray(parsed.commit_quality)
          ? parsed.commit_quality.map(Number).filter((n: number) => !isNaN(n))
          : [],
        pr_description_quality: Array.isArray(parsed.pr_description_quality)
          ? parsed.pr_description_quality.map(Number).filter((n: number) => !isNaN(n))
          : [],
        review_depth: Array.isArray(parsed.review_depth)
          ? parsed.review_depth.filter((d: string) =>
              ['LGTM_only', 'surface', 'root_cause', 'architectural'].includes(d),
            )
          : [],
        hard_problem_detection: Array.isArray(parsed.hard_problem_detection)
          ? parsed.hard_problem_detection.filter((d: string) =>
              ['hard_problem', 'moderate', 'routine', 'unclear'].includes(d),
            )
          : [],
        ai_leverage: parsed.ai_leverage && typeof parsed.ai_leverage === 'object'
          ? {
              classification: this.validateAIClassification(
                parsed.ai_leverage.classification,
              ),
              confidence_0_to_100: Math.max(
                0,
                Math.min(100, Number(parsed.ai_leverage.confidence_0_to_100) || 0),
              ),
              reasoning: parsed.ai_leverage.reasoning || 'No reasoning provided.',
              key_evidence: Array.isArray(parsed.ai_leverage.key_evidence)
                ? parsed.ai_leverage.key_evidence
                : [],
            }
          : defaultWave3BatchOutput().ai_leverage,
      };
    } catch (error) {
      console.log(
        `[LLMIntegration] phase=json_parse_error error=${(error as Error).message}`,
      );
      return defaultWave3BatchOutput();
    }
  }

  /**
   * Validate AI classification against allowed values.
   */
  private validateAIClassification(value: string): Wave3BatchOutput['ai_leverage']['classification'] {
    const validValues = [
      'ai_architect',
      'ai_operator',
      'ai_passenger',
      'traditional',
      'disclosure_flag',
    ] as const;
    return validValues.includes(value as any)
      ? (value as Wave3BatchOutput['ai_leverage']['classification'])
      : 'traditional';
  }

  // ──────────────────────────────────────────────────────────────────
  // Wave 4: Narrative Generation
  // ──────────────────────────────────────────────────────────────────

  /**
   * Generate the evidence brief narrative (Sections A, B, C).
   * Uses the module results and CV claims (if any) to produce natural language text.
   */
  async generateNarrative(
    allModuleResults: ModuleResult[],
    config: AnalysisConfig,
    corpus: SignalCorpus,
  ): Promise<NarrativeOutput> {
    console.log(
      `[LLMIntegration] phase=call_start callType=narrative ` +
      `tokenEstimate=2500 username=${corpus.github_username}`,
    );

    const userPrompt = this.prompts.buildNarrativePrompt(
      allModuleResults,
      corpus,
      config,
    );

    try {
      const raw = await this.llm.chatCompletionWithRetry(
        this.prompts.NARRATIVE_SYSTEM_PROMPT,
        userPrompt,
        { maxTokens: 2000 },
      );

      return this.parseNarrativeResponse(raw);
    } catch (error) {
      console.log(
        `[LLMIntegration] phase=fallback callType=narrative ` +
        `reason=${(error as Error).message}`,
      );
      return defaultNarrativeOutput();
    }
  }

  /**
   * Parse the narrative response — split on section delimiters.
   */
  private parseNarrativeResponse(raw: string): NarrativeOutput {
    const sectionADelim = '---SECTION_A---';
    const sectionBDelim = '---SECTION_B---';
    const sectionCDelim = '---SECTION_C---';

    const sectionA = this.extractSection(raw, sectionADelim, sectionBDelim);
    const sectionB = this.extractSection(raw, sectionBDelim, sectionCDelim);
    const sectionC = this.extractSection(raw, sectionCDelim, null);

    return {
      profile_summary: sectionA || defaultNarrativeOutput().profile_summary,
      cv_cross_reference: sectionB || defaultNarrativeOutput().cv_cross_reference,
      work_pattern_intelligence: sectionC || defaultNarrativeOutput().work_pattern_intelligence,
    };
  }

  /**
   * Extract a section between two delimiters.
   */
  private extractSection(
    text: string,
    startDelim: string,
    endDelim: string | null,
  ): string {
    const startIdx = text.indexOf(startDelim);
    if (startIdx === -1) return '';

    const contentStart = startIdx + startDelim.length;
    if (!endDelim) return text.slice(contentStart).trim();

    const endIdx = text.indexOf(endDelim, contentStart);
    if (endIdx === -1) return text.slice(contentStart).trim();

    return text.slice(contentStart, endIdx).trim();
  }

  // ──────────────────────────────────────────────────────────────────
  // Wave 4: Interview Questions
  // ──────────────────────────────────────────────────────────────────

  /**
   * Generate interview questions from module results.
   * Returns an array of 4 questions (one per type).
   */
  async generateInterviewQuestions(
    allModuleResults: ModuleResult[],
    corpus: SignalCorpus,
  ): Promise<InterviewQuestion[]> {
    console.log(
      `[LLMIntegration] phase=call_start callType=interview_questions ` +
      `tokenEstimate=2000 username=${corpus.github_username}`,
    );

    const userPrompt = this.prompts.buildInterviewQuestionsPrompt(
      allModuleResults,
      corpus,
    );

    try {
      const raw = await this.llm.chatCompletionWithRetry(
        this.prompts.INTERVIEW_Q_SYSTEM_PROMPT,
        userPrompt,
        { requireJson: true, maxTokens: 2000 },
      );

      return this.parseInterviewQuestions(raw);
    } catch (error) {
      console.log(
        `[LLMIntegration] phase=fallback callType=interview_questions ` +
        `reason=${(error as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Parse the interview questions JSON array.
   */
  private parseInterviewQuestions(raw: string): InterviewQuestion[] {
    // Strip markdown fences if present
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    }

    try {
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) return [];

      const validTypes = [
        'experience_depth',
        'problem_solving',
        'team_collaboration',
        'technical_judgment',
      ];

      return parsed
        .filter(
          (q: any) =>
            q &&
            typeof q.question === 'string' &&
            validTypes.includes(q.type),
        )
        .map((q: any) => ({
          type: q.type,
          question: q.question.slice(0, 300),
          source_primitive: (q.source_primitive || 'unknown').slice(0, 50),
          evaluation_criteria: (q.evaluation_criteria || '').slice(0, 200),
        }))
        .slice(0, 8);
    } catch {
      console.log(
        `[LLMIntegration] phase=json_parse_error callType=interview_questions`,
      );
      return [];
    }
  }
}