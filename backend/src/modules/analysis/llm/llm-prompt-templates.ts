/**
 * LLM Prompt Templates — All system/user prompts for Deepseek v4 LLM calls.
 *
 * Architecture: Stateless template provider. Each method returns a complete
 * system + user prompt pair for a specific LLM call type.
 *
 * Call types:
 *   - Wave 3 Batch: 5 analysis tasks in one call (commit quality, PR quality,
 *                    review depth, hard problem detection, AI leverage)
 *   - Wave 4 Narrative: Generates Section A, B, C text for the Evidence Brief
 *   - Wave 4 Interview Questions: Generates 4-8 structured interview questions
 *
 * Token budgeting is managed by the caller (LLMIntegrationService).
 * Templates are designed to fit within 4K token responses.
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 5
 */

import { Injectable } from '@nestjs/common';
import { SignalCorpus } from '../corpus/corpus.types';
import { ModuleResult } from '../modules/module-result.types';
import { AnalysisConfig } from '../modules/module.interface';

@Injectable()
export class LLMPromptTemplates {
  // ──────────────────────────────────────────────────────────────────
  // Wave 3: Batch Analysis System Prompt
  // ──────────────────────────────────────────────────────────────────

  readonly WAVE_3_SYSTEM_PROMPT = `You are an expert software engineering analyst. Analyze the provided GitHub profile data and return a single JSON object with the following named sections. Return ONLY the JSON — no preamble, no explanation, no markdown fences.

TASK 1 — commit_quality: Score each commit message 0–100 on: imperative mood (25pts), specificity (40pts), appropriate length (15pts), context provided (20pts). Return: { "commit_quality": number[] } (same order as input)

TASK 2 — pr_description_quality: Score each PR description 0–100: explains WHY not just what (30pts), trade-offs mentioned (25pts), testing described (20pts), reviewer context (25pts). Return: { "pr_description_quality": number[] }

TASK 3 — review_depth: Classify each review comment: LGTM_only | surface | root_cause | architectural. Return: { "review_depth": string[] }

TASK 4 — hard_problem_detection: For each commit/PR, classify: hard_problem | moderate | routine | unclear. hard_problem = addresses concurrency, fault tolerance, data consistency, performance at scale, or distributed systems. Return: { "hard_problem_detection": string[] }

TASK 5 — ai_leverage_classification: Analyze the engineer's git history for AI leverage patterns. Input: commit message samples, style discontinuity events, AI config files. Be conservative — prefer 'traditional' or 'ai_operator' over 'disclosure_flag' unless evidence is strong. Return: { "ai_leverage": { "classification": "ai_architect|ai_operator|ai_passenger|traditional|disclosure_flag", "confidence_0_to_100": number, "reasoning": "string", "key_evidence": ["string"] } }`;

  // ──────────────────────────────────────────────────────────────────
  // Wave 4: Narrative System Prompts
  // ──────────────────────────────────────────────────────────────────

  readonly NARRATIVE_SYSTEM_PROMPT = `You are an expert technical recruiter writing an evidence brief about a software engineer. Write a clear, specific assessment based on the provided analysis results. Use natural language. Do not use markdown formatting or bullet points in your response. Write in plain paragraphs.

Structure your response with three sections marked by "---SECTION_A---", "---SECTION_B---", and "---SECTION_C---" delimiters.

SECTION A — Profile in 90 Seconds: Summarize the candidate's strengths, working style, and what the evidence shows about their engineering capability. Be specific — cite concrete evidence patterns, not generic traits. 2-3 paragraphs.

SECTION B — Tech Reality vs CV Claims: For each CV claim provided, state whether the GitHub evidence supports, contradicts, or is silent on the claim. Be specific about what evidence was found or not found. If no CV claims were provided, state "No CV claims provided for cross-reference." 1-2 paragraphs.

SECTION C — Work Pattern Intelligence: Describe the candidate's work patterns — cadence, collaboration style, areas of depth, and any notable patterns (positive or negative). 1-2 paragraphs.`;

  readonly INTERVIEW_Q_SYSTEM_PROMPT = `You are an expert technical interviewer preparing questions based on a candidate's GitHub analysis. Generate 4 interview questions as a JSON array. Each question must target a different category and be specific to what the evidence shows.

Return ONLY a JSON array with no preamble: [ { "type": "experience_depth|problem_solving|team_collaboration|technical_judgment", "question": "string", "source_primitive": "string", "evaluation_criteria": "string" } ]

Generate exactly 4 questions, one per type. Base each question on specific gaps or strengths identified in the module results. Questions should probe areas where the evidence was inconclusive or where an interview would add critical context.`;

  // ──────────────────────────────────────────────────────────────────
  // Prompt Builders
  // ──────────────────────────────────────────────────────────────────

  /**
   * Build the user prompt for the Wave 3 batch LLM call.
   * Includes sampled commit messages, PR descriptions, review comments,
   * style discontinuity events, and AI config files.
   */
  buildWave3BatchPrompt(corpus: SignalCorpus): string {
    const cs = corpus.commit_signals;
    const ep = corpus.engineering_practice_signals;
    const ag = corpus.anti_gaming_inputs;

    const sections: string[] = [];

    // Commit messages (max 20)
    const msgs = cs.message_quality_raw.slice(0, 20);
    sections.push(`COMMIT MESSAGES (${msgs.length}):`);
    msgs.forEach((m, i) => sections.push(`  ${i + 1}. "${m.slice(0, 120)}"`));

    // PR descriptions (max 10)
    const prs = corpus.collaboration_signals.contribution.pr_description_raw.slice(0, 10);
    sections.push(`PR DESCRIPTIONS (${prs.length}):`);
    prs.forEach((p, i) => sections.push(`  ${i + 1}. "${p.slice(0, 200)}"`));

    // Review comments (max 10)
    const reviews = corpus.collaboration_signals.review.authored_review_raw.slice(0, 10);
    sections.push(`REVIEW COMMENTS (${reviews.length}):`);
    reviews.forEach((r, i) => sections.push(`  ${i + 1}. "${r.slice(0, 200)}"`));

    // Metadata
    sections.push(`METADATA:`);
    sections.push(`  Total lifetime commits: ${cs.sampled_commit_count}`);
    sections.push(`  Active months: ${Object.keys(cs.commit_frequency_by_month).length}`);
    // sections.push(`  Sub-5-line commit ratio: ${cs.sub_5_line_commit_ratio.toFixed(3)}`);
    sections.push(`  Merge commit ratio: ${cs.merge_commit_ratio.toFixed(3)}`);
    sections.push(`  Style discontinuity events: ${ag.style_discontinuity_events.length}`);
    sections.push(`  AI config files: ${ep.ai_config_files_present.join(', ') || 'none'}`);

    return sections.join('\n');
  }

  /**
   * Build the user prompt for the Wave 4 narrative generation.
   */
  buildNarrativePrompt(
    moduleResults: ModuleResult[],
    corpus: SignalCorpus,
    config: AnalysisConfig,
  ): string {
    const sections: string[] = [];

    sections.push(`CANDIDATE: ${corpus.github_username}`);
    sections.push(`SENIORITY: ${config.seniority}`);
    sections.push(`ROLE: ${config.role_archetype}`);
    sections.push('');

    // Module results summary
    sections.push('MODULE RESULTS:');
    for (const result of moduleResults) {
      sections.push(
        `  ${result.module_id}: confidence=${result.confidence} ` +
        `flags=${result.flags.length} evidence=${result.evidence.length} ` +
        `score="${result.score_label.slice(0, 100)}"`,
      );
      if (result.interview_probe) {
        sections.push(`    probe="${result.interview_probe.slice(0, 120)}"`);
      }
    }

    // CV claims if present
    if (config.cv_claims && config.cv_claims.length > 0) {
      sections.push('');
      sections.push('CV CLAIMS:');
      for (const claim of config.cv_claims) {
        sections.push(
          `  ${claim.type}: "${claim.value}" ` +
          `(confidence: ${claim.confidence}, source: "${claim.source_text.slice(0, 80)}")`,
        );
      }
    }

    // Corpus summary
    sections.push('');
    sections.push('CORPUS GROUPS:');
    sections.push(`  Present: ${corpus.groups_present.join(', ')}`);
    sections.push(`  Errors: ${corpus.collection_errors.length > 0 ? corpus.collection_errors.join('; ') : 'none'}`);

    return sections.join('\n');
  }

  /**
   * Build the user prompt for interview question generation.
   */
  buildInterviewQuestionsPrompt(
    moduleResults: ModuleResult[],
    corpus: SignalCorpus,
  ): string {
    const sections: string[] = [];

    sections.push(`CANDIDATE: ${corpus.github_username}`);
    sections.push('');

    // Focus on modules with low confidence or flags
    const interestingResults = moduleResults.filter(
      (r) => r.confidence === 'low' ||
        r.confidence === 'observability_gap' ||
        r.flags.length > 0 ||
        r.interview_probe !== null,
    );

    sections.push(`AREAS REQUIRING INTERVIEW PROBE (${interestingResults.length}):`);
    for (const result of interestingResults) {
      sections.push(
        `  ${result.module_id}: confidence=${result.confidence} flags=${result.flags.length}`,
      );
      if (result.interview_probe) {
        sections.push(`    Suggested probe: "${result.interview_probe}"`);
      }
    }

    // Low-confidence modules that need deeper investigation
    const lowConfidence = moduleResults.filter(
      (r) => r.confidence === 'low' || r.confidence === 'observability_gap',
    );
    if (lowConfidence.length > 0) {
      sections.push('');
      sections.push(`OBSERVABILITY GAPS (${lowConfidence.length}):`);
      for (const result of lowConfidence) {
        sections.push(`  ${result.module_id}: ${result.score_label.slice(0, 120)}`);
      }
    }

    return sections.join('\n');
  }
}