/**
 * Zod Validation Schemas for Signal Corpus
 *
 * Validates all 7 corpus groups and the top-level SignalCorpus structure.
 * Used in tests and runtime validation when building/consuming corpora.
 *
 * Usage:
 *   import { signalCorpusSchema } from './corpus.schema';
 *   const parsed = signalCorpusSchema.parse(rawCorpus);
 */

import { z } from 'zod';

// ─── Group Sub-Schemas ───────────────────────────────────────────────

const identitySignalsSchema = z.object({
  account_age_days: z.number().min(0),
  bio: z.string().nullable(),
  company_claim: z.string().nullable(),
  linked_urls: z.array(z.string()),
  commit_email_domains: z.array(z.string()),
  github_org_memberships: z.array(z.string()),
  hireable_flag: z.boolean().nullable(),
});

const repositorySignalSchema = z.object({
  name: z.string(),
  full_name: z.string(),
  primary_language: z.string().nullable(),
  star_count: z.number().min(0),
  fork_count: z.number().min(0),
  commit_count: z.number().min(0),
  is_fork: z.boolean(),
  is_archived: z.boolean(),
  is_private: z.boolean(),
  is_org_repo: z.boolean(),
  pushed_at: z.string(),
  has_readme: z.boolean(),
  topics: z.array(z.string()),
  homepage_url: z.string().nullable(),
  languages: z.record(z.string(), z.number()),
  quality_score: z.number().min(0),
});

const perRepoAuthorStatsSchema = z.object({
  lines_added: z.number(),
  lines_deleted: z.number(),
  commits: z.number(),
  active_days: z.number(),
  authorship_pct: z.number().min(0).max(1),
});

const commitSignalsSchema = z.object({
  sampled_commit_count: z.number().min(0),
  commit_frequency_by_month: z.record(z.string(), z.number()),
  p25_commit_size_lines: z.number().min(0),
  median_commit_size_lines: z.number().min(0),
  sub_5_line_commit_ratio: z.number().min(0).max(1),
  merge_commit_ratio: z.number().min(0).max(1),
  message_quality_raw: z.array(z.string()),
  message_quality_scores: z.array(z.number().min(0).max(100)),
  //deep mode:
  test_to_code_ratio_by_repo: z.record(z.string(), z.number()),
  per_repo_author_stats: z.record(z.string(), perRepoAuthorStatsSchema),
  complexity_trend_by_year: z.record(z.string(), z.number()),
  commit_size_histogram: z.array(z.number()),

});

const collaborationSignalsSchema = z.object({
  pr_author_count: z.number().min(0),
  pr_reviewer_count: z.number().min(0),
  substantive_review_ratio: z.number().min(0).max(1),
  self_merge_rate: z.number().min(0).max(1),
  avg_pr_description_length_words: z.number().min(0),
  pr_size_distribution: z.array(z.number()),
  pr_description_raw: z.array(z.string()),
  review_comment_raw: z.array(z.string()),
  review_comment_depth_scores: z.array(z.number().min(0).max(100)),
  cross_repo_comment_count: z.number().min(0),
  issue_triage_quality_score: z.number().min(0).max(100).nullable(),
  avg_time_to_merge_hours: z.number().min(0),
});

const secretLeakDetailSchema = z.object({
  repo: z.string(),
  file_path: z.string(),
  secret_type: z.string(),
  commit_sha: z.string(),
  is_revoked: z.boolean(),
});

const engineeringPracticeSignalsSchema = z.object({
  repos_with_test_dir: z.number().min(0),
  repos_with_ci_config: z.number().min(0),
  repos_with_docker: z.number().min(0),
  repos_with_iac: z.number().min(0),
  repos_with_linting: z.number().min(0),
  ci_pass_rate_trajectory: z.record(z.string(), z.number().min(0).max(1)),
  semantic_versioning_discipline: z.boolean(),
  avg_dependabot_resolution_days: z.number().min(0).nullable(),
  secret_leak_detected: z.boolean(),
  secret_leak_details: z.array(secretLeakDetailSchema),
  sast_finding_density: z.number().min(0).nullable(),
  observability_markers_present: z.array(z.string()),
  feature_flag_usage_detected: z.boolean(),
  ai_config_files_present: z.array(z.string()),
  actionlint_violations: z.number().min(0),
});

const packageRegistryEntrySchema = z.object({
  name: z.string(),
  downloads: z.number().min(0),
  dependents: z.number().min(0),
});

const impactSignalsSchema = z.object({
  // external_oss_contribution_count: z.number().min(0),
  contribution_calendar_active_weeks_12m: z.number().min(0),
  npm_packages: z.array(packageRegistryEntrySchema),
  pypi_packages: z.array(packageRegistryEntrySchema),
  cargo_packages: z.array(packageRegistryEntrySchema),
  stackoverflow_reputation: z.number().min(0),
  stackoverflow_accepted_answer_rate: z.number().min(0).max(1).nullable(),
  stackoverflow_top_tags: z.array(z.string()),
});

const codeSearchFlagSchema = z.object({
  repo: z.string(),
  similarity_ratio: z.number().min(0).max(1),
  matched_repos: z.array(z.string()),
});

const copyleaksResultSchema = z.object({
  repo: z.string(),
  similarity_pct: z.number().min(0).max(100),
  confirmed: z.boolean(),
});

const styleDiscontinuityEventSchema = z.object({
  date: z.string(),
  repo: z.string(),
  lines_added: z.number().min(0),
  style_delta_score: z.number().min(0).max(100),
});

const antiGamingInputsSchema = z.object({
  burst_dormancy_ratio: z.number().min(0),
  burst_triggered_at_evaluation: z.boolean(),
  fork_dump_ratio: z.number().min(0),
  code_search_flags: z.array(codeSearchFlagSchema),
  copyleaks_results: z.array(copyleaksResultSchema),
  commit_inflation_ratio: z.number().min(0),
  ai_pattern_confidence: z.number().min(0).max(100),
  style_discontinuity_events: z.array(styleDiscontinuityEventSchema),
});

// ─── Top-Level Signal Corpus Schema ──────────────────────────────────

export const signalCorpusSchema = z.object({
  corpus_id: z.string().min(1),
  github_username: z.string().min(1),
  collected_at: z.string(), // ISO8601
  collection_mode: z.enum(['light', 'deep', 'light_partial', 'deep_partial']),
  groups_present: z.array(
    z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G']),
  ),
  collection_errors: z.array(z.string()),
  identity: identitySignalsSchema,
  repositories: z.array(repositorySignalSchema),
  commit_signals: commitSignalsSchema,
  collaboration_signals: collaborationSignalsSchema,
  engineering_practice_signals: engineeringPracticeSignalsSchema,
  impact_signals: impactSignalsSchema,
  anti_gaming_inputs: antiGamingInputsSchema,
});

// ─── Partial Corpus Schema (for circuit-breaker scenarios) ────────────

export const partialCorpusSchema = signalCorpusSchema.partial({
  identity: true,
  repositories: true,
  commit_signals: true,
  collaboration_signals: true,
  engineering_practice_signals: true,
  impact_signals: true,
  anti_gaming_inputs: true,
});

// ─── Type Inference ───────────────────────────────────────────────────

export type ValidatedSignalCorpus = z.infer<typeof signalCorpusSchema>;
export type ValidatedPartialCorpus = z.infer<typeof partialCorpusSchema>;