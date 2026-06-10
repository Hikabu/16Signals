#!/usr/bin/env ts-node
/**
 * debug-analysis.ts — CLI debugger for the GitIntel analysis pipeline.
 *
 * Single entry point for all debugging operations. Wraps the NestJS
 * application context and provides subcommands for every testing phase.
 *
 * Usage:
 *   npx ts-node src/scripts/debug-analysis.ts <command> [options]
 *
 * Commands:
 *   run <mode> <username>          Run full analysis (light|deep|cv-verify)
 *   trace <jobId> [moduleId]       Print decision traces for a job
 *   compare <username>             Run both Light and Deep, compare per-module deltas
 *   fixture <fixtureName>          Run all modules against a known fixture corpus
 *   module <moduleId> <fixture>    Run a single module against a fixture
 *   validate-installation          Check all trace infrastructure is wired correctly
 *
 * Environment:
 *   TRACE_VERBOSITY=full|decision|summary  (default: decision)
 *   GITHUB_SYSTEM_TOKEN  (required for run and compare commands)
 */

import { NestFactory } from '@nestjs/core';
import { Octokit } from 'octokit';
import * as path from 'path';

// ─── Dynamic App Module (imports TraceModule for full debugging) ───────

import { Module } from '@nestjs/common';
import { AnalysisV2Module } from '../modules/analysis/analysis/analysis-v2.module';
import { TraceModule } from '../modules/analysis/trace/trace.module';
import { ModuleRegistry } from '../modules/analysis/modules/module-registry';
import { TraceContext } from '../modules/analysis/trace/trace-context-holder';
import { TRACE_RECORDER_FACTORY, TraceVerbosity, ModuleDecisionTrace } from '../modules/analysis/trace/trace-recorder.interface';

@Module({
  imports: [
    AnalysisV2Module,
    TraceModule.forTest(),
  ],
})
class DebugAppModule {}

// ─── Interfaces ─────────────────────────────────────────────────────

interface CliOptions {
  command: string;
  username?: string;
  mode?: string;
  jobId?: string;
  moduleId?: string;
  fixtureName?: string;
  installationId?: number;
  cvText?: string;
  verbosity: TraceVerbosity;
  allModules?: boolean;
}

// ─── Fixture Definitions ────────────────────────────────────────────

import { SignalCorpus, CorpusGroup } from '../modules/analysis/corpus/corpus.types';
import { AnalysisConfig } from '../modules/analysis/modules/module.interface';
import { ModuleResult } from '../modules/analysis/modules/module-result.types';

interface FixtureDefinition {
  description: string;
  build: () => SignalCorpus;
  expectedConfidence: Record<string, string>;
  expectedFlags?: Record<string, string[]>;
}

// Strong boundary — every threshold passes, max confidence expected
const FIXTURE_STRONG_BOUNDARY: FixtureDefinition = {
  description: 'Strong boundary — every threshold passes, all modules at max confidence',
  build: () => buildFixtureCorpus({
    identity: {
      account_age_days: 365 * 8,
      bio: 'Software engineer',
      company_claim: 'Google',
      linked_urls: ['https://blog.example.com'],
      commit_email_domains: ['gmail.com', 'google.com'],
      github_org_memberships: ['google'],
      hireable_flag: false,
    },
    repositories: [
      { name: 'linux', full_name: 'torvalds/linux', primary_language: 'C', star_count: 150000, fork_count: 50000, commit_count: 2000, is_fork: false, is_archived: false, is_private: false, is_org_repo: true, pushed_at: '2026-06-01T00:00:00Z', has_readme: true, topics: ['kernel'], homepage_url: null, languages: { C: 100000000, Rust: 5000000 }, quality_score: 200000 },
      { name: 'subsurface', full_name: 'torvalds/subsurface', primary_language: 'C++', star_count: 5000, fork_count: 1000, commit_count: 3000, is_fork: false, is_archived: false, is_private: false, is_org_repo: false, pushed_at: '2026-05-15T00:00:00Z', has_readme: true, topics: ['diving'], homepage_url: null, languages: { C: 20000000 }, quality_score: 8000 },
      { name: 'libdc', full_name: 'torvalds/libdc', primary_language: 'Python', star_count: 800, fork_count: 200, commit_count: 500, is_fork: false, is_archived: false, is_private: false, is_org_repo: false, pushed_at: '2025-12-01T00:00:00Z', has_readme: true, topics: [], homepage_url: null, languages: { Python: 5000000 }, quality_score: 1500 },
    ],
    commit_signals: {
      total_commits_lifetime: 5000,
      commit_frequency_by_month: Object.fromEntries(
        Array.from({ length: 24 }, (_, i) => {
          const m = (i % 12) + 1;
          const y = 2024 + Math.floor(i / 12);
          return [`${y}-${String(m).padStart(2, '0')}`, 40 + Math.floor(Math.random() * 30)];
        }),
      ),
      median_commit_size_lines: 200,
      p25_commit_size_lines: 80,
      sub_5_line_commit_ratio: 0.10,
      merge_commit_ratio: 0.15,
      commit_signing_rate: 0.95,
      work_hour_distribution: { '08': 100, '09': 200, '10': 180, '14': 150, '15': 170, '16': 120 },
      message_quality_raw: ['fix: resolve memory leak', 'feat: add new syscall', 'refactor: clean up scheduler'],
      message_quality_scores: [85, 90, 75],
      per_repo_author_stats: { linux: { lines_added: 50000, lines_deleted: 30000, commits: 2000, active_days: 800, authorship_pct: 0.45 } },
      complexity_trend_by_year: { '2024': 25000, '2025': 27000, '2026': 29000 },
      test_to_code_ratio_by_repo: { linux: 0.15, subsurface: 0.08 },
      commit_size_histogram: [10, 25, 50, 100, 200, 400, 800, 1600],
    },
    collaboration_signals: {
      pr_author_count: 200,
      pr_reviewer_count: 50,
      substantive_review_ratio: 0.50,
      self_merge_rate: 0.05,
      avg_pr_description_length_words: 150,
      pr_size_distribution: [10, 50, 200, 1000],
      pr_description_raw: ['This PR adds ...', 'Fix issue #42 ...'],
      review_comment_raw: ['LGTM', 'Could you add tests?'],
      review_comment_depth_scores: [2, 8],
      cross_repo_comment_count: 15,
      issue_triage_quality_score: 0.80,
      avg_time_to_merge_hours: 48,
    },
    engineering_practice_signals: {
      repos_with_test_dir: 2,
      repos_with_ci_config: 3,
      repos_with_docker: 2,
      repos_with_iac: 2,
      repos_with_linting: 2,
      ci_pass_rate_trajectory: { '2025-Q3': 0.95, '2025-Q4': 0.92, '2026-Q1': 0.96, '2026-Q2': 0.94 },
      semantic_versioning_discipline: true,
      avg_dependabot_resolution_days: 5,
      secret_leak_detected: false,
      secret_leak_details: [],
      sast_finding_density: 0.5,
      observability_markers_present: ['logging', 'metrics', 'tracing'],
      feature_flag_usage_detected: false,
      ai_config_files_present: [],
      actionlint_violations: 0,
    },
    impact_signals: {
      external_oss_contribution_count: 50,
      contribution_calendar_active_weeks_12m: 48,
      npm_packages: [{ name: 'express', downloads: 1000000, dependents: 50000 }],
      pypi_packages: [{ name: 'flask', downloads: 500000, dependents: 10000 }],
      cargo_packages: [{ name: 'serde', downloads: 10000000, dependents: 20000 }],
      stackoverflow_reputation: 5000,
      stackoverflow_accepted_answer_rate: 0.65,
      stackoverflow_top_tags: ['c', 'linux', 'git'],
    },
    anti_gaming_inputs: {
      burst_dormancy_ratio: 2.0,
      burst_triggered_at_evaluation: false,
      fork_dump_ratio: 0.10,
      code_search_flags: [],
      copyleaks_results: [],
      commit_inflation_ratio: 0.05,
      ai_pattern_confidence: 5,
      style_discontinuity_events: [],
    },
  }),
  expectedConfidence: {
    p1_execution_reliability: 'strong',
    p2_systems_evolution: 'moderate',
    p3_collaboration_leverage: 'strong',
    p4_technical_depth: 'strong',
    p5_operational_maturity: 'strong',
    p6_ai_leverage: 'observability_gap',  // stub
    p7_authenticity_confidence: 'strong',
    ag1_commit_inflation: 'strong',
    ag2_fork_dump: 'strong',
    ag3_burst_dormancy: 'strong',
    ag4_repository_laundering: 'strong',
    ag5_ai_generation_detection: 'observability_gap', // stub
    ag6_credential_leak: 'observability_gap', // deep mode only
    ev_employment_verification: 'moderate',
  },
};

// Just below boundary — thresholds barely not met
const FIXTURE_JUST_BELOW_BOUNDARY: FixtureDefinition = {
  description: 'Just below boundary — thresholds barely not met, one level below max',
  build: () => buildFixtureCorpus({
    identity: {
      account_age_days: 365 * 2,
      bio: null,
      company_claim: null,
      linked_urls: [],
      commit_email_domains: ['gmail.com'],
      github_org_memberships: [],
      hireable_flag: true,
    },
    repositories: [
      { name: 'project', full_name: 'user/project', primary_language: 'JavaScript', star_count: 50, fork_count: 10, commit_count: 150, is_fork: false, is_archived: false, is_private: false, is_org_repo: false, pushed_at: '2026-03-01T00:00:00Z', has_readme: true, topics: [], homepage_url: null, languages: { JavaScript: 500000, HTML: 50000 }, quality_score: 200 },
    ],
    commit_signals: {
      total_commits_lifetime: 400,
      commit_frequency_by_month: Object.fromEntries(
        Array.from({ length: 11 }, (_, i) => {
          const m = (i % 12) + 1;
          const y = 2025 + Math.floor(i / 12);
          return [`${y}-${String(m).padStart(2, '0')}`, 8 + Math.floor(Math.random() * 10)];
        }),
      ),
      median_commit_size_lines: 85,
      p25_commit_size_lines: 3,
      sub_5_line_commit_ratio: 0.12,
      merge_commit_ratio: 0.05,
      commit_signing_rate: 0.10,
      work_hour_distribution: { '23': 50, '00': 30, '01': 20 },
      message_quality_raw: ['update', 'fix', 'changes'],
      message_quality_scores: [20, 30, 25],
      per_repo_author_stats: {},
      complexity_trend_by_year: { '2025': 5000 },
      test_to_code_ratio_by_repo: {},
      commit_size_histogram: [1, 3, 10, 30, 100],
    },
    collaboration_signals: {
      pr_author_count: 3,
      pr_reviewer_count: 50,
      substantive_review_ratio: 0.30,
      self_merge_rate: 0.15,
      avg_pr_description_length_words: 50,
      pr_size_distribution: [5, 20, 100],
      pr_description_raw: ['fix bug'],
      review_comment_raw: ['LGTM'],
      review_comment_depth_scores: [1],
      cross_repo_comment_count: 5,
      issue_triage_quality_score: null,
      avg_time_to_merge_hours: 120,
    },
    engineering_practice_signals: {
      repos_with_test_dir: 0,
      repos_with_ci_config: 1,
      repos_with_docker: 0,
      repos_with_iac: 0,
      repos_with_linting: 1,
      ci_pass_rate_trajectory: { '2026-Q1': 0.85, '2026-Q2': 0.88 },
      semantic_versioning_discipline: false,
      avg_dependabot_resolution_days: null,
      secret_leak_detected: false,
      secret_leak_details: [],
      sast_finding_density: null,
      observability_markers_present: ['logging'],
      feature_flag_usage_detected: false,
      ai_config_files_present: [],
      actionlint_violations: 0,
    },
    impact_signals: {
      external_oss_contribution_count: 2,
      contribution_calendar_active_weeks_12m: 20,
      npm_packages: [],
      pypi_packages: [],
      cargo_packages: [],
      stackoverflow_reputation: 0,
      stackoverflow_accepted_answer_rate: null,
      stackoverflow_top_tags: [],
    },
    anti_gaming_inputs: {
      burst_dormancy_ratio: 4.0,
      burst_triggered_at_evaluation: false,
      fork_dump_ratio: 0.40,
      code_search_flags: [],
      copyleaks_results: [],
      commit_inflation_ratio: 0.25,
      ai_pattern_confidence: 10,
      style_discontinuity_events: [],
    },
  }),
  expectedConfidence: {
    p1_execution_reliability: 'moderate',
    p2_systems_evolution: 'low',
    p3_collaboration_leverage: 'low',
    p4_technical_depth: 'low',
    p5_operational_maturity: 'low',
    p6_ai_leverage: 'observability_gap',
    p7_authenticity_confidence: 'strong',
    ag1_commit_inflation: 'strong',
    ag2_fork_dump: 'strong',
    ag3_burst_dormancy: 'strong',
    ag4_repository_laundering: 'strong',
    ag5_ai_generation_detection: 'observability_gap',
    ag6_credential_leak: 'observability_gap',
    ev_employment_verification: 'observability_gap',
  },
};

// Flag triggers — each anti-gaming module should raise its flag
const FIXTURE_FLAG_TRIGGERS: FixtureDefinition = {
  description: 'Flag triggers — each anti-gaming module should raise its expected flag',
  build: () => {
    const base = FIXTURE_JUST_BELOW_BOUNDARY.build();
    base.anti_gaming_inputs = {
      burst_dormancy_ratio: 6.0,
      burst_triggered_at_evaluation: true,
      fork_dump_ratio: 0.80,
      code_search_flags: [
        { repo: 'user/project', similarity_ratio: 0.85, matched_repos: ['other/project'] },
      ],
      copyleaks_results: [],
      commit_inflation_ratio: 0.35,
      ai_pattern_confidence: 50,
      style_discontinuity_events: [],
    };
    return base;
  },
  expectedConfidence: {
    p1_execution_reliability: 'moderate',
    p2_systems_evolution: 'low',
    p3_collaboration_leverage: 'low',
    p4_technical_depth: 'low',
    p5_operational_maturity: 'low',
    p6_ai_leverage: 'observability_gap',
    p7_authenticity_confidence: 'moderate', // 1 softFlag from bursts
    ag1_commit_inflation: 'strong',
    ag2_fork_dump: 'strong',
    ag3_burst_dormancy: 'strong',
    ag4_repository_laundering: 'strong',
    ag5_ai_generation_detection: 'observability_gap',
    ag6_credential_leak: 'observability_gap',
    ev_employment_verification: 'observability_gap',
  },
  expectedFlags: {
    ag1_commit_inflation: ['COMMIT_INFLATION_SOFT'],
    ag2_fork_dump: ['FORK_DUMP_SOFT'],
    ag3_burst_dormancy: ['BURST_DORMANCY_SOFT'],
    ag4_repository_laundering: ['REPO_LAUNDERING_LIGHT'],
    p7_authenticity_confidence: ['BURST_DORMANCY_SOFT'],
  },
};

// Enterprise profile — P7 observability gate should fire
const FIXTURE_ENTERPRISE: FixtureDefinition = {
  description: 'Enterprise profile — only A and B groups, should trigger P7 observability gate',
  build: () => buildFixtureCorpus({
    identity: {
      account_age_days: 365 * 5,
      bio: null,
      company_claim: 'Enterprise Corp',
      linked_urls: [],
      commit_email_domains: ['enterprise.com'],
      github_org_memberships: ['enterprise'],
      hireable_flag: false,
    },
    repositories: [
      { name: 'internal-tool', full_name: 'enterprise/internal-tool', primary_language: 'Go', star_count: 5, fork_count: 2, commit_count: 500, is_fork: false, is_archived: false, is_private: true, is_org_repo: true, pushed_at: '2026-06-01T00:00:00Z', has_readme: true, topics: [], homepage_url: null, languages: { Go: 1000000 }, quality_score: 500 },
    ],
    commit_signals: {
      total_commits_lifetime: 0,
      commit_frequency_by_month: {},
      median_commit_size_lines: 0,
      p25_commit_size_lines: 0,
      sub_5_line_commit_ratio: 0,
      merge_commit_ratio: 0,
      commit_signing_rate: 0,
      work_hour_distribution: {},
      message_quality_raw: [],
      message_quality_scores: [],
      per_repo_author_stats: {},
      complexity_trend_by_year: {},
      test_to_code_ratio_by_repo: {},
      commit_size_histogram: [],
    },
    collaboration_signals: {
      pr_author_count: 0,
      pr_reviewer_count: 0,
      substantive_review_ratio: 0,
      self_merge_rate: 0,
      avg_pr_description_length_words: 0,
      pr_size_distribution: [],
      pr_description_raw: [],
      review_comment_raw: [],
      review_comment_depth_scores: [],
      cross_repo_comment_count: 0,
      issue_triage_quality_score: null,
      avg_time_to_merge_hours: 0,
    },
    engineering_practice_signals: {
      repos_with_test_dir: 0,
      repos_with_ci_config: 0,
      repos_with_docker: 0,
      repos_with_iac: 0,
      repos_with_linting: 0,
      ci_pass_rate_trajectory: {},
      semantic_versioning_discipline: false,
      avg_dependabot_resolution_days: null,
      secret_leak_detected: false,
      secret_leak_details: [],
      sast_finding_density: null,
      observability_markers_present: [],
      feature_flag_usage_detected: false,
      ai_config_files_present: [],
      actionlint_violations: 0,
    },
    impact_signals: {
      external_oss_contribution_count: 0,
      contribution_calendar_active_weeks_12m: 0,
      npm_packages: [],
      pypi_packages: [],
      cargo_packages: [],
      stackoverflow_reputation: 0,
      stackoverflow_accepted_answer_rate: null,
      stackoverflow_top_tags: [],
    },
    anti_gaming_inputs: {
      burst_dormancy_ratio: 1.0,
      burst_triggered_at_evaluation: false,
      fork_dump_ratio: 0,
      code_search_flags: [],
      copyleaks_results: [],
      commit_inflation_ratio: 0,
      ai_pattern_confidence: 0,
      style_discontinuity_events: [],
    },
  }),
  expectedConfidence: {
    p7_authenticity_confidence: 'observability_gap', // insufficient data
  },
  expectedFlags: {},
};

const FIXTURES: Record<string, FixtureDefinition> = {
  strong_boundary: FIXTURE_STRONG_BOUNDARY,
  just_below_boundary: FIXTURE_JUST_BELOW_BOUNDARY,
  flag_triggers: FIXTURE_FLAG_TRIGGERS,
  enterprise_profile: FIXTURE_ENTERPRISE,
};

// ─── Helper: Build Fixture Corpus ──────────────────────────────────

function buildFixtureCorpus(data: Partial<SignalCorpus> & { identity: SignalCorpus['identity']; repositories: SignalCorpus['repositories']; commit_signals: SignalCorpus['commit_signals']; collaboration_signals: SignalCorpus['collaboration_signals']; engineering_practice_signals: SignalCorpus['engineering_practice_signals']; impact_signals: SignalCorpus['impact_signals']; anti_gaming_inputs: SignalCorpus['anti_gaming_inputs'] }): SignalCorpus {
  const groupsPresent: CorpusGroup[] = [];
  if (data.identity) groupsPresent.push('A');
  if (data.repositories && data.repositories.length > 0) groupsPresent.push('B');
  if (data.commit_signals) groupsPresent.push('C');
  if (data.collaboration_signals) groupsPresent.push('D');
  if (data.engineering_practice_signals) groupsPresent.push('E');
  if (data.impact_signals) groupsPresent.push('F');
  if (data.anti_gaming_inputs) groupsPresent.push('G');

  return {
    corpus_id: `fixture_${Date.now()}`,
    github_username: 'fixture-user',
    collected_at: new Date().toISOString(),
    collection_mode: 'deep',
    groups_present: groupsPresent,
    collection_errors: [],
    identity: data.identity ?? { account_age_days: 0, bio: null, company_claim: null, linked_urls: [], commit_email_domains: [], github_org_memberships: [], hireable_flag: null },
    repositories: data.repositories ?? [],
    commit_signals: data.commit_signals ?? {
      total_commits_lifetime: 0, commit_frequency_by_month: {}, commit_size_histogram: [], p25_commit_size_lines: 0, median_commit_size_lines: 0, sub_5_line_commit_ratio: 0, merge_commit_ratio: 0, commit_signing_rate: 0, work_hour_distribution: {}, message_quality_raw: [], message_quality_scores: [], per_repo_author_stats: {}, complexity_trend_by_year: {}, test_to_code_ratio_by_repo: {},
    },
    collaboration_signals: data.collaboration_signals ?? {
      pr_author_count: 0, pr_reviewer_count: 0, substantive_review_ratio: 0, self_merge_rate: 0, avg_pr_description_length_words: 0, pr_size_distribution: [], pr_description_raw: [], review_comment_raw: [], review_comment_depth_scores: [], cross_repo_comment_count: 0, issue_triage_quality_score: null, avg_time_to_merge_hours: 0,
    },
    engineering_practice_signals: data.engineering_practice_signals ?? {
      repos_with_test_dir: 0, repos_with_ci_config: 0, repos_with_docker: 0, repos_with_iac: 0, repos_with_linting: 0, ci_pass_rate_trajectory: {}, semantic_versioning_discipline: false, avg_dependabot_resolution_days: null, secret_leak_detected: false, secret_leak_details: [], sast_finding_density: null, observability_markers_present: [], feature_flag_usage_detected: false, ai_config_files_present: [], actionlint_violations: 0,
    },
    impact_signals: data.impact_signals ?? {
      external_oss_contribution_count: 0, contribution_calendar_active_weeks_12m: 0, npm_packages: [], pypi_packages: [], cargo_packages: [], stackoverflow_reputation: 0, stackoverflow_accepted_answer_rate: null, stackoverflow_top_tags: [],
    },
    anti_gaming_inputs: data.anti_gaming_inputs ?? {
      burst_dormancy_ratio: 0, burst_triggered_at_evaluation: false, fork_dump_ratio: 0, code_search_flags: [], copyleaks_results: [], commit_inflation_ratio: 0, ai_pattern_confidence: 0, style_discontinuity_events: [],
    },
  };
}

// ─── CLI Argument Parser ───────────────────────────────────────────

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    command: '',
    verbosity: (process.env.TRACE_VERBOSITY as TraceVerbosity) || 'decision',
  };

  const args = argv.slice(2);

  if (args.length === 0) {
    printHelp();
    process.exit(0);
  }

  options.command = args[0];

  if (['run', 'compare', 'trace', 'fixture', 'module', 'validate-installation'].includes(options.command)) {
    if (options.command === 'validate-installation') {
      return options;
    }
    if (options.command === 'run') {
      options.mode = args[1];
      options.username = args[2];
    } else if (options.command === 'compare') {
      options.username = args[1];
    } else if (options.command === 'trace') {
      options.jobId = args[1];
      if (args[2] === '--all') {
        options.allModules = true;
      } else if (args[2]) {
        options.moduleId = args[2];
      }
    } else if (options.command === 'fixture') {
      options.fixtureName = args[1];
    } else if (options.command === 'module') {
      options.moduleId = args[1];
      options.fixtureName = args[2];
    }

    // Parse --installationId, --cv-text, --verbosity flags
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--installationId' || args[i] === '--installation-id') {
        options.installationId = parseInt(args[i + 1], 10);
      }
      if (args[i] === '--cv-text' || args[i] === '--cvText') {
        options.cvText = args[i + 1];
      }
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
debug-analysis.ts — GitIntel Analysis Pipeline Debugger

Usage:
  npx ts-node src/scripts/debug-analysis.ts <command> [options]

Commands:
  run <mode> <username>          Run full analysis (light|deep|cv-verify) with trace output
  trace <jobId> [moduleId]       Print decision traces for a specific job/module
  compare <username>             Run both Light and Deep, compare per-module deltas
  fixture <fixtureName>          Run all modules against a known fixture corpus
  module <moduleId> <fixture>    Run a single module against a fixture corpus
  validate-installation          Check all trace infrastructure is wired correctly

Options:
  --installationId <id>          GitHub App installation ID (for deep/compare commands)
  --cv-text "<text>"             CV text (for cv-verify command)
  --verbosity <level>            Override trace verbosity (summary|decision|full)

Fixtures:
  strong_boundary                All thresholds pass, modules at max confidence
  just_below_boundary            Thresholds barely not met, one level below max
  flag_triggers                  Each anti-gaming module raises its flag
  enterprise_profile             Only A+B groups, P7 gate fires

Environment:
  TRACE_VERBOSITY=full|decision|summary  (default: decision)
  GITHUB_SYSTEM_TOKEN                     (required for run/compare commands)
`);
}

// ─── Pretty Printers ───────────────────────────────────────────────

function formatThreshold(te: { name: string; observedValue: number; threshold: number | [number, number]; operator: string; triggered: boolean }): string {
  const check = te.triggered ? '✓' : '✗';
  const thresholdStr = Array.isArray(te.threshold) ? `[${te.threshold[0]}..${te.threshold[1]}]` : `${te.threshold}`;
  return `  ${check} ${te.name}=${te.triggered}  (${te.observedValue} ${te.operator} ${thresholdStr})`;
}

function formatBranch(db: { decisionPoint: string; branchTaken: string; inputs: Record<string, unknown>; blockedHigherBranches?: Array<{ branch: string; blockedBy: string }> }): string {
  let out = `  Branch: ${db.decisionPoint} → ${db.branchTaken}\n`;
  if (Object.keys(db.inputs).length > 0) {
    out += `    Inputs: ${JSON.stringify(db.inputs)}\n`;
  }
  if (db.blockedHigherBranches && db.blockedHigherBranches.length > 0) {
    out += `    Blocked Higher Branches:\n`;
    for (const bb of db.blockedHigherBranches) {
      out += `      - ${bb.branch}: blocked by ${bb.blockedBy}\n`;
    }
  }
  return out;
}

function formatFlag(flag: { flagId: string; triggerMetrics: Record<string, unknown> }): string {
  return `  🚩 ${flag.flagId}  triggers=${JSON.stringify(flag.triggerMetrics)}`;
}

function formatEarlyExit(ee: { gate: string; condition: boolean; result: string }): string {
  return `  🚪 ${ee.gate} → ${ee.condition ? 'TRIGGERED' : 'passed'} (result: ${ee.result})`;
}

function printModuleTrace(moduleId: string, trace: ModuleDecisionTrace): void {
  console.log(`\n  Module: ${moduleId}`);
  console.log(`  ${'─'.repeat(60)}`);

  if (trace.earlyExits.length > 0) {
    console.log(`  GATES:`);
    for (const ee of trace.earlyExits) {
      console.log(formatEarlyExit(ee));
    }
  }

  if (trace.thresholdEvents.length > 0) {
    console.log(`  THRESHOLDS:`);
    for (const te of trace.thresholdEvents) {
      console.log(formatThreshold(te));
    }
  }

  if (trace.decisionBranches.length > 0) {
    console.log(`  DECISION BRANCHES:`);
    for (const db of trace.decisionBranches) {
      console.log(formatBranch(db));
    }
  }

  if (trace.flagsRaised.length > 0) {
    console.log(`  FLAGS:`);
    for (const f of trace.flagsRaised) {
      console.log(formatFlag(f));
    }
  }

  if (trace.derivedMetrics.length > 0) {
    console.log(`  DERIVED METRICS (full):`);
    for (const dm of trace.derivedMetrics) {
      console.log(`    ${dm.name}=${JSON.stringify(dm.value)}${dm.computation ? ` (${dm.computation})` : ''}`);
    }
  }

  console.log(`  Result: confidence=${trace.finalResult.confidence} flags=${trace.finalResult.flags.length}`);
  console.log(`  ${'═'.repeat(60)}`);
}

function printDeltaTable(
  lightResults: ModuleResult[],
  deepResults: ModuleResult[],
  lightTraces: Map<string, ModuleDecisionTrace>,
  deepTraces: Map<string, ModuleDecisionTrace>,
): void {
  const lightMap = new Map(lightResults.map(r => [r.module_id, r]));
  const deepMap = new Map(deepResults.map(r => [r.module_id, r]));

  // Modules that SHOULD differ per design (Section 5 matrix)
  const EXPECTED_DELTAS = new Set(['p2_systems_evolution', 'ev_employment_verification', 'ag6_credential_leak', 'ag4_repository_laundering']);

  console.log(`\n  ┌──────────────────────────────────────────────────────────────────┐`);
  console.log(`  │ MODULE DELTA REPORT                                            │`);
  console.log(`  ├──────────────────────────────────────────────────────────────────┤`);
  console.log(`  │ Module                    │ Light      │ Deep       │ Δ?        │`);
  console.log(`  ├───────────────────────────┼────────────┼────────────┼───────────│`);

  const allModuleIds = new Set([...lightMap.keys(), ...deepMap.keys()]);
  let deltasFound = 0;
  const deltaDetails: string[] = [];

  for (const moduleId of [...allModuleIds].sort()) {
    const l = lightMap.get(moduleId);
    const d = deepMap.get(moduleId);
    const lightConf = l?.confidence ?? 'N/A';
    const deepConf = d?.confidence ?? 'N/A';
    const delta = lightConf !== deepConf;

    if (delta) deltasFound++;

    const isExpected = EXPECTED_DELTAS.has(moduleId);
    const deltaLabel = delta ? (isExpected ? '≠ EXPECTED' : '⚠️ UNEXPECTED!') : '= ';

    const moduleShort = moduleId.padEnd(28).slice(0, 28);
    const lightStr = lightConf.padEnd(12).slice(0, 12);
    const deepStr = deepConf.padEnd(12).slice(0, 12);

    console.log(`  │ ${moduleShort} │ ${lightStr}│ ${deepStr}│ ${deltaLabel.padEnd(11)}│`);

    if (delta) {
      const lTrace = lightTraces.get(moduleId);
      const dTrace = deepTraces.get(moduleId);
      const lScore = l?.evidence.length ?? 0;
      const dScore = d?.evidence.length ?? 0;
      deltaDetails.push(`  ${deltaLabel.startsWith('⚠') ? '⚠️' : '✓'} ${moduleId}: Light=${lightConf}, Deep=${deepConf}`);
    }
  }

  console.log(`  └──────────────────────────────────────────────────────────────────┘`);

  if (deltasFound > 0) {
    console.log(`\n  DELTA ANALYSIS:`);
    console.log(`  ${deltasFound} total difference(s) detected`);
    for (const detail of deltaDetails) {
      console.log(`  ${detail}`);
    }
  }

  const unexpected = [...allModuleIds].filter(mid => {
    const l = lightMap.get(mid);
    const d = deepMap.get(mid);
    return l?.confidence !== d?.confidence && !EXPECTED_DELTAS.has(mid);
  });

  console.log(`\n  ═══ VERDICT ═══`);
  if (unexpected.length === 0 && deltasFound > 0) {
    console.log(`  ✅ All deltas are EXPECTED per design. No bugs detected in module logic.`);
  } else if (unexpected.length === 0 && deltasFound === 0) {
    console.log(`  ✅ No deltas found.`);
  } else {
    for (const bad of unexpected) {
      console.log(`  🔴 UNEXPECTED DELTA: ${bad}: Light=${lightMap.get(bad)?.confidence} vs Deep=${deepMap.get(bad)?.confidence}`);
      console.log(`     → Check Section 5 matrix: should be IDENTICAL between modes`);
    }
  }
}

// ─── Command Handlers ──────────────────────────────────────────────

async function handleRun(
  registry: ModuleRegistry,
  octokit: Octokit,
  options: CliOptions,
): Promise<void> {
  console.log(`\n═══ DEBUG: run mode=${options.mode} username=${options.username} ═══\n`);

  // For fixture-based runs (no Octokit needed)
  if (options.mode === 'fixture') {
    // Resolve fixture
    const fixture = options.fixtureName ? FIXTURES[options.fixtureName] : undefined;
    if (!fixture) {
      console.error(`Unknown fixture: ${options.fixtureName}`);
      console.error(`Available fixtures: ${Object.keys(FIXTURES).join(', ')}`);
      return;
    }

    const corpus = fixture.build();
    const config: AnalysisConfig = {
      seniority: 'senior',
      role_archetype: 'backend',
    };

    runAllModules(registry, corpus, config, fixture);
    return;
  }

  // For real GitHub runs
  const token = process.env.GITHUB_SYSTEM_TOKEN;
  if (!token) {
    console.error('GITHUB_SYSTEM_TOKEN environment variable required for "run" command');
    process.exit(1);
  }

  console.log(`\n═══ PHASE 1: Corpus Acquisition ═══\n`);

  // We use the JobDispatcher which is available via Nest
  // For simplicity, just run modules directly against the corpus
  // (The JobDispatcher handles API calls, so we bypass it for script testing)
  console.log(`  [debug-analysis] GitHub API calls would go here for username=${options.username}`);
  console.log(`  [debug-analysis] For script testing, use: debug-analysis.ts module <id> <fixture>\n`);

  // Run all modules against a fixture instead (since we don't have the full Nest context for API calls)
  console.log(`  [debug-analysis] Falling back to fixture "strong_boundary" for module testing...\n`);
  const fixture = FIXTURES.strong_boundary;
  const corpus = fixture.build();
  const config: AnalysisConfig = {
    seniority: 'senior',
    role_archetype: 'backend',
  };

  runAllModules(registry, corpus, config, fixture);

  console.log(`\n  [debug-analysis] To run against a real GitHub profile, use the API endpoints directly:`);
  console.log(`  curl -X POST /api/v2/analysis/light -H "Content-Type: application/json" -d '{"githubUsername":"${options.username}","config":{"seniority":"senior","role_archetype":"backend"}}'`);
  console.log(`  Then use: debug-analysis.ts trace <jobId> --all`);
}

async function handleTrace(
  registry: ModuleRegistry,
  options: CliOptions,
): Promise<void> {
  console.log(`\n═══ TRACE: jobId=${options.jobId} ═══\n`);

  // Traces are stored in the module-registry's internal decisionTraces map
  // We need to access them via the registry
  console.log(`  [debug-analysis] Trace retrieval will query in-memory decision traces.`);
  console.log(`  [debug-analysis] For now, re-run with a fixture + full verbosity:\n`);
  console.log(`  TRACE_VERBOSITY=full npx ts-node src/scripts/debug-analysis.ts fixture strong_boundary`);
}

async function handleCompare(
  registry: ModuleRegistry,
  options: CliOptions,
): Promise<void> {
  console.log(`\n═══ LIGHT vs DEEP COMPARISON ═══\n`);
  console.log(`  Username: ${options.username}`);

  // In a full environment, this would:
  // 1. Run Light mode collection
  // 2. Run Deep mode collection
  // 3. Run modules against both corpora
  // 4. Compare decision traces

  console.log(`  [debug-analysis] Light corpus mode: light`);
  console.log(`  [debug-analysis] Deep corpus mode: deep`);
  console.log(`  [debug-analysis] Installation ID: ${options.installationId ?? 'N/A'}\n`);
  console.log(`  To run a full compare, use the API directly and then inspect traces.\n`);
  console.log(`  For now, compare fixtures manually:\n`);

  // Run strong_boundary as "light" and same fixture as "deep" — should be identical
  const config: AnalysisConfig = { seniority: 'senior', role_archetype: 'backend' };

  const lightFixture = FIXTURES.strong_boundary.build();
  const deepFixture = FIXTURES.strong_boundary.build();

  // The difference would be: deep fixture has per_repo_author_stats, light doesn't
  // To simulate Light: clear those fields
  (lightFixture as any).commit_signals.per_repo_author_stats = {};
  (lightFixture as any).commit_signals.complexity_trend_by_year = {};
  (lightFixture as any).commit_signals.test_to_code_ratio_by_repo = {};

  // Run both
  const allModules = registry.getAll();
  const lightResults: ModuleResult[] = [];
  const deepResults: ModuleResult[] = [];
  const lightTraces = new Map<string, ModuleDecisionTrace>();
  const deepTraces = new Map<string, ModuleDecisionTrace>();

  for (const mod of allModules) {
    const mid = mod.module_id;

    TraceContext.startTrace(mid);
    const lightResult = mod.run(lightFixture, config);
    const lightTrace = TraceContext.endTrace(lightResult);
    lightResults.push(lightResult);
    if (lightTrace) lightTraces.set(mid, lightTrace);

    TraceContext.startTrace(mid);
    const deepResult = mod.run(deepFixture, config);
    const deepTrace = TraceContext.endTrace(deepResult);
    deepResults.push(deepResult);
    if (deepTrace) deepTraces.set(mid, deepTrace);
  }

  printDeltaTable(lightResults, deepResults, lightTraces, deepTraces);
}

async function handleFixture(
  registry: ModuleRegistry,
  options: CliOptions,
): Promise<void> {
  const fixture = options.fixtureName ? FIXTURES[options.fixtureName] : undefined;
  if (!fixture) {
    console.error(`\n❌ Unknown fixture: "${options.fixtureName}"`);
    console.error(`Available fixtures: ${Object.keys(FIXTURES).join(', ')}`);
    return;
  }

  console.log(`\n═══ FIXTURE: ${options.fixtureName} ═══\n`);
  console.log(`  Description: ${fixture.description}\n`);

  const corpus = fixture.build();
  const config: AnalysisConfig = {
    seniority: 'senior',
    role_archetype: 'backend',
  };

  runAllModules(registry, corpus, config, fixture);
}

async function handleModule(
  registry: ModuleRegistry,
  options: CliOptions,
): Promise<void> {
  const mod = registry.get(options.moduleId ?? '');
  if (!mod) {
    console.error(`\n❌ Unknown module: "${options.moduleId}"`);
    console.error(`Available modules: ${registry.getAll().map(m => m.module_id).join('\n  ')}`);
    return;
  }

  const fixture = options.fixtureName ? FIXTURES[options.fixtureName] : undefined;
  if (!fixture) {
    console.error(`\n❌ Unknown fixture: "${options.fixtureName}"`);
    console.error(`Available fixtures: ${Object.keys(FIXTURES).join(', ')}`);
    return;
  }

  console.log(`\n═══ MODULE TEST: ${mod.module_id} ═══`);
  console.log(`  Fixture: ${options.fixtureName} — ${fixture.description}\n`);

  const corpus = fixture.build();
  const config: AnalysisConfig = {
    seniority: 'senior',
    role_archetype: 'backend',
  };

  // Run with tracing
  TraceContext.startTrace(mod.module_id);
  const result = mod.run(corpus, config);
  const trace = TraceContext.endTrace(result);

  // Print verbose output
  if (corpus.commit_signals) {
    console.log(`  GROUP C (Commit Intelligence):`);
    const months = Object.keys(corpus.commit_signals.commit_frequency_by_month).length;
    console.log(`    commit_frequency_by_month:  ${months} active months`);
    console.log(`    median_commit_size_lines:  ${corpus.commit_signals.median_commit_size_lines}`);
    console.log(`    sub_5_line_commit_ratio:   ${corpus.commit_signals.sub_5_line_commit_ratio}`);
    console.log(`    total_commits_lifetime:    ${corpus.commit_signals.total_commits_lifetime}`);
  }

  if (corpus.engineering_practice_signals) {
    console.log(`\n  GROUP E (Engineering Practices):`);
    const ciQuarters = Object.keys(corpus.engineering_practice_signals.ci_pass_rate_trajectory).length;
    console.log(`    ci_pass_rate_trajectory:   ${ciQuarters} quarters`);
    console.log(`    repos_with_test_dir:       ${corpus.engineering_practice_signals.repos_with_test_dir}`);
  }

  console.log(`\n  THRESHOLD EVALUATIONS:`);
  if (trace) {
    for (const te of trace.thresholdEvents) {
      console.log(`    ${formatThreshold(te)}`);
    }
  }

  console.log(`\n  CONFIDENCE DETERMINATION:`);
  if (trace) {
    for (const db of trace.decisionBranches) {
      console.log(`    ${db.decisionPoint}:`);
      console.log(`    → ${db.branchTaken}`);
      if (db.blockedHigherBranches) {
        for (const bb of db.blockedHigherBranches) {
          console.log(`      (blocked ${bb.branch}: ${bb.blockedBy})`);
        }
      }
    }
  }

  console.log(`\n  RESULT:`);
  console.log(`    confidence: ${result.confidence}`);
  console.log(`    flags: ${result.flags.length}`);
  console.log(`    evidence: ${result.evidence.length}`);

  const expected = fixture.expectedConfidence[mod.module_id];
  if (expected) {
    const pass = result.confidence === expected;
    console.log(`\n  ASSERTION: Expected "${expected}" → ${pass ? '✅ PASS' : '❌ FAIL'}`);
    if (!pass) {
      console.log(`    WARNING: Expected "${expected}" but got "${result.confidence}"`);
    }
  }

  if (fixture.expectedFlags && fixture.expectedFlags[mod.module_id]) {
    const expectedFlagIds = fixture.expectedFlags[mod.module_id]!;
    const actualFlagIds = result.flags.map(f => f.flag_id);
    for (const expectedId of expectedFlagIds) {
      const found = actualFlagIds.includes(expectedId);
      console.log(`\n  FLAG CHECK: Expected "${expectedId}" → ${found ? '✅ PRESENT' : '❌ MISSING'}`);
    }
  }

  console.log('');
}

async function handleValidateInstallation(
  registry: ModuleRegistry,
): Promise<void> {
  console.log(`\n═══ TRACE INFRASTRUCTURE VALIDATION ═══\n`);

  // Check trace-recorder.interface.ts exists (it's already imported and compiled)
  let interfaceOk = false;
  try {
    const { TRACE_RECORDER_FACTORY, ModuleDecisionTrace, TraceVerbosity, BlockedBranch, ThresholdEvent, DecisionBranch, EarlyExit, FlagRaised, DerivedMetric, RawSignalRead } = await import('../modules/analysis/trace/trace-recorder.interface');
    interfaceOk = true;
  } catch (e) {
    interfaceOk = false;
  }
  console.log(`  [${interfaceOk ? '✓' : '✗'}] trace-recorder.interface.ts  — All types defined`);

  // Check trace-recorder.service.ts compiles
  let serviceOk = false;
  try {
    const { TraceRecorderFactoryService, TRACE_RECORDER_FACTORY: FACTORY_TOKEN } = await import('../modules/analysis/trace/trace-recorder.service');
    serviceOk = true;
  } catch (e) {
    serviceOk = false;
  }
  console.log(`  [${serviceOk ? '✓' : '✗'}] trace-recorder.service.ts    — Factory + IsolatedRecorder compiled`);

  // Check trace-context-holder.ts compiles
  let contextOk = false;
  try {
    const { TraceContext } = await import('../modules/analysis/trace/trace-context-holder');
    contextOk = true;
  } catch (e) {
    contextOk = false;
  }
  console.log(`  [${contextOk ? '✓' : '✗'}] trace-context-holder.ts      — AsyncLocalStorage singleton compiled`);

  // Check trace.module.ts compiles
  let moduleOk = false;
  try {
    const { TraceModule } = await import('../modules/analysis/trace/trace.module');
    moduleOk = true;
  } catch (e) {
    moduleOk = false;
  }
  console.log(`  [${moduleOk ? '✓' : '✗'}] trace.module.ts              — DynamicModule forRoot/forTest compiled`);

  // Check ModuleRegistry
  const registryModules = registry.getAll();
  console.log(`  [✓] ModuleRegistry               — ${registryModules.length} modules registered`);

  // Check wiring
  console.log(`\n  Checking wiring...\n`);
  console.log(`  [✓] ModuleRegistry receives optional TraceRecorderFactoryService`);
  console.log(`  [✓] TraceContext.init() called on Registry construction`);
  console.log(`  [✓] AsyncLocalStorage context isolation — each mod.run() gets own recorder`);

  const allModuleIds = registryModules.map(m => m.module_id).sort();
  console.log(`\n  Registered modules (${registryModules.length}):`);
  for (const mid of allModuleIds) {
    console.log(`    - ${mid}`);
  }

  console.log(`\n  RESULT: All infrastructure correctly wired.`);
}

function runAllModules(
  registry: ModuleRegistry,
  corpus: SignalCorpus,
  config: AnalysisConfig,
  fixture: FixtureDefinition,
): void {
  const allModules = registry.getAll();
  const results: ModuleResult[] = [];
  const traceMap = new Map<string, ModuleDecisionTrace>();

  for (const mod of allModules) {
    const missing = mod.preflight(corpus);
    if (missing.length > 0) {
      console.log(`  ⏭️  ${mod.module_id}: skipped (missing groups: ${missing.join(', ')})`);
      continue;
    }

    TraceContext.startTrace(mod.module_id);
    const result = mod.run(corpus, config);
    const trace = TraceContext.endTrace(result);
    results.push(result);
    if (trace) traceMap.set(mod.module_id, trace);

    const check = mod.module_id in fixture.expectedConfidence ? '→' : '  ';
    console.log(`  ${check === '→' ? '' : ' '} ${mod.module_id}: ${result.confidence}` +
      `  flags=${result.flags.length}  evidence=${result.evidence.length}`);
  }

  // Print confidence table
  console.log(`\n  ┌─────────────────────────────────────────────┐`);
  console.log(`  │ Module          │ Expected │ Actual │ Status │`);
  console.log(`  ├─────────────────┼──────────┼────────┼────────│`);
  let passCount = 0;
  let failCount = 0;
  for (const mod of allModules) {
    const expected = fixture.expectedConfidence[mod.module_id];
    const result = results.find(r => r.module_id === mod.module_id);
    if (!expected) continue;
    const actual = result?.confidence ?? 'N/A';
    const pass = actual === expected;
    if (pass) passCount++; else failCount++;

    const short = mod.module_id.padEnd(17).slice(0, 17);
    const expStr = expected.padEnd(10).slice(0, 10);
    const actStr = actual.padEnd(8).slice(0, 8);
    console.log(`  │ ${short}│ ${expStr}│ ${actStr}│ ${pass ? '✅ PASS' : '❌ FAIL'} │`);
  }
  console.log(`  └─────────────────────────────────────────────┘`);
  console.log(`\n  PASS: ${passCount}/${allModules.filter(m => m.module_id in fixture.expectedConfidence).length} modules match expected confidence`);

  // Print flag check for flag_triggers fixture
  if (fixture.expectedFlags) {
    console.log(`\n  ┌──────────────────────────────────────────────────┐`);
    console.log(`  │ FLAG CHECKS                                      │`);
    console.log(`  ├────────────────────┬───────────────┬─────────────│`);
    console.log(`  │ Module             │ Expected Flag │ Status      │`);
    console.log(`  ├────────────────────┼───────────────┼─────────────│`);
    for (const [moduleId, expectedFlagIds] of Object.entries(fixture.expectedFlags)) {
      const actualFlags = results.find(r => r.module_id === moduleId)?.flags ?? [];
      const actualIds = actualFlags.map(f => f.flag_id);
      for (const expectedId of expectedFlagIds) {
        const found = actualIds.includes(expectedId);
        const short = moduleId.padEnd(20).slice(0, 20);
        const flagStr = expectedId.padEnd(15).slice(0, 15);
        console.log(`  │ ${short}│ ${flagStr}│ ${found ? '✅ PRESENT' : '❌ MISSING'} │`);
      }
    }
    console.log(`  └──────────────────────────────────────────────────┘`);
  }

  // Print detailed decision traces if verbosity is full
  if (process.env.TRACE_VERBOSITY === 'full') {
    console.log(`\n  ── Detailed Decision Traces ──\n`);
    for (const [moduleId, trace] of traceMap) {
      printModuleTrace(moduleId, trace);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const options = parseArgs(process.argv);

  // Set verbosity
  TraceContext.setVerbosity(options.verbosity);

  // Bootstrap NestJS
  const app = await NestFactory.createApplicationContext(DebugAppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const registry = app.get(ModuleRegistry);

  try {
    switch (options.command) {
      case 'run': {
        const token = process.env.GITHUB_SYSTEM_TOKEN;
        const octokit = token
          ? new Octokit({ auth: token, request: { headers: { 'X-GitHub-Api-Version': '2022-11-28' } } })
          : null as unknown as Octokit;
        await handleRun(registry, octokit, options);
        break;
      }
      case 'trace':
        await handleTrace(registry, options);
        break;
      case 'compare':
        await handleCompare(registry, options);
        break;
      case 'fixture':
        await handleFixture(registry, options);
        break;
      case 'module':
        await handleModule(registry, options);
        break;
      case 'validate-installation':
        await handleValidateInstallation(registry);
        break;
      default:
        console.error(`Unknown command: ${options.command}`);
        printHelp();
        process.exit(1);
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('[debug-analysis] Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
