/**
 * BriefRenderer — Renders structured Evidence Brief sections into Markdown.
 *
 * Architecture: Pure rendering functions. Takes structured section data
 * and produces formatted Markdown strings. No business logic — all
 * computation is done by the BriefAssemblerService.
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 6
 */

import { Injectable } from '@nestjs/common';
import { ModuleResult } from '../modules/module-result.types';
import { WeightedModuleResult } from './seniority-weighting';

export interface BriefSections {
  sectionA: string;
  sectionB: string;
  sectionC: string;
  sectionD: string;
  sectionE: string;
  sectionF: string | null;
  sectionG: string;
  metadata: {
    username: string;
    mode: string;
    generatedAt: string;
    schemaVersion: string;
  };
}

export interface SectionA_Input {
  profileSummary: string;
  confidenceOverview: Array<{
    module_id: string;
    confidence: string;
    score_label: string;
  }>;
}

export interface SectionB_Input {
  claimByClaim: string;
  cvClaimsPresent: boolean;
  claimCount: number;
}

export interface SectionC_Input {
  workPatternIntelligence: string;
  primitivesSummary: string;
}

export interface SectionD_Input {
  flags: Array<{
    flag_id: string;
    flag_type: string;
    severity: string;
    module_id: string;
    description: string;
    escalate_to_hiring_manager: boolean;
    clear_without_interview: boolean;
    interview_probe: string | null;
  }>;
}

export interface SectionE_Input {
  interviewQuestions: Array<{
    type: string;
    question: string;
    source_primitive: string;
    evaluation_criteria: string;
  }>;
}

@Injectable()
export class BriefRenderer {
  /**
   * Render all sections into a complete Markdown Evidence Brief.
   */
  renderMarkdown(sections: BriefSections): string {
    const md: string[] = [];

    md.push(`# Evidence Brief: @${sections.metadata.username}`);
    md.push('');
    md.push(
      `**Analysis Mode:** ${sections.metadata.mode} | ` +
      `**Generated:** ${sections.metadata.generatedAt} | ` +
      `**Schema:** ${sections.metadata.schemaVersion}`,
    );
    md.push('');
    md.push('---');
    md.push('');

    // Section A
    md.push('## A. Profile in 90 Seconds');
    md.push('');
    md.push(sections.sectionA);
    md.push('');
    md.push('---');
    md.push('');

    // Section B
    md.push('## B. Tech Reality vs CV Claims');
    md.push('');
    md.push(sections.sectionB);
    md.push('');
    md.push('---');
    md.push('');

    // Section C
    md.push('## C. Work Pattern Intelligence');
    md.push('');
    md.push(sections.sectionC);
    md.push('');
    md.push('---');
    md.push('');

    // Section D
    md.push('## D. Red Flags & Verification Gaps');
    md.push('');
    md.push(sections.sectionD);
    md.push('');
    md.push('---');
    md.push('');

    // Section E
    md.push('## E. Interview Intelligence');
    md.push('');
    md.push(sections.sectionE);
    md.push('');
    md.push('---');
    md.push('');

    // Section F (optional)
    if (sections.sectionF) {
      md.push('## F. Role & Stack Match');
      md.push('');
      md.push(sections.sectionF);
      md.push('');
      md.push('---');
      md.push('');
    }

    // Section G
    md.push('## G. What This Evaluation Cannot Tell You');
    md.push('');
    md.push(sections.sectionG);

    return md.join('\n');
  }

  /**
   * Render Section A: Profile in 90 Seconds.
   */
  renderSectionA(input: SectionA_Input): string {
    const parts: string[] = [];
    parts.push(input.profileSummary);
    parts.push('');
    parts.push('### Confidence Overview');
    for (const mod of input.confidenceOverview) {
      parts.push(`- **${mod.module_id}**: ${mod.confidence} — ${mod.score_label}`);
    }
    return parts.join('\n');
  }

  /**
   * Render Section B: Tech Reality vs CV Claims.
   */
  renderSectionB(input: SectionB_Input): string {
    if (!input.cvClaimsPresent) {
      return 'No CV claims were provided for cross-reference. This assessment is based solely on public GitHub activity.';
    }
    const parts: string[] = [];
    parts.push(`**${input.claimCount} claim(s) extracted from CV.**`);
    parts.push('');
    parts.push(input.claimByClaim);
    return parts.join('\n');
  }

  /**
   * Render Section D: Red Flags & Verification Gaps.
   */
  renderSectionD(input: SectionD_Input): string {
    if (input.flags.length === 0) {
      return '**No flags detected.** The assessment shows no anomalies or verification gaps.';
    }

    const hardFlags = input.flags.filter((f) => f.flag_type === 'HARD');
    const softFlags = input.flags.filter((f) => f.flag_type === 'SOFT');

    const parts: string[] = [];

    if (hardFlags.length > 0) {
      parts.push('### ⚠ HARD Flags (Escalate to Hiring Manager)');
      parts.push('');
      for (const flag of hardFlags) {
        parts.push(`- **${flag.flag_id}** (${flag.severity})`);
        parts.push(`  - ${flag.description}`);
        if (flag.interview_probe) {
          parts.push(`  - Probe: "${flag.interview_probe}"`);
        }
        parts.push('');
      }
    }

    if (softFlags.length > 0) {
      parts.push('### SOFT Flags (Review in Interview)');
      parts.push('');
      for (const flag of softFlags) {
        parts.push(`- **${flag.flag_id}** (${flag.severity})`);
        parts.push(`  - ${flag.description}`);
        if (flag.interview_probe) {
          parts.push(`  - Probe: "${flag.interview_probe}"`);
        }
        parts.push('');
      }
    }

    return parts.join('\n');
  }

  /**
   * Render Section E: Interview Intelligence.
   */
  renderSectionE(input: SectionE_Input): string {
    if (input.interviewQuestions.length === 0) {
      return 'No interview questions were generated for this profile.';
    }

    const parts: string[] = [];
    for (const q of input.interviewQuestions) {
      parts.push(`### ${this.formatQuestionType(q.type)}`);
      parts.push('');
      parts.push(`**Question:** ${q.question}`);
      parts.push('');
      parts.push(`*Evaluation criteria:* ${q.evaluation_criteria}`);
      parts.push(`*Source:* ${q.source_primitive}`);
      parts.push('');
    }

    return parts.join('\n');
  }

  /**
   * Render Section G: What This Evaluation Cannot Tell You.
   */
  renderSectionG(): string {
    return [
      'This evaluation is based entirely on public GitHub activity. It cannot assess:',
      '',
      '- **Private or enterprise work**: Engineers at established companies often have limited public history.',
      '- **Soft skills**: Communication, teamwork, leadership in closed-source environments.',
      '- **Performance under pressure**: How the candidate performs in production incidents or tight deadlines.',
      '- **Technical interviews**: The candidate\'s ability to solve novel problems or explain complex concepts.',
      '- **Cultural fit**: Alignment with team values, working style, or company mission.',
      '',
      'Use this report as a starting point for a structured technical interview, not as a hiring filter.',
    ].join('\n');
  }

  private formatQuestionType(type: string): string {
    const labels: Record<string, string> = {
      experience_depth: 'Experience & Depth',
      problem_solving: 'Problem Solving',
      team_collaboration: 'Team & Collaboration',
      technical_judgment: 'Technical Judgment',
    };
    return labels[type] || type;
  }
}