# GitIntel Analysis — Light vs Deep Mode Testing Plan

## Overview

This document is the **single source of truth** for debugging and validating the
GitIntel analysis pipeline. It covers:

1. Architecture outline with pipeline stages
2. Per-stage expected behavior — Light vs Deep comparison
3. Step-to-step dependency map (how upstream results affect downstream)
4. The testing/debugging process: how to isolate and fix bugs

---

## 1. Architecture Outline

```
┌─────────────────────────────────────────────────────────────────────┐
│                       API LAYER (NestJS)                            │
│                                                                     │
│  POST /api/v2/analysis/light   ──> Light Mode (sync, ~45s)          │
│  POST /api/v2/analysis/cv-verify  ──> Light + CV claims (~50s)      │
│  POST /api/v2/analysis/deep   ──> Deep Mode (sync, ~3min)           │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                     ┌──────▼───────┐
                     │ JobDispatcher │  <── Orchestrates all phases
                     │ (7 phases)   │
                     └──────┬───────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   ┌────▼────┐        ┌────▼────┐         ┌────▼────────┐
   │Corpus   │        │DataColl │         │DeepCollector│
   │Cache    │        │(A-G)    │         │(clone+run)  │
   │(Redis   │        │         │         │tools: scc,  │
   │ 7d TTL) │        │light    │         │tokei,       │
   └─────────┘        └─────────┘         │gitleaks)    │
                                          └─────────────┘
                            │
                     ┌──────▼───────────┐
                     │  WaveOrchestrator │
                     │                   │
                     │  Wave 1: AG1-AG3  │  (parallel, anti-gaming)
                     │  Wave 2a: AG4     │  (conditional on W1 flags)
                     │  Wave 2b: P1,P2,P5│  (parallel with 2c,2d)
                     │  Wave 2c: P3      │  (parallel with 2b,2d)
                     │  Wave 2d: P4      │  (parallel with 2b,2c)
                     │  Wave 3: P6,AG5,EV│  (LLM-dependent)
                     └──────┬───────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
   ┌─────▼──────┐   ┌──────▼───────┐   ┌──────▼──────────┐
   │14 Modules  │   │ LLM Service  │   │ BriefAssembler  │
   │(P1-P7,     │   │ (Deepseek v4,│   │ (7 sections:    │
   │ AG1-AG6,   │   │  3 calls)    │   │  weigh, A-G)   │
   │ EV, P7)    │   │              │   │                 │
   └────────────┘   └──────────────┘   └─────────────────┘
                            │
                     ┌──────▼───────────┐
                     │  Evidence Brief   │
                     │  (Markdown+JSON)  │
                     └──────────────────┘
```

---

## 2. Pipeline Stages — Detailed Breakdown

The pipeline runs in 7 sequential phases:

### Phase 0: Request & Dispatch
```
[Controller]         POST /api/v2/analysis/{light,deep}
[JobDispatcher]      phase=dispatch jobId=xxx mode=light|deep
```

### Phase 1: Corpus Acquisition (Light)
```
[DataCollector]      collectLightMode(octokit, username, jobId)
```
Groups collected with their dependencies:

| Group | Data Content | Dependencies | Light | Deep |
|-------|-------------|--------------|-------|------|
| **A (Identity)** | GitHub profile, company, email domains, orgs | Independent | ✅ Full | ✅ Full |
| **B (Repos)** | Repository inventory, languages, forks | Independent | ✅ Full | ✅ Full |
| **C (Commits)** | Commit frequency, size, messages, test ratio | Depends on B (repo list) | ✅ Light limited | ✅ Full (per-repo) |
| **D (Collab)** | PR review counts, comments, self-merge rate | Independent | ✅ Full | ✅ Full |
| **E (Eng Practices)** | CI configs, Docker, IaC, observability, secrets | Depends on B (repo list) | ✅ Light limited | ✅ Full (gitleaks, sast) |
| **F (Impact)** | NPM/PyPI/Cargo packages, OSS contributions | Independent | ✅ Full | ✅ Full |
| **G (Anti-gaming)** | Burst/dormancy, commit inflation, code search | Depends on B+C | ✅ Light computed | ✅ Light computed |

**Key dependency:** Groups C and E cannot run until B is collected (they need repo list).
Group G cannot run until B and C are collected.

**Execution order:**
```
Parallel Phase 1: A, B, D, F   (independent, no deps)
Parallel Phase 2: C, E          (depends on B's repo list)
Sequential Phase 3: G            (depends on B + C)
```

### Phase 1b: Corpus Acquisition (Deep — Extension)
Deep Mode does everything from Phase 1, then adds:

1. Fetch private repos via GitHub App (`installationId`)
2. Clone each private repo to `/tmp/deep-clone/{repo}`
3. Run analysis tools per repo (parallel batches of 4):
   - `scc` — Language stats, code counts
   - `tokei` — Code complexity metrics
   - `gitleaks` — Secret scanning
4. Merge delta into the corpus (enriches groups C, E, G)

**Deep-only enriched fields:**
- `commit_signals.per_repo_author_stats` (authorship % per repo)
- `commit_signals.test_to_code_ratio_by_repo` (test coverage)
- `engineering_practice_signals.secret_leak_details` (deep scan)
- `engineering_practice_signals.sast_finding_density` (SAST results)
- `commit_signals.complexity_trend_by_year` (complexity over time)

### Phase 2: Wave Orchestration

```
[WaveOrchestrator] orchestrate(corpus, config, jobId)

  Wave 1: AG1, AG2, AG3  ──> parallel, anti-gaming pre-check
  Wave 2a: AG4 ──> conditional (runs only if AG1 or AG3 raised flags)
  Wave 2b: P1, P2, P5 ──> parallel execution primitives
  Wave 2c: P3 ──> parallel with 2b,2d
  Wave 2d: P4 ──> parallel with 2b,2c
  Wave 3: P6, AG5, EV ──> LLM-dependent (P6 classification)
```

### Phase 3: LLM Processing
3 calls to Deepseek v4:
1. **Wave 3 batch** — AI leverage classification (~3.5K tokens)
2. **Narrative** — Profile summary (~2.5K tokens)
3. **Interview questions** — Generate probes (~2K tokens)

### Phase 4: Brief Assembly
```
[BriefAssembler] assemble(results, narrative, questions, corpus, config, jobId)
  Section: weighting ──> Seniority/role weighting
  Section: A    ────> Profile in 90 Seconds (LLM narrative)
  Section: B    ────> CV Claims cross-reference (if cv_claims provided)
  Section: C    ────> Work Pattern Intelligence (P1-P5 results)
  Section: D    ────> Red Flags (all module flags)
  Section: E    ────> Interview Questions + Probes
  Section: G    ────> Limitations & Caveats
```

---

## 3. Module Decision Logic — What Each Module Checks

### P1: Execution Reliability

| Threshold | Inputs | Light | Deep | Branch Impact |
|-----------|--------|-------|------|---------------|
| `cadenceMet` | `commit_frequency_by_month`, activeMonths >= 9, no gaps | ✅ | ✅ | +1 to primaryMet |
| `sizeMet` | `median_commit_size_lines` in [20..400], sub5 < 0.30 | ✅ | ✅ | +1 to primaryMet |
| `ciMet` | `ci_pass_rate_trajectory` quarters >= 2, all >= 0.80 | ✅ | ✅ | +1 to primaryMet |
| `testRatioMet` | `repos_with_test_dir` > 0 | ✅ same | ✅ same | Evidence only, not primary |

**Confidence logic:**
- `primaryMet >= 3 && activeMonths >= 12` → **strong**
- `primaryMet >= 3 && activeMonths < 12` → **moderate** (blocked: "activeMonths=N < 12")
- `primaryMet >= 2 && activeMonths >= 6` → **moderate**
- `primaryMet >= 1` → **low**
- Junior + `total_commits_lifetime > 0` → **low**
- Otherwise → **observability_gap**

**Light vs Deep: Same.** No Deep-only fields affect P1 confidence.

### P2: Systems Evolution

| Threshold | Inputs | Light | Deep | Branch Impact |
|-----------|--------|-------|------|---------------|
| Junior gate | `seniority` | ✅ | ✅ | Early exit → obs_gap |
| `complexityYears >= 2` | `complexity_trend_by_year` | ⚠️ Limited | ✅ Full data | +1 to score |
| `refactorSignals >= 5` | `message_quality_raw` | ✅ | ✅ | +1 to score |
| `longLivedRepos >= 2` | `per_repo_author_stats` | ❌ Empty | ✅ Computed | +1 to score (Deep only) |

**Confidence logic:**
- `score >= 2` → **moderate**
- `score >= 1` → **low**
- Otherwise → **observability_gap**

**Light vs Deep CRITICAL:** In Light mode, `longLivedRepos` is always 0 (empty from per_repo_author_stats).
This means Light mode can never reach score >= 2 if refactorSignals < 5. Deep mode gets +1 from longLivedRepos.

### P3: Collaboration Leverage

| Threshold | Inputs | Light | Deep | Branch Impact |
|-----------|--------|-------|------|---------------|
| Low-activity gate | `pr_reviewer_count < 5` | ✅ | ✅ | Early exit → obs_gap |
| `substantive_ratio >= 0.4` | `substantive_review_ratio` | ✅ | ✅ | +1 to score |
| `reviewer/author >= 0.5` | `pr_reviewer_count / pr_author_count` | ✅ | ✅ | +1 to score |
| `self_merge < threshold` | `self_merge_rate` (senior 0.1, else 0.2) | ✅ | ✅ | +1 to score |
| `cross_repo >= 10` | `cross_repo_comment_count` | ✅ | ✅ | +1 to score |

**Confidence logic:**
- `score >= 3` → **strong**
- `score >= 2` → **moderate**
- Otherwise → **low** (never returns obs_gap if past the gate)

**Light vs Deep: Same.**

### P4: Technical Depth

| Threshold | Inputs | Light | Deep | Branch Impact |
|-----------|--------|-------|------|---------------|
| `deepLangs >= 2` | `repositories[].commit_count + primary_language` | ✅ | ✅ | +1 to score |
| `opMarkers >= 2` | `observability_markers_present` | ✅ | ✅ | +1 to score |
| `hasAdoption` | `npm/pypi/cargo_packages.downloads >= 1000` | ✅ | ✅ | +2 to score (double weight) |

**Confidence logic:**
- `score >= 3` → **strong**
- `score >= 2` → **moderate**
- `score >= 1` → **low**
- Otherwise → **observability_gap**

**Light vs Deep: Same.**

### P5: Operational Maturity

| Threshold | Inputs | Light | Deep | Branch Impact |
|-----------|--------|-------|------|---------------|
| Secret leak flag | `secret_leak_detected + details` | ⚠️ Partial | ✅ Full gitleaks | Flag → confidence='low' |
| `docker > 0` | `repos_with_docker` | ✅ | ✅ | +1 to score |
| `ci > 0` | `repos_with_ci_config` | ✅ | ✅ | +1 to score |
| `obs >= 2` | `observability_markers_present.length` | ✅ | ✅ | +1 to score |
| `iac >= 2` | `repos_with_iac` | ✅ | ✅ | +1 to score |

**Confidence logic:**
- Flag present → **low** (capped, regardless of score)
- `score >= 3` → **strong**
- `score >= 2` → **moderate**
- `score >= 1` → **low**
- Otherwise → **observability_gap**

**Light vs Deep:** Deep gives richer secret_leak_details (gitleaks scan vs GitHub secret scanning).
Light may miss some leaks.

### P6: AI Leverage (Stub until LLM Phase)

**Always returns:** `confidence='observability_gap'`, `classification='traditional'`

This module is a stub. In production, the LLM's Wave 3 batch provides the classification.

### P7: Authenticity Confidence

| Threshold | Inputs | Light | Deep | Branch Impact |
|-----------|--------|-------|------|---------------|
| Profile-level gate | `observabilityCount >= 4` (groups missing) | ✅ | ✅ | Early exit → `insufficient_data` |
| `burstFlag` | `burst_dormancy_ratio > 5.0` | ✅ | ✅ | +1 soft flag |
| `fork_ratio > 0.7` | `fork_dump_ratio` | ✅ | ✅ | +1 soft flag |
| `inflation_ratio > 0.3` | `commit_inflation_ratio` | ✅ | ✅ | +1 soft flag |
| `codeSearch > 0` | `code_search_flags.length` | ✅ | ✅ | +1 soft flag |

**Confidence logic:**
- `softFlags === 0` → **strong**
- `softFlags <= 1` → **moderate**
- `softFlags >= 2` → **low**

**Light vs Deep: Same** (all inputs are from group G, which is computed identically).

---

### AG1: Commit Inflation

| Threshold | Light | Deep | Flag |
|-----------|-------|------|------|
| `sub5 > 0.30 AND p25 < 3` | ✅ | ✅ | `COMMIT_INFLATION_SOFT` (SOFT, WARNING) |

**Light vs Deep: Same.**

### AG2: Fork Dump

| Threshold | Light | Deep | Flag |
|-----------|-------|------|------|
| `forkRatio > 0.70` | ✅ | ✅ | `FORK_DUMP_SOFT` (SOFT, INFO) |

**Light vs Deep: Same.**

### AG3: Burst Dormancy

| Threshold | Light | Deep | Flag |
|-----------|-------|------|------|
| `ratio > 5.0 AND triggered_at_evaluation` | ✅ | ✅ | `BURST_DORMANCY_SOFT` (SOFT, WARNING) |

**Light vs Deep: Same.**

### AG4: Repository Laundering (Conditional)

| Threshold | Condition | Light | Deep | Flag |
|-----------|-----------|-------|------|------|
| Run gate | AG1 or AG3 raised flags? | ✅ | ✅ | Skip if no triggers |
| `code_search_flags > 0` | Corpus G | ✅ | ✅ | `REPO_LAUNDERING_LIGHT` (SOFT) |
| `copyleaks_results` confirmed | Deep only | ❌ | ✅ | `REPO_LAUNDERING_CONFIRMED` (HARD) |

**Light vs Deep CRITICAL:** Light mode can never produce a HARD flag (no Copyleaks).
Deep mode can produce both SOFT and HARD flags.

### AG5: AI Generation Detection (Stub)

**Always returns:** `confidence='observability_gap'`, no flags.

This module reads P6's Wave 3 output, which is not available until Stage 5.

### AG6: Credential Leak

| Threshold | Light | Deep | Flag |
|-----------|-------|------|------|
| Mode gate | Light → skip (obs_gap) | ✅ Full | Hard leaks → CREDENTIAL_LEAK_*, SOFT for false positives |
| `secret_leak_detected + hardLeaks > 0` | ❌ | ✅ | Per-type HARD flags |
| `softLeaks > 0` | ❌ | ✅ | `CREDENTIAL_LEAK_SOFT_FP` (SOFT, INFO) |

**Light vs Deep CRITICAL:** AG6 is Deep Mode only. In Light mode it returns `observability_gap`.

### EV: Employment Verification

| Threshold | Light | Deep | Branch Impact |
|-----------|-------|------|---------------|
| Rung 0 gate | `company_claim === null` | ✅ | ✅ | Early exit → obs_gap |
| Rung 1: Email domain match | `commit_email_domains` | ✅ | ✅ | confirmed/unconfirmed |
| Rung 2: Org membership | `github_org_memberships` | ⚠️ Partial | ✅ Full | confirmed/unconfirmed/partial |
| Rung 3: Contribution fingerprint | `total_commits_lifetime + org match` | ❌ Partial | ✅ Full | confirmed/unconfirmed/partial |

**Light vs Deep CRITICAL:** Rungs 2-3 are only fully confirmed in Deep mode.
Light mode returns "partial" for Rung 2 and "partial" for Rung 3.
This means EV can never reach `confidence='strong'` in Light mode (requires 2+ confirmed rungs).

---

## 4. Step-to-Step Dependency Map

Understanding how each pipeline stage's output affects the next:

```
A (Identity) ──────────────────────> EV (Rungs 1-2)
                                      └> Brief Section B (CV cross-ref)
B (Repos) ─────────────────────────> AG2 (fork detection)
                ───────────────────> P4 (depth by language)
                ───┐
                   ├─> C (Commits)
                   ├─> E (Eng Practices)
                ───┘
C (Commits) ───────────────────────> P1 (cadence, size, CI)
                ───────────────────> AG1 (sub5 ratio, p25)
                ───────────────────> AG3 (burst/dormancy)
                ───────────────────> EV (Rung 3)
                ───────────────────> P2 (complexity, refactor)
                ───────────────────> P6 (AI patterns stubs)
D (Collab) ────────────────────────> P3 (review quality)
                ───────────────────> P4 (PR descriptions)
E (Eng Practice) ─────────────────> P1 (CI pass rate)
                ───────────────────> P5 (Docker, CI, IaC, obs)
                ───────────────────> AG6 (secret leaks — Deep)
F (Impact) ────────────────────────> P4 (package adoption)
                ───────────────────> Brief Section C (work patterns)

G (Anti-gaming) ───────────────────> AG1-AG6 (corpus inputs)
                ───────────────────> P7 (burst, fork, inflation, codeSearch)
                ───────────────────> Wave Orchestrator (AG1/AG3 flags → Wave 2a gate)

Wave 1 (AG1-AG3) ─────────────────> Wave 2a gate (shouldRunWave2a)
Wave 1 flags ─────────────────────> P7 softFlags count
Wave 2b (P1,P2,P5) results ───────> Brief Section C (work patterns)
Wave 2c (P3) results ─────────────> Brief Section C
Wave 2d (P4) results ─────────────> Brief Section C
Wave 2a (AG4) flags ──────────────> Brief Section D (red flags)
Wave 3 (P6, AG5, EV) ────────────> Brief Section C + E

Wave 3 LLM output ────────────────> P6 classification
                ───────────────────> AG5 flag decision
                ───────────────────> Brief Section A (narrative)
                ───────────────────> Brief Section E (interview questions)

All ModuleResults ────────────────> BriefAssembler (Sections C, D, E)
LLM Narrative ────────────────────> Brief Section A
LLM Interview Questions ──────────> Brief Section E
CV Claims (optional) ─────────────> Brief Section B
P7 Authenticity ──────────────────> Brief Section D (flags)
```

### Critical Dependency Chains (Debug These First)

**Chain 1: Data Quality → Collateral Impact**
```
B (repos) missing Java repos
  → C (commit signals) misses Java commits
    → P1 shows no Java cadence → cadenceMet=false → moderate not strong
    → P4 shows shallow Java depth → only 1 deepLang → moderate not strong
    Example: If GitHub API pagination fails for B, EVERY module is affected
```

**Chain 2: Cache Contamination**
```
Old cache (7d TTL)
  → Stale B (fork status may change)
    → AG2 wrong fork ratio → flag or no-flag incorrectly
    → AG3 wrong burst/dormancy ratio
    Debug: Compare `groups_present` + `corpus_id` vs fresh collect
```

**Chain 3: Light vs Deep Delta**
```
Light corpus (no per_repo_author_stats, no complexity_trend_by_year)
  → P2 longLivedRepos=0 always → score capped at 1 if refactorSignals<5
  → P2 can never reach moderate from commit data alone
  → EV Rung 2 = partial, Rung 3 = partial, max confidence = moderate
  → AG6 = observability_gap (deep mode required)
  
  EXPECTED DIFFERENCES (NOT BUGS):
  Light: P2 max=low (unless refactorSignals >= 5), EV max=moderate, AG6=obs_gap
  Deep:  P2 max=moderate, EV max=strong, AG6 may produce flags
```

**Chain 4: Conditional Wave Gate**
```
AG1/AG3 flag present → Wave 2a (AG4) runs → may produce REPO_LAUNDERING_LIGHT
AG1/AG3 no flag      → Wave 2a skipped → no AG4 output

Test: Force AG1 flag by seeding sub5>0.30 + p25<3, verify AG4 executes
Test: Force no flags, verify AG4 does NOT execute
```

---

## 5. Light vs Deep Outcome Comparison Matrix

| Module | Light Expected Confidence | Deep Expected Confidence | Delta Cause |
|--------|--------------------------|-------------------------|-------------|
| P1 | strong/moderate/low | strong/moderate/low | None (same inputs) |
| P2 | low/obs_gap | moderate/low/obs_gap | `longLivedRepos` always 0 in Light |
| P3 | strong/moderate/low | strong/moderate/low | None (same inputs) |
| P4 | strong/moderate/low/obs | strong/moderate/low/obs | None (same inputs) |
| P5 | moderate/low/obs | moderate/low/obs | Flags may differ with gitleaks |
| P6 | obs_gap | obs_gap | Both stubs until LLM integration |
| P7 | strong/moderate/low | strong/moderate/low | None (same inputs) |
| AG1 | strong/low (flag) | strong/low (flag) | None |
| AG2 | strong/low (flag) | strong/low (flag) | None |
| AG3 | strong/low (flag) | strong/low (flag) | None |
| AG4 | strong/low (flag) | strong/low (flag) | Light: SOFT only. Deep: may get HARD |
| AG5 | obs_gap | obs_gap | Both stubs |
| AG6 | obs_gap | strong/low (flag) | **Deep Mode only** |
| EV | moderate/low/obs | strong/moderate/low/obs | Rungs 2-3 partial in Light |

### Expected Module Counts by Mode

**Light Mode** (14 modules, but some skip):
- Executed: P1, P2, P3, P4, P5, P6, P7, AG1, AG2, AG3, AG4 (conditional), AG5, EV = 13-14
- Skipped: AG6 (deep mode required)
- Stubs: P6, AG5 (both return obs_gap)

**Deep Mode** (14 modules, all may execute):
- Executed: All 14 modules
- AG4 only if Wave 1 triggers it
- AG6 has full data to produce flags

---

## 6. Testing Process — Debugging the Analysis

### Phase A: Sanity Check — "Does it run?"

**Test 1: Cache Hit Path**
```bash
# Seed the cache
curl -X POST /api/v2/analysis/light \
  -H "Content-Type: application/json" \
  -d '{"githubUsername":"torvalds","config":{"seniority":"senior","role_archetype":"backend"}}'

# Second call with SAME username — should hit cache
curl -X POST ...
# Verify: [CorpusCache] phase=cache_hit appears in logs
# Expected: ~15s total (no collection), ~340ms orchestration
```

**Test 2: Cache Miss Path**
```bash
# Use different username or clear cache
curl -X POST /api/v2/analysis/light \
  -H "Content-Type: application/json" \
  -d '{"githubUsername":"some-user","config":{"seniority":"mid","role_archetype":"backend"}}'
# Verify: [CorpusCache] phase=cache_miss → [DataCollector] phase=collect_start
# Expected: ~35-45s total with full collection
```

**Test 3: Deep Mode End-to-End**
```bash
curl -X POST /api/v2/analysis/deep \
  -H "Content-Type: application/json" \
  -d '{"githubUsername":"torvalds","installationId":12345,"config":{"seniority":"senior","role_archetype":"backend"}}'
# Verify: DeepCollector phase=private_repos_fetched, clone_batch
# Expected: ~2-3min depending on repo sizes
```

### Phase B: Module Isolation — "Is each module producing the right output?"

For each module, test with a **known corpus fixture** and verify:
1. Confidence level matches expectations
2. Each threshold evaluation is correct
3. Branch selection with blocked-higher analysis is correct
4. Flag conditions fire at correct thresholds

**Test Kit: Use the TraceContext + seed data**

```typescript
// Example: P1 trace test
import { TraceContext } from '../trace/trace-context-holder';

// 1. Seed corpus with known values
const testCorpus = createFixtureCorpus({
  commit_frequency_by_month: {
    '2025-Q3': 45, '2025-Q4': 52, '2026-Q1': 38, '2026-Q2': 41
  },
  median_commit_size_lines: 85,
  sub_5_line_commit_ratio: 0.12,
  ci_pass_rate_trajectory: { '2026-Q1': 0.85, '2026-Q2': 0.88 },
});

// 2. Execute with tracing
TraceContext.startTrace('p1_execution_reliability');
const result = p1.run(testCorpus, { seniority: 'senior', role_archetype: 'backend' });
const trace = TraceContext.endTrace(result);

// 3. Verify trace output
assert.strictEqual(trace.decisionBranches[0].branchTaken, 'moderate');
assert.strictEqual(
  trace.decisionBranches[0].blockedHigherBranches[0].blockedBy,
  'activeMonths=11 < 12'
);
assert.strictEqual(trace.thresholdEvents.length, 3); // cadenceMet, sizeMet, ciMet
```

### Phase C: Cross-Module Dependency Testing

Test that changes in upstream groups propagate correctly to downstream modules:

**Test: B (repos) → C (commits) → P1 confidence chain**
```
1. Seed B with 3 repos including 1 non-English name
2. Check C collects commits only from accessible repos
3. Verify P1 cadenceMet computation uses correct activeMonths
4. Missing repo = fewer commits = potentially lower P1 confidence
```

**Test: AG1 flag → Wave 2a gate → AG4 execution**
```
1. Seed corpus with sub5=0.35 (>0.30) and p25=2 (<3)
2. Execute AG1 → verify COMMIT_INFLATION_SOFT flag
3. Check shouldRunWave2a returns true
4. Verify AG4 executes and produces its own result
```

### Phase D: Light vs Deep Delta Testing — THE MOST IMPORTANT TEST

For the **same GitHub profile**, run both Light and Deep, then compare.

**Expected deltas to verify:**

| Delta ID | Module | Light | Deep | How to Verify |
|----------|--------|-------|------|---------------|
| D1 | P2 | longLivedRepos=0, score capped | longLivedRepos>=2 possible | Check per_repo_author_stats present in Deep |
| D2 | EV | Rung 2=partial, Rung 3=partial → max moderate | Rungs 2-3 confirmed → strong possible | Check org_memberships + commits in Deep |
| D3 | AG6 | obs_gap | strong or leak flags | Check secret_leak_details populated in Deep |
| D4 | AG4 | SOFT only | SOFT + possibly HARD | Check copyleaks_results in Deep |
| D5 | P5 | May miss some secrets | Full gitleaks scan | Compare secret_leak_details length |

**Debugging a delta mismatch:**
1. Run both modes with `TRACE_VERBOSITY=full`
2. Compare per-module decision traces
3. For any module where confidence differs:
   - Check which threshold evaluations differ
   - Trace back to the raw corpus field causing the difference
   - Verify if the difference is expected (e.g., Deep-only field) or a bug

### Phase E: Edge Cases

| Test Case | Expected Behavior | How to Trigger |
|-----------|------------------|----------------|
| Empty profile (new GitHub user) | All modules return obs_gap or insufficient_data | Create new GitHub account, run light |
| Enterprise developer (private-only commits) | P7 observability gate fires → insufficient_data | Delete all public repos from profile |
| Profile with only forks | AG2 fork dump flag → P7 softFlags=1+ → moderate | Profile of 10+ repos, all forks |
| Profile with eval-timed burst | AG3 flag → BURST_DORMANCY_SOFT | Seed burst_triggered_at_evaluation=true |
| CV with 0 claims | EV Rung 0 → obs_gap | POST cv-verify with empty cvText |
| Deep mode, 0 private repos | Normal Light-mode corpus, no clone phase | Use profile with no private repos |
| Profile with secret leak in test/ | AG6: SOFT flag only (test/fixture filtered) | Seed leak in test directory |
| Cache expires mid-analysis | Redis error → should fall back to fresh collect | Simulate Redis flush during analysis |

### Phase F: Fixed Fixture Tests (Reproducible)

Create a fixed signal corpus fixture covering each module's threshold boundaries:

```
Fixture: "strong_boundary"
  P1: activeMonths=12, median=200, sub5=0.10, ci quarters=2 @ 0.95 → strong
  P2: complexityYears=2, refactorSignals=5, longLivedRepos=2 → moderate (never strong)
  P3: prReviewerCount=50, substantive=0.5, selfMerge=0.05, crossRepo=15 → strong
  P4: deepLangs=2, opMarkers=3, hasAdoption=true → strong
  P5: docker=2, ci=3, obs=3, iac=2 → strong
  P7: burst=2.0, fork=0.10, inflation=0.05, codeSearch=0 → strong

Fixture: "just_below_boundary"
  P1: activeMonths=11, median=85, sub5=0.12, ci quarters=2 @ 0.85 → moderate (blocked: 11<12)
  P2: complexityYears=1, refactorSignals=4, longLivedRepos=1 → low
  P3: prReviewerCount=50, substantive=0.3, selfMerge=0.15, crossRepo=5 → low (score=1)
  P4: deepLangs=1, opMarkers=1, hasAdoption=false → low
  P5: docker=0, ci=1, obs=1, iac=0 → low
  P7: burst=4.0, fork=0.40, inflation=0.25, codeSearch=0 → strong (no flags)

Fixture: "flag_triggers"
  AG1: sub5=0.35, p25=2 → COMMIT_INFLATION_SOFT
  AG2: forkRatio=0.80 → FORK_DUMP_SOFT
  AG3: ratio=6.0, triggered=true → BURST_DORMANCY_SOFT
  AG4: codeSearchFlags=[{...}] → REPO_LAUNDERING_LIGHT
  AG6: hardLeaks>0 → CREDENTIAL_LEAK_* (Deep only)
  P5: secret_leak_detected=true, hardLeaks=[{...}] → SECRET_LEAK_HARD

Fixture: "enterprise_profile" (P7 gate test)
  groups_present: only A, B (no C, D, E, F)
  P7 observabilityCount >= 4 → insufficient_data
```

### Phase G: Debugging Best Practices

**When a module returns unexpected confidence:**

1. Enable decision tracing: `TRACE_VERBOSITY=decision`
2. Run the analysis
3. For the problematic module, inspect:
   ```
   THRESHOLDS THAT FEED THE DECISION:
     cadenceMet = false (activeMonths=3 >= 9 → ✗)
     sizeMet    = true  (85 in [20..400] → ✓)
     ciMet      = false (quarters=0 < 2 → ✗)
   
   BRANCH: confidence_determination
     TAKEN: observability_gap (primarySignalsMet=1)
   ```
4. The question "why not moderate?" → `primarySignalsMet=1`, need >=2
5. The question "why not strong?" → `primarySignalsMet=1`, need >=3 AND activeMonths>=12
6. Root cause: `activeMonths=3`. Either data collection missed commits, or profile truly has low activity.

**When a flag is unexpectedly raised or not raised:**

1. Check the threshold trigger values in the module trace
2. Verify the corpus fields feeding the threshold
3. Check if it's a Light vs Deep difference (e.g., AG6 in Light mode returns obs_gap)
4. Check if the conditional wave gate (Wave 2a) fired correctly

**When Light and Deep produce different confidences (expected delta check):**

Use the Delta Matrix (Section 5) to determine if the difference is expected:
- P2: Light can't reach moderate without longLivedRepos → **Expected**
- EV: Light can't reach strong → **Expected**
- AG6: Light returns obs_gap → **Expected**
- P1: Should be identical → **Bug if differs**
- P3: Should be identical → **Bug if differs**
- P4: Should be identical → **Bug if differs**

---

## 7. How to Use the Tester — CLI Commands & Expected Outputs

A dedicated `debug-analysis.ts` script (to be placed at `backend/src/scripts/debug-analysis.ts`)
provides a **single entry point for all debugging operations**. It accepts a subcommand to
select the testing phase.

### 7.1 CLI Interface

```bash
# Run from backend directory
npx ts-node src/scripts/debug-analysis.ts

Usage: debug-analysis [command]

Commands:
  run <mode> <username>          Run a full analysis (light|deep|cv-verify) and print trace
  trace <jobId> [moduleId]       Print decision traces for a specific job/module
  compare <username>             Run both Light and Deep, compare per-module deltas
  fixture <fixtureName>          Run a known fixture corpus against all modules
  module <moduleId> <fixture>    Run a single module against a fixture corpus
  validate-installation          Check that all trace infrastructure is wired correctly
  help                           Show this help
```

### 7.2 Command: `run` — Full Analysis with Trace Output

**Purpose:** Run a complete end-to-end analysis and capture per-module decision traces.

```bash
# Light mode, trace verbosity = decision
TRACE_VERBOSITY=decision npx ts-node src/scripts/debug-analysis.ts run light torvalds

# Deep mode, full verbosity
TRACE_VERBOSITY=full npx ts-node src/scripts/debug-analysis.ts run deep torvalds --installationId=12345

# Light + CV claims
npx ts-node src/scripts/debug-analysis.ts run cv-verify torvalds --cv-text="..."
```

**Expected Output:**

```
[debug-analysis] phase=run mode=light username=torvalds

═══ PHASE 1: Corpus Acquisition ═══
  [CorpusCache] phase=cache_miss
  [DataCollector] phase=collect_start  groups=A,B,D,F in parallel ...
  [DataCollector] phase=group_complete  group=A durationMs=320
  [DataCollector] phase=group_complete  group=B durationMs=1450
  [DataCollector] phase=group_complete  group=D durationMs=800
  [DataCollector] phase=group_complete  group=F durationMs=520
  [DataCollector] phase=group_complete  group=C durationMs=2800  (depends on B)
  [DataCollector] phase=group_complete  group=E durationMs=2200  (depends on B)
  [DataCollector] phase=group_complete  group=G durationMs=150   (depends on B+C)
  [DataCollector] phase=collect_complete  groups=A,B,C,D,E,F,G  totalDurationMs=9520

═══ PHASE 2: Wave Orchestration ═══
  [WaveOrchestrator] phase=wave_start  wave=1  modules=ag1,ag2,ag3
  [WaveOrchestrator] phase=wave_complete  wave=1  durationMs=52

  [WaveOrchestrator] phase=wave_skip  wave=2a  reason=no_triggers

  [WaveOrchestrator] phase=wave_start  wave=2b  modules=p1,p2,p5
  [WaveOrchestrator] phase=wave_start  wave=2c  modules=p3
  [WaveOrchestrator] phase=wave_start  wave=2d  modules=p4
  [WaveOrchestrator] phase=wave_complete  wave=2b  durationMs=95
  [WaveOrchestrator] phase=wave_complete  wave=2c  durationMs=70
  [WaveOrchestrator] phase=wave_complete  wave=2d  durationMs=60

  [WaveOrchestrator] phase=wave_start  wave=3  modules=p6,ag5,ev
  [WaveOrchestrator] phase=wave_complete  wave=3  durationMs=12

  [WaveOrchestrator] phase=orchestration_complete  totalDurationMs=340

═══ PHASE 3: DECISION TRACES ═══
  Module: p1_execution_reliability
    Decision Branches:
      Branch: confidence_determination → moderate
        Inputs: { primarySignalsMet: 2, activeMonths: 11, isJunior: false }
        Blocked Higher Branches:
          - strong: primarySignalsMet=2 < 3 (need 3+)
          - strong: activeMonths=11 < 12 (need 12+)
        Blocked By: activeMonths=11 < 12
    Thresholds:
      ✓ cadenceMet=true  (activeMonths=11 ≥ 9)         → +1 primaryMet
      ✓ sizeMet=true     (median=85 in [20..400])       → +1 primaryMet
      ✗ ciMet=false      (quarters=1 < 2)               → +0 primaryMet
    Raw Result: { confidence: 'moderate', score_label: '...', flags: 0 }

  Module: ag1_commit_inflation
    Thresholds:
      ✓ sub5=0.12 ≤ 0.30  → No flag (normal)
      ✓ p25=6 ≥ 3         → No flag (normal)
    Result: { confidence: 'strong', flags: 0 }

═══ PHASE 4: LLM + Brief Assembly ═══
  [LLM] phase=wave3_batch  tokens=3450  durationMs=22000
  [LLM] phase=narrative    tokens=1200  durationMs=15000
  [LLM] phase=interview_q  tokens=800   durationMs=12000
  [Brief] phase=assembled  sections=7  durationMs=340

═══ SUMMARY ═══
  Total Duration: 45.2s
  Modules Executed: 10 (3 obs_gap, 1 stub)
  Module Confidence Summary:
    strong: 5  (ag1, ag2, ag3, p3, p4)
    moderate: 2  (p1, p5)
    low: 0
    obs_gap: 4  (p2, p6, ag5, ag6)
  Flags Raised: 0
```

### 7.3 Command: `trace` — Per-Module Decision Trace Inspection

**Purpose:** Inspect the decision trace for one or all modules after a run.

```bash
# Full trace for a specific module
npx ts-node src/scripts/debug-analysis.ts trace job_abc123 p1_execution_reliability

# All module traces for a job
npx ts-node src/scripts/debug-analysis.ts trace job_abc123 --all
```

**Expected Output (single module):**

```
Job: job_abc123
Module: p1_execution_reliability

┌───────────────────────────────────────────────────────────────┐
│ GATE: seniority_adjustment (junior?)                          │
│ p1 has no junior gate — seniorty check not applicable         │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│ THRESHOLD: cadenceMet                                         │
│   Signal:      commit_frequency_by_month                      │
│   Operator:    activeMonths >= 9  AND  no gaps > 8w           │
│   Observed:    activeMonths=11,  gaps=false                   │
│   Result:      ✓ PASSED  (+1 primaryMet)                      │
│   Light/Deep:  Same                                           │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│ THRESHOLD: sizeMet                                             │
│   Signal:      median_commit_size_lines  IN  [20..400]        │
│   Operator:    median=85 >= 20  AND  median=85 <= 400         │
│                AND  sub5_ratio=0.12 < 0.30                    │
│   Observed:    median=85, sub5=0.12                           │
│   Result:      ✓ PASSED  (+1 primaryMet)                      │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│ THRESHOLD: ciMet                                               │
│   Signal:      ci_pass_rate_trajectory                        │
│   Operator:    quarters >= 2  AND  all quarters >= 0.80       │
│   Observed:    quarters=1,  rates={ Q2_2026: 0.85 }          │
│   Result:      ✗ FAILED  (need 2 quarters, got 1)            │
│   Light/Deep:  Same                                           │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│ DECISION BRANCH: confidence_determination                      │
│   Inputs:      primarySignalsMet=2, activeMonths=11            │
│                                                                 │
│   Hierarchy (checked in order):                                │
│   [✗] strong    ← skipped: primaryMet=2 < 3                    │
│   [✗] strong    ← skipped: activeMonths=11 < 12                │
│   [✓] moderate  ← primaryMet >= 2 AND activeMonths >= 6       │
│   [ ] low       ← not reached (moderate was taken)            │
│   [ ] obs_gap   ← not reached (moderate was taken)            │
│                                                                 │
│   TAKEN: moderate                                               │
│   BLOCKED HIGHER BRANCHES:                                      │
│     • strong: blocked by activeMonths=11 < 12                  │
│     • strong: blocked by primaryMet=2 < 3                      │
└───────────────────────────────────────────────────────────────┘

Result: { confidence: 'moderate', flags: 0, evidence: 3 }
```

### 7.4 Command: `compare` — Light vs Deep Delta Report

**Purpose:** The MOST important command. Runs Light then Deep on the same username
and produces a per-module delta report.

```bash
# Requires GitHub App installationId for Deep mode
npx ts-node src/scripts/debug-analysis.ts compare torvalds --installationId=12345
```

**Expected Output:**

```
═══ LIGHT vs DEEP COMPARISON ═══
Username: torvalds
Light Corpus Mode: light
Deep Corpus Mode: deep

┌──────────────────────────────────────────────────────────────────┐
│ MODULE DELTA REPORT                                               │
├──────────────────────────────────────────────────────────────────┤
│ Module                │ Light Confidence │ Deep Confidence │ Δ?  │
│───────────────────────┼──────────────────┼─────────────────┼─────│
│ p1_execution_reliability     moderate     │   moderate     │  =  │
│ p2_systems_evolution          low         │   moderate     │  ≠  │ ← EXPECTED
│ p3_collaboration_leverage    strong       │   strong       │  =  │
│ p4_technical_depth          moderate      │   moderate     │  =  │
│ p5_operational_maturity      moderate     │   moderate     │  =  │
│ p6_ai_leverage              obs_gap       │   obs_gap      │  =  │
│ p7_authenticity_confidence  strong        │   strong       │  =  │
│ ag1_commit_inflation         strong       │   strong       │  =  │
│ ag2_fork_dump                strong       │   strong       │  =  │
│ ag3_burst_dormancy           strong       │   strong       │  =  │
│ ag4_repository_laundering skipped        │   strong       │  ≠  │ ← EXPECTED (cond)
│ ag5_ai_generation_detection obs_gap       │   obs_gap      │  =  │
│ ag6_credential_leak         obs_gap       │   strong       │  ≠  │ ← EXPECTED (deep only)
│ ev_employment_verification  moderate      │   strong       │  ≠  │ ← EXPECTED (rungs)
└──────────────────────────────────────────────────────────────────┘

DELTA ANALYSIS:
  4 differences detected (all EXPECTED per design):

  ✓ p2_systems_evolution: Light=low, Deep=moderate
    Cause: per_repo_author_stats (empty in Light) → longLivedRepos=0 in Light
    Light: score=1  (complexityYears=1, refactorSignals=4, longLivedRepos=0)
    Deep:  score=2  (complexityYears=1, refactorSignals=4, longLivedRepos=3)

  ✓ ag4_repository_laundering: Light=skipped (cond), Deep=strong
    Cause: Wave 2a gate fired only in Deep (AG1 had flags in Deep corpus)

  ✓ ag6_credential_leak: Light=obs_gap, Deep=strong
    Cause: Deep Mode only module

  ✓ ev_employment_verification: Light=moderate, Deep=strong
    Cause: Rungs 2-3 confirmed in Deep (org membership + contribution fingerprint)

═══ VERDICT ═══
  ✅ All deltas are EXPECTED. No bugs detected in module logic.
  🔴 BUG: p2_systems_evolution differs but inputs are same? → Investigate!
  (Only shown if a delta is unexpected per Section 5 matrix)
```

### 7.5 Command: `fixture` — Run Fixed Fixtures

**Purpose:** Test all 14 modules against a known corpus fixture to verify
threshold boundaries produce the expected confidence levels.

```bash
# Run the "strong_boundary" fixture
npx ts-node src/scripts/debug-analysis.ts fixture strong_boundary

# Run with trace output
TRACE_VERBOSITY=full npx ts-node src/scripts/debug-analysis.ts fixture just_below_boundary
```

**Expected Output:**

```
═══ FIXTURE: strong_boundary ═══

┌───────────────────────────────────────────────┐
│ Module        │ Expected │ Actual │ Status      │
│───────────────┼──────────┼────────┼─────────────│
│ p1            │ strong   │ strong │ ✅ PASS     │
│ p2            │ moderate │ moderate │ ✅ PASS   │
│ p3            │ strong   │ strong │ ✅ PASS     │
│ p4            │ strong   │ strong │ ✅ PASS     │
│ p5            │ strong   │ strong │ ✅ PASS     │
│ p7            │ strong   │ strong │ ✅ PASS     │
│ ag1           │ strong   │ strong │ ✅ PASS     │
│ ag2           │ strong   │ strong │ ✅ PASS     │
│ ag3           │ strong   │ strong │ ✅ PASS     │
│ ag4           │ strong   │ strong │ ✅ PASS     │
└───────────────────────────────────────────────┘

PASS: 10/10 modules match expected confidence
```

**Fixture: "flag_triggers"**

```
═══ FIXTURE: flag_triggers ═══

┌───────────────────────────────────────────────────┐
│ Module │ Expected Flag │ Actual Flag   │ Status   │
│────────┼───────────────┼───────────────┼──────────│
│ ag1    │ COMMIT_       │ COMMIT_       │ ✅ PASS  │
│        │ INFLATION_SOFT│ INFLATION_SOFT│          │
│ ag2    │ FORK_DUMP_SOFT│ FORK_DUMP_SOFT│ ✅ PASS  │
│ ag3    │ BURST_        │ BURST_        │ ✅ PASS  │
│        │ DORMANCY_SOFT │ DORMANCY_SOFT │          │
│ ag4    │ REPO_         │ REPO_         │ ✅ PASS  │
│        │ LAUNDERING_   │ LAUNDERING_   │          │
│        │ LIGHT         │ LIGHT         │          │
└───────────────────────────────────────────────────┘

PASS: 4/4 flags match expected
```

### 7.6 Command: `module` — Single Module Test

**Purpose:** Test a single module in isolation to debug a specific threshold or flag.

```bash
# Test P1 with a fixture that should produce 'moderate' (blocked from 'strong')
npx ts-node src/scripts/debug-analysis.ts module p1_execution_reliability strong_boundary

# Test AG1 flag threshold
npx ts-node src/scripts/debug-analysis.ts module ag1_commit_inflation flag_triggers
```

**Expected Output (single module verbose):**

```
═══ MODULE TEST: p1_execution_reliability ═══
Fixture: strong_boundary
Seniority: senior
Role: backend

GROUP C (Commit Intelligence):
  commit_frequency_by_month:  {'2025-Q1':40,'2025-Q2':45,...}  → 12 active months
  median_commit_size_lines:  200
  sub_5_line_commit_ratio:   0.10
  total_commits_lifetime:    3200

GROUP E (Engineering Practices):
  ci_pass_rate_trajectory:   {'2025-Q1':0.95,'2025-Q2':0.92,'2025-Q3':0.96,'2025-Q4':0.94}
  repos_with_test_dir:       5

THRESHOLD EVALUATIONS:
  cadenceMet = true   (activeMonths=12 >= 9, no gaps)         → +1
  sizeMet    = true   (median=200 in [20..400], sub5=0.10<0.30) → +1
  ciMet      = true   (quarters=4 >= 2, all >= 0.80)           → +1
  primarySignalsMet = 3

ADJUSTMENT: seniority=senior → no adjustment (not junior)

SENIORITY ADJUSTMENT: applied only for intern/junior → skipped

CONFIDENCE DETERMINATION:
  primaryMet=3 >= 3  AND  activeMonths=12 >= 12
  → strong  ✓

RESULT: { confidence: 'strong', evidence: 5, flags: 0, probe: null }
MATCH: Expected "strong" → ✅ PASS
```

### 7.7 Command: `validate-installation`

**Purpose:** Verify that all trace infrastructure is wired correctly before running any tests.

```bash
npx ts-node src/scripts/debug-analysis.ts validate-installation
```

**Expected Output:**

```
═══ TRACE INFRASTRUCTURE VALIDATION ═══

[✓] trace-recorder.interface.ts  — All types defined
[✓] trace-recorder.service.ts    — Factory + IsolatedRecorder compiled
[✓] trace-context-holder.ts      — AsyncLocalStorage singleton compiled
[✓] trace.module.ts              — DynamicModule forRoot/forTest compiled
[✓] ModuleRegistry               — Imports TRACE_RECORDER_FACTORY optionally

Checking wiring...

[✓] ModuleRegistry receives optional TraceRecorderFactoryService
[✓] TraceContext.init() called on Registry construction
[✓] AsyncLocalStorage context isolation — each mod.run() gets own recorder

RESULT: All infrastructure correctly wired.
```

### 7.8 Quick Reference: Trace Points in Each Module

When instrumenting modules with `TraceContext.captureXxx()` calls, use this
cheat sheet to know which capture method to call at each decision point:

| Module | Gate(s) | Thresholds | Branch | Flag(s) |
|--------|---------|------------|--------|---------|
| P1 | seniority_adjustment | cadenceMet, sizeMet, ciMet | confidence_determination | — |
| P2 | junior_gate | complexityYears, refactorSignals, longLivedRepos | confidence_determination | — |
| P3 | low_activity_gate | substantive_ratio, reviewer_ratio, self_merge, cross_repo | confidence_determination | — |
| P4 | — | deepLangs, opMarkers, hasAdoption | confidence_determination | — |
| P5 | — | docker, ci, obs, iac | confidence_determination | SECRET_LEAK_HARD |
| P6 | — | — | — | — (stub) |
| P7 | observability_gate | burstFlag, fork_ratio, inflation, codeSearch | confidence_determination | — |
| AG1 | — | sub5, p25 | — | COMMIT_INFLATION_SOFT |
| AG2 | — | forkRatio | — | FORK_DUMP_SOFT |
| AG3 | — | ratio, triggered | — | BURST_DORMANCY_SOFT |
| AG4 | — | codeSearchFlags, copyleaks | — | REPO_LAUNDERING_* |
| AG5 | — | — | — | — (stub) |
| AG6 | mode_gate | hardLeaks, softLeaks | — | CREDENTIAL_LEAK_* |
| EV | rung0_gate | domainMatch, orgMatch, fingerprint | confidence_determination | — |

---

## 8. Quick-Reference Checklist for Each Test Run


```markdown
- [ ] Cache hit: second call returns without fetch (~15s)
- [ ] Cache miss: first call collects all 7 groups (~35s)
- [ ] Phase 1 order: A,B,D,F in parallel → C,E in parallel → G sequential
- [ ] Wave 1: AG1, AG2, AG3 all execute in parallel
- [ ] Wave 2a: Conditional on AG1 or AG3 flag
- [ ] Wave 2b,2c,2d: Execute in parallel
- [ ] Wave 3: P6, AG5, EV execute
- [ ] AG6: Deep mode only, returns obs_gap in light
- [ ] P7: observabilityCount gate works (4+ → insufficient_data)
- [ ] LLM: 3 calls made (wave3, narrative, interview)
- [ ] Brief: 7 sections assembled (weighting, A, B, C, D, E, G)
- [ ] Deep mode: clone + tools run on private repos
- [ ] Deep mode: merge_delta into corpus
- [ ] Light vs Deep: only P2, EV, AG6, AG4 differ (Section 5 matrix)
- [ ] No module throws an unhandled exception
- [ ] All 14 modules produce a ModuleResult (some may be skip/obs_gap)
```

---

## Appendix: Trace Point Instrumentation Summary

Each module has ~3-6 focused trace points (total ~84 across 14 modules):

| Category | Count | What's Traced |
|----------|-------|---------------|
| Gates | ~8 | Early-exit conditions (pr_reviewer_count<5, junior, etc.) |
| Determinative Thresholds | ~55 | Thresholds that feed into confidence/flag logic |
| Decision Branches | ~14 | `determineConfidence()` calls with blocked-higher analysis |
| Flag Raises | ~12 | Flag triggers with measured values |

All trace points use `TraceContext.captureXxx()` static calls — no constructor changes
needed. Tracing is gated by verbosity level (summary=off, decision, full).

---

*This document is the primary reference for debugging the GitIntel analysis pipeline
and should be updated whenever module logic or pipeline architecture changes.*
