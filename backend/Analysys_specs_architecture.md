GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

## **GITINTEL** 

Feature & Technical Specification 

_v1.0  ·  May 2026  ·  Engineering — Internal Reference_ 

**==> picture [469 x 32] intentionally omitted <==**

**Purpose:** Engineering source of truth for all GitIntel analyser features. Defines the composable pipeline architecture, signal corpus schema, every analysis module with its algorithm and output contract, and every core product feature at implementation detail. 

**Audience:** Backend engineers, ML/LLM integration engineers, and technical leads. Not a product overview — see the Roadmap & Launch Playbook for that. 

**Scope:** Analyser architecture, data collection, analysis modules (P1–P7 + anti-gaming), core product features, brief assembly, LLM integration. Excludes: billing engine, auth, deployment infrastructure. 

© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

## **1. Analyser Architecture — The Composable Pipeline** 

The analyser is a three-layer composable pipeline. Every design decision in this document flows from it — read this section before implementing any individual feature. 

## **1.1 Why Composable?** 

A naive design couples data collection to analysis: each mode fetches its own data and scores it. This creates critical problems: 

- Re-scoring is impossible without re-fetching. Changing role archetype from Backend to Frontend re-runs the entire expensive GitHub crawl. 

- CV Verifier and Interview Intelligence need to operate on existing data — without a shared corpus, each mode is an isolated pipeline that cannot share signals. 

- Deep Mode cannot build on a prior Light Mode run — it starts from scratch even though ~65% of signals overlap. 

- Adding a new analysis module requires touching pipeline code rather than extending a clean interface. 

_The solution: separate data collection from analysis. Fetch once, analyse many ways. The Signal Corpus is the shared intermediate representation — a normalised, cached snapshot of all observable signals for a candidate. Analysis Modules are stateless functions over the corpus. Brief Assembly is a final rendering step over scored module results._ 

## **1.2 The Three Layers** 

|**Layer**|**Name**|**Responsibility**|**Output**|
|---|---|---|---|
|1|Data<br>Collector|Calls GitHub APIs and runs local tools<br>(Deep Mode only). Normalises raw<br>responses into Signal Groups A–G. Owns<br>rate limit management, circuit breaker, and<br>clone worker orchestration.|Signal Corpus —<br>Redis (TTL 7 days),<br>keyed corpus:<br>{username}:{mode}|
|2|Analysis<br>Modules|14 stateless functions. Each takes a Signal<br>Corpus + Analysis Config and returns a<br>structured ModuleResult. Modules with no<br>shared dependencies run in parallel. No<br>module calls external APIs directly.|ModuleResult[] —<br>persisted to Postgres<br>on pipeline<br>completion.|
|3|Brief<br>Assembler|Consumes all ModuleResults +<br>AnalysisConfig. Applies seniority weighting.<br>Calls LLM API for narrative sections.<br>Renders Evidence Brief Markdown and<br>generates interview questions.|Evidence Brief —<br>stored in<br>evidence_briefs<br>table. PDF generated<br>on demand.|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

## **1.3 Module Contract** 

Every Analysis Module implements this interface. No module may make external API calls — all required data must be in the Signal Corpus. 

```
// Every analysis module implements this interface (Python dataclass in
practice)
```

```
interface AnalysisModule {
```

```
  module_id: string;                  // e.g. 'p1_execution_reliability'
  required_corpus_groups: string[];   // fails fast if group absent from
corpus
```

```
  required_collection_mode: 'light' | 'deep' | 'either';
```

```
  run(corpus: SignalCorpus, config: AnalysisConfig): ModuleResult;
}
```

```
interface AnalysisConfig {
  seniority: 'intern'|'junior'|'mid'|'senior'|'staff'|'principal';
  role_archetype:
'backend'|'frontend'|'platform'|'data_ml'|'security'|'mobile'|'generalist
';
  jd_text?: string;
}
```

```
interface ModuleResult {
  module_id: string;
  primitive_id: string | null;        // 'p1'–'p7', null for anti-gaming
modules
```

```
  confidence:
```

```
'strong'|'moderate'|'low'|'observability_gap'|'insufficient_data';
```

```
  score_label: string;                // mandatory language — see Section
6.2
```

```
  evidence: Evidence[];              // each item cites a corpus field
path + value
  flags: Flag[];                     // anti-gaming or security flags
  interview_probe: string | null;    // generated when confidence <
strong
```

```
  raw_signals_used: string[];        // corpus field paths consumed by
this module
```

```
}
```

```
interface Evidence {
  signal: string;          // human-readable name
  corpus_field: string;    // e.g.
'commit_signals.median_commit_size_lines'
  value: any;              // observed value
  interpretation: string;  // what this value means in context
```

© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

```
}
```

## **1.4 Signal Corpus Schema** 

Stored in Redis as JSON with 7-day TTL. A Deep Mode corpus supersedes a Light Mode corpus for the same username — modules that only require Light signals can consume a Deep corpus. 

```
interface SignalCorpus {
  corpus_id: string;
  github_username: string;
  collected_at: string;           // ISO8601
  collection_mode: 'light'|'deep'|'light_partial'|'deep_partial';
  groups_present: string[];       // which groups were fully collected
  collection_errors: string[];    // non-fatal collection errors logged
here
```

```
  // ── GROUP A — Identity & Profile
```

```
─────────────────────────────────────
  identity: {
    account_age_days: number;
    bio: string | null;
    company_claim: string | null;
    linked_urls: string[];
    commit_email_domains: string[];
    github_org_memberships: string[];   // Deep Mode only
    hireable_flag: boolean | null;
  };
```

```
  // ── GROUP B — Repository Inventory
───────────────────────────────────
  repositories: Array<{
```

```
    name: string;  full_name: string;  primary_language: string | null;
    star_count: number;  fork_count: number;  commit_count: number;
    is_fork: boolean;  is_archived: boolean;  is_private: boolean;
    is_org_repo: boolean;  pushed_at: string;  has_readme: boolean;
    topics: string[];  homepage_url: string | null;
    languages: Record<string,number>;   // language -> bytes
    quality_score: number;              // (stars+forks+commits) ×
recency_weight
```

```
  }>;
```

```
  // ── GROUP C — Commit Intelligence
```

```
────────────────────────────────────
  commit_signals: {
    total_commits_lifetime: number;
```

```
    commit_frequency_by_month: Record<string,number>;  // 'YYYY-MM' ->
count
```

© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

```
    commit_size_histogram: number[];   // additions+deletions per non-
merge commit
    p25_commit_size_lines: number;
    median_commit_size_lines: number;
    sub_5_line_commit_ratio: number;   // 0.0–1.0, excludes merge+doc
commits
    merge_commit_ratio: number;
    commit_signing_rate: number;
    work_hour_distribution: Record<string,number>;  // 'HH' (UTC) ->
commit count
    message_quality_raw: string[];     // raw message text, sampled for
LLM batch
    message_quality_scores: number[];  // 0–100, populated after LLM Wave
3
```

```
    // Deep Mode only:
    per_repo_author_stats: Record<string,{
      lines_added: number;  lines_deleted: number;
      commits: number;  active_days: number;  authorship_pct: number;
    }>;
    complexity_trend_by_year: Record<string,number>;  // from scc
    test_to_code_ratio_by_repo: Record<string,number>;  // from tokei
  };
```

```
  // ── GROUP D — Collaboration & Review
```

```
─────────────────────────────────
```

```
  collaboration_signals: {
    pr_author_count: number;
    pr_reviewer_count: number;
    substantive_review_ratio: number;  // non-LGTM reviews / total
reviews
    self_merge_rate: number;
    avg_pr_description_length_words: number;
    pr_size_distribution: number[];
```

```
    pr_description_raw: string[];      // raw text, sampled for LLM batch
    review_comment_raw: string[];      // raw review text for LLM depth
scoring
```

```
    review_comment_depth_scores: number[];   // populated after LLM Wave
3
```

```
    cross_repo_comment_count: number;
    issue_triage_quality_score: number | null;
    avg_time_to_merge_hours: number;
  };
```

```
  // ── GROUP E — Engineering Practices
```

```
──────────────────────────────────
  engineering_practice_signals: {
    repos_with_test_dir: number;
    repos_with_ci_config: number;
    repos_with_docker: number;
    repos_with_iac: number;
    repos_with_linting: number;
```

© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

```
    ci_pass_rate_trajectory: Record<string,number>;  // 'YYYY-Q' -> 0.0–
1.0
```

```
    semantic_versioning_discipline: boolean;
    avg_dependabot_resolution_days: number | null;
    secret_leak_detected: boolean;         // from gitleaks (Deep only)
    secret_leak_details: Array<{
      repo: string;  file_path: string;  secret_type: string;
      commit_sha: string;  is_revoked: boolean;
    }>;
    sast_finding_density: number | null;   // critical+high per 1000 SLOC
(Deep only)
    observability_markers_present: string[];  //
['logging','metrics','tracing']
    feature_flag_usage_detected: boolean;
    ai_config_files_present: string[];
    actionlint_violations: number;
  };
```

```
  // ── GROUP F — Impact & External Signals
```

```
──────────────────────────────
```

```
  impact_signals: {
```

```
    external_oss_contribution_count: number;
    contribution_calendar_active_weeks_12m: number;
    npm_packages: Array<{name:string; weekly_downloads:number;
dependents:number}>;
    pypi_packages: Array<{name:string; monthly_downloads:number;
dependents:number}>;
    cargo_packages: Array<{name:string; total_downloads:number;
dependents:number}>;
```

```
    stackoverflow_reputation: number;
    stackoverflow_accepted_answer_rate: number | null;
    stackoverflow_top_tags: string[];
  };
```

```
  // ── GROUP G — Anti-Gaming Raw Inputs
```

```
─────────────────────────────────
  anti_gaming_inputs: {
    burst_dormancy_ratio: number;       // last-30d weekly avg /
trailing-12m weekly avg
    burst_triggered_at_evaluation: boolean;
    fork_dump_ratio: number;
    code_search_flags: Array<{repo:string; similarity_ratio:number;
matched_repos:string[]}>;
    copyleaks_results: Array<{repo:string; similarity_pct:number;
confirmed:boolean}>;
    commit_inflation_ratio: number;
    ai_pattern_confidence: number;      // 0–100, populated after LLM
Wave 3
    style_discontinuity_events: Array<{
      date: string;  repo: string;  lines_added: number;
style_delta_score: number;
```

© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

```
    }>;
  };
}
```

## **1.5 Caching and Reuse Strategy** 

|**Scenario**|**Behaviour**|
|---|---|
|Same username,<br>same mode, within 7<br>days|Return cached corpus from Redis. Skip collection entirely. Re-run<br>analysis modules with new AnalysisConfig if archetype or seniority<br>changed. Completes in ~30 seconds.|
|Deep Mode<br>requested, Light<br>corpus exists (< 7<br>days)|Fetch only the delta: private repos + clone tool outputs. Merge into<br>existing Light corpus. Do not re-fetch public API data already present.<br>Saves ~40% of API calls.|
|CV Verifier<br>requested, no corpus<br>exists|Auto-trigger Light Mode collection first. Block CV Verifier module<br>execution until corpus is ready. Result appears as a single combined<br>brief to the employer.|
|Re-score with<br>different archetype or<br>seniority|Retrieve cached corpus. Re-run all 14 analysis modules with new<br>AnalysisConfig. No GitHub API calls. Typically completes in under 30<br>seconds.|
|Corpus older than 7<br>days|Cache miss — full collection re-runs. Old corpus TTL expired<br>automatically.|
|Circuit breaker fired<br>— partial corpus|Corpus stored with groups_present reflecting what was collected<br>before circuit break. Modules requiring absent groups return<br>observability_gap. Brief marked PARTIAL.|
|Batch — 500<br>candidates|Each candidate gets independent corpus. Cache hits are reused<br>without consuming quota. Employer informed: 'X of 500 candidates<br>reused cached analyses.'|



## **1.6 Module Execution Wave Order** 

|**Wave**|**Modules Running in Parallel**|**Dependency**|**Target Time**|
|---|---|---|---|
|Wave<br>1|AG1 Commit Inflation, AG2<br>Fork Dump, AG3<br>Burst/Dormancy.<br>Deterministic — no API calls.|Corpus groups C, B,<br>G|~2 seconds|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**Wave**|**Modules Running in Parallel**|**Dependency**|**Target Time**|
|---|---|---|---|
|Wave<br>2a<br>(conditi<br>onal)|AG4 Repository Laundering<br>— runs only if AG1 or AG3<br>fires, or repo shows<br>laundering characteristics.|Wave 1 results +<br>GitHub Code Search<br>API|~20 seconds if triggered|
|Wave<br>2b<br>(parall<br>el)|P1 Execution Reliability, P2<br>Systems Evolution, P5<br>Operational Maturity —<br>deterministic scoring from<br>corpus.|Corpus C, E|~1 second|
|Wave<br>2c<br>(parall<br>el)|P3 Collaboration Leverage —<br>deterministic from Group D<br>signals.|Corpus D|~1 second|
|Wave<br>2d<br>(parall<br>el)|P4 Technical Depth —<br>deterministic from Groups B,<br>D, F.|Corpus B, D, F|~1 second|
|Wave<br>3|Single batched LLM API call:<br>P6 AI Leverage + AG5 AI-<br>Generation detector + commit<br>message quality + PR<br>description depth scoring.<br>Employment verification EV<br>Rungs 1–3 runs in parallel<br>(no LLM).|Wave 1 results +<br>corpus C, D, A|~25 seconds|
|Wave<br>4|Brief Assembler: narrative<br>LLM call (Sections A, B, C).<br>Interview question generation<br>LLM call. CV cross-check (if<br>CV Verifier). Role/stack<br>match (if JD provided).|All module results|~20 seconds|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

## **2. Data Collection Layer** 

The collector populates the Signal Corpus from GitHub APIs and local tools. It is the only layer that makes external network calls and is strictly separated from all analysis logic. 

## **2.1 GraphQL-First API Strategy** 

All nested and relational data is fetched via a single batched GraphQL query, saving ~60% of the REST budget. The query below is the primary Light Mode fetch — it populates Groups A, B, D, and F in one round-trip. 

```
query CandidateProfile($login: String!, $prCursor: String) {
  user(login: $login) {
    createdAt  bio  company  websiteUrl  isHireable  email
    # Group B — top 100 repos ordered by activity
    repositories(first:100, ownerAffiliations:OWNER,
                 orderBy:{field:PUSHED_AT, direction:DESC}) {
      nodes {
        name  primaryLanguage { name }  stargazerCount  forkCount
        isFork  isArchived  isPrivate  pushedAt  homepageUrl
        repositoryTopics(first:10) { nodes { topic { name } } }
        hasReadme: object(expression:"HEAD:README.md") { id }
        languages(first:10) { edges { size node { name } } }
        defaultBranchRef { target { ... on Commit {
          history(first:1) { totalCount }  # commit count proxy
        }}}
      }
    }
    # Group D — PR and review data (paginated)
    pullRequests(first:50, states:MERGED, after:$prCursor) {
      pageInfo { hasNextPage  endCursor }
      nodes {
        title  bodyText  createdAt  mergedAt  additions  deletions
        mergedBy { login }  author { login }
        reviews(first:10) { nodes { body  state  author { login } } }
      }
    }
    # Group F — contribution calendar
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { contributionCount  date } }
      }
    }
  }
}
```

© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

## **2.2 Light Mode Collection Sequence** 

|**S**<br>**t**<br>**e**<br>**p**|**API Call / Action**|**Groups**<br>**Populated**|**Notes**|
|---|---|---|---|
|1|GraphQL bulk fetch<br>(above, paginated for<br>>50 PRs)|A, B, D, F|Handles Groups A/B/D/F in one call. Paginate<br>PRs in batches of 50 until all merged PRs in last<br>12 months fetched.|
|2|REST: GET<br>/users/{login}/events/<br>public — last 90<br>events|C (partial)|PushEvents extracted for<br>commit_frequency_by_month computation.|
|3|REST: GET<br>/repos/{owner}/{repo}<br>/commits — top 10<br>repos by quality<br>score, 100 commits<br>each|C|commit_size_histogram, p25, median,<br>sub_5_line_ratio, work_hour_distribution,<br>message_quality_raw. Filter out merge commits<br>(parents count > 1).|
|4|REST: GET<br>/repos/{owner}/{repo}<br>/releases — top 10<br>repos|E|semantic_versioning_discipline: true if ≥2 repos<br>use semver tags (vMAJOR.MINOR.PATCH<br>pattern).|
|5|REST: GET<br>/repos/{owner}/{repo}<br>/contents/ (root file<br>tree) — top 20 repos|E|Detect: test dirs (test/, tests/, __tests__, spec/), CI<br>configs (.github/workflows, .circleci, .travis.yml),<br>Docker, IaC (terraform/, pulumi/, cdk/), linting<br>configs (.eslintrc, .pylintrc, pyproject.toml), AI<br>config files (cursor.rules, .github/copilot-<br>instructions.md).|
|6|REST: GET<br>/repos/{owner}/{repo}<br>/actions/runs?<br>per_page=50 —<br>repos with CI config|E|ci_pass_rate_trajectory: group runs by quarter,<br>compute pass_count / total_count per quarter.|
|7|Search API: GET<br>/search/code — 3<br>representative file<br>signatures per<br>flagged repo|G|Rate: 1 request per 2 seconds. Max 15 requests<br>per analysis (5 repos × 3 signatures). Threshold:<br>if >40% of signature queries match other repos →<br>code_search_flags entry.|
|8|External: npm, PyPI,|F|npm: GET https://registry.npmjs.org/-/v1/search?|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**S**<br>**t**<br>**e**<br>**p**|**API Call / Action**|**Groups**<br>**Populated**|**Notes**|
|---|---|---|---|
||Cargo APIs — lookup<br>by candidate email<br>and known package<br>names||text=author:{email}. PyPI: GET<br>https://pypi.org/pypi/{package}/json. Cargo: GET<br>https://crates.io/api/v1/crates?q={username}.|
|9|External: Stack<br>Exchange API —<br>GET<br>/2.3/users/{id}/answer<br>s|F|Tier 3 — additive only. Absence carries zero<br>negative weight. Cache result 24 hours.|
|1<br>0|Deterministic anti-<br>gaming computation<br>from collected corpus<br>data — no API calls|G|Compute: commit_inflation_ratio,<br>fork_dump_ratio, burst_dormancy_ratio,<br>burst_triggered_at_evaluation. All from corpus<br>data already collected.|



_Circuit breaker: track X-RateLimit-Remaining on every REST response. If remaining < 500: snapshot partial corpus to Redis with 2-hour TTL, record groups_present, emit CIRCUIT_BREAK event, set job status to pending_resume, schedule resume job for rate limit reset timestamp + 30 seconds. On resume: fetch only incomplete groups and merge into partial corpus. Partial briefs are marked PARTIAL in the Evidence Brief header and billed at 50% of the analysis rate._ 

## **2.3 Deep Mode Additional Collection Steps** 

|**S**<br>**t**<br>**e**<br>**p**|**Action**|**Groups**<br>**Populated**|**Notes**|
|---|---|---|---|
|D<br>1|REST: GET<br>/user/repos?<br>type=all&visibility=p<br>rivate — fetch<br>private repo list.<br>Merge with public<br>repos.|B|Private repos appended to repositories[] with<br>is_private: true.|
|D<br>2|GraphQL org<br>membership query<br>for each org the<br>candidate token<br>has access to.|A, B|identity.github_org_memberships populated. Org<br>repos added with is_org_repo: true.|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**S**<br>**t**<br>**e**<br>**p**|**Action**|**Groups**<br>**Populated**|**Notes**|
|---|---|---|---|
|D<br>3|Repo prioritisation:<br>score all repos by<br>(stars + forks +<br>commit_count) ×<br>recency_weight.<br>Recency: pushed <<br>12mo = 1.0, 12–<br>24mo = 0.7, 24–<br>48mo = 0.4, >48mo<br>= 0.1. Select top<br>30.|—|Top 30 list passed to clone workers. Prioritisation<br>heuristic disclosed in brief footer.|
|D<br>4|Clone workers (4<br>parallel Docker<br>containers, tmpfs<br>only): git clone --<br>filter=blob:none<br>then git fetch --<br>unshallow for full<br>history.|—|Timeout: 5 minutes per repo. On timeout: skip repo,<br>log to collection_errors. Network egress restricted to<br>github.com:443 only.|
|D<br>5|Per cloned repo:<br>scc --format json.<br>Extracts SLOC per<br>language,<br>comment ratio,<br>cyclomatic<br>complexity,<br>generated-code<br>flag.|C, E|complexity_trend_by_year: group scc complexity<br>output by commit year. Requires git log --format='%H<br>%ai' to map commits to years.|
|D<br>6|Per cloned repo:<br>tokei --output json.<br>Test file vs. source<br>file detection per<br>language.|C|test_to_code_ratio_by_repo: test_sloc / (test_sloc +<br>source_sloc) per repo.|
|D<br>7|Per cloned repo:<br>gitinspector --<br>format=json --<br>since=2020-01-01.<br>Filter to candidate's<br>known commit<br>email addresses.|C|per_repo_author_stats: lines_added, lines_deleted,<br>commits, active_days, authorship_pct per repo.|
|D<br>8|Per cloned repo:<br>gitleaks detect --|E|secret_leak_detected, secret_leak_details[]. Includes<br>revoked secrets. False positive check: if file path|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**S**<br>**t**<br>**e**<br>**p**|**Action**|**Groups**<br>**Populated**|**Notes**|
|---|---|---|---|
||source . --report-<br>format json. Full git<br>history scan.||contains test/, fixture/, example/, mock/ — downgrade<br>to soft flag.|
|D<br>9|Per cloned repo:<br>semgrep --<br>config=p/security-<br>audit<br>--config=p/secrets<br>--json.|E|sast_finding_density: (critical_count + high_count) /<br>(total_sloc / 1000).|
|D<br>1<br>0|Per cloned repo<br>with<br>.github/workflows:<br>actionlint --format<br>'{{json .}}'.|E|actionlint_violations: total violation count across all<br>workflow files.|
|D<br>1<br>1|Employment<br>verification: for<br>each claimed<br>employer, query<br>org membership<br>API + fetch<br>contribution<br>timestamps from<br>org repos.|A, G|Populates identity.github_org_memberships (Rung 2).<br>Contribution timestamp fingerprint analysis done in<br>EV module (Rung 3).|
|D<br>1<br>2|Cleanup (finally<br>block —<br>guaranteed<br>execution): delete<br>tmpfs clone dirs,<br>revoke installation<br>token via<br>DELETE<br>/installation/token,<br>update<br>evaluation_link<br>status.|—|Watchdog job runs every 15 minutes: deletes any<br>tmpfs dirs older than 30 minutes (catches worker<br>crash scenarios).|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

## **3. Analysis Modules — Primitive Scorers (P1–P7)** 

Each module is documented with: corpus groups consumed, algorithm, confidence thresholds, edge cases, and seniority adjustments. LLM calls happen in Wave 3 — modules that require LLM output receive it as pre-computed values in the corpus before running. 

## **P1 — EXECUTION RELIABILITY  ·  Can this engineer ship safely and consistently?** 

Corpus groups: C (Commit Intelligence), E (Engineering Practices). Minimum mode: Light. Full confidence: Deep only. 

|**Signal**|**Corpus Field**|**Strong Evidence**<br>**Threshold**|**Weigh**<br>**t**|**Edge Cases**|
|---|---|---|---|---|
|Commit<br>cadence<br>consistency|commit_signals.co<br>mmit_frequency_by<br>_month|Active in ≥9 of<br>trailing 12<br>months. No<br>gap > 8<br>consecutive<br>weeks.|High|Erratic cadence (active<br>bursts + long silences)<br>reduces confidence. Burst<br>within 30 days of<br>evaluation → AG3 flag<br>also fires. Account age <<br>12 months: use full<br>available history, note<br>limited history in brief.|
|Commit size<br>discipline|p25_commit_size_l<br>ines,<br>sub_5_line_commit<br>_ratio|Median 20–400<br>lines. p25 ≥ 5<br>lines.<br>sub_5_line_rati<br>o < 0.30.|High|Exclude from histogram:<br>merge commits (parents ><br>1), doc-only commits (all<br>changed files end<br>in .md/.txt/.rst/.adoc), bot<br>commits (email contains<br>[bot] or noreply). Config-<br>only repos (e.g. dotfiles)<br>excluded entirely.|
|CI pass rate<br>trajectory|engineering_practic<br>e_signals.ci_pass_<br>rate_trajectory|≥80% pass<br>rate in each of<br>last 4 quarters<br>AND stable or<br>improving<br>trend.|High|No CI config:<br>observability_gap (not<br>penalty). Declining trend<br>over 4 quarters is<br>negative regardless of<br>absolute level. Single-<br>quarter data: low<br>confidence, not strong.|
|Test-to-code<br>ratio (Deep)|commit_signals.tes<br>t_to_code_ratio_by<br>_repo|≥0.15<br>test/source<br>ratio in ≥3<br>repos with|Mode<br>rate|Light Mode fallback:<br>repos_with_test_dir /<br>total_repos ≥ 0.4. Much<br>weaker signal. Repos|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**Signal**|**Corpus Field**|**Strong Evidence**<br>**Threshold**|**Weigh**<br>**t**|**Edge Cases**|
|---|---|---|---|---|
|||>500 SLOC<br>(from tokei).||where testing framework<br>is a dev dependency but<br>no test dir found: neutral.|
|Semantic<br>versioning|engineering_practic<br>e_signals.semantic<br>_versioning_discipli<br>ne|True: ≥2 of<br>candidate's<br>own projects<br>use<br>vMAJOR.MINO<br>R.PATCH<br>release tags.|Mode<br>rate|Only meaningful if<br>candidate has published<br>software. Non-publishing<br>engineers:<br>observability_gap for this<br>signal only, not for P1<br>overall.|
|Dependabot<br>response<br>time|engineering_practic<br>e_signals.avg_dep<br>endabot_resolution<br>_days|< 30 days<br>average<br>resolution time.|Mode<br>rate|null value (no Dependabot<br>alerts): neutral — not a<br>negative. >90 days<br>average: soft negative.<br>Security archetype: >30<br>days on High/Critical CVE<br>in own packages is a hard<br>flag.|



## **P1 Confidence thresholds** 

|**Confidence**|**Trigger Condition**|
|---|---|
|strong|All three primary signals met (cadence, size discipline, CI pass rate)<br>across ≥12 months.|
|moderate|2 of 3 primary signals met, OR all 3 met but only 6–11 months of history.|
|low|Only 1 primary signal met, OR history < 6 months.|
|observability_gap|< 3 repos with CI config AND no Deep Mode clone data. Typical for<br>enterprise engineers.|



## **P1 Seniority adjustments** 

Intern/Junior: CI pass rate and test ratio are not expected. P1 confidence computed from cadence + size discipline only. CI absence is NOT an observability gap — it is expected. Do not mention CI in the brief for Junior targets. 

**P2 — SYSTEMS EVOLUTION  ·  Do systems improve under this engineer's stewardship over time?** 

© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

Corpus groups: C, E. Deep Mode required for complexity trajectory. P2 is marked 'Not expected' for Intern and Junior seniority — still scored but absence is not penalised. 

|**Signal**|**Corpus Field**|**Strong**<br>**Threshold**|**Notes**|
|---|---|---|---|
|Complexity<br>trajectory<br>(scc)|commit_signals.co<br>mplexity_trend_by_<br>year|Flat or<br>decreasing<br>average<br>cyclomatic<br>complexity<br>over ≥2 years<br>in a repo where<br>candidate has<br>≥30%<br>authorship_pct.|Deep Mode only. Requires ≥2<br>years of git history in repo. scc<br>complexity is measured per<br>language at repo-snapshot level<br>— approximate per-year values<br>built by sampling commits at year<br>boundaries.|
|Refactor<br>commit<br>evidence<br>(LLM)|commit_signals.me<br>ssage_quality_raw<br>— LLM tags<br>refactor-intent<br>commits in Wave 3|≥5 refactor-<br>intent commits<br>with<br>explanatory<br>messages (not<br>just 'refactor')<br>in ≥2 repos.|LLM identifies refactor patterns:<br>remove, simplify, extract,<br>consolidate, decompose, clean<br>up. Code diff must support intent<br>— LLM evaluates message + diff<br>summary together.|
|Long-lived<br>code survival<br>(gitinspector)|commit_signals.per<br>_repo_author_stats|Candidate's<br>code<br>constitutes<br>≥30%<br>authorship in a<br>repo that is still<br>active (pushed<br>in last 6<br>months) and<br>has ≥2 years of<br>history.|Strong signal: their code wasn't<br>immediately replaced. Hard to<br>game — requires genuine long-<br>term repo stewardship.|
|API surface<br>stability (LLM)|commit_signals.me<br>ssage_quality_raw<br>— LLM tags<br>breaking-change<br>commits|Absence of<br>unannounced<br>breaking<br>changes in<br>public APIs.<br>OR explicit<br>backward-<br>compatibility<br>patterns<br>detected.|LLM detects breaking change<br>patterns in PR descriptions and<br>commit messages. Absence of<br>detection ≠ confirmed stability —<br>report as 'No breaking change<br>evidence detected' (neutral).|
|Migration<br>safety (LLM)|engineering_practic<br>e_signals + commit<br>corpus|Evidence of<br>phased rollout<br>patterns,|LLM-detected. Requires Deep<br>Mode for sufficient commit history.<br>Light Mode: observability_gap for|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**Signal**|**Corpus Field**|**Strong**<br>**Threshold**|**Notes**|
|---|---|---|---|
|||feature flags<br>for migrations,<br>backward-<br>compatible<br>schema<br>changes.|this signal only.|
|||||
|**P3 — COLLABORATION LEVERAGE  ·  Does this engineer amplify the people around them?**||||



Corpus groups: D (Collaboration & Review). LLM Wave 3 scores review comment depth and PR description quality. 

_CRITICAL: P3 is the highest-value signal when present. When absent or thin (< 5 PRs reviewed), it carries ZERO negative weight for enterprise, security, or embedded engineers whose review activity is entirely private. The module must output observability_gap — not low confidence — when pr_reviewer_count < 5._ 

|**Signal**|**Corpus Field**|**Strong**<br>**Threshold**|**Notes**|
|---|---|---|---|
|Substantive<br>review rate<br>(LLM)|collaboration_signa<br>ls.review_comment<br>_raw →<br>review_comment_d<br>epth_scores|≥0.40 of<br>reviews scored<br>as 'root-cause'<br>or<br>'architectural'<br>by LLM.|LLM classifies each review:<br>LGTM-only, surface-level<br>(style/format), root-cause<br>(identifies underlying issue),<br>architectural (questions design<br>decision). LGTM-only reviews<br>count against the ratio.|
|PR<br>author/review<br>er ratio|collaboration_signa<br>ls.pr_author_count,<br>pr_reviewer_count|reviewer_count<br>≥ 0.5 ×<br>author_count<br>over trailing 12<br>months.|Candidates who author PRs but<br>never review others: negative<br>signal at Senior+. Reviewer-only<br>candidates (rare): positive P3,<br>note absence of authorship<br>context.|
|Self-merge<br>rate|collaboration_signa<br>ls.self_merge_rate|< 0.20 for Mid-<br>level+. < 0.10<br>for Senior+.|High self-merge rate (>0.40) is a<br>red flag for Senior+. For<br>Intern/Junior: expected and not<br>penalised. Repos with single<br>contributor excluded from self-<br>merge calculation.|
|PR<br>description|collaboration_signa<br>ls.pr_description_ra|LLM score<br>≥65/100. Avg|LLM scoring rubric: does PR<br>explain WHY not just what (30pts),|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**Signal**|**Corpus Field**|**Strong**<br>**Threshold**|**Notes**|
|---|---|---|---|
|quality (LLM)|w → Wave 3 LLM<br>scoring|description ≥80<br>words.|are trade-offs mentioned (25pts),<br>is testing approach described<br>(20pts), does reviewer have<br>enough context (25pts)?|
|Cross-repo<br>engagement|collaboration_signa<br>ls.cross_repo_com<br>ment_count,<br>impact_signals.ext<br>ernal_oss_contribut<br>ion_count|≥10<br>substantive<br>cross-repo<br>comments OR<br>≥3 external<br>OSS<br>contributions in<br>trailing 12<br>months.|Very strong positive for Staff+.<br>Indicates candidate engages<br>beyond their own repos.|



**P4 — TECHNICAL DEPTH  ·  Can this engineer go deep when the problem genuinely requires it?** 

Corpus groups: B, D, F. LLM Wave 3 tags hard-problem commits. Stack Overflow is Tier 3 additive only. 

|**Signal**|**Corpus Field**|**Strong**<br>**Threshold**|**Notes**|
|---|---|---|---|
|Depth by<br>commit<br>volume|repositories[] +<br>commit_signals.per<br>_repo_author_stats<br>(Deep) or commit<br>API samples (Light)|Top 2<br>languages<br>have ≥200<br>commits over<br>≥18 months in<br>candidate-<br>owned code<br>(not forks).|Repo COUNT is explicitly not<br>used. 50 repos with 5 commits<br>each does not equal depth.<br>Commit VOLUME in candidate-<br>authored code is the measure.|
|Hard problem<br>evidence<br>(LLM)|commit_signals.me<br>ssage_quality_raw<br>+<br>pr_description_raw<br>→ LLM tagging|LLM tags ≥3<br>commits or<br>PRs as<br>addressing<br>genuinely hard<br>problems.|LLM prompt classification:<br>hard_problem (concurrency, fault<br>tolerance, data consistency,<br>performance at scale, distributed<br>systems), moderate_complexity<br>(standard design patterns), routine<br>(feature CRUD, UI changes),<br>unclear. 'Hard_problem'<br>classification requires justification<br>in LLM output.|
|Operational|engineering_practic|≥2 of 3 present|Also check for: retry logic (search|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**Signal**|**Corpus Field**|**Strong**<br>**Threshold**|**Notes**|
|---|---|---|---|
|depth markers|e_signals.observab<br>ility_markers_prese<br>nt|in ≥2 repos:<br>logging<br>framework,<br>metrics<br>instrumentation<br>, distributed<br>tracing setup.|for retry/backoff patterns in file<br>tree via keyword search on cloned<br>repos in Deep Mode), circuit<br>breaker patterns, timeout<br>handling.|
|Package<br>registry<br>adoption|impact_signals.np<br>m_packages[],<br>pypi_packages[],<br>cargo_packages[]|≥1 package<br>with ≥1,000<br>weekly<br>downloads OR<br>≥5 dependent<br>packages<br>using the<br>candidate's<br>package.|Extremely hard to fake — requires<br>real-world adoption. If present at<br>this threshold, it is one of the<br>strongest individual signals in the<br>entire system.|
|Stack<br>Overflow (Tier<br>3)|impact_signals.stac<br>koverflow_accepte<br>d_answer_rate,<br>stackoverflow_top_<br>tags|Accepted<br>answer rate<br>≥0.30 in a tag<br>matching<br>candidate's<br>primary<br>language.|Additive only. Zero SO activity: 'No<br>Stack Overflow activity observed<br>— neutral signal given community<br>migration to LLM tools since<br>2022.' Never used as a filter.|



## **P5 — OPERATIONAL MATURITY  ·  Can this engineer handle production reality?** 

Corpus groups: E, C. Deep Mode required for secret scanning and SAST. Secret leak is the only automatic hard flag in the entire system. 

|**Signal**|**Corpus Field**|**Threshold**|**Hard**<br>**Flag?**|**Notes**|
|---|---|---|---|---|
|Secret<br>manageme<br>nt —<br>gitleaks|engineering_prac<br>tice_signals.secr<br>et_leak_detected|False —<br>zero<br>detections.|YES<br>— any<br>detecti<br>on|P5 score capped at LOW.<br>Escalated to hiring manager<br>regardless of other scores. Cannot<br>be cleared by system — requires<br>interview or background check.<br>False positive check: file path<br>contains test/, fixture/, example/,<br>mock/ OR value matches<br>placeholder pattern → downgrade<br>to SOFT.|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**Signal**|**Corpus Field**|**Threshold**|**Hard**<br>**Flag?**|**Notes**|
|---|---|---|---|---|
|Observabilit<br>y tooling|engineering_prac<br>tice_signals.obse<br>rvability_markers<br>_present|≥2 of 3<br>markers in<br>≥2 repos.|No|Only flagged as observability_gap<br>if candidate claims production<br>engineering experience in CV or<br>bio. OSS repos without<br>observability: not penalised.|
|IaC<br>presence|engineering_prac<br>tice_signals.repo<br>s_with_iac|≥2 repos<br>with<br>Terraform,<br>Pulumi, or<br>CDK files<br>(not just<br>examples<br>— actual<br>resource<br>definitions)<br>.|No|Elevated signal for Platform/SRE<br>archetype only. For Backend:<br>positive additive, absence not<br>penalised. Detect via file tree: *.tf,<br>*.tfvars, Pulumi.yaml, cdk.json<br>files.|
|Feature flag<br>usage|engineering_prac<br>tice_signals.featu<br>re_flag_usage_d<br>etected|True —<br>any<br>detection.|No|Search for: LaunchDarkly SDK<br>import, Unleash client, custom flag<br>service patterns, environment-<br>conditional feature blocks with flag<br>variable names.|
|SAST<br>density<br>(semgrep)|engineering_prac<br>tice_signals.sast<br>_finding_density|< 0.5<br>critical/high<br>per 1,000<br>SLOC.|No|Deep Mode only. Soft negative if<br>>2.0. Note in brief with interview<br>probe. Security archetype: >1.0 is<br>a soft flag.|
|Dependabot<br>CVE<br>response|engineering_prac<br>tice_signals.avg_<br>dependabot_reso<br>lution_days|< 30 days<br>for<br>High/Critic<br>al CVEs in<br>candidate's<br>own<br>published<br>packages.|Soft for<br>Securit<br>y<br>archet<br>ype|Security archetype: unpatched<br>critical CVE >30 days in own<br>package → hard flag.|



```
# gitleaks flag handling — implement exactly
```

```
if corpus.engineering_practice_signals.secret_leak_detected:
    details = corpus.engineering_practice_signals.secret_leak_details
    # False positive mitigation
    hard_leaks = [d for d in details if not any([
        'test/' in d.file_path, 'fixture/' in d.file_path,
        'example/' in d.file_path, 'mock/' in d.file_path,
        is_placeholder_value(d),  # checks for 'your_api_key_here'
```

© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

```
patterns
    ])]
    if hard_leaks:
        result.flags.append(Flag(
            flag_id='SECRET_LEAK_HARD', severity='HARD',
            escalate_to_hiring_manager=True,
            clear_without_interview=False,  # system cannot clear this
            auto_reject=False,              # NEVER auto-reject
            interview_probe=generate_secret_probe(hard_leaks),
        ))
        result.confidence = 'low'  # cap P5
```

**P6 — AI LEVERAGE QUALITY  ·  Can this engineer effectively direct AI to produce quality outcomes?** 

Corpus groups: C, E. Requires LLM Wave 3 output. Produces both a confidence level AND a classification label stored in evidence_briefs.ai_leverage_classification. 

|**Classification**|**Detection Logic**|**Brief Framing**|
|---|---|---|
|ai_architect|Large AI-assisted commit (>500 lines, <2<br>hours) followed within 48h by ≥3 smaller<br>commits modifying same files. Style<br>consistency maintained. AI config files<br>present and customised (non-default<br>prompt rules detected by LLM).|Strong positive — engineer<br>directs AI rather than<br>accepting output.|
|ai_operator|High velocity periods (top quartile of<br>candidate's own history) with maintained<br>or improving CI pass rate and test<br>coverage. AI tool config files present. No<br>significant style discontinuities (LLM-<br>scored).|Positive — efficient AI use<br>without sacrificing quality.|
|ai_passenger|Velocity spikes (>3× candidate trailing<br>average) NOT followed by refinement<br>commits. Test coverage drops during<br>spikes. Abrupt style discontinuities with no<br>iterative follow-up. Commit messages<br>during spike are shallow or generic.|Risk flag — volume without<br>judgment. Surfaced as<br>interview probe. NEVER<br>automatic rejection.|
|traditional|No AI config files. Organic stylistic drift<br>across full git history (gradual, not abrupt<br>— consistent with human development<br>patterns). Commit velocity consistent<br>across all periods.|Neutral — not penalised.<br>Noted as context.|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**Classification**|**Detection Logic**|**Brief Framing**|
|---|---|---|
|disclosure_fla<br>g|LLM pattern confidence > 70/100. Style<br>discontinuity events in<br>anti_gaming_inputs. Syntactically perfect<br>code in style inconsistent with prior history.<br>AG5 flag also fires.|Interview required to clarify<br>authorship. NEVER<br>automatic rejection.|



## **LLM prompt for P6 / AG5 (Wave 3 batch)** 

```
system: |
  Analyse a software engineer's git history for AI leverage patterns.
  Input: commit message samples with timestamps and diff sizes,
  style discontinuity events (algorithmically detected), AI config files
present.
  Classify the engineer's AI usage. Be conservative — prefer
'traditional' or
  'ai_operator' over 'disclosure_flag' unless evidence is strong.
  Return ONLY JSON: no preamble, no explanation outside the JSON.
user: |
  Commit sample (chronological, last 6 months):
  {{commit_sample_json}}
  Style discontinuity events: {{style_events_json}}
  AI config files detected: {{ai_config_files_present}}
  Respond with:
  {
    "classification": "ai_architect|ai_operator|ai_passenger|traditional|
disclosure_flag",
    "confidence_0_to_100": number,
    "reasoning": "string",
    "key_evidence": ["string"]
  }
```

**P7 — AUTHENTICITY CONFIDENCE  ·  Is the evidence trustworthy and the identity coherent?** 

P7 is an aggregator — it does not score independently. It aggregates results from the 6 anti-gaming modules (AG1–AG6) and the employment verification module (EV). Its confidence level reflects overall corpus trustworthiness. 

|**P7 Confidence**|**Condition**|
|---|---|
|strong|No anti-gaming flags. Employment verification ≥ Rung 2. No style<br>discontinuities. No code similarity hits.|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**P7 Confidence**|**Condition**|
|---|---|
|moderate|0–1 soft flags (burst/dormancy or commit inflation below hard<br>threshold). OR employment verification at Rung 1 only.|
|low|2+ soft flags OR 1 hard flag (laundering or credential leak). OR AG5<br>ai_pattern_confidence > 50 with no iterative refinement evidence.|
|insufficient_data<br>(profile-level gate)|≥4 of 7 primitives return observability_gap. Output: 'This profile pattern<br>is consistent with enterprise or regulated-industry contexts. Proceed<br>directly to technical interview.'|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

## **4. Anti-Gaming Detection Modules (AG1–AG6)** 

Six stateless modules. All run before primitive scorers (Waves 1–2). Each produces Flag objects aggregated into P7 and surfaced verbatim in Evidence Brief Section D. No flag causes automatic rejection. 

## **AG1 — Commit Inflation Detector** 

|**Parameter**|**Specification**|
|---|---|
|Module ID|ag1_commit_inflation|
|Corpus fields|commit_signals.commit_size_histogram, sub_5_line_commit_ratio,<br>p25_commit_size_lines|
|Pre-filter|Remove from histogram before computation: merge commits (parents<br>> 1), doc-only commits (all files end in .md/.txt/.rst/.adoc), bot commits<br>(email contains [bot] or noreply), config-only repos (all files are dotfiles<br>or package.json-only).|
|Hard threshold|sub_5_line_ratio > 0.30 AND p25_commit_size_lines < 3 → SOFT<br>flag (note: AG flags are never HARD except AG6 credential leak and<br>AG4 laundering confirmed by Copyleaks).|
|Soft note|sub_5_line_ratio 0.15–0.30 → noted as context in brief with no flag.<br>No interview probe generated.|
|Flag output|Flag type: SOFT. P7 confidence noted. P1 and P4 noted as affected.<br>Interview probe: 'I noticed your commit history has a high proportion of<br>very small commits — can you walk me through your typical commit<br>workflow? Do you use interactive rebase or squash before pushing?'<br>— does not reveal the detection threshold.|
|False positive note|Small commits are normal in certain workflows (TDD red/green cycles,<br>atomic commits). The interview probe allows the candidate to explain<br>this naturally.|



## **AG2 — Fork Dump Detector** 

|**Parameter**|**Specification**|
|---|---|
|Module ID|ag2_fork_dump|
|Corpus fields|repositories[] — is_fork field + per_repo_author_stats (Deep) or|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**Parameter**|**Specification**|
|---|---|
||commit API sample (Light)|
|Algorithm|For each repo where is_fork=true: Deep Mode — use gitinspector<br>per_repo_author_stats: if candidate authorship_pct < 0.01, classify as<br>unmodified_fork. Light Mode — sample last 5 commits via REST,<br>check if any commit author email matches candidate's known emails.<br>If no match: unmodified_fork. Compute ratio: unmodified_forks /<br>total_public_repos.|
|Hard threshold|ratio > 0.50 → repo inventory adjusted. Unmodified forks excluded<br>from all language analysis and repo counts in brief.|
|Interview probe|Generated only if ratio > 0.70: 'I see you have a large number of<br>forked repositories — can you tell me which of these you've actively<br>contributed to versus which you forked for reference?' Below 0.70: no<br>probe, just inventory adjustment with note.|
|Brief language|'X of Y public repositories are unmodified forks and have been<br>excluded from technical analysis. This is common and carries no<br>negative signal on its own.'|



## **AG3 — Burst / Dormancy Fingerprinter** 

|**Parameter**|**Specification**|
|---|---|
|Module ID|ag3_burst_dormancy|
|Corpus fields|anti_gaming_inputs.burst_dormancy_ratio,<br>burst_triggered_at_evaluation,<br>commit_signals.commit_frequency_by_month|
|Algorithm|trailing_12m_weekly_avg = contributions in weeks 5–56 from today /<br>52 (excludes last 30 days, avoiding recency bias).<br>last_30d_weekly_avg = contributions in last 30 days / 4.3.<br>burst_dormancy_ratio = last_30d_weekly_avg /<br>trailing_12m_weekly_avg. burst_triggered_at_evaluation = True if the<br>burst started within 14 days of when the analysis was triggered.|
|Hard threshold|burst_dormancy_ratio > 5.0 AND burst_triggered_at_evaluation =<br>True → SOFT flag.|
|Soft note|burst_dormancy_ratio > 5.0 AND burst_triggered_at_evaluation =<br>False → noted in brief as context only. No flag, no probe.|
|Flag output|SOFT flag. Interview probe: 'Your GitHub activity shows a significant|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**Parameter**|**Specification**|
|---|---|
||spike in the last few weeks — can you tell me what you've been<br>working on? Is this a new project or ongoing work?' Does not reveal<br>the 5× threshold or the evaluation trigger detection.|
|Brief note|'Contribution activity spike detected in the 30 days prior to this<br>evaluation. May reflect genuine project work or profile optimisation —<br>verify timeline in interview.'|



## **AG4 — Repository Laundering Detector** 

|**Parameter**|**Specification**|
|---|---|
|Module ID|ag4_repo_laundering|
|Trigger condition|Runs only if: AG1 fires, OR AG3 fires, OR any repo has laundering<br>characteristics (pushed within 60 days, >1000 commits, single author,<br>zero stars, topics contain 'portfolio' or 'showcase').|
|Stage 1 — GitHub<br>Code Search|For each triggered repo: select 3 representative files (>50 lines, not<br>config/README). Query: GET /search/code?q={file_hash}<br>+NOT+repo:{candidate}/{repo}. If >40% of file signature queries return<br>hits from other repos → append to code_search_flags with<br>similarity_ratio and matched_repos. Rate: 1 request per 2 seconds,<br>max 30/min.|
|Stage 2 —<br>Copyleaks<br>(conditional)|If code_search_flags non-empty: submit flagged repos to Copyleaks<br>Code API. POST https://api.copyleaks.com/v3/education/submit/file.<br>Wait for scan result (async callback, typically <60 seconds).<br>Copyleaks must CONFIRM >40% similarity before HARD flag is<br>issued. Without Copyleaks confirmation: SOFT flag only.|
|Hard threshold|Copyleaks confirmed similarity >40% AND repo presented as original<br>work (pinned, featured, or described as original in bio/README).|
|Hard flag output|P7 confidence set to LOW. Interview probe: 'I'd like to discuss [repo<br>name] — can you walk me through the origin of this code and what<br>your specific contributions were?' Does not reveal detection<br>mechanism.|
|Light Mode note|In Light Mode: Copyleaks is not called even if code_search_flags fires.<br>Brief notes: 'Code similarity check triggered for [repo] — secondary<br>verification requires Deep Mode analysis.'|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

## **AG5 — AI-Generation Disclosure Gap Detector** 

AG5 reads P6 module output — it does not make an independent LLM call. Its sole function is to produce a Flag object when P6 classification is 'disclosure_flag'. 

|**Parameter**|**Specification**|
|---|---|
|Module ID|ag5_ai_generation_gap|
|Input|P6 ModuleResult|
|Trigger|P6 classification === 'disclosure_flag'|
|Flag type|SOFT. NEVER HARD. NOT grounds for rejection.|
|Interview probe|'I'd like to understand your development workflow — do you use AI<br>coding tools as part of your process? Can you walk me through how<br>you typically use them and how you validate the output?' No<br>accusation implied.|
|Mandatory brief<br>note|'AI-assisted development patterns detected inconsistent with the<br>candidate's historical coding style. Interview clarification required —<br>not evidence of fraud. Many engineers use AI tools extensively for<br>legitimate productivity gains.'|



## **AG6 — Credential Leak Detector (Deep Mode Only)** 

|**Parameter**|**Specification**|
|---|---|
|Module ID|ag6_credential_leak|
|Input|engineering_practice_signals.secret_leak_detected,<br>secret_leak_details[]|
|Light Mode|Not available. P7 notes: 'Secret scanning requires Deep Mode<br>analysis — credential leak history cannot be assessed from public<br>signals.'|
|Hard flag trigger|secret_leak_detected = True after false positive filter. False positive<br>filter: file path contains test/, fixture/, example/, mock/ OR value<br>matches placeholder regex (e.g. 'YOUR_.*_HERE', 'xxx+',<br>'placeholder').|
|Hard flag output|Type: HARD. Severity: CRITICAL. Fields in Flag: repo, file_path,<br>secret_type (e.g. 'AWS Access Key'), commit_sha, is_revoked.<br>NEVER include the actual secret value in any output or log.|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**Parameter**|**Specification**|
|---|---|
||escalate_to_hiring_manager: true. clear_without_interview: false.|
|Soft flag (false<br>positive)|Path suggests test fixture: SOFT flag. Note: 'Potential credential<br>exposure detected in what appears to be a test fixture at [path] —<br>verify in interview that this is intentionally non-functional.'|
|Interview probe|'I noticed a credential was committed to your repository [repo name].<br>Can you walk me through what happened and how you handled the<br>remediation?' — direct but non-accusatory.|



## **EV — Employment Verification Module** 

|**Rung**|**Mechanism**|**Algorithm**|**Output Language**|
|---|---|---|---|
|Rung 0|No signal|No match on email<br>domain OR org<br>membership. Output<br>immediately.|'Rung 0 — No verifiable signal<br>for claimed role at [Employer].<br>System limitation. Probe: Can<br>you describe your engineering<br>environment at [Employer] —<br>what version control system did<br>you use?'|
|Rung 1 —<br>Email<br>domain|Commit email<br>matches<br>employer<br>domain|Extract all unique<br>domains from<br>commit_signals commit<br>author emails. Fuzzy-<br>match against<br>company_claim: 'Acme<br>Corp' → try acme.com,<br>acmecorp.com, acme.io,<br>getacme.com. Match<br>confidence > 0.7<br>required. Score: 1.0 for<br>exact domain match, 0.7<br>for plausible variant.|'Rung 1 — Email domain match<br>confirmed (@employer.com<br>commits present). Weak signal<br>— does not verify scope or<br>role.'|
|Rung 2 —<br>Org<br>membershi<br>p (Deep)|GitHub org<br>membership<br>API|For each employer in<br>company_claim: resolve<br>to GitHub org slug (via<br>GET /orgs/{slug}). Check<br>identity.github_org_mem<br>berships for slug match.|'Rung 2 — GitHub org<br>membership confirmed:<br>candidate has an active seat in<br>[Employer]'s GitHub<br>organisation.'|
|Rung 3 —<br>Contributio<br>n|Temporal<br>analysis of org<br>repo|For the GitHub org<br>(Rung 2 confirmed):<br>fetch commit timestamps|'Rung 3 — Contribution<br>fingerprint confirmed: active<br>engineering contributions|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**Rung**|**Mechanism**|**Algorithm**|**Output Language**|
|---|---|---|---|
|fingerprint<br>(Deep)|contributions|in org repos authored by<br>candidate email. Check if<br>commit activity overlaps<br>with stated employment<br>start_date and end_date<br>(allow 30-day grace<br>period on each end).<br>Overlap ratio:<br>overlap_months /<br>tenure_months. Rung 3<br>granted if overlap_ratio ≥<br>0.70.|detected in [Employer] org<br>repositories during stated<br>employment period [date<br>range].'|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

## **5. Core Product Features — Implementation Specification** 

## **5.1  LIGHT MODE ANALYSIS  ·  Public-signal analysis < 3 minutes, zero candidate action** 

|**Sub-Feature**|**Implementation Detail**|
|---|---|
|Username<br>resolution &<br>validation|Before enqueueing: GET /users/{login}. If 404 → reject, error: 'GitHub<br>user not found', no quota consumed. If type=Organization → reject:<br>'This is an organisation account, not a personal profile.' If<br>account_age_days < 7 → flag in corpus, note in P7 brief: 'Account<br>created within 7 days — profile history is minimal.' If login contains<br>special characters or exceeds 39 chars → reject with validation error<br>before any API call.|
|Repo prioritisation<br>(>100 repos)|quality_score = (stars + forks + commit_count) × recency_weight.<br>Recency weights: pushed < 12mo = 1.0, 12–24mo = 0.7, 24–48mo =<br>0.4, >48mo = 0.1. Select top 50 for signal collection. All repos included<br>in language summary display. Heuristic disclosed in brief footer<br>verbatim: 'Analysis prioritised the top 50 repositories by activity score.<br>[N] repositories were not analysed.'|
|Language<br>attribution|Use GitHub Linguist via REST languages endpoint per repo (GET<br>/repos/{owner}/{repo}/languages — returns bytes per language). This<br>matches GitHub.com display. Exclude vendor, generated, and<br>documentation languages (same exclusion list as GitHub Linguist).<br>Aggregate across top 50 repos. Sort by bytes. Present top 5<br>languages with commit volume cross-reference.|
|Commit histogram<br>construction|Fetch 100 most recent commits per top-10 repos (REST: GET<br>/repos/{owner}/{repo}/commits?per_page=100). For each commit:<br>fetch stats via GET /repos/{owner}/{repo}/commits/{sha} (additions +<br>deletions). Pre-filter: skip if parents.length > 1 (merge commit), skip if<br>all files end in doc extensions, skip if author.email contains [bot] or<br>noreply. Build histogram of (additions + deletions) values. Compute<br>p25, median, sub_5_line_ratio.|
|Commit message<br>quality sampling|Take the most recent 100 non-merge commits across top 10 repos.<br>Extract subject line and body (first 500 chars). Batch into Wave 3 LLM<br>call with max 4,096 tokens total input. LLM scores each 0–100. Store<br>scores in commit_signals.message_quality_scores.|
|Work-hour<br>distribution<br>(informational)|Parse commit author timestamps for top-10 repos. Convert to UTC.<br>Bucket by hour (0–23). Store as work_hour_distribution Record.<br>Displayed in Section C brief as work pattern context. NOT used in any<br>scoring. NOT used to infer time zone or work habits. Label in brief:<br>'Commit time distribution (UTC) — informational only.'|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**Sub-Feature**|**Implementation Detail**|
|---|---|
|CI pass rate<br>collection|For repos where repos_with_ci_config > 0: fetch last 50 GitHub<br>Actions runs per repo (GET /repos/{owner}/{repo}/actions/runs?<br>per_page=50). Group by quarter (YYYY-Q). Compute: pass_count /<br>total_count per quarter. Store in ci_pass_rate_trajectory. Exclude runs<br>with status=cancelled (not informative of quality).|
|Circuit breaker|Threshold: X-RateLimit-Remaining < 500 on any REST response OR<br>ratelimitStatus.remaining < 500 from GraphQL. On trigger: snapshot<br>corpus to Redis with 2-hour TTL, set collection_mode to 'light_partial',<br>record groups_present, emit CIRCUIT_BREAK job event, set job<br>status to pending_resume. Schedule resume job for X-RateLimit-<br>Reset + 30 seconds. On resume: fetch incomplete groups only, merge<br>into corpus, set collection_mode to 'light'. Partial briefs: brief_md<br>header includes PARTIAL watermark, billing_units = 0.5.|



**5.2  DEEP MODE ANALYSIS  ·  Private + public analysis, candidate consent, 8–15 min async** 

|**Sub-Feature**|**Implementation Detail**|
|---|---|
|Evaluation link<br>generation|POST /api/v1/analyses/deep/request. Token:<br>crypto.randomBytes(32).toString('base64url') — 43-char URL-safe<br>string. URL: https://app.gitintel.io/evaluate/{token}. Expiry: 7 days from<br>creation. One-time-use after installation — token becomes invalid for<br>new installations once an analysis has been triggered. Employer can<br>revoke via PATCH /api/v1/evaluation-links/{id} with status: revoked —<br>immediately invalidates the link without revealing analysis results.|
|Candidate consent<br>page|Must display before any GitHub OAuth redirect: (1) requesting<br>company name and logo, (2) exact GitHub permission scopes being<br>requested with plain-language descriptions, (3) checkbox list of repos<br>that will be accessed (candidate can deselect). Deselected repos<br>stored in evaluation_links.consent_scope_repos as exclusion list.<br>Consent timestamp and IP logged for GDPR compliance. Page must<br>be inaccessible after link expiry or revocation — return 410 Gone with<br>generic message.|
|GitHub App<br>installation|Redirect to https://github.com/apps/{app_slug}/installations/new?<br>state={token}. On OAuth callback: exchange code for user access<br>token (temporary — used only to get installation_id, not stored).<br>GET /user/installations to retrieve installation_id. Store installation_id<br>in evaluation_links. Generate installation access token: POST<br>/app/installations/{id}/access_tokens using JWT signed with RS256<br>app private key. Store encrypted (AES-256-GCM with per-record IV) in<br>evaluation_links.installation_access_token. Enqueue DeepJob<br>immediately.|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**Sub-Feature**|**Implementation Detail**|
|---|---|
|Installation token<br>refresh|Deep Mode analyses take up to 15 minutes. Installation tokens expire<br>after 1 hour. At 50-minute mark (detected by job runtime tracker):<br>generate new installation access token, update encrypted value in DB,<br>update environment variable for active clone workers (via shared<br>Redis key workers:{job_id}:token). Clone operations already started<br>use original token embedded in clone URL — no mid-clone refresh<br>needed. If refresh fails: log error, continue with remaining analysis<br>time, flag token expiry risk in collection_errors.|
|Clone worker fleet|4 Docker containers per Deep Mode analysis. Each container: network<br>namespace with egress only to github.com:443 (enforced via iptables<br>rules in container entrypoint), 50GB tmpfs mount at /workspace (no<br>persistent disk), 4 vCPU + 8GB RAM limit. Clone command: git clone<br>--filter=blob:none --no-checkout {https_url_with_token}<br>/workspace/{repo_name} then git fetch --unshallow. Worker picks up<br>~8 repos sequentially. Clone timeout: 5 minutes per repo (SIGTERM<br>after 4min50s, SIGKILL after 5min). On timeout or network error: skip<br>repo, append to collection_errors, continue. No retry on clone failure<br>— analysis proceeds with remaining repos.|
|Tool execution per<br>repo|Run in this order: (1) scc, tokei, gitinspector all in parallel (fast). (2)<br>gitleaks and semgrep sequentially after (2). (3) actionlint if<br>.github/workflows exists. Each tool: JSON output to<br>/workspace/{repo_name}/tool_output/{tool}.json. Tool timeout: 3<br>minutes each. Parse JSON output immediately after tool completes.<br>On tool timeout: log to collection_errors, skip tool output for this repo,<br>do not fail entire repo analysis.|
|Private corpus<br>delta merge|On DeepJob start: check Redis for existing Light corpus for this<br>username (corpus:{username}:light). If exists and < 7 days old: copy<br>into new Deep corpus. Do not re-fetch public repos, Group D, or<br>Group F data already present. Only fetch: private repos (D1), org<br>repos (D2), clone tool outputs (D4–D10), org membership for EV<br>(D11). Mark corpus.collection_mode = 'deep'. This reduces API calls<br>by ~40% and latency by ~3 minutes.|
|Cleanup guarantee|Cleanup runs in Python try/finally block — executes even on analysis<br>failure. Steps: (1) shutil.rmtree('/workspace/{job_id}',<br>ignore_errors=True) for each clone dir. (2) DELETE /installation/token<br>to revoke token (non-fatal if fails — tokens expire in 1 hour). (3)<br>Update evaluation_link status to 'complete' or 'failed'. (4) Emit<br>cleanup_complete event. Watchdog job (runs every 15 minutes):<br>scans /workspace for any directory older than 30 minutes → deletes<br>immediately. Handles worker crash scenarios.|



**5.3  CV VERIFIER  ·  LLM claim extraction + GitHub cross-check on existing corpus** 

© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**Sub-Feature**|**Implementation Detail**|
|---|---|
|CV ingestion|Accepts: (1) cv_text — raw text (paste or ATS-structured). (2) cv_file<br>— PDF or DOCX uploaded to S3 with 24-hour TTL key<br>cvs/{tenant_id}/{uuid}. PDF: extract text with pdfminer.six (pip install<br>pdfminer.six). DOCX: extract with python-docx. Clean extracted text:<br>detect and remove repeating header/footer patterns (same string<br>appearing on 3+ pages), remove page numbers (standalone digit<br>lines). No raw CV text persisted after claim extraction — only the<br>structured claims JSON is stored.|
|Claim extraction<br>LLM call|System: 'Extract all verifiable claims from this CV as a JSON array.<br>For each claim: claim_type (employment|technology_skill|education|<br>certification|open_source_contribution), claim_text (verbatim),<br>company_or_institution (string), start_date (YYYY-MM or YYYY),<br>end_date (YYYY-MM, YYYY, or null if current),<br>technologies_mentioned (string[]), seniority_claim (string or null).<br>Return ONLY the JSON array — no preamble, no markdown fences.'<br>Temperature: 0. Model: claude-sonnet-4-20250514. Max tokens:<br>2000.|
|Cross-check<br>engine —<br>employment claims|For each employment claim: run employment verification module with<br>company = claim.company_or_institution, date_range = {start:<br>claim.start_date, end: claim.end_date}. Output: confirmed (Rung ≥ 2),<br>partially_confirmed (Rung 1), unconfirmed (Rung 0). Rung 3<br>(contribution fingerprint) provides the strongest employment cross-<br>check.|
|Cross-check<br>engine —<br>technology claims|For each technology_skill claim: check commit_signals for actual<br>commit volume in stated technology. Query: sum of commits in repos<br>where primary_language matches technology OR language appears<br>in repo.languages with >10% byte share. Time-bound to stated<br>employment period (±6 months). Thresholds: ≥50 commits →<br>evidenced. 1–49 commits → partial. 0 commits → no_evidence (not<br>contradicted — absence of public evidence is not proof of absence of<br>skill).|
|Contradiction<br>detection|Mark 'contradicted' only when positive evidence of falsehood exists —<br>never from absence of evidence alone. Contradiction triggers: (1)<br>Employment dates contradict GitHub contribution fingerprint — active<br>commits at conflicting org during stated tenure at claimed employer.<br>(2) Technology claim at a specific company contradicts zero commits<br>in that language during tenure AND candidate has high commit<br>volume in other languages (ruling out a private-work explanation).<br>Level: must be high-confidence — err toward 'unconfirmed' over<br>'contradicted' when uncertain.|
|Discrepancy report<br>storage|Stored in evidence_briefs.tech_reality_vs_cv as JSONB. Each claim<br>entry: { claim_text, claim_type, status: confirmed|partially_confirmed|<br>unconfirmed|contradicted, evidence: Evidence[], interview_probe:<br>string|null }. 'Contradicted' claims always include: note that|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**Sub-Feature**|**Implementation Detail**|
|---|---|
||contradiction does not assume fraud, specific evidence cited, direct<br>interview probe. 'Unconfirmed' claims always include: interview probe<br>to verify. 'Confirmed' claims: brief positive note, no probe needed.|
|Corpus interaction|If corpus exists for username within 7 days: reuse. Run CV Verifier as<br>an additional analysis module on existing corpus — no re-collection. If<br>no corpus: trigger Light Mode collection first (blocking), then run CV<br>Verifier. Entire flow is transparent to employer — they see one<br>combined result. CV Verifier does NOT require Deep Mode — Light<br>Mode corpus is sufficient for claim cross-check, though Rung 2/3<br>employment verification is only available with Deep Mode corpus.|
|||
|**5.4  BATCH PROCESSING  ·  CSV upload of up to 500 candidates, async ranked output**||



|**Sub-Feature**|**Implementation Detail**|
|---|---|
|CSV parsing &<br>validation|Required column: github_username. Optional: candidate_name,<br>email, ats_candidate_id, role_archetype, target_seniority. Row limit:<br>500 (reject with 400 if exceeded). Validation before enqueueing: (1)<br>github_username non-empty and matches /^[a-zA-Z0-9]([a-zA-Z0-9-]<br>{0,37}[a-zA-Z0-9])?$/, (2) role_archetype if present must match enum,<br>(3) target_seniority if present must match enum. Return full validation<br>error list (all rows, not fail-fast) before any job is enqueued. Employer<br>fixes CSV and re-uploads.|
|Cache hit<br>optimisation|Before spawning child jobs: for each username, check Redis EXISTS<br>corpus:{username}:light OR corpus:{username}:deep. If exists and<br>TTL > 0: mark row as cache_hit = true, skip quota consumption, use<br>cached corpus directly. Report in batch summary: 'X of Y candidates<br>used cached analyses — quota consumed: Z analyses.' This can<br>dramatically reduce overage costs for repeat screening of the same<br>applicant pool.|
|Batch coordinator<br>job|Queue: jobs:batch. Coordinator reads validated CSV. For each row: if<br>cache_hit → skip to analysis wave, else → enqueue individual<br>jobs:light child job with per-row AnalysisConfig. Coordinator tracks:<br>total_count, cache_hit_count, queued_count, complete_count,<br>failed_count. Reports progress via WebSocket every 30 seconds. On<br>all_complete: aggregate results, write batch summary to Postgres,<br>notify employer via email + WebSocket.|
|Rate limit pool<br>sharing|Batch child jobs share the platform rate limit pool (5,000 REST req/hr)<br>with individual Light Mode jobs. No priority reservation for batch. A<br>batch of 500 with no cache hits spreads across multiple rate limit<br>windows (~3 hours per window = ~12–18 hours total for 500<br>candidates). This is disclosed to employer in a confirmation modal|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**Sub-Feature**|**Implementation Detail**|
|---|---|
||before the batch is started: 'Estimated completion: [calculated hours].<br>You'll be notified when complete.'|
|Ranked output<br>dashboard|Sort key: primary = flag_count ASC (cleanest profiles first), secondary<br>= strong_primitive_count DESC (most evidence), tertiary =<br>p7_confidence DESC. This is a display sort, not a composite score.<br>Columns in dashboard: github_username, profile_archetype,<br>ai_leverage_classification, ev_rung, flag_count (badges: green 0,<br>amber 1, red 2+), top_3_primitive_confidence labels. Each row links to<br>full Evidence Brief. Re-sortable by any column. Filterable by<br>archetype, flag status, EV rung.|
|Partial batch<br>completion|If ≥1 candidate job reaches DLQ (3 retries exhausted): batch marked<br>PARTIAL_COMPLETE. Employer notified with list of failed usernames<br>and reason codes. Failed candidates: not billed. Employer can re-run<br>failed candidates individually at any time. Completed candidates'<br>results available immediately — not held pending failed ones.|
|||
|**5.5  INTERVIEW INTELLIGENCE  ·  LLM-generated questions from actual code decisions**||



|**Sub-Feature**|**Implementation Detail**|
|---|---|
|Source material<br>selection|Select source material in priority order: (1) PR descriptions where<br>candidate explains a design decision (LLM-tagged in Wave 3 as<br>'design_decision_present'). (2) Commit messages referencing a trade-<br>off or alternative considered. (3) Gaps between CV claims and<br>evidenced capabilities (requires CV Verifier run). (4) Anti-gaming flags<br>requiring non-accusatory clarification. (5) Deep complexity signals<br>from scc (repos with high cyclomatic complexity where candidate is<br>primary author). Minimum 2 source materials required — if fewer,<br>Section E is omitted with note: 'Insufficient evidence for targeted<br>questions — use standard technical interview format.'|
|Question<br>generation LLM<br>call|Separate call from Wave 3 batch — runs in Wave 4. System:<br>'Generate technical interview questions grounded in specific evidence<br>from this engineer's GitHub profile. Questions must: (1) cite specific<br>observable evidence, (2) allow candidate to confirm OR clarify (never<br>accusatory), (3) probe depth beyond surface level, (4) be answerable<br>by a strong engineer in 5–10 minutes. For flag clarifications: do NOT<br>reveal the detection mechanism. Return JSON array.' Max questions:<br>5. Min: 3 if source material available.|
|Question types (4<br>types)|DESIGN_DECISION: asks candidate to explain a specific architectural<br>choice observed in their code — e.g. 'In your X project I can see you<br>chose approach Y. Can you walk me through that decision and what<br>alternatives you considered?' GAP_PROBE: explores discrepancy|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**Sub-Feature**|**Implementation Detail**|
|---|---|
||between CV claim and evidenced signals. DEPTH_PROBE: asks<br>candidate to go deeper on a technology they demonstrably use.<br>FLAG_CLARIFICATION: probes an anti-gaming flag without revealing<br>the detection mechanism — e.g. 'Can you walk me through your<br>typical commit workflow?' for AG1.|
|Question ordering|DESIGN_DECISION questions first (most conversational, builds<br>rapport). DEPTH_PROBE second. GAP_PROBE third (more direct —<br>requires some rapport). FLAG_CLARIFICATION last (most sensitive<br>— only include if flag fired). Employer sees all questions +<br>source_evidence + what_a_strong_answer_includes +<br>red_flag_indicators per question.|
|Role & Stack<br>Match (Section F)|Activated when config.jd_text provided. LLM extracts from JD:<br>required_technologies[], required_experience_years, role_type,<br>seniority_level, key_responsibilities[]. Cross-reference against<br>candidate's evidenced stack: commit volume > 50 per technology in<br>last 3 years counts as 'matched'. 1–49 commits: 'partial'. 0 commits:<br>'gap'. Gap items added to interview probe list for Section F. One<br>sentence per gap: 'Candidate has no evidenced [technology] usage —<br>probe in interview or treat as a learning curve item if the role allows.'|
|Light Mode<br>question quality<br>gate|In Light Mode: LLM scores each generated question for quality 0–100<br>(separate from the question content — meta-evaluation). Questions<br>with score < 60 are dropped. If fewer than 2 questions pass the quality<br>gate: Section E is omitted with note. Deep Mode: quality gate<br>threshold lowered to 50 (more source material available → more<br>reliable questions even at lower individual scores).|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

## **6. Evidence Brief Assembly** 

## **6.1 Section Assembly Specification** 

|**Section**|**Assembly Logic**|**LLM Call?**|**Always Present?**|
|---|---|---|---|
|A —<br>Profile in<br>90<br>Seconds|Profile archetype assigned by rule<br>engine: if P4 strong + P3 weak →<br>'Specialist'. If P3 strong + P4<br>moderate → 'Production Engineer'. If<br>external_oss_contribution_count > 5<br>+ P3 strong → 'OSS Contributor'. If<br>repos_with_iac ≥ 2 + P5 strong →<br>'Ops-Focused'. If top-3 language<br>diversity + P4 strong → 'Generalist<br>Builder'. Default: 'Generalist Builder'.<br>Top 3 capabilities: 3 ModuleResults<br>with highest evidence count + strong<br>or moderate confidence.<br>Employment rung, AI leverage<br>classification, analysis mode pulled<br>directly from module results.|Yes — 2-<br>sentence<br>narrative<br>summary of<br>archetype.<br>No scoring.|Always.|
|B —<br>Tech<br>Reality<br>vs. CV<br>Claims|Languages: compute actual commit<br>volume per language from<br>commit_signals (last 3 years).<br>Compare against CV-stated<br>languages (from CV Verifier claims<br>or bio text). Flag: any language<br>stated in CV with zero evidenced<br>commits. Frameworks: detected from<br>file tree (package.json<br>dependencies, requirements.txt,<br>go.mod, Cargo.toml, build.gradle).<br>Cross-reference against CV claims.|Yes — one<br>sentence per<br>significant<br>discrepancy,<br>neutral<br>language.|Always. Depth<br>increases when CV<br>Verifier has been run.|
|C —<br>Work<br>Pattern<br>Intelligen<br>ce|Shipping velocity: if<br>avg_time_to_merge_hours available<br>→ display as 'median X hours from<br>PR open to merge'. Quality<br>discipline: ci_pass_rate_trajectory<br>trend line<br>(improving/stable/declining).<br>Collaboration style: from P3 signals.<br>AI Leverage classification + 2<br>supporting evidence items.<br>Communication quality: median<br>pr_description LLM score.|Yes — 2–3<br>paragraph<br>narrative.<br>Structured<br>data is<br>deterministic;<br>LLM writes<br>interpretation<br>only.|Always.|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**Section**|**Assembly Logic**|**LLM Call?**|**Always Present?**|
|---|---|---|---|
|D — Red<br>Flags &<br>Verificati<br>on Gaps|Iterate all Flag objects from all<br>modules. For each flag: display<br>flag_type (HARD/SOFT badge),<br>specific evidence that triggered it,<br>confidence level (with false positive<br>likelihood note), recommended<br>interview question, resolution path<br>(system-clearable or interview-only).<br>Zero flags: display 'No authenticity<br>flags detected in this analysis' —<br>never leave this section empty or<br>silent.|No — purely<br>deterministic<br>from Flag<br>objects.|Always.|
|E —<br>Interview<br>Intelligen<br>ce|Questions from Interview Intelligence<br>module (Section 5.5). Ordered:<br>DESIGN_DECISION →<br>DEPTH_PROBE → GAP_PROBE →<br>FLAG_CLARIFICATION. Each<br>question: question_text,<br>source_evidence (cited corpus field),<br>what_a_strong_answer_includes,<br>red_flag_indicators.|Yes —<br>question<br>generation<br>(Wave 4 LLM<br>call).<br>Assembler<br>formats<br>output only.|Deep Mode: always if<br>source material<br>available. Light Mode: if<br>quality gate passes.|
|F —<br>Role &<br>Stack<br>Match|Matched stack (evidenced), partial<br>stack (low commit volume), gap<br>stack (zero evidence). Gap items<br>become interview probe topics. One<br>sentence per gap item.|Yes — gap<br>interpretation<br>sentences<br>(part of<br>Wave 4<br>narrative<br>call).|Conditional: only when<br>jd_text provided at<br>analysis trigger.|
|G —<br>What<br>This<br>Evaluatio<br>n Cannot<br>Tell You|Fixed template items: problem-<br>solving under novel ambiguity, verbal<br>communication clarity, cultural fit,<br>motivation and growth trajectory,<br>performance under pressure.<br>Dynamic additions: every primitive<br>with observability_gap adds its<br>recommended interview probe here.|No — fixed<br>template +<br>deterministic<br>additions.|Always. Cannot be<br>omitted by any tenant<br>configuration —<br>enforced in assembler.|



## **6.2 Confidence Language Constants — Mandatory** 

These strings are implemented as constants in the assembler. String interpolation is permitted only for the bracketed placeholders shown. No synonyms or paraphrases are permitted. 

© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

## `CONFIDENCE_LANGUAGE: Record<string, string> = {` 

```
  strong:
```

```
    'Demonstrated across {n_repos} repositories and {n_months} months —
high confidence.',
```

```
  moderate:
```

```
    'Evidenced in limited context — probe in interview to confirm
depth.',
```

```
  low:
```

```
    'One instance detected — insufficient to score. Treat as unconfirmed
in hiring decision.',
```

```
  observability_gap:
```

```
    'No public evidence — likely private or enterprise context. Do not
penalise. ' +
```

```
    'Recommend: {interview_probe}',
```

```
  insufficient_data:
```

```
    'This profile cannot be assessed from available public signals. ' +
```

```
    'Do not use this report as a filter for this candidate. ' +
```

```
    'Proceed directly to technical interview using the generated
interview questions.',
```

```
}
```

```
PROFILE_LEVEL_GATE: string =
```

```
  'This profile pattern is consistent with enterprise or regulated-
industry engineering ' +
```

```
  'contexts where public evidence is structurally absent. ' +
```

```
  'This is correlated with — not anticorrelated with — seniority and
impact. ' +
```

```
  'Proceed to technical interview.'
```

```
// Gate fires when ≥4 of 7 primitives return observability_gap
```

```
// Must appear as a banner at the top of Section A when triggered
```

```
// PROHIBITED: assembler must raise AssertionError if this path is
reached
```

```
function compute_composite_score(): never {
```

```
  throw new Error(
```

```
    'Composite scores are prohibited. The Evidence Brief presents seven
independent ' +
```

```
    'assessments. See Section 1.2 of the Feature & Technical
Specification.'
```

```
  );
}
```

## **6.3 Brief Storage and Export** 

|**Format**|**Storage**|**Generation**<br>**Timing**|**Notes**|
|---|---|---|---|
|Markdown|TEXT column in|Synchronous|Primary format and source of|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**Format**|**Storage**|**Generation**<br>**Timing**|**Notes**|
|---|---|---|---|
|(brief_md)|evidence_briefs.<br>Written on pipeline<br>completion.|— assembled<br>at end of Wave<br>4.|truth for all other formats.<br>Rendered in dashboard via<br>marked.js.|
|JSON<br>(structured<br>JSONB)|JSONB columns:<br>primitive_scores,<br>red_flags,<br>interview_questions,<br>role_stack_match,<br>tech_reality_vs_cv.|Populated<br>simultaneously<br>with brief_md.|Used by API consumers and ATS<br>outbound webhook. Enables<br>programmatic processing without<br>parsing Markdown.|
|PDF<br>(brief_pdf_s3<br>_key)|Generated on first<br>GET<br>/api/v1/analyses/{id}/<br>brief/pdf request. S3<br>key:<br>briefs/{tenant_id}/{an<br>alysis_id}.pdf. TTL: 7<br>days. Subsequent<br>requests return<br>signed S3 URL (TTL:<br>1 hour).|On-demand.<br>Not proactively<br>generated.|Generated via headless Chrome<br>(Puppeteer): Markdown → HTML<br>→ PDF. Trial accounts: grey<br>diagonal watermark 'FREE<br>TRIAL — GITINTEL'. Enterprise<br>white-label: custom logo in<br>header.|
|ATS push<br>(JSON<br>summary)|Not stored. Delivered<br>to<br>outbound_webhook_<br>url on analysis<br>completion.|On analysis<br>completion if<br>auto_push_brie<br>f = true for the<br>ATS<br>integration.|Summary payload (not full brief).<br>Fields: github_username, mode,<br>status, profile_archetype,<br>ai_leverage_classification,<br>ev_rung, red_flag_count,<br>primitive_confidences map,<br>brief_url. Full brief accessible via<br>brief_url.|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

## **7. LLM Integration Design** 

## **7.1 What Is and Is Not Sent to the LLM** 

_SECURITY CONSTRAINT: Raw source code is NEVER sent to the LLM API. Only derived text artifacts are sent. This is both a privacy requirement (for private repos) and a practical constraint (code diffs exceed context windows). Implementers must enforce this as an allowlist, not a denylist — if a corpus field is not in the allowlist below, it does not get sent._ 

|**Sent to LLM**|**NOT sent to LLM**|
|---|---|
|Commit message subject + body text|Source code content or code diffs of any<br>kind|
|PR title + description text|File contents from cloned repos|
|README text (truncated to 2,000 chars)|Dependency lock files or build artifacts|
|Issue title + body text|Environment variables or configuration files|
|Style discontinuity metadata (timestamps +<br>diff sizes only, not content)|gitleaks finding values (sent as: type + file<br>path only, secret value never included)|
|AI config file names (not contents)|Copyleaks raw similarity data|
|CV claim extracted text|Raw CV file contents|



## **7.2 Wave 3 Batch LLM Call Structure** 

The Wave 3 call consolidates multiple analytical tasks into a single LLM request. The model returns a structured JSON object with named sections for each task. This reduces LLM latency from ~90 seconds (sequential calls) to ~25 seconds (single batch). 

```
// Wave 3 batch prompt structure
```

```
// Model: claude-sonnet-4-20250514 | Temperature: 0 | Max tokens: 3000
```

## `user: |` 

```
  Complete all of the following analysis tasks. Return a single JSON
object
```

```
  with one key per task. Return ONLY the JSON — no preamble, no markdown
fences.
```

© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

```
  TASK 1 — commit_quality:
```

```
  Score each commit message 0–100 on: imperative mood (25pts),
specificity (40pts),
```

```
  appropriate length (15pts), context provided (20pts).
  Input: {{commit_messages_json}}
  Return: { commit_quality: number[] }  // same order as input
```

```
  TASK 2 — pr_description_quality:
```

```
  Score each PR description 0–100: explains WHY not just what (30pts),
  trade-offs mentioned (25pts), testing described (20pts), reviewer
context (25pts).
```

```
  Input: {{pr_descriptions_json}}
  Return: { pr_description_quality: number[] }
```

```
  TASK 3 — review_depth:
```

```
  Classify each review comment: LGTM_only | surface | root_cause |
architectural.
```

```
  Input: {{review_comments_json}}
  Return: { review_depth: string[] }
```

```
  TASK 4 — hard_problem_detection:
```

```
  For each commit/PR, classify: hard_problem | moderate | routine |
unclear.
```

```
  hard_problem = addresses concurrency, fault tolerance, data
consistency,
```

```
  performance at scale, or distributed systems.
```

```
  Input: {{commit_pr_corpus_json}}
```

```
  Return: { hard_problem_detection: string[] }
```

```
  TASK 5 — ai_leverage_classification:
  {{see P6 prompt specification in Section 3.P6}}
```

```
  Return: { ai_leverage: { classification, confidence_0_to_100,
reasoning, key_evidence[] } }
```

## **7.3 LLM Error Handling** 

|**Error**|**Handling**|
|---|---|
|API timeout (> 30<br>seconds)|Retry once after 5-second delay. On second timeout: mark affected<br>analysis tasks as llm_timeout. Downgrade affected primitives to<br>observability_gap. Generate brief without LLM-dependent narrative<br>sections. Brief header note: 'Some narrative sections could not be<br>generated due to a temporary analysis service issue. Deterministic<br>scores are unaffected.'|
|Malformed JSON<br>response|Re-prompt once: 'Your previous response was not valid JSON. Return<br>ONLY the JSON object with no preamble, explanation, or markdown.'<br>If second response is also malformed: fallback to deterministic-only|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**Error**|**Handling**|
|---|---|
||scoring for affected modules. P6 classification defaults to 'traditional'<br>(conservative fallback).|
|Context window<br>exceeded|Progressive truncation: commit messages reduced from 100 to 50,<br>then 25. PR descriptions reduced from 20 to 10. Apply truncation until<br>request fits. Log truncation event to corpus.collection_errors. Note in<br>brief: 'Commit history analysis was based on a sample of [N] commits<br>due to volume.'|
|Rate limit (HTTP 529<br>or 529-equivalent)|Exponential backoff: 5s, 15s, 45s. After 3 retries: defer LLM-<br>dependent modules to retry queue (jobs:llm_retry, runs 10 minutes<br>later). Set analysis status to 'llm_pending'. Dashboard shows<br>'Finalising analysis...' — employer not alarmed.|
|Unexpected<br>classification value|If LLM returns an AI leverage classification not in the enum<br>(ai_architect|ai_operator|ai_passenger|traditional|disclosure_flag): log<br>and default to 'traditional'. Never surface an invalid classification to the<br>employer.|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

## **8. Complete Feature Hierarchy Reference** 

Master index mapping every feature to its parent product, analysis modules, corpus dependencies, and specification section. 

|**Core**<br>**Product**|**Feature**|**Sub-Feature**|**Module(s)**|**Corpus**<br>**Groups**|**Section**|
|---|---|---|---|---|---|
|Light<br>Mode|Public-signal<br>analysis|Username<br>resolution &<br>validation|—|—|5.1|
|Light<br>Mode|Public-signal<br>analysis|Repo prioritisation<br>heuristic (>100<br>repos)|—|B|5.1|
|Light<br>Mode|Public-signal<br>analysis|Language<br>attribution<br>(Linguist-<br>matching)|—|B|5.1|
|Light<br>Mode|Public-signal<br>analysis|Commit histogram<br>& size discipline|P1, AG1|C|5.1|
|Light<br>Mode|Public-signal<br>analysis|Commit message<br>quality scoring<br>(LLM)|P1, P3|C|5.1|
|Light<br>Mode|Public-signal<br>analysis|Work-hour<br>distribution<br>(informational<br>only)|—|C|5.1|
|Light<br>Mode|Public-signal<br>analysis|CI pass rate<br>trajectory|P1|E|5.1|
|Light<br>Mode|Public-signal<br>analysis|Circuit breaker &<br>partial corpus<br>handling|—|All|5.1|
|Light<br>Mode|Anti-gaming|Commit inflation<br>detector|AG1|C|4.AG1|
|Light<br>Mode|Anti-gaming|Fork dump<br>detector|AG2|B|4.AG2|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**Core**<br>**Product**|**Feature**|**Sub-Feature**|**Module(s)**|**Corpus**<br>**Groups**|**Section**|
|---|---|---|---|---|---|
|Light<br>Mode|Anti-gaming|Burst / dormancy<br>fingerprinter|AG3|C, G|4.AG3|
|Light<br>Mode|Anti-gaming|Repository<br>laundering (Code<br>Search — partial)|AG4|B, G|4.AG4|
|Light<br>Mode|Employment<br>verification|Rung 1 — email<br>domain match|EV|A, C|4.EV|
|Light<br>Mode|P1 —<br>Execution<br>Reliability|Commit cadence<br>consistency|P1|C|3.P1|
|Light<br>Mode|P1 —<br>Execution<br>Reliability|Commit size<br>discipline|P1 + AG1|C|3.P1|
|Light<br>Mode|P1 —<br>Execution<br>Reliability|CI pass rate<br>trajectory|P1|E|3.P1|
|Light<br>Mode|P1 —<br>Execution<br>Reliability|Semantic<br>versioning<br>discipline|P1|E|3.P1|
|Light<br>Mode|P2 —<br>Systems<br>Evolution|Refactor commit<br>evidence (LLM)|P2|C|3.P2|
|Light<br>Mode|P3 —<br>Collaboration<br>Leverage|Substantive<br>review rate (LLM)|P3|D|3.P3|
|Light<br>Mode|P3 —<br>Collaboration<br>Leverage|Self-merge rate|P3|D|3.P3|
|Light<br>Mode|P3 —<br>Collaboration<br>Leverage|PR description<br>quality (LLM)|P3|D|3.P3|
|Light<br>Mode|P3 —<br>Collaboration<br>Leverage|Cross-repo<br>engagement|P3|D, F|3.P3|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**Core**<br>**Product**|**Feature**|**Sub-Feature**|**Module(s)**|**Corpus**<br>**Groups**|**Section**|
|---|---|---|---|---|---|
|Light<br>Mode|P4 —<br>Technical<br>Depth|Depth by commit<br>volume (not repo<br>count)|P4|B, C|3.P4|
|Light<br>Mode|P4 —<br>Technical<br>Depth|Hard problem<br>evidence (LLM<br>tagging)|P4|C, D|3.P4|
|Light<br>Mode|P4 —<br>Technical<br>Depth|Operational depth<br>markers (file tree)|P4|E|3.P4|
|Light<br>Mode|P4 —<br>Technical<br>Depth|Package registry<br>adoption<br>(npm/PyPI/Cargo)|P4|F|3.P4|
|Light<br>Mode|P4 —<br>Technical<br>Depth|Stack Overflow<br>enrichment (Tier 3<br>additive)|P4|F|3.P4|
|Light<br>Mode|P5 —<br>Operational<br>Maturity|Observability<br>tooling (file tree<br>detection)|P5|E|3.P5|
|Light<br>Mode|P5 —<br>Operational<br>Maturity|IaC presence<br>(Terraform/Pulumi<br>/CDK)|P5|E|3.P5|
|Light<br>Mode|P5 —<br>Operational<br>Maturity|Feature flag<br>usage detection|P5|E|3.P5|
|Light<br>Mode|P5 —<br>Operational<br>Maturity|Dependabot CVE<br>response time|P5|E|3.P5|
|Light<br>Mode|P6 — AI<br>Leverage<br>Quality|AI config file<br>detection|P6|E|3.P6|
|Light<br>Mode|P6 — AI<br>Leverage<br>Quality|Velocity / quality<br>correlation|P6 + AG5|C, E|3.P6|
|Light<br>Mode|P6 — AI<br>Leverage|Style discontinuity<br>detection (LLM)|P6 + AG5|C, G|3.P6|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**Core**<br>**Product**|**Feature**|**Sub-Feature**|**Module(s)**|**Corpus**<br>**Groups**|**Section**|
|---|---|---|---|---|---|
||Quality|||||
|Light<br>Mode|P7 —<br>Authenticity<br>Confidence|AG1–AG4<br>aggregation + EV<br>Rung 1|P7|G, A|3.P7|
|Deep<br>Mode|Private repo<br>analysis|Clone worker fleet<br>(4 parallel<br>containers)|—|B (private)|5.2|
|Deep<br>Mode|Private repo<br>analysis|scc — complexity<br>& SLOC analysis|P1, P2|C, E|5.2|
|Deep<br>Mode|Private repo<br>analysis|tokei — test/code<br>ratio|P1|C|5.2|
|Deep<br>Mode|Private repo<br>analysis|gitinspector —<br>per-author<br>isolation|P1, P2, P4|C|5.2|
|Deep<br>Mode|Private repo<br>analysis|gitleaks — full<br>history secret<br>scanning|AG6, P5|E, G|4.AG6|
|Deep<br>Mode|Private repo<br>analysis|semgrep — SAST<br>pattern matching|P5|E|5.2|
|Deep<br>Mode|Private repo<br>analysis|actionlint — CI<br>workflow<br>validation|P1, P5|E|5.2|
|Deep<br>Mode|Anti-gaming|Copyleaks<br>laundering<br>confirmation (API)|AG4|G|4.AG4|
|Deep<br>Mode|Anti-gaming|Credential leak<br>hard flag (ag6)|AG6, P5|E|4.AG6|
|Deep<br>Mode|Employment<br>verification|Rung 2 — org<br>membership API|EV|A|4.EV|
|Deep<br>Mode|Employment<br>verification|Rung 3 —<br>contribution<br>fingerprint<br>analysis|EV|A, C|4.EV|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**Core**<br>**Product**|**Feature**|**Sub-Feature**|**Module(s)**|**Corpus**<br>**Groups**|**Section**|
|---|---|---|---|---|---|
|Deep<br>Mode|P2 —<br>Systems<br>Evolution|Complexity<br>trajectory (scc per<br>year)|P2|C|3.P2|
|Deep<br>Mode|P2 —<br>Systems<br>Evolution|Long-lived code<br>survival<br>(gitinspector)|P2|C|3.P2|
|Deep<br>Mode|P2 —<br>Systems<br>Evolution|Migration safety<br>patterns (LLM)|P2|C|3.P2|
|Deep<br>Mode|P5 —<br>Operational<br>Maturity|SAST finding<br>density (semgrep)|P5|E|3.P5|
|Deep<br>Mode|P5 —<br>Operational<br>Maturity|Secret<br>management hard<br>flag (gitleaks)|AG6, P5|E|3.P5|
|Deep<br>Mode|Interview<br>Intelligence|Design decision<br>question<br>generation|—|C, D (LLM)|5.5|
|Deep<br>Mode|Interview<br>Intelligence|Gap probe<br>generation (CV<br>gaps)|—|CV claims|5.5|
|Deep<br>Mode|Interview<br>Intelligence|Flag clarification<br>questions|—|Module<br>flags|5.5|
|Deep<br>Mode|Interview<br>Intelligence|Role & stack<br>match analysis<br>(requires JD)|—|B, C, F<br>(LLM)|5.5|
|CV<br>Verifier|CV cross-<br>check|PDF / DOCX text<br>extraction|—|—|5.3|
|CV<br>Verifier|CV cross-<br>check|Claim extraction<br>LLM call|—|—|5.3|
|CV<br>Verifier|CV cross-<br>check|Employment claim<br>cross-check (EV<br>module)|EV|A, C|5.3|
|CV|CV cross-|Technology claim|P4|B, C|5.3|



© 2026 GitIntel — Confidential engineering document 

GitIntel  ·  Feature & Technical Specification  ·  v1.0  ·  Internal Engineering Reference 

|**Core**<br>**Product**|**Feature**|**Sub-Feature**|**Module(s)**|**Corpus**<br>**Groups**|**Section**|
|---|---|---|---|---|---|
|Verifier|check|cross-check<br>(commit volume)||||
|CV<br>Verifier|CV cross-<br>check|Seniority claim<br>cross-check (P2,<br>P3)|P2, P3|C, D|5.3|
|CV<br>Verifier|CV cross-<br>check|Contradiction<br>detection|P2, P4, EV|C|5.3|
|CV<br>Verifier|CV cross-<br>check|Discrepancy<br>report with<br>interview probes|—|All|5.3|
|Batch<br>Process<br>ing|CSV batch|CSV parsing &<br>validation|—|—|5.4|
|Batch<br>Process<br>ing|CSV batch|Cache hit<br>optimisation (per-<br>candidate)|—|Redis|5.4|
|Batch<br>Process<br>ing|CSV batch|Batch coordinator<br>job (jobs:batch<br>queue)|—|—|5.4|
|Batch<br>Process<br>ing|CSV batch|Rate limit pool<br>sharing with Light<br>Mode|—|—|5.4|
|Batch<br>Process<br>ing|CSV batch|Ranked output<br>dashboard<br>(display sort)|All<br>modules|—|5.4|
|Batch<br>Process<br>ing|CSV batch|Partial batch<br>completion<br>handling|—|—|5.4|



_End of document  ·  GitIntel Feature & Technical Specification  ·  v1.0  ·  May 2026_ 

© 2026 GitIntel — Confidential engineering document 

