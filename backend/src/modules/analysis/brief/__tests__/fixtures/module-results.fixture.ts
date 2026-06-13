// /**
//  * Module Results Fixtures — Reusable test data for Stage 6 unit tests.
//  *
//  * Represents the output of all 14 analysis modules after wave orchestration,
//  * providing realistic data for testing the Brief Assembler's section assembly,
//  * seniority weighting, flag rendering, and CV claim cross-referencing.
//  *
//  * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 6
//  */

// import { ModuleResult } from '../../../modules/module-result.types';
// import { SignalCorpus, CorpusGroup } from '../../../corpus/corpus.types';
// import { AnalysisConfig, CvClaim } from '../../../modules/module.interface';
// import { NarrativeOutput, InterviewQuestion } from '../../../llm/llm-response.types';

// // ─── Complete Corpus Fixture ────────────────────────────────────────

// export const STRONG_BACKEND_CORPUS: SignalCorpus = {
//   corpus_id: 'test_cor_brief_001',
//   github_username: 'strong-backend-dev',
//   collected_at: '2026-05-31T00:00:00Z',
//   collection_mode: 'light',
//   groups_present: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
//   collection_errors: [],
//   identity: {
//     account_age_days: 1200,
//     bio: 'Senior backend engineer',
//     company_claim: 'TechCorp',
//     linked_urls: ['https://linkedin.com/in/strong-dev'],
//     commit_email_domains: ['techcorp.com', 'gmail.com'],
//     github_org_memberships: [],
//     hireable_flag: true,
//   },
//   repositories: [
//     {
//       name: 'api-service',
//       full_name: 'strong-backend-dev/api-service',
//       primary_language: 'TypeScript',
//       star_count: 45,
//       fork_count: 8,
//       commit_count: 350,
//       is_fork: false,
//       is_archived: false,
//       is_private: false,
//       is_org_repo: false,
//       pushed_at: '2026-05-15T00:00:00Z',
//       has_readme: true,
//       topics: ['backend', 'api', 'typescript'],
//       homepage_url: null,
//       languages: { TypeScript: 80000, JavaScript: 20000 },
//       quality_score: 0.92,
//     },
//     {
//       name: 'data-pipeline',
//       full_name: 'strong-backend-dev/data-pipeline',
//       primary_language: 'Python',
//       star_count: 120,
//       fork_count: 25,
//       commit_count: 500,
//       is_fork: false,
//       is_archived: false,
//       is_private: false,
//       is_org_repo: false,
//       pushed_at: '2026-05-01T00:00:00Z',
//       has_readme: true,
//       topics: ['data', 'python', 'etl'],
//       homepage_url: null,
//       languages: { Python: 120000, Shell: 10000 },
//       quality_score: 0.95,
//     },
//   ],
//   commit_signals: {
//     total_commits_lifetime: 850,
//     commit_frequency_by_month: {
//       '2025-06': 65, '2025-07': 58, '2025-08': 72, '2025-09': 61,
//       '2025-10': 53, '2025-11': 67, '2025-12': 49, '2026-01': 71,
//       '2026-02': 64, '2026-03': 68, '2026-04': 62, '2026-05': 57,
//     },
//     commit_size_histogram: [8, 15, 30, 55, 95, 160, 310, 15, 10, 5],
//     p25_commit_size_lines: 15,
//     median_commit_size_lines: 95,
//     sub_5_line_commit_ratio: 0.10,
//     merge_commit_ratio: 0.12,
//     commit_signing_rate: 0.85,
//     work_hour_distribution: {
//       '08': 30, '09': 75, '10': 90, '11': 65, '12': 35,
//       '13': 55, '14': 80, '15': 70, '16': 50, '17': 30,
//     },
//     message_quality_raw: [
//       'Add retry logic for db connection pool exhaustion',
//       'Refactor authentication middleware to use JWT',
//       'Fix pagination off-by-one error in list endpoint',
//       'Implement rate limiting for public API routes',
//       'Add integration tests for payment webhook handler',
//     ],
//     message_quality_scores: [88, 92, 75, 85, 90],
//     per_repo_author_stats: {},
//     complexity_trend_by_year: {},
//     test_to_code_ratio_by_repo: {},
//   },
//   collaboration_signals: {
//     pr_author_count: 65,
//     pr_reviewer_count: 18,
//     substantive_review_ratio: 0.72,
//     self_merge_rate: 0.05,
//     avg_pr_description_length_words: 120,
//     pr_size_distribution: [60, 140, 220, 95, 40],
//     pr_description_raw: [
//       'Add authentication middleware with JWT refresh token support',
//       'Refactor database layer to use connection pooling',
//     ],
//     review_comment_raw: [
//       'Consider adding error handling for the database timeout case',
//       'The retry logic should probably use exponential backoff here',
//       'LGTM',
//     ],
//     review_comment_depth_scores: [85, 90, 30],
//     cross_repo_comment_count: 25,
//     issue_triage_quality_score: 78,
//     avg_time_to_merge_hours: 14.2,
//   },
//   engineering_practice_signals: {
//     repos_with_test_dir: 2,
//     repos_with_ci_config: 2,
//     repos_with_docker: 2,
//     repos_with_iac: 1,
//     repos_with_linting: 2,
//     ci_pass_rate_trajectory: {
//       '2025-Q3': 0.94,
//       '2025-Q4': 0.91,
//       '2026-Q1': 0.96,
//       '2026-Q2': 0.93,
//     },
//     semantic_versioning_discipline: true,
//     avg_dependabot_resolution_days: 2.8,
//     secret_leak_detected: false,
//     secret_leak_details: [],
//     sast_finding_density: null,
//     observability_markers_present: ['logging', 'metrics', 'tracing'],
//     feature_flag_usage_detected: true,
//     ai_config_files_present: [],
//     actionlint_violations: 0,
//   },
//   impact_signals: {
//     external_oss_contribution_count: 8,
//     contribution_calendar_active_weeks_12m: 50,
//     npm_packages: [{ name: 'express-utils', downloads: 15000, dependents: 45 }],
//     pypi_packages: [],
//     cargo_packages: [],
//     stackoverflow_reputation: 350,
//     stackoverflow_accepted_answer_rate: 0.72,
//     stackoverflow_top_tags: ['typescript', 'node.js', 'postgresql'],
//   },
//   anti_gaming_inputs: {
//     burst_dormancy_ratio: 1.3,
//     burst_triggered_at_evaluation: false,
//     fork_dump_ratio: 0.10,
//     code_search_flags: [],
//     copyleaks_results: [],
//     commit_inflation_ratio: 0.10,
//     ai_pattern_confidence: 15,
//     style_discontinuity_events: [],
//   },
// };

// // ─── 14 Module Results ───────────────────────────────────────────────

// export const ALL_MODULE_RESULTS: ModuleResult[] = [
//   {
//     module_id: 'p1_execution_reliability',
//     primitive_id: 'p1',
//     confidence: 'strong',
//     score_label: 'Demonstrated across 2 repositories and 12 months — high confidence.',
//     evidence: [
//       { signal: 'Commit cadence consistency', corpus_field: 'commit_signals.commit_frequency_by_month', value: { activeMonths: 12 }, interpretation: 'Active in 12 of trailing 12 months.' },
//       { signal: 'Commit size discipline', corpus_field: 'commit_signals.median_commit_size_lines', value: 95, interpretation: 'Median 95 lines in range.' },
//       { signal: 'CI pass rate trajectory', corpus_field: 'engineering_practice_signals.ci_pass_rate_trajectory', value: {}, interpretation: 'CI ≥80% across 4 quarters.' },
//     ],
//     flags: [],
//     interview_probe: null,
//     raw_signals_used: [],
//   },
//   {
//     module_id: 'p2_systems_evolution',
//     primitive_id: 'p2',
//     confidence: 'moderate',
//     score_label: 'Evidenced in limited context — probe in interview to confirm depth.',
//     evidence: [
//       { signal: 'Language growth', corpus_field: 'repositories[].primary_language', value: { languages: ['TypeScript', 'Python'] }, interpretation: 'Multi-language proficiency.' },
//     ],
//     flags: [],
//     interview_probe: 'Can you describe a time you migrated a system from one technology stack to another?',
//     raw_signals_used: [],
//   },
//   {
//     module_id: 'p3_collaboration_leverage',
//     primitive_id: 'p3',
//     confidence: 'strong',
//     score_label: 'Demonstrated across multiple repositories — high confidence.',
//     evidence: [
//       { signal: 'PR review activity', corpus_field: 'collaboration_signals.pr_reviewer_count', value: 18, interpretation: '18 distinct reviewers engaged.' },
//     ],
//     flags: [],
//     interview_probe: null,
//     raw_signals_used: [],
//   },
//   {
//     module_id: 'p4_technical_depth',
//     primitive_id: 'p4',
//     confidence: 'strong',
//     score_label: 'Demonstrated across multiple repositories — high confidence.',
//     evidence: [
//       { signal: 'Depth by commit volume', corpus_field: 'repositories[].commit_count', value: { topLanguages: [['Python', 500], ['TypeScript', 350]] }, interpretation: 'Deep in 2 languages.' },
//     ],
//     flags: [],
//     interview_probe: null,
//     raw_signals_used: [],
//   },
//   {
//     module_id: 'p5_operational_maturity',
//     primitive_id: 'p5',
//     confidence: 'moderate',
//     score_label: 'Evidenced in limited context — probe in interview to confirm depth.',
//     evidence: [
//       { signal: 'Observability markers', corpus_field: 'engineering_practice_signals.observability_markers_present', value: ['logging', 'metrics', 'tracing'], interpretation: 'Strong observability practice.' },
//     ],
//     flags: [],
//     interview_probe: 'How do you approach incident response and post-mortems in your current team?',
//     raw_signals_used: [],
//   },
//   {
//     module_id: 'p6_ai_leverage',
//     primitive_id: 'p6',
//     confidence: 'observability_gap',
//     score_label: 'AI Leverage analysis requires Wave 3 LLM batch. Currently using default classification.',
//     evidence: [],
//     flags: [],
//     interview_probe: null,
//     raw_signals_used: [],
//   },
//   {
//     module_id: 'p7_authenticity_confidence',
//     primitive_id: 'p7',
//     confidence: 'strong',
//     score_label: 'No authenticity flags detected. High confidence in profile authenticity.',
//     evidence: [],
//     flags: [],
//     interview_probe: null,
//     raw_signals_used: [],
//   },
//   {
//     module_id: 'ag1_commit_inflation',
//     primitive_id: null,
//     confidence: 'strong',
//     score_label: 'No commit inflation detected.',
//     evidence: [],
//     flags: [],
//     interview_probe: null,
//     raw_signals_used: [],
//   },
//   {
//     module_id: 'ag2_fork_dump',
//     primitive_id: null,
//     confidence: 'strong',
//     score_label: 'Normal fork-to-owned ratio.',
//     evidence: [],
//     flags: [],
//     interview_probe: null,
//     raw_signals_used: [],
//   },
//   {
//     module_id: 'ag3_burst_dormancy',
//     primitive_id: null,
//     confidence: 'strong',
//     score_label: 'Normal activity pattern — no burst/dormancy flags.',
//     evidence: [],
//     flags: [],
//     interview_probe: null,
//     raw_signals_used: [],
//   },
//   {
//     module_id: 'ag4_repository_laundering',
//     primitive_id: null,
//     confidence: 'observability_gap',
//     score_label: 'No public evidence — likely private or enterprise context.',
//     evidence: [],
//     flags: [],
//     interview_probe: null,
//     raw_signals_used: [],
//   },
//   {
//     module_id: 'ag5_ai_generation_detection',
//     primitive_id: null,
//     confidence: 'observability_gap',
//     score_label: 'AI generation detection requires Wave 3 LLM batch output.',
//     evidence: [],
//     flags: [],
//     interview_probe: null,
//     raw_signals_used: [],
//   },
//   {
//     module_id: 'ag6_credential_leak',
//     primitive_id: null,
//     confidence: 'observability_gap',
//     score_label: 'Secret scanning requires Deep Mode.',
//     evidence: [],
//     flags: [],
//     interview_probe: null,
//     raw_signals_used: [],
//   },
//   {
//     module_id: 'ev_employment_verification',
//     primitive_id: null,
//     confidence: 'moderate',
//     score_label: 'Employment partially verified: Rung 1/3.',
//     evidence: [],
//     flags: [],
//     interview_probe: null,
//     raw_signals_used: [],
//   },
// ];

// // ─── Results With Flags ──────────────────────────────────────────────

// export const RESULTS_WITH_FLAGS: ModuleResult[] = [
//   ...ALL_MODULE_RESULTS.slice(0, 7),
//   {
//     module_id: 'ag1_commit_inflation',
//     primitive_id: null,
//     confidence: 'low',
//     score_label: 'Commit inflation flag raised. See Section D.',
//     evidence: [],
//     flags: [{
//       flag_id: 'COMMIT_INFLATION_SOFT',
//       flag_type: 'SOFT',
//       severity: 'WARNING',
//       module_id: 'ag1_commit_inflation',
//       description: 'High proportion of very small commits suggests commit inflation.',
//       evidence_paths: [],
//       escalate_to_hiring_manager: false,
//       clear_without_interview: true,
//       auto_reject: false,
//       interview_probe: 'Can you walk me through your typical commit workflow?',
//     }],
//     interview_probe: null,
//     raw_signals_used: [],
//   },
//   {
//     module_id: 'ag3_burst_dormancy',
//     primitive_id: null,
//     confidence: 'low',
//     score_label: 'Burst/dormancy flag raised. See Section D.',
//     evidence: [],
//     flags: [{
//       flag_id: 'BURST_DORMANCY_SOFT',
//       flag_type: 'SOFT',
//       severity: 'WARNING',
//       module_id: 'ag3_burst_dormancy',
//       description: 'Activity burst detected: 8.5x ratio, evaluation-timed.',
//       evidence_paths: [],
//       escalate_to_hiring_manager: false,
//       clear_without_interview: true,
//       auto_reject: false,
//       interview_probe: 'Your GitHub activity shows a significant spike — can you tell me what you\'ve been working on?',
//     }],
//     interview_probe: null,
//     raw_signals_used: [],
//   },
//   ...ALL_MODULE_RESULTS.slice(10),
// ];

// // ─── Config Fixtures ─────────────────────────────────────────────────

// export const SENIOR_CONFIG: AnalysisConfig = {
//   seniority: 'senior',
//   role_archetype: 'backend',
// };

// export const JUNIOR_CONFIG: AnalysisConfig = {
//   seniority: 'junior',
//   role_archetype: 'frontend',
// };

// export const CONFIG_WITH_JD: AnalysisConfig = {
//   seniority: 'senior',
//   role_archetype: 'backend',
//   jd_text: 'We are looking for a senior backend engineer with strong TypeScript and Python skills, experience with distributed systems, and a track record of mentoring junior engineers.',
// };

// export const CONFIG_WITH_CV_CLAIMS: AnalysisConfig = {
//   seniority: 'senior',
//   role_archetype: 'backend',
//   cv_claims: [
//     { type: 'company', value: 'TechCorp', confidence: 'explicit', source_text: 'Senior Engineer at TechCorp' },
//     { type: 'role', value: 'Senior Engineer', confidence: 'explicit', source_text: 'Senior Engineer at TechCorp' },
//     { type: 'date_range', value: '2019 - Present', confidence: 'explicit', source_text: '2019 - Present' },
//     { type: 'tech_stack', value: 'TypeScript, Python, AWS', confidence: 'explicit', source_text: 'Skills: TypeScript, Python, AWS' },
//   ],
// };

// // ─── Narrative & Interview Fixtures ──────────────────────────────────

// export const NARRATIVE_FIXTURE: NarrativeOutput = {
//   profile_summary: 'Strong-backend-dev has demonstrated consistent backend engineering skills with 850+ commits across 2 repositories in TypeScript and Python. Commit cadence is stable across 12 months with strong CI practices and comprehensive testing. Collaboration signals show active code review participation with 18 distinct reviewers engaged.',
//   cv_cross_reference: 'Company claim "TechCorp" — supported by email domain match (techcorp.com). Role claim "Senior Engineer" — commit patterns and review depth consistent with senior-level responsibility. Date range "2019-Present" — GitHub account age of 1200 days (3.3 years) supports claimed tenure. Tech stack claim "TypeScript, Python, AWS" — confirmed via repository languages (TypeScript, Python); AWS markers present in observability config.',
//   work_pattern_intelligence: 'Work patterns show a preference for mid-sized commits (median 95 lines) with descriptive commit messages and substantive PR descriptions. Collaboration is a strength — 18 distinct reviewers, 72% substantive review ratio, low self-merge rate (5%). Technical depth spans multiple languages with package registry adoption.',
// };

// export const INTERVIEW_QUESTIONS_FIXTURE: InterviewQuestion[] = [
//   {
//     type: 'experience_depth',
//     question: 'Your commit history shows strong TypeScript and Python work — can you describe a complex distributed systems problem you solved?',
//     source_primitive: 'p4',
//     evaluation_criteria: 'Should demonstrate understanding of distributed systems concepts.',
//   },
//   {
//     type: 'problem_solving',
//     question: 'Walk me through how you debugged a production issue with limited observability.',
//     source_primitive: 'p1',
//     evaluation_criteria: 'Should articulate a systematic debugging approach.',
//   },
//   {
//     type: 'team_collaboration',
//     question: 'How do you approach mentoring junior engineers on code quality and system design?',
//     source_primitive: 'p3',
//     evaluation_criteria: 'Should describe specific mentoring practices.',
//   },
//   {
//     type: 'technical_judgment',
//     question: 'How would you decide between TypeScript and Python for a new data processing service?',
//     source_primitive: 'p2',
//     evaluation_criteria: 'Should reference trade-offs around type safety, ecosystem, performance.',
//   },
// ];