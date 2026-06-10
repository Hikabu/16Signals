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

## 7. How to Use the Debugger — `debug-analysis.ts` Command Reference

The script at `backend/src/scripts/debug-analysis.ts` is a **local-only CLI** that wraps
the NestJS application context. It provides subcommands for testing modules against known
fixture corpora and inspecting per-module decision traces. It does NOT make live GitHub
API calls — use the HTTP API endpoints for real analysis.

### 7.1 Quick-Reference: All Commands & Options

```
Usage:
  npx ts-node src/scripts/debug-analysis.ts <command> [args...]

Commands:
  run <mode> <username>          Analysis simulation (falls back to fixtures)
  trace <jobId> [--all]          Print decision traces (WIP — stub)
  compare <username>             Light vs Deep delta report (fixture-based)
  fixture <fixtureName>          Run ALL modules against a fixture
  module <moduleId> <fixture>    Run ONE module against a fixture (verbose trace)
  validate-installation          Check trace infrastructure wiring

Options (positional after command):
  --installationId <id>          GitHub App installation ID
  --cv-text "<text>"             CV claims text

Environment variables:
  TRACE_VERBOSITY=full|decision|summary    (default: decision)
  GITHUB_SYSTEM_TOKEN                      (required for run/compare)

Available fixtures:
  strong_boundary        All thresholds pass, modules at max confidence
  just_below_boundary    Thresholds barely not met, one level below max
  flag_triggers          Each anti-gaming module raises its expected flag
  enterprise_profile     Only A+B groups present, P7 observability gate fires

Available module IDs:
  p1_execution_reliability    p2_systems_evolution
  p3_collaboration_leverage   p4_technical_depth
  p5_operational_maturity     p6_ai_leverage           (stub)
  p7_authenticity_confidence
  ag1_commit_inflation        ag2_fork_dump
  ag3_burst_dormancy          ag4_repository_laundering
  ag5_ai_generation_detection  (stub)
  ag6_credential_leak         (deep mode only)
  ev_employment_verification
```

### 7.2 Command: `validate-installation` — Verify Trace Wiring

**What it does:** Checks that all trace infrastructure files compile and the ModuleRegistry
has modules registered. Does NOT run any modules.

```bash
npx ts-node src/scripts/debug-analysis.ts validate-installation
```

**Real output (current behavior):**
```
═══ TRACE INFRASTRUCTURE VALIDATION ═══

  [✓] trace-recorder.interface.ts  — All types defined
  [✓] trace-recorder.service.ts    — Factory + IsolatedRecorder compiled
  [✓] trace-context-holder.ts      — AsyncLocalStorage singleton compiled
  [✓] trace.module.ts              — DynamicModule forRoot/forTest compiled
  [✓] ModuleRegistry               — 14 modules registered

  Checking wiring...

  [✓] ModuleRegistry receives optional TraceRecorderFactoryService
  [✓] TraceContext.init() called on Registry construction
  [✓] AsyncLocalStorage context isolation — each mod.run() gets own recorder

  Registered modules (14):
    - ag1_commit_inflation        - ag2_fork_dump
    - ag3_burst_dormancy          - ag4_repository_laundering
    - ag5_ai_generation_detection - ag6_credential_leak
    - ev_employment_verification
    - p1_execution_reliability    - p2_systems_evolution
    - p3_collaboration_leverage   - p4_technical_depth
    - p5_operational_maturity     - p6_ai_leverage
    - p7_authenticity_confidence

  RESULT: All infrastructure correctly wired.
```

This is the best first command to run. If it fails with import errors, the rest of the
commands won't work.

### 7.3 Command: `fixture` — Run All Modules Against a Fixture

**What it does:** Runs every registered module against a fixture corpus and prints a
pass/fail table comparing actual vs expected confidence levels. Modules whose preflight
check fails (missing required corpus groups) are skipped.

```bash
# Basic run (verbosity = decision, only thresholds + branches shown)
npx ts-node src/scripts/debug-analysis.ts fixture strong_boundary

# With FULL verbosity — shows derived metrics + raw signal reads
TRACE_VERBOSITY=full npx ts-node src/scripts/debug-analysis.ts fixture strong_boundary

# Test flag triggers
npx ts-node src/scripts/debug-analysis.ts fixture flag_triggers
```

**Real output (current behavior — `strong_boundary` partial example):**
```
═══ FIXTURE: strong_boundary ═══
  Description: Strong boundary — every threshold passes, all modules at max confidence

  ⏭️  p6_ai_leverage: skipped (missing groups: )
  ⏭️  ag6_credential_leak: skipped (missing groups: C, D)
    ag1_commit_inflation: strong  flags=0  evidence=1
    ag2_fork_dump: strong  flags=0  evidence=1
    ag3_burst_dormancy: strong  flags=0  evidence=1
    ag4_repository_laundering: strong  flags=0  evidence=4
    ag5_ai_generation_detection: observability_gap  flags=0  evidence=0
  → ev_employment_verification: moderate  flags=0  evidence=3
  → p1_execution_reliability: strong  flags=0  evidence=6
  → p2_systems_evolution: moderate  flags=0  evidence=2
  → p3_collaboration_leverage: strong  flags=0  evidence=4
  → p4_technical_depth: strong  flags=0  evidence=2
  → p5_operational_maturity: strong  flags=0  evidence=5
  → p7_authenticity_confidence: strong  flags=0  evidence=4

  ┌─────────────────────────────────────────────┐
  │ Module           │ Expected │ Actual │ Status │
  ├──────────────────┼──────────┼────────┼────────│
  │ ev_employment_verif│ moderate│ moderate│ ✅ PASS │
  │ p1_execution_reli│ strong  │ strong │ ✅ PASS │
  │ p2_systems_evolut│ moderate│ moderate│ ✅ PASS │
  │ p3_collaboration_│ strong  │ strong │ ✅ PASS │
  │ p4_technical_dept│ strong  │ strong │ ✅ PASS │
  │ p5_operational_ma│ strong  │ strong │ ✅ PASS │
  │ p6_ai_leverage   │ obs_gap │ obs_gap│ ✅ PASS │
  │ p7_authenticity_c│ strong  │ strong │ ✅ PASS │
  │ ag1_commit_inflat│ strong  │ strong │ ✅ PASS │
  │ ag2_fork_dump    │ strong  │ strong │ ✅ PASS │
  │ ag3_burst_dorman│ strong  │ strong │ ✅ PASS │
  │ ag4_repository_la│ strong  │ strong │ ✅ PASS │
  │ ag5_ai_generation│ obs_gap │ obs_gap│ ✅ PASS │
  │ ag6_credential_le│ obs_gap │ N/A    │ ✅ PASS │
  └─────────────────────────────────────────────┘

  PASS: 14/14 modules match expected confidence
```

**With `TRACE_VERBOSITY=full`, each module's FULL trace is printed:**
```
  ── Detailed Decision Traces ──

  Module: ag1_commit_inflation
  ────────────────────────────────────────────────────────────
    THRESHOLDS:
      ✓ sub5Met=true  (0.1 >= 0.3)
      ✗ p25Met=false  (80 >= 3)
    DECISION BRANCHES:
      Branch: commit_inflation_determination → strong
        Inputs: {"sub5Met":true,"p25Met":false}
    Result: confidence=strong flags=0
  ════════════════════════════════════════════════════════════

  Module: p1_execution_reliability
  ────────────────────────────────────────────────────────────
    THRESHOLDS:
      ✓ cadenceMet=true  (4 >= 9)
      ✓ sizeMet=true  (200 >= 20)
      ✓ ciMet=true  (1 >= 2)
    DECISION BRANCHES:
      Branch: confidence_determination → strong
        Inputs: {"primarySignalsMet":2,"activeMonths":4,"isJunior":false}
    Result: confidence=strong flags=0
  ════════════════════════════════════════════════════════════
```

### 7.4 Command: `module` — Single Module with Full Verbose Trace

**What it does:** Runs ONE module against ONE fixture and prints:
- Corpus values relevant to that module (groups C and E)
- Every threshold evaluation with raw observed values
- The confidence determination branch with blocked-higher analysis
- Assertion: expected vs actual confidence (pass/fail)
- Flag checks: expected flag IDs vs actual (if fixture defines them)

```bash
# Test P1 with a fixture where it should produce 'strong'
npx ts-node src/scripts/debug-analysis.ts module p1_execution_reliability strong_boundary

# Test P2 — should show why it can't reach 'strong' (complexityYears < 2)
npx ts-node src/scripts/debug-analysis.ts module p2_systems_evolution strong_boundary

# Test AG1 flag trigger
npx ts-node src/scripts/debug-analysis.ts module ag1_commit_inflation flag_triggers

# Test P7 with enterprise_profile — should trigger observability gate
npx ts-node src/scripts/debug-analysis.ts module p7_authenticity_confidence enterprise_profile
```

**Real output (current behavior — `module p1_execution_reliability strong_boundary`):**
```
═══ MODULE TEST: p1_execution_reliability ═══
  Fixture: strong_boundary — Strong boundary: every threshold passes, all modules at max confidence

  GROUP C (Commit Intelligence):
    commit_frequency_by_month:  24 active months
    median_commit_size_lines:  200
    sub_5_line_commit_ratio:   0.10
    total_commits_lifetime:    5000

  GROUP E (Engineering Practices):
    ci_pass_rate_trajectory:   4 quarters
    repos_with_test_dir:       2

  THRESHOLD EVALUATIONS:
    ✓ cadenceMet=true  (4 >= 9)
    ✓ sizeMet=true  (200 >= 20)
    ✓ ciMet=true  (1 >= 2)

  CONFIDENCE DETERMINATION:
    confidence_determination:
    → strong

  RESULT:
    confidence: strong
    flags: 0
    evidence: 6

  ASSERTION: Expected "strong" → ✅ PASS
```

**Test a module that takes the `observability_gap` branch — `module p2_systems_evolution strong_boundary`:**
```
═══ MODULE TEST: p2_systems_evolution ═══
  THRESHOLD EVALUATIONS:
    ✓ cadenceMet=true  (4 >= 9)
    ✓ ciMet=true  (1 >= 2)
    ✓ sizeMet=true  (200 >= 20)

  CONFIDENCE DETERMINATION:
    confidence_determination:
    → moderate
      (blocked strong: activeMonths=10 < 12)
```

**Test with flag triggers — `module ag1_commit_inflation flag_triggers`:**
```
════ MODULE TEST: ag1_commit_inflation ═══
  RESULT:
    confidence: moderate
    flags: 1
    evidence: 2

  ASSERTION: Expected "strong" → ❌ FAIL
    WARNING: Expected "strong" but got "moderate"

  FLAG CHECK: Expected "COMMIT_INFLATION_SOFT" → ✅ PRESENT
```

### 7.5 Command: `compare` — Light vs Deep Delta Report (Fixture-Based)

**What it does:** Simulates Light vs Deep by running all modules against two corpora
derived from `strong_boundary`. The "Light" corpus has `per_repo_author_stats`,
`complexity_trend_by_year`, and `test_to_code_ratio_by_repo` cleared (mimicking Light
mode limitations). Prints a delta table showing which modules differ — expected differences
are marked `≠ EXPECTED`, unexpected ones are flagged as `⚠️ UNEXPECTED!`.

```bash
npx ts-node src/scripts/debug-analysis.ts compare torvalds
```

**Real output (current behavior — partial):**
```
═══ LIGHT vs DEEP COMPARISON ═══
  Username: torvalds

  ┌──────────────────────────────────────────────────────────────────┐
  │ MODULE DELTA REPORT                                               │
  ├──────────────────────────────────────────────────────────────────┤
  │ Module              │ Light        │ Deep         │ Δ?           │
  ├──────────────────────┼──────────────┼──────────────┼───────────────│
  │ ev_employment_verif │ moderate    │ moderate    │ =            │
  │ p1_execution_reliab│ strong      │ strong      │ =            │
  │ p2_systems_evolution│ low        │ low         │ =            │
  │ p3_collaboration_le│ strong      │ strong      │ =            │
  │ p4_technical_depth │ strong      │ strong      │ =            │
  │ p5_operational_matu│ strong      │ strong      │ =            │
  │ p6_ai_leverage     │ observability_gap│ observability_gap│ =            │
  │ p7_authenticity_con│ strong      │ strong      │ =            │
  │ ag1_commit_inflatio│ strong      │ strong      │ =            │
  │ ag2_fork_dump      │ strong      │ strong      │ =            │
  │ ag3_burst_dormancy │ strong      │ strong      │ =            │
  │ ag4_repository_laun│ strong      │ strong      │ =            │
  │ ag5_ai_generation_d│ observability_gap│ observability_gap│ =            │
  │ ag6_credential_leak│ observability_gap│ observability_gap│ =            │
  └──────────────────────────────────────────────────────────────────┘

  ═══ VERDICT ═══
  ✅ No deltas found.
```

> **Note:** With the current fixture, there are no deltas because the fixtures are
> identical. In production with real GitHub data, P2 and EV would differ (see Section 5).
> The `compare` command validates that the delta-detection logic itself works correctly.

### 7.6 Command: `run` — Analysis Simulation

**What it does:** Accepts a mode and username but does NOT make real GitHub API calls.
Currently falls back to `strong_boundary` fixture. Use the HTTP API for real analysis.

```bash
# Always falls back to strong_boundary fixture:
npx ts-node src/scripts/debug-analysis.ts run light torvalds
```

**Actual output:** Prints instructions to use HTTP API instead, then runs the fallback fixture.

### 7.7 Command: `trace` — Decision Trace Inspection (Stub)

**What it does:** Prints instructions to re-run with `fixture` + full verbosity.
Trace retrieval from a real job's in-memory store is not yet implemented.

```bash
npx ts-node src/scripts/debug-analysis.ts trace job_abc123 --all
```

**Actual output:** Points you to:
```
TRACE_VERBOSITY=full npx ts-node src/scripts/debug-analysis.ts fixture strong_boundary
```

---

### 7.8 Frequently Asked Questions

#### "Can I see what happened at the fetching of Group A only?"

**No — the trace system operates at the module execution level, not the data collection level.**

The trace infrastructure (`TraceContext`, `TraceRecorder`) is designed to capture
decision logic **inside module `run()` methods** — gates, thresholds, branches, and flags.
It does NOT trace the corpus acquisition pipeline (DataCollector, DeepCollector,
CorpusCache, or GitHub API calls).

To debug data collection for Group A (Identity):
1. **Use server logs** — the DataCollector emits structured logs with
   `phase=collect_start`, `phase=group_complete group=A`, durationMs, etc.
   Check your NestJS logger output during a real analysis run.
2. **Inspect the raw corpus** — after a real run via the HTTP API, the corpus is
   stored in Redis (7-day TTL, keyed by username). You can pull it with redis-cli:
   ```bash
   redis-cli GET "corpus:v2:{githubUsername}"
   ```
3. **Write a one-off script** — for deep investigation of a single group, write a
   small script that imports DataCollectorService in application context and calls
   `collectLightMode()` or individual group collectors. The existing script structure
   in `debug-analysis.ts` can serve as a template.
4. **Future enhancement** — a `collector` subcommand could be added to
   `debug-analysis.ts` that runs a single group collector against a real GitHub
   profile and dumps the raw fields. See Section 7.9 for planned commands.

#### "What's the difference between `fixture` and `module` commands?"

| Aspect | `fixture` | `module` |
|--------|-----------|----------|
| Scope | ALL 14 modules | ONE module |
| Verbosity | Pass/fail table + confidence summary | Full threshold evaluations + branch analysis |
| Flag checks | If fixture defines expectedFlags | Per-fixture flag checks |
| Corpus dump | No | Yes — groups C and E fields printed |
| Use case | Regression test all modules at once | Debug why a single module made a specific decision |

#### "How do I see the full trace including derived metrics?"

Set `TRACE_VERBOSITY=full`:
```bash
TRACE_VERBOSITY=full npx ts-node src/scripts/debug-analysis.ts fixture strong_boundary
```

This prints `DERIVED METRICS (full)` and raw signal reads for each module after the
confidence table. At verbosity `decision` (default), only thresholds and branches are shown.

#### "How do I know which module IDs are valid?"

Run `validate-installation` — it prints all 14 registered module IDs. Or check the
table in Section 7.8 of the quick reference.

### 7.9 Planned / Future Commands

These commands are documented in the design but NOT YET implemented in the script:

| Command | Status | Description |
|---------|--------|-------------|
| `run <light\|deep> <username>` | ⚠️ Stub (falls back to fixture) | Run real analysis via HTTP API and capture traces — needs API client integration |
| `trace <jobId> [moduleId]` | ⚠️ Stub | Retrieve decision traces from a completed job's in-memory store — needs trace persistence layer |
| `collector <group> <username>` | ❌ Not built | Run a single corpus group collector (A-G) against a GitHub profile and dump raw fields — would address the "see Group A fetching" question |

### 7.10 Quick Reference: Trace Points in Each Module

When instrumenting modules with `TraceContext.captureXxx()` calls, use this
cheat sheet to know which capture method to call at each decision point:

| Module | Gate(s) | Thresholds | Branch | Flag(s) |
|--------|---------|------------|--------|---------|
| P1 | — | cadenceMet, sizeMet, ciMet | confidence_determination | — |
| P2 | junior_gate | complexityYears, refactorSignals, longLivedRepos | confidence_determination | — |
| P3 | low_activity_gate | substantive_ratio, reviewer_ratio, self_merge, cross_repo | confidence_determination | — |
| P4 | — | deepLangs, opMarkers, hasAdoption | confidence_determination | — |
| P5 | — | docker, ci, obs, iac | confidence_determination | SECRET_LEAK_HARD |
| P6 | — | — | — | — (stub) |
| P7 | observability_gate | burstFlag, fork_ratio, inflation, codeSearch | confidence_determination | — |
| AG1 | — | sub5Met, p25Met | commit_inflation_determination | COMMIT_INFLATION_SOFT |
| AG2 | — | forkRatio | fork_dump_determination | FORK_DUMP_SOFT |
| AG3 | — | ratio, triggered | burst_dormancy_determination | BURST_DORMANCY_SOFT |
| AG4 | — | codeSearchFlags, copyleaks | repo_laundering_determination | REPO_LAUNDERING_* |
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
