/**
 * Signal Corpus Type Definitions
 *
 * The Signal Corpus is the shared intermediate representation between
 * data collection and analysis. It is a normalized, cached snapshot of
 * all observable signals for a candidate.
 *
 * All 7 groups (A–G) are defined here matching the Analysys_specs_architecture.md.
 */

// ─── Corpus Top Level ────────────────────────────────────────────────

export type CorpusGroup = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

export type CollectionMode =
  | 'light'
  | 'deep'
  | 'light_partial'
  | 'deep_partial';

export interface SignalCorpus {
  corpus_id: string;
  github_username: string;
  collected_at: string; // ISO8601
  collection_mode: CollectionMode;
  groups_present: CorpusGroup[];
  collection_errors: string[];

  // ── Group A: Identity & Profile ──
  identity: IdentitySignals;

  // ── Group B: Repository Inventory ──
  repositories: RepositorySignal[];

  // ── Group C: Commit Intelligence ──
  commit_signals: CommitSignals;

  // ── Group D: Collaboration & Review ──
  collaboration_signals: CollaborationSignals;

  // ── Group E: Engineering Practices ──
  engineering_practice_signals: EngineeringPracticeSignals;

  // ── Group G: Anti-Gaming Raw Inputs ──
  anti_gaming_inputs: AntiGamingInputs;
}

// ─── Group A: Identity & Profile ─────────────────────────────────────

export interface IdentitySignals {
  account_age_days: number;
  bio: string | null;
  company_claim: string | null;
  linked_urls: string[];
  commit_email_domains: string[];
  github_org_memberships: string[]; // Deep Mode only
  hireable_flag: boolean | null;
}

// ─── Group B: Repository Inventory ───────────────────────────────────

export interface RepositorySignal {
  name: string;
  full_name: string;
  primary_language: string | null;
  star_count: number;
  fork_count: number;
  size_kb: number;
  is_fork: boolean;
  is_archived: boolean;
  is_private: boolean;
  is_org_repo: boolean;
  pushed_at: string;
  has_readme: boolean;
  topics: string[];
  homepage_url: string | null;
  languages: Record<string, number>; // language -> bytes
  quality_score: number; // (stars+forks+commits) × recency_weight
}

// ─── Group C: Commit Intelligence ────────────────────────────────────

export interface CommitSignals {
  total_commits_lifetime: number;
  commit_frequency_by_month: Record<string, number>; // 'YYYY-MM' -> count
  commit_size_histogram: number[]; // additions+deletions per non-merge commit
  p25_commit_size_lines: number;
  median_commit_size_lines: number;
  sub_5_line_commit_ratio: number; // 0.0–1.0, excludes merge+doc commits
  merge_commit_ratio: number;
  commit_signing_rate: number;
  work_hour_distribution: Record<string, number>; // 'HH' (UTC) -> commit count
  message_quality_raw: string[]; // raw message text, sampled for LLM batch
  message_quality_scores: number[]; // 0–100, populated after LLM Wave 3

  // Deep Mode only:
  per_repo_author_stats: Record<string, PerRepoAuthorStats>;
  complexity_trend_by_year: Record<string, number>; // from scc
  test_to_code_ratio_by_repo: Record<string, number>; // from tokei
}

export interface PerRepoAuthorStats {
  lines_added: number;
  lines_deleted: number;
  commits: number;
  active_days: number;
  authorship_pct: number;
}

// ─── Group D: Collaboration & Review ─────────────────────────────────

export interface CollaborationSignals { 
  contribution: ContributionBehaviorSignals;
  review: ReviewBehaviorSignals;
  maintenance: MaintenanceBehaviorSignals;
}

export interface ContributionBehaviorSignals {
  pr_count: number;
  merged_pr_count: number;
  unique_repo_count: number;
  external_repo_count: number;
  avg_pr_description_length_words: number;
  pr_description_raw: string[];
}

export interface ReviewBehaviorSignals {
  authored_review_count: number;
  // substantive_authored_review_ratio: number;
  authored_review_raw: string[];

  reviews_received_count: number;
  review_state_distribution: ReviewStateDistribution;
  unique_reviewers_count: number;
  avg_reviews_per_pr: number;
  received_review_raw: string[];
}

export interface MaintenanceBehaviorSignals {
  issueParticipationCount: number;
  issueParticipationRaw: string[];
}


export interface ReviewStateDistribution {
  approved: number;
  changes_requested: number;
  commented: number;
}

export interface ReviewStateDistribution {
  approved: number;
  changes_requested: number;
  commented: number;
}

export interface AuthoredReviewData {
  body: string;
  state: string;
  created_at: string;
}


export interface IssueActivityData {
  issue_url: string;
  title: string;
  body: string;
}


// ─── Group E: Engineering Practices ──────────────────────────────────

export interface EngineeringPracticeSignals {
  repos_with_test_dir: number;
  repos_with_ci_config: number;
  repos_with_docker: number;
  repos_with_iac: number;
  repos_with_linting: number;
  ci_pass_rate_trajectory: Record<string, number>; // 'YYYY-Q' -> 0.0–1.0
  semantic_versioning_discipline: boolean;
  avg_dependabot_resolution_days: number | null;
  secret_leak_detected: boolean; // from gitleaks (Deep only)
  secret_leak_details: SecretLeakDetail[];
  sast_finding_density: number | null; // critical+high per 1000 SLOC (Deep only)
  observability_markers_present: string[]; // ['logging','metrics','tracing']
  feature_flag_usage_detected: boolean;
  ai_config_files_present: string[];
  actionlint_violations: number;
}

export interface SecretLeakDetail {
  repo: string;
  file_path: string;
  secret_type: string;
  commit_sha: string;
  is_revoked: boolean;
}


// ─── Group G: Anti-Gaming Raw Inputs ─────────────────────────────────

export interface AntiGamingInputs {
  burst_dormancy_ratio: number; // last-30d weekly avg / trailing-12m weekly avg
  burst_triggered_at_evaluation: boolean;
  fork_dump_ratio: number;
  code_search_flags: CodeSearchFlag[];
  copyleaks_results: CopyleaksResult[];
  commit_inflation_ratio: number;
  ai_pattern_confidence: number; // 0–100, populated after LLM Wave 3
  style_discontinuity_events: StyleDiscontinuityEvent[];
}

export interface CodeSearchFlag {
  repo: string;
  similarity_ratio: number;
  matched_repos: string[];
}

export interface CopyleaksResult {
  repo: string;
  similarity_pct: number;
  confirmed: boolean;
}

export interface StyleDiscontinuityEvent {
  date: string;
  repo: string;
  lines_added: number;
  style_delta_score: number;
}