#!/usr/bin/env ts-node
/**
 * debug-analysis.ts — CLI debugger for the GitIntel analysis pipeline.
 *
 * Single entry point for debugging operations.
 *
 * Usage:
 *   npx ts-node src/scripts/debug-analysis.ts <command> [options]
 *
 * Commands:
 *   trace <jobId> [moduleId]       Print decision traces for a job (reads Redis)
 *   compare <username>             Run both Light and Deep, compare per-module deltas
 *   module <moduleId> <fixture>    Run a single module against a fixture
 *
 * Environment:
 *   REDIS_URL                       (required for trace command)
 *   TRACE_VERBOSITY=full|decision   (default: decision, for module/compare)
 */

import Redis from 'ioredis';
import * as path from 'path';

// ─── CLI Argument Parser ───────────────────────────────────────────

interface CliOptions {
  command: string;
  jobId?: string;
  username?: string;
  moduleId?: string;
  fixtureName?: string;
  allModules?: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { command: '' };
  const args = argv.slice(2);

  if (args.length === 0) {
    printHelp();
    process.exit(0);
  }

  options.command = args[0];

  if (['trace', 'compare', 'module'].includes(options.command)) {
    if (options.command === 'trace') {
      options.jobId = args[1];
      if (args[2] === '--all') {
        options.allModules = true;
      } else if (args[2]) {
        options.moduleId = args[2];
      }
    } else if (options.command === 'compare') {
      options.username = args[1];
    } else if (options.command === 'module') {
      options.moduleId = args[1];
      options.fixtureName = args[2];
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
  trace <jobId> [moduleId]       Print decision traces for a specific job/module
  compare <username>             Run both Light and Deep, compare per-module deltas
  module <moduleId> <fixture>    Run a single module against a fixture corpus

Options:
  --all                           Show traces for all modules (trace command)

Fixtures:
  strong_boundary                All thresholds pass, modules at max confidence
  just_below_boundary            Thresholds barely not met, one level below max
  flag_triggers                  Each anti-gaming module raises its flag
  enterprise_profile             Only A+B groups, P7 gate fires

Environment:
  REDIS_URL                       (required for trace command)
  TRACE_VERBOSITY=full|decision   (default: decision)
`);
}

// ─── Pretty Printers ───────────────────────────────────────────────

function formatThreshold(te: { name: string; observedValue: number | boolean; threshold: number | [number, number] | boolean; operator: string; triggered: boolean }): string {
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

function printModuleTrace(moduleId: string, trace: any): void {
  console.log(`\n  Module: ${moduleId}`);
  console.log(`  ${'─'.repeat(60)}`);

  if (trace.earlyExits?.length > 0) {
    console.log(`  GATES:`);
    for (const ee of trace.earlyExits) {
      console.log(formatEarlyExit(ee));
    }
  }

  if (trace.thresholdEvents?.length > 0) {
    console.log(`  THRESHOLDS:`);
    for (const te of trace.thresholdEvents) {
      console.log(formatThreshold(te));
    }
  }

  if (trace.decisionBranches?.length > 0) {
    console.log(`  DECISION BRANCHES:`);
    for (const db of trace.decisionBranches) {
      console.log(formatBranch(db));
    }
  }

  if (trace.flagsRaised?.length > 0) {
    console.log(`  FLAGS:`);
    for (const f of trace.flagsRaised) {
      console.log(formatFlag(f));
    }
  }

  if (trace.derivedMetrics?.length > 0) {
    console.log(`  DERIVED METRICS (full):`);
    for (const dm of trace.derivedMetrics) {
      console.log(`    ${dm.name}=${JSON.stringify(dm.value)}${dm.computation ? ` (${dm.computation})` : ''}`);
    }
  }

  if (trace.finalResult) {
    console.log(`  Result: confidence=${trace.finalResult.confidence} flags=${trace.finalResult.flags?.length ?? 0}`);
  }
  console.log(`  ${'═'.repeat(60)}`);
}

function printTraceSummary(allTraces: Record<string, any>): void {
  console.log(`\n  ┌──────────────────────────────────────┐`);
  console.log(`  │ TRACE SUMMARY                        │`);
  console.log(`  ├──────────────────┬───────┬───────────│`);
  console.log(`  │ Module           │ Conf  │ Flags     │`);
  console.log(`  ├──────────────────┼───────┼───────────│`);
  for (const [moduleId, trace] of Object.entries(allTraces).sort()) {
    const tr = trace as any;
    const short = moduleId.padEnd(18).slice(0, 18);
    const conf = (tr.finalResult?.confidence ?? 'N/A').padEnd(7).slice(0, 7);
    const flags = String(tr.flagsRaised?.length ?? 0).padEnd(11).slice(0, 11);
    console.log(`  │ ${short}│ ${conf}│ ${flags}│`);
  }
  console.log(`  └──────────────────────────────────────┘`);
}

// ─── Fixture Definitions ────────────────────────────────────────────

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigModule } from '../shared/config/config.module';
import { RedisModule } from '../redis/redis.module';
import { ModulesModule } from '../modules/analysis/modules/module.module';
import { TraceModule } from '../modules/analysis/trace/trace.module';
import { ModuleRegistry } from '../modules/analysis/modules/module-registry';
import { TraceContext } from '../modules/analysis/trace/trace-context-holder';
import { SignalCorpus, CorpusGroup } from '../modules/analysis/corpus/corpus.types';
import { AnalysisConfig } from '../modules/analysis/modules/module.interface';
import { ModuleResult } from '../modules/analysis/modules/module-result.types';

@Module({
  imports: [ConfigModule, RedisModule, ModulesModule, TraceModule.forRoot({ verbosity: (process.env.TRACE_VERBOSITY as any) ?? 'full', isGlobal: true })],
})
class DebugAppModule {}

interface FixtureDefinition {
  description: string;
  build: () => SignalCorpus;
  expectedConfidence: Record<string, string>;
  expectedFlags?: Record<string, string[]>;
}

const FIXTURE_STRONG_BOUNDARY: FixtureDefinition = {
  description: 'Strong boundary — every threshold passes, all modules at max confidence',
  build: () => buildFixtureCorpus({
    identity: { account_age_days: 365 * 8, bio: 'Software engineer', company_claim: 'Google', linked_urls: ['https://blog.example.com'], commit_email_domains: ['gmail.com', 'google.com'], github_org_memberships: ['google'], hireable_flag: false },
    repositories: [
      { name: 'linux', full_name: 'torvalds/linux', primary_language: 'C', star_count: 150000, fork_count: 50000, commit_count: 2000, is_fork: false, is_archived: false, is_private: false, is_org_repo: true, pushed_at: '2026-06-01T00:00:00Z', has_readme: true, topics: ['kernel'], homepage_url: null, languages: { C: 100000000, Rust: 5000000 }, quality_score: 200000 },
      { name: 'subsurface', full_name: 'torvalds/subsurface', primary_language: 'C++', star_count: 5000, fork_count: 1000, commit_count: 3000, is_fork: false, is_archived: false, is_private: false, is_org_repo: false, pushed_at: '2026-05-15T00:00:00Z', has_readme: true, topics: ['diving'], homepage_url: null, languages: { C: 20000000 }, quality_score: 8000 },
      { name: 'libdc', full_name: 'torvalds/libdc', primary_language: 'Python', star_count: 800, fork_count: 200, commit_count: 500, is_fork: false, is_archived: false, is_private: false, is_org_repo: false, pushed_at: '2025-12-01T00:00:00Z', has_readme: true, topics: [], homepage_url: null, languages: { Python: 5000000 }, quality_score: 1500 },
    ],
    commit_signals: {
      total_commits_lifetime: 5000,
      commit_frequency_by_month: Object.fromEntries(Array.from({ length: 24 }, (_, i) => { const m = (i % 12) + 1; const y = 2024 + Math.floor(i / 12); return [`${y}-${String(m).padStart(2, '0')}`, 40 + Math.floor(Math.random() * 30)]; })),
      median_commit_size_lines: 200, p25_commit_size_lines: 80, sub_5_line_commit_ratio: 0.10, merge_commit_ratio: 0.15, commit_signing_rate: 0.95,
      work_hour_distribution: { '08': 100, '09': 200, '10': 180, '14': 150, '15': 170, '16': 120 },
      message_quality_raw: ['fix: resolve memory leak', 'feat: add new syscall', 'refactor: clean up scheduler'], message_quality_scores: [85, 90, 75],
      per_repo_author_stats: { linux: { lines_added: 50000, lines_deleted: 30000, commits: 2000, active_days: 800, authorship_pct: 0.45 } },
      complexity_trend_by_year: { '2024': 25000, '2025': 27000, '2026': 29000 }, test_to_code_ratio_by_repo: { linux: 0.15, subsurface: 0.08 },
      commit_size_histogram: [10, 25, 50, 100, 200, 400, 800, 1600],
    },
    collaboration_signals: {
      pr_author_count: 200, pr_reviewer_count: 50, substantive_review_ratio: 0.50, self_merge_rate: 0.05, avg_pr_description_length_words: 150,
      pr_size_distribution: [10, 50, 200, 1000], pr_description_raw: ['This PR adds ...', 'Fix issue #42 ...'], review_comment_raw: ['LGTM', 'Could you add tests?'],
      review_comment_depth_scores: [2, 8], cross_repo_comment_count: 15, issue_triage_quality_score: 0.80, avg_time_to_merge_hours: 48,
    },
    engineering_practice_signals: {
      repos_with_test_dir: 2, repos_with_ci_config: 3, repos_with_docker: 2, repos_with_iac: 2, repos_with_linting: 2,
      ci_pass_rate_trajectory: { '2025-Q3': 0.95, '2025-Q4': 0.92, '2026-Q1': 0.96, '2026-Q2': 0.94 },
      semantic_versioning_discipline: true, avg_dependabot_resolution_days: 5, secret_leak_detected: false, secret_leak_details: [],
      sast_finding_density: 0.5, observability_markers_present: ['logging', 'metrics', 'tracing'], feature_flag_usage_detected: false,
      ai_config_files_present: [], actionlint_violations: 0,
    },
    impact_signals: {
      external_oss_contribution_count: 50, contribution_calendar_active_weeks_12m: 48,
      npm_packages: [{ name: 'express', downloads: 1000000, dependents: 50000 }],
      pypi_packages: [{ name: 'flask', downloads: 500000, dependents: 10000 }],
      cargo_packages: [{ name: 'serde', downloads: 10000000, dependents: 20000 }],
      stackoverflow_reputation: 5000, stackoverflow_accepted_answer_rate: 0.65, stackoverflow_top_tags: ['c', 'linux', 'git'],
    },
    anti_gaming_inputs: {
      burst_dormancy_ratio: 2.0, burst_triggered_at_evaluation: false, fork_dump_ratio: 0.10,
      code_search_flags: [], copyleaks_results: [], commit_inflation_ratio: 0.05, ai_pattern_confidence: 5, style_discontinuity_events: [],
    },
  }),
  expectedConfidence: {
    p1_execution_reliability: 'strong', p2_systems_evolution: 'moderate', p3_collaboration_leverage: 'strong',
    p4_technical_depth: 'strong', p5_operational_maturity: 'strong', p6_ai_leverage: 'observability_gap',
    p7_authenticity_confidence: 'strong', ag1_commit_inflation: 'strong', ag2_fork_dump: 'strong',
    ag3_burst_dormancy: 'strong', ag4_repository_laundering: 'strong', ag5_ai_generation_detection: 'observability_gap',
    ag6_credential_leak: 'observability_gap', ev_employment_verification: 'moderate',
  },
};

const FIXTURE_JUST_BELOW_BOUNDARY: FixtureDefinition = {
  description: 'Just below boundary — thresholds barely not met, one level below max',
  build: () => buildFixtureCorpus({
    identity: { account_age_days: 365 * 2, bio: null, company_claim: null, linked_urls: [], commit_email_domains: ['gmail.com'], github_org_memberships: [], hireable_flag: true },
    repositories: [{ name: 'project', full_name: 'user/project', primary_language: 'JavaScript', star_count: 50, fork_count: 10, commit_count: 150, is_fork: false, is_archived: false, is_private: false, is_org_repo: false, pushed_at: '2026-03-01T00:00:00Z', has_readme: true, topics: [], homepage_url: null, languages: { JavaScript: 500000, HTML: 50000 }, quality_score: 200 }],
    commit_signals: {
      total_commits_lifetime: 400,
      commit_frequency_by_month: Object.fromEntries(Array.from({ length: 11 }, (_, i) => { const m = (i % 12) + 1; const y = 2025 + Math.floor(i / 12); return [`${y}-${String(m).padStart(2, '0')}`, 8 + Math.floor(Math.random() * 10)]; })),
      median_commit_size_lines: 85, p25_commit_size_lines: 3, sub_5_line_commit_ratio: 0.12, merge_commit_ratio: 0.05, commit_signing_rate: 0.10,
      work_hour_distribution: { '23': 50, '00': 30, '01': 20 }, message_quality_raw: ['update', 'fix', 'changes'], message_quality_scores: [20, 30, 25],
      per_repo_author_stats: {}, complexity_trend_by_year: { '2025': 5000 }, test_to_code_ratio_by_repo: {}, commit_size_histogram: [1, 3, 10, 30, 100],
    },
    collaboration_signals: {
      pr_author_count: 3, pr_reviewer_count: 50, substantive_review_ratio: 0.30, self_merge_rate: 0.15, avg_pr_description_length_words: 50,
      pr_size_distribution: [5, 20, 100], pr_description_raw: ['fix bug'], review_comment_raw: ['LGTM'], review_comment_depth_scores: [1],
      cross_repo_comment_count: 5, issue_triage_quality_score: null, avg_time_to_merge_hours: 120,
    },
    engineering_practice_signals: {
      repos_with_test_dir: 0, repos_with_ci_config: 1, repos_with_docker: 0, repos_with_iac: 0, repos_with_linting: 1,
      ci_pass_rate_trajectory: { '2026-Q1': 0.85, '2026-Q2': 0.88 }, semantic_versioning_discipline: false, avg_dependabot_resolution_days: null,
      secret_leak_detected: false, secret_leak_details: [], sast_finding_density: null, observability_markers_present: ['logging'],
      feature_flag_usage_detected: false, ai_config_files_present: [], actionlint_violations: 0,
    },
    impact_signals: { external_oss_contribution_count: 2, contribution_calendar_active_weeks_12m: 20, npm_packages: [], pypi_packages: [], cargo_packages: [], stackoverflow_reputation: 0, stackoverflow_accepted_answer_rate: null, stackoverflow_top_tags: [] },
    anti_gaming_inputs: { burst_dormancy_ratio: 4.0, burst_triggered_at_evaluation: false, fork_dump_ratio: 0.40, code_search_flags: [], copyleaks_results: [], commit_inflation_ratio: 0.25, ai_pattern_confidence: 10, style_discontinuity_events: [] },
  }),
  expectedConfidence: {
    p1_execution_reliability: 'moderate', p2_systems_evolution: 'low', p3_collaboration_leverage: 'low', p4_technical_depth: 'low',
    p5_operational_maturity: 'low', p6_ai_leverage: 'observability_gap', p7_authenticity_confidence: 'strong',
    ag1_commit_inflation: 'strong', ag2_fork_dump: 'strong', ag3_burst_dormancy: 'strong', ag4_repository_laundering: 'strong',
    ag5_ai_generation_detection: 'observability_gap', ag6_credential_leak: 'observability_gap', ev_employment_verification: 'observability_gap',
  },
};

const FIXTURE_FLAG_TRIGGERS: FixtureDefinition = {
  description: 'Flag triggers — each anti-gaming module should raise its expected flag',
  build: () => {
    const base = FIXTURE_JUST_BELOW_BOUNDARY.build();
    base.anti_gaming_inputs = { burst_dormancy_ratio: 6.0, burst_triggered_at_evaluation: true, fork_dump_ratio: 0.80, code_search_flags: [{ repo: 'user/project', similarity_ratio: 0.85, matched_repos: ['other/project'] }], copyleaks_results: [], commit_inflation_ratio: 0.35, ai_pattern_confidence: 50, style_discontinuity_events: [] };
    return base;
  },
  expectedConfidence: {
    p1_execution_reliability: 'moderate', p2_systems_evolution: 'low', p3_collaboration_leverage: 'low', p4_technical_depth: 'low',
    p5_operational_maturity: 'low', p6_ai_leverage: 'observability_gap', p7_authenticity_confidence: 'moderate',
    ag1_commit_inflation: 'strong', ag2_fork_dump: 'strong', ag3_burst_dormancy: 'strong', ag4_repository_laundering: 'strong',
    ag5_ai_generation_detection: 'observability_gap', ag6_credential_leak: 'observability_gap', ev_employment_verification: 'observability_gap',
  },
  expectedFlags: { ag1_commit_inflation: ['COMMIT_INFLATION_SOFT'], ag2_fork_dump: ['FORK_DUMP_SOFT'], ag3_burst_dormancy: ['BURST_DORMANCY_SOFT'], ag4_repository_laundering: ['REPO_LAUNDERING_LIGHT'], p7_authenticity_confidence: ['BURST_DORMANCY_SOFT'] },
};

const FIXTURE_ENTERPRISE: FixtureDefinition = {
  description: 'Enterprise profile — only A and B groups, should trigger P7 observability gate',
  build: () => buildFixtureCorpus({
    identity: { account_age_days: 365 * 5, bio: null, company_claim: 'Enterprise Corp', linked_urls: [], commit_email_domains: ['enterprise.com'], github_org_memberships: ['enterprise'], hireable_flag: false },
    repositories: [{ name: 'internal-tool', full_name: 'enterprise/internal-tool', primary_language: 'Go', star_count: 5, fork_count: 2, commit_count: 500, is_fork: false, is_archived: false, is_private: true, is_org_repo: true, pushed_at: '2026-06-01T00:00:00Z', has_readme: true, topics: [], homepage_url: null, languages: { Go: 1000000 }, quality_score: 500 }],
    commit_signals: { total_commits_lifetime: 0, commit_frequency_by_month: {}, commit_size_histogram: [], p25_commit_size_lines: 0, median_commit_size_lines: 0, sub_5_line_commit_ratio: 0, merge_commit_ratio: 0, commit_signing_rate: 0, work_hour_distribution: {}, message_quality_raw: [], message_quality_scores: [], per_repo_author_stats: {}, complexity_trend_by_year: {}, test_to_code_ratio_by_repo: {} },
    collaboration_signals: { pr_author_count: 0, pr_reviewer_count: 0, substantive_review_ratio: 0, self_merge_rate: 0, avg_pr_description_length_words: 0, pr_size_distribution: [], pr_description_raw: [], review_comment_raw: [], review_comment_depth_scores: [], cross_repo_comment_count: 0, issue_triage_quality_score: null, avg_time_to_merge_hours: 0 },
    engineering_practice_signals: { repos_with_test_dir: 0, repos_with_ci_config: 0, repos_with_docker: 0, repos_with_iac: 0, repos_with_linting: 0, ci_pass_rate_trajectory: {}, semantic_versioning_discipline: false, avg_dependabot_resolution_days: null, secret_leak_detected: false, secret_leak_details: [], sast_finding_density: null, observability_markers_present: [], feature_flag_usage_detected: false, ai_config_files_present: [], actionlint_violations: 0 },
    impact_signals: { external_oss_contribution_count: 0, contribution_calendar_active_weeks_12m: 0, npm_packages: [], pypi_packages: [], cargo_packages: [], stackoverflow_reputation: 0, stackoverflow_accepted_answer_rate: null, stackoverflow_top_tags: [] },
    anti_gaming_inputs: { burst_dormancy_ratio: 1.0, burst_triggered_at_evaluation: false, fork_dump_ratio: 0, code_search_flags: [], copyleaks_results: [], commit_inflation_ratio: 0, ai_pattern_confidence: 0, style_discontinuity_events: [] },
  }),
  expectedConfidence: { p7_authenticity_confidence: 'observability_gap' },
};

const FIXTURES: Record<string, FixtureDefinition> = {
  strong_boundary: FIXTURE_STRONG_BOUNDARY,
  just_below_boundary: FIXTURE_JUST_BELOW_BOUNDARY,
  flag_triggers: FIXTURE_FLAG_TRIGGERS,
  enterprise_profile: FIXTURE_ENTERPRISE,
};

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
    corpus_id: `fixture_${Date.now()}`, github_username: 'fixture-user', collected_at: new Date().toISOString(),
    collection_mode: 'deep', groups_present: groupsPresent, collection_errors: [],
    identity: data.identity ?? { account_age_days: 0, bio: null, company_claim: null, linked_urls: [], commit_email_domains: [], github_org_memberships: [], hireable_flag: null },
    repositories: data.repositories ?? [],
    commit_signals: data.commit_signals ?? { total_commits_lifetime: 0, commit_frequency_by_month: {}, commit_size_histogram: [], p25_commit_size_lines: 0, median_commit_size_lines: 0, sub_5_line_commit_ratio: 0, merge_commit_ratio: 0, commit_signing_rate: 0, work_hour_distribution: {}, message_quality_raw: [], message_quality_scores: [], per_repo_author_stats: {}, complexity_trend_by_year: {}, test_to_code_ratio_by_repo: {} },
    collaboration_signals: data.collaboration_signals ?? { pr_author_count: 0, pr_reviewer_count: 0, substantive_review_ratio: 0, self_merge_rate: 0, avg_pr_description_length_words: 0, pr_size_distribution: [], pr_description_raw: [], review_comment_raw: [], review_comment_depth_scores: [], cross_repo_comment_count: 0, issue_triage_quality_score: null, avg_time_to_merge_hours: 0 },
    engineering_practice_signals: data.engineering_practice_signals ?? { repos_with_test_dir: 0, repos_with_ci_config: 0, repos_with_docker: 0, repos_with_iac: 0, repos_with_linting: 0, ci_pass_rate_trajectory: {}, semantic_versioning_discipline: false, avg_dependabot_resolution_days: null, secret_leak_detected: false, secret_leak_details: [], sast_finding_density: null, observability_markers_present: [], feature_flag_usage_detected: false, ai_config_files_present: [], actionlint_violations: 0 },
    impact_signals: data.impact_signals ?? { external_oss_contribution_count: 0, contribution_calendar_active_weeks_12m: 0, npm_packages: [], pypi_packages: [], cargo_packages: [], stackoverflow_reputation: 0, stackoverflow_accepted_answer_rate: null, stackoverflow_top_tags: [] },
    anti_gaming_inputs: data.anti_gaming_inputs ?? { burst_dormancy_ratio: 0, burst_triggered_at_evaluation: false, fork_dump_ratio: 0, code_search_flags: [], copyleaks_results: [], commit_inflation_ratio: 0, ai_pattern_confidence: 0, style_discontinuity_events: [] },
  };
}

// ─── Command Handlers ──────────────────────────────────────────────

async function handleTrace(options: CliOptions): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.error('REDIS_URL environment variable is required for the trace command.');
    process.exit(1);
  }

  console.log(`\n═══ TRACE: jobId=${options.jobId} ═══\n`);

  const redis = new Redis(redisUrl, { lazyConnect: true, enableOfflineQueue: false });
  await redis.connect();

  const cacheKey = `traces:${options.jobId}`;
  const raw = await redis.get(cacheKey);

  await redis.quit();

  if (!raw) {
    console.error(`  ❌ No traces found for jobId: ${options.jobId}`);
    console.error(`  Traces have a 7-day TTL. The job may not have completed yet,`);
    console.error(`  or the analysis may have been run before trace persistence was enabled.`);
    return;
  }

  let allTraces: Record<string, any>;
  try {
    allTraces = JSON.parse(raw);
  } catch {
    console.error(`  ❌ Failed to parse trace data for jobId: ${options.jobId}`);
    return;
  }

  const moduleIds = Object.keys(allTraces);
  console.log(`  Loaded ${moduleIds.length} module traces from Redis\n`);

  if (options.moduleId) {
    const trace = allTraces[options.moduleId];
    if (!trace) {
      console.error(`  ❌ Module '${options.moduleId}' not found. Available modules: ${moduleIds.join(', ')}`);
      return;
    }
    printModuleTrace(options.moduleId, trace);
  } else {
    // Show summary table first, then detailed traces
    printTraceSummary(allTraces);
    console.log(`\n  ── Detailed Decision Traces ──\n`);
    for (const [moduleId, trace] of Object.entries(allTraces).sort()) {
      printModuleTrace(moduleId, trace);
    }
  }
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
  const config: AnalysisConfig = { seniority: 'senior', role_archetype: 'backend' };

  TraceContext.startTrace(mod.module_id);
  const result = mod.run(corpus, config);
  const trace = TraceContext.endTrace(result);

  if (corpus.commit_signals) {
    console.log(`  GROUP C (Commit Intelligence):`);
    console.log(`    commit_frequency_by_month:  ${Object.keys(corpus.commit_signals.commit_frequency_by_month).length} active months`);
    console.log(`    median_commit_size_lines:  ${corpus.commit_signals.median_commit_size_lines}`);
    console.log(`    sub_5_line_commit_ratio:   ${corpus.commit_signals.sub_5_line_commit_ratio}`);
    console.log(`    total_commits_lifetime:    ${corpus.commit_signals.total_commits_lifetime}`);
  }

  if (trace) {
    console.log(`\n  THRESHOLD EVALUATIONS:`);
    for (const te of trace.thresholdEvents) {
      console.log(`    ${formatThreshold(te)}`);
    }
    console.log(`\n  CONFIDENCE DETERMINATION:`);
    for (const db of trace.decisionBranches) {
      console.log(`    ${db.decisionPoint}: → ${db.branchTaken}`);
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
  }
  console.log('');
}

function printDeltaTable(
  lightResults: ModuleResult[],
  deepResults: ModuleResult[],
): void {
  const lightMap = new Map(lightResults.map(r => [r.module_id, r]));
  const deepMap = new Map(deepResults.map(r => [r.module_id, r]));

  const EXPECTED_DELTAS = new Set(['p2_systems_evolution', 'ev_employment_verification', 'ag6_credential_leak', 'ag4_repository_laundering']);

  console.log(`\n  ┌──────────────────────────────────────────────────────────────────┐`);
  console.log(`  │ MODULE DELTA REPORT                                            │`);
  console.log(`  ├──────────────────────────────────────────────────────────────────┤`);
  console.log(`  │ Module                    │ Light      │ Deep       │ Δ?        │`);
  console.log(`  ├───────────────────────────┼────────────┼────────────┼───────────│`);

  const allModuleIds = new Set([...lightMap.keys(), ...deepMap.keys()]);
  let deltasFound = 0;

  for (const moduleId of [...allModuleIds].sort()) {
    const l = lightMap.get(moduleId);
    const d = deepMap.get(moduleId);
    const lightConf = l?.confidence ?? 'N/A';
    const deepConf = d?.confidence ?? 'N/A';
    const delta = lightConf !== deepConf;
    if (delta) deltasFound++;
    const isExpected = EXPECTED_DELTAS.has(moduleId);
    const deltaLabel = delta ? (isExpected ? '≠ EXPECTED' : '⚠️ UNEXPECTED!') : '= ';
    console.log(`  │ ${moduleId.padEnd(28).slice(0, 28)} │ ${lightConf.padEnd(12).slice(0, 12)}│ ${deepConf.padEnd(12).slice(0, 12)}│ ${deltaLabel.padEnd(11)}│`);
  }

  console.log(`  └──────────────────────────────────────────────────────────────────┘`);
  console.log(`\n  ═══ VERDICT ═══`);
  const unexpected = [...allModuleIds].filter(mid => lightMap.get(mid)?.confidence !== deepMap.get(mid)?.confidence && !EXPECTED_DELTAS.has(mid));
  if (unexpected.length === 0 && deltasFound > 0) {
    console.log(`  ✅ All deltas are EXPECTED per design.`);
  } else if (unexpected.length === 0) {
    console.log(`  ✅ No deltas found.`);
  } else {
    for (const bad of unexpected) console.log(`  🔴 UNEXPECTED DELTA: ${bad}`);
  }
}

async function handleCompare(registry: ModuleRegistry, options: CliOptions): Promise<void> {
  console.log(`\n═══ LIGHT vs DEEP COMPARISON ═══\n`);

  const config: AnalysisConfig = { seniority: 'senior', role_archetype: 'backend' };
  const allModules = registry.getAll();
  const lightResults: ModuleResult[] = [];
  const deepResults: ModuleResult[] = [];

  for (const mod of allModules) {
    const lightFixture = FIXTURE_STRONG_BOUNDARY.build();
    const deepFixture = FIXTURE_STRONG_BOUNDARY.build();
    (lightFixture as any).commit_signals.per_repo_author_stats = {};
    (lightFixture as any).commit_signals.complexity_trend_by_year = {};
    (lightFixture as any).commit_signals.test_to_code_ratio_by_repo = {};

    lightResults.push(mod.run(lightFixture, config));
    deepResults.push(mod.run(deepFixture, config));
  }

  printDeltaTable(lightResults, deepResults);
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const options = parseArgs(process.argv);

  if (options.command === 'trace') {
    await handleTrace(options);
    return;
  }

  // For 'module' and 'compare', bootstrap NestJS
  if (['module', 'compare'].includes(options.command)) {
    const app = await NestFactory.createApplicationContext(DebugAppModule, {
      logger: ['error', 'warn'],
    });

    const registry = app.get(ModuleRegistry);
    TraceContext.setVerbosity((process.env.TRACE_VERBOSITY as any) || 'decision');

    try {
      if (options.command === 'module') {
        await handleModule(registry, options);
      } else if (options.command === 'compare') {
        await handleCompare(registry, options);
      }
    } finally {
      await app.close();
    }
    return;
  }

  console.error(`Unknown command: ${options.command}`);
  printHelp();
  process.exit(1);
}

main().catch((error) => {
  console.error('[debug-analysis] Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});