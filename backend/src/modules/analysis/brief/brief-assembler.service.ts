/**
 * BriefAssemblerService — Assembles the complete Evidence Brief from module results,
 * LLM narratives, interview questions, and (optionally) CV claims.
 *
 * Architecture: Consumes all pipeline outputs and produces a 7-section Evidence Brief
 * in Markdown and JSON formats. Each section is independently assembled.
 *
 * Section F is conditional: only included when jd_text is provided in config.
 * Composite scores are PROHIBITED (enforced by confidence-language.ts).
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 6
 */

import { Injectable } from '@nestjs/common';
import { ModuleResult, Flag } from '../modules/module-result.types';
import { AnalysisConfig } from '../modules/module.interface';
import { SignalCorpus } from '../corpus/corpus.types';
import { NarrativeOutput, InterviewQuestion, EvidenceBriefOutput } from '../llm/llm-response.types';
import { SeniorityWeightingService, WeightedModuleResult } from './seniority-weighting';
import { BriefRenderer, BriefSections } from './brief-renderer';
import { CvClaimExtractorService } from './cv-claim-extractor.service';
import { formatConfidenceLanguage, computeCompositeScore } from './confidence-language';

@Injectable()
export class BriefAssemblerService {
  constructor(
    private readonly renderer: BriefRenderer,
    private readonly seniorityWeighting: SeniorityWeightingService,
    private readonly cvExtractor: CvClaimExtractorService,
  ) {}

  /**
   * Assemble the complete Evidence Brief.
   */
  async assemble(
    moduleResults: ModuleResult[],
    narrative: NarrativeOutput,
    interviewQuestions: InterviewQuestion[],
    corpus: SignalCorpus,
    config: AnalysisConfig,
    jobId: string,
  ): Promise<EvidenceBriefOutput> {
    console.log(
      `[BriefAssembler] phase=assembly_start jobId=${jobId} ` +
      `moduleCount=${moduleResults.length} username=${corpus.github_username}`,
    );

    // Apply seniority weighting
    const weighted = this.seniorityWeighting.apply(moduleResults, config);
    console.log(
      `[BriefAssembler] phase=section_complete jobId=${jobId} section=weighting`,
    );

    // ── Section A: Profile in 90 Seconds ──
    const sectionA = this.renderer.renderSectionA({
      profileSummary: narrative.profile_summary,
      confidenceOverview: moduleResults.map((r) => ({
        module_id: r.module_id,
        confidence: r.confidence,
        score_label: r.score_label,
      })),
    });
    console.log(`[BriefAssembler] phase=section_complete jobId=${jobId} section=A`);

    // ── Section B: Tech Reality vs CV Claims ──
    const hasCvClaims = config.cv_claims !== undefined && config.cv_claims.length > 0;
    const sectionB = this.renderer.renderSectionB({
      claimByClaim: narrative.cv_cross_reference,
      cvClaimsPresent: hasCvClaims,
      claimCount: config.cv_claims?.length ?? 0,
    });
    console.log(
      `[BriefAssembler] phase=section_complete jobId=${jobId} section=B ` +
      `cvClaims=${hasCvClaims ? config.cv_claims?.length : 0}`,
    );

    // ── Section C: Work Pattern Intelligence ──
    const sectionC = this.assembleSectionC(moduleResults, narrative, corpus);
    console.log(`[BriefAssembler] phase=section_complete jobId=${jobId} section=C`);

    // ── Section D: Red Flags & Verification Gaps ──
    const sectionD = this.renderer.renderSectionD({
      flags: this.extractAllFlags(moduleResults),
    });
    console.log(
      `[BriefAssembler] phase=section_complete jobId=${jobId} section=D ` +
      `flags=${this.extractAllFlags(moduleResults).length}`,
    );

    // ── Section E: Interview Intelligence ──
    const sectionE = this.renderer.renderSectionE({
      interviewQuestions: interviewQuestions,
    });
    console.log(`[BriefAssembler] phase=section_complete jobId=${jobId} section=E`);

    // ── Section F: Role & Stack Match (conditional) ──
    const sectionF = config.jd_text
      ? this.assembleSectionF(moduleResults, config)
      : null;
    if (sectionF) {
      console.log(`[BriefAssembler] phase=section_complete jobId=${jobId} section=F`);
    }

    // ── Section G: What This Evaluation Cannot Tell You ──
    const sectionG = this.renderer.renderSectionG();
    console.log(`[BriefAssembler] phase=section_complete jobId=${jobId} section=G`);

    // ── Render Markdown ──
    const sections: BriefSections = {
      sectionA,
      sectionB,
      sectionC,
      sectionD,
      sectionE,
      sectionF,
      sectionG,
      metadata: {
        username: corpus.github_username,
        mode: corpus.collection_mode,
        generatedAt: new Date().toISOString(),
        schemaVersion: 'gitintel_v1.0',
      },
    };

    const briefMarkdown = this.renderer.renderMarkdown(sections);

    // ── Build structured JSON ──
    const primitiveScores = this.extractPrimitiveScores(moduleResults);
    const redFlags = this.extractAllFlags(moduleResults);

    const briefJson = {
      sections: {
        A: sectionA,
        B: sectionB,
        C: sectionC,
        D: sectionD,
        E: sectionE,
        F: sectionF,
        G: sectionG,
      },
      primitiveScores,
      redFlags,
      interviewQuestions,
      metadata: {
        username: corpus.github_username,
        mode: corpus.collection_mode,
        generatedAt: new Date().toISOString(),
        schemaVersion: 'gitintel_v1.0',
      },
    };

    console.log(
      `[BriefAssembler] phase=assembly_complete jobId=${jobId} ` +
      `markdownLength=${briefMarkdown.length} sections=7`,
    );

    return {
      briefMarkdown,
      briefJson,
      primitiveScores,
      redFlags,
      interviewQuestions,
    };
  }

  /**
   * Assemble Section C: Work Pattern Intelligence.
   * Combines LLM narrative with structured primitive summaries.
   */
  private assembleSectionC(
    moduleResults: ModuleResult[],
    narrative: NarrativeOutput,
    corpus: SignalCorpus,
  ): string {
    const parts: string[] = [];

    parts.push(narrative.work_pattern_intelligence);
    parts.push('');
    parts.push('### Primitive Score Summary');
    parts.push('');

    const primitives = moduleResults.filter((r) => r.primitive_id?.startsWith('p'));
    for (const p of primitives) {
      const formatted = formatConfidenceLanguage(
        p.confidence,
        p.confidence === 'observability_gap' && p.interview_probe
          ? { interview_probe: p.interview_probe }
          : undefined,
      );
      parts.push(`- **${p.module_id}**: ${formatted}`);
    }

    return parts.join('\n');
  }

  /**
   * Assemble Section F: Role & Stack Match (conditional).
   * Only rendered when config.jd_text is provided.
   */
  private assembleSectionF(
    moduleResults: ModuleResult[],
    config: AnalysisConfig,
  ): string {
    const parts: string[] = [];
    parts.push(`**Target Role:** ${config.role_archetype} (${config.seniority})`);
    parts.push('');
    parts.push('### Alignment Assessment');
    parts.push('');

    // Match role archetype against module results
    const p4Result = moduleResults.find((r) => r.module_id === 'p4_technical_depth');
    const p3Result = moduleResults.find((r) => r.module_id === 'p3_collaboration_leverage');

    if (p4Result) {
      parts.push(
        `- **Technical Depth**: ${p4Result.confidence} — ${p4Result.score_label}`,
      );
    }
    if (p3Result) {
      parts.push(
        `- **Collaboration**: ${p3Result.confidence} — ${p3Result.score_label}`,
      );
    }

    parts.push('');
    parts.push('### JD Text Provided (matched against modules)');
    parts.push('');
    parts.push(
      'Note: Full JD-to-profile matching requires the LLM narrative enrichment. ' +
      'The structured assessment above provides signal-level alignment.',
    );

    return parts.join('\n');
  }

  /**
   * Extract all flags from all module results.
   */
  private extractAllFlags(moduleResults: ModuleResult[]): Array<{
    flag_id: string;
    flag_type: 'SOFT' | 'HARD';
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    module_id: string;
    description: string;
    escalate_to_hiring_manager: boolean;
    clear_without_interview: boolean;
    interview_probe: string | null;
  }> {
    const flags: Array<{
      flag_id: string;
      flag_type: 'SOFT' | 'HARD';
      severity: 'INFO' | 'WARNING' | 'CRITICAL';
      module_id: string;
      description: string;
      escalate_to_hiring_manager: boolean;
      clear_without_interview: boolean;
      interview_probe: string | null;
    }> = [];

    for (const result of moduleResults) {
      for (const flag of result.flags) {
        flags.push({
          flag_id: flag.flag_id,
          flag_type: flag.flag_type,
          severity: flag.severity,
          module_id: flag.module_id,
          description: flag.description,
          escalate_to_hiring_manager: flag.escalate_to_hiring_manager,
          clear_without_interview: flag.clear_without_interview,
          interview_probe: flag.interview_probe,
        });
      }
    }

    // Sort: HARD flags first, then by severity
    return flags.sort((a, b) => {
      if (a.flag_type !== b.flag_type) return a.flag_type === 'HARD' ? -1 : 1;
      const severityOrder = { CRITICAL: 0, WARNING: 1, INFO: 2 };
      return (
        (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)
      );
    });
  }

  /**
   * Extract primitive scores from module results.
   * Returns a map of primitive_id -> numeric score derived from confidence.
   * NOTE: These are NOT composite scores — they are individual primitive assessments.
   */
  private extractPrimitiveScores(
    moduleResults: ModuleResult[],
  ): Record<string, number> {
    const scores: Record<string, number> = {};
    const confidenceToScore: Record<string, number> = {
      strong: 90,
      moderate: 65,
      low: 35,
      observability_gap: 0,
      insufficient_data: 0,
    };

    for (const result of moduleResults) {
      if (result.primitive_id) {
        scores[result.primitive_id] =
          confidenceToScore[result.confidence] ?? 0;
      }
    }

    return scores;
  }
}