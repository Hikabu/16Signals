/**
 * Mandatory Confidence Language — Spec-defined constants for Evidence Brief.
 *
 * These exact strings MUST be used in the Evidence Brief score labels.
 * No synonyms, paraphrasing, or substitutions are permitted.
 * See spec Section 6.2.
 */

import { ModuleConfidence } from '../modules/module-result.types';

/**
 * Mandatory language for each confidence level.
 * These strings must appear verbatim in the Evidence Brief.
 */
export const CONFIDENCE_LANGUAGE: Record<ModuleConfidence, string> = {
  strong:
    'Demonstrated across {n_repos} repositories and {n_months} months — high confidence.',
  moderate:
    'Evidenced in limited context — probe in interview to confirm depth.',
  low:
    'One instance detected — insufficient to score. Treat as unconfirmed in hiring decision.',
  observability_gap:
    'No public evidence — likely private or enterprise context. Do not penalise. Recommend: {interview_probe}',
  insufficient_data:
    'This profile cannot be assessed from available public signals. Do not use this report as a filter for this candidate. Proceed directly to technical interview using the generated interview questions.',
};

/**
 * Profile-level gate message (when 4+ primitives return observability_gap).
 */
export const PROFILE_LEVEL_GATE =
  'This profile pattern is consistent with enterprise or regulated-industry engineering ' +
  'contexts where public evidence is structurally absent. ' +
  'This is correlated with — not anticorrelated with — seniority and impact. ' +
  'Proceed directly to technical interview.';

/**
 * Formats the confidence language string with interpolated values.
 */
export function formatConfidenceLanguage(
  confidence: ModuleConfidence,
  params?: {
    n_repos?: number;
    n_months?: number;
    interview_probe?: string;
  },
): string {
  let template = CONFIDENCE_LANGUAGE[confidence];

  if (params?.n_repos !== undefined) {
    template = template.replace('{n_repos}', String(params.n_repos));
  }
  if (params?.n_months !== undefined) {
    template = template.replace('{n_months}', String(params.n_months));
  }
  if (params?.interview_probe !== undefined) {
    template = template.replace('{interview_probe}', params.interview_probe);
  }

  return template;
}

/**
 * Composite score is PROHIBITED per spec Section 1.2.
 * This function MUST throw if called.
 */
export function computeCompositeScore(): never {
  throw new Error(
    'Composite scores are prohibited. The Evidence Brief presents seven independent ' +
    'assessments. See Section 1.2 of the Feature & Technical Specification.',
  );
}