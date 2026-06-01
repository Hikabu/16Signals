# GitIntel Migration Plan: Legacy (16Signals) → Target Architecture (Refactored)

**Date:** June 1, 2026  
**Status:** Planning & Pre-Implementation  
**Scope:** Full migration from monolithic legacy analysis pipeline to composable 3-layer GitIntel architecture  
**Target Completion:** 8 weeks (with incremental stages)

---

## EXECUTIVE SUMMARY

Both systems currently coexist:
- **Legacy:** `/modules/scoring/` with monolithic pipeline (AnalysisController, SignalExtractorService, ScoringService, etc.)
- **Refactored:** `/modules/analysis/` with target 3-layer composable pipeline (AnalysisV2Controller, ModuleRegistry, WaveOrchestrator, etc.)

### Current Implementation Status

**✅ Refactored Tier 1 (Core infrastructure):**
- Corpus types, schema, caching (corpus.types.ts, corpus-cache.service.ts)
- Module interface & contract (module.interface.ts, module-result.types.ts)
- Module registry (module-registry.ts)
- AnalysisV2Controller with 3 endpoints (light, cv-verify, deep)
- All 14 analysis modules (P1–P7, AG1–AG6, EV) — **STARTED but partially incomplete**
- Wave orchestrator & job dispatcher (incomplete)
- Data collector infrastructure (Group collectors A–G) — **STARTED**
- LLM integration (Deepseek v4) — **STARTED**
- Brief assembler — **STARTED**

**⚠️ Refactored Tier 2 (Completeness & Integration):**
- Module implementations: All 14 files exist but need verification of correctness
- Wave orchestration logic: Needs completion & testing
- LLM integration: Needs full implementation & error handling
- Brief assembly: Needs full implementation & Markdown rendering
- Swagger documentation: Needs comprehensive RestAPI docs for all endpoints
- Error handling & edge cases: Circuit breaker, partial corpus handling

**🚫 Legacy Tier (To be deprecated):**
- AnalysisController at `/scoring/analysis/analysis.controller.ts` — Still actively used
- ScoringService (monolithic) — Still in use
- SignalExtractorService — Still in use
- GithubAdapterService (legacy fetcher) — Still in use

---

## CRITICAL ASSESSMENT: PATH TO COMPLETION

### Gap Analysis

| Component | Legacy Status | Refactored Status | Gap | Priority |
|-----------|---|---|---|---|
| **Corpus Abstraction** | ❌ None | ✅ Complete (Redis, 7d TTL) | 0 | — |
| **Data Collector (Groups A–G)** | 🟡 Mixed (in GithubAdapterService) | 🟡 Started (7 collectors) | Group collectors need completion & integration | HIGH |
| **Module System (14 modules)** | ❌ 1 monolithic scorer | ✅ Started (all 14 files exist) | Modules need correctness verification & testing | HIGH |
| **Wave Orchestration** | ❌ Linear flow only | 🟡 Started (wave-orchestrator.service.ts exists) | Orchestration logic incomplete | HIGH |
| **LLM Integration (Deepseek v4)** | ❌ Claude stub (SummaryGeneratorService) | 🟡 Started (deepseek-client.ts exists) | LLM calls in Waves 3 & 4 need completion | HIGH |
| **Brief Assembly** | 🟡 Partial (legacy assembles AnalysisResult) | 🟡 Started (brief-assembler.service.ts exists) | Markdown rendering, Section A–G, needs completion | HIGH |
| **CV Claim Extraction** | ❌ None | 🟡 Started (cv-claim-extractor.service.ts) | Integration with Section B cross-reference needed | MEDIUM |
| **Employment Verification** | ❌ None | 🟡 Started (ev-employment-verification.module.ts) | CV claim enrichment logic needed | MEDIUM |
| **Swagger Documentation** | 🟡 Partial (legacy API) | 🟡 Basic (AnalysisV2Controller has @ApiTags but needs detail) | Full endpoint docs + response schemas needed | MEDIUM |
| **Error Handling & Recovery** | 🟡 Partial (legacy has cache fallback) | 🟡 Basic (circuit breaker exists) | Partial corpus handling, graceful degradation | MEDIUM |
| **Testing (E2E)** | 🟡 Legacy has some e2e tests | ❌ Refactored has 0 e2e tests | Full e2e test suite for all user flows | HIGH |
| **Backwards Compatibility** | N/A | 🟡 Minimal adapter | Legacy→Refactored migration path needed | MEDIUM |

---

## MIGRATION STRATEGY

### Stage-Based Approach (8 Stages from Refactor Plan)

The DEEPSEEK_V4_REFACTOR_PLAN.md already laid out these stages. **Our task: complete and integrate them.**

| Stage | Name | Status | Duration | Deliverable |
|-------|------|--------|----------|-------------|
| 0 | Prerequisites (schema + types) | ✅ COMPLETE | ~5 hrs | Schema migrations, Zod schemas, tracing config |
| 1 | Signal Corpus Layer | ✅ COMPLETE | ~10 hrs | CorpusCache, CorpusBuilder, 7d TTL |
| 2 | Module System | 🟡 50% DONE | 120 hrs | 14 modules (P1–P7, AG1–AG6, EV) fully implemented & tested |
| 3 | Wave Orchestrator | 🟡 30% DONE | 60 hrs | 4 waves (1, 2a[conditional], 2b/c/d, 3, 4) working with tracing |
| 4 | Data Collector Refactor | 🟡 40% DONE | 80 hrs | 7 group collectors + circuit breaker integration |
| 5 | LLM Integration (Deepseek v4) | 🟡 20% DONE | 30 hrs | Wave 3 batch call + Wave 4 narrative/interview questions |
| 6 | Brief Assembler | 🟡 30% DONE | 50 hrs | Markdown rendering, all 7 sections (A–G), seniority weighting |
| 7 | Multi-Mode Dispatcher & API Migration | 🟡 40% DONE | 40 hrs | V2 controller complete, Swagger docs, backwards compat |
| 8 | Deep Mode & Clone Workers | 🟡 20% DONE | 60 hrs | Clone workers, tool runners (scc, tokei, gitleaks) |

**Total Remaining Effort: ~440 hours (~11 weeks)**

---

## DETAILED MIGRATION PLAN

### PHASE 1: COMPLETE CORE INFRASTRUCTURE (Weeks 1–2)

**Goal:** Stages 0–3 complete and tested. Corpus → Orchestration fully working.

#### 1.1 Verify & Complete Corpus Layer (Stage 1) — 5 hours

**Files to Review:**
- ✅ `corpus/corpus.types.ts` — Verify all 7 group interfaces (A–G)
- ✅ `corpus/corpus-cache.service.ts` — Verify Redis 7d TTL implementation
- ✅ `corpus/corpus.schema.ts` — Verify Zod validation schemas

**Actions:**
1. Run corpus unit tests: `npm test -- corpus.cache.spec.ts`
2. Verify Redis integration works in test environment
3. Add corpus TTL expiry tests (7d sliding window)

**Deliverable:** ✅ Corpus layer fully tested and verified

---

#### 1.2 Complete All 14 Analysis Modules (Stage 2) — 120 hours

**Current State:** All 14 module files exist. Must verify correctness per spec.

**Primitives (P1–P7):**
- [x] `p1-execution-reliability.module.ts` — Commit cadence, size discipline, CI pass rate, tests, semver, dependabot
- [ ] `p2-systems-evolution.module.ts` — Complexity trend, code quality trajectory
- [ ] `p3-collaboration-leverage.module.ts` — PR review quality, collaboration depth
- [ ] `p4-technical-depth.module.ts` — Stack diversity, OSS impact, publications
- [ ] `p5-operational-maturity.module.ts` — Infrastructure, observability, monitoring
- [ ] `p6-ai-leverage.module.ts` — **LLM-dependent** (Wave 3), AI tool usage, copilot markers
- [ ] `p7-authenticity-confidence.module.ts` — Role archetype fit, domain specialization

**Anti-Gaming (AG1–AG6):**
- [ ] `ag1-commit-inflation.module.ts` — Commit count anomalies
- [ ] `ag2-fork-dump.module.ts` — Fork-to-owned ratio, farm detection
- [ ] `ag3-burst-dormancy.module.ts` — Temporal anomaly on frequency
- [ ] `ag4-repository-laundering.module.ts` — **Code Search API**, cross-repo similarity
- [ ] `ag5-ai-generation-detection.module.ts` — **LLM-dependent** (Wave 3), style patterns
- [ ] `ag6-credential-leak.module.ts` — Secret detection, revocation status

**Employment Verification (EV):**
- [ ] `ev-employment-verification.module.ts` — CV claim cross-reference (3 rungs)

**For Each Module:**
1. ✅ Verify interface implementation (module_id, primitive_id, required_corpus_groups, required_collection_mode, run(), preflight())
2. ✅ Verify evidence collection (cites exact corpus field paths)
3. ✅ Verify confidence levels (strong, moderate, low, observability_gap, insufficient_data)
4. ✅ Verify flags (if applicable) — type, severity, escalation rules
5. ✅ Verify interview probes (if confidence < strong)
6. ✅ Verify corpus group requirements and handling
7. Create unit tests (fixtures + test cases)
8. Add to `__tests__/fixtures/signal-corpus-fixtures.ts`

**Spec References:**
- Primitives: Analysys_specs_architecture.md Section 3 (P1–P7)
- Anti-gaming: Target spec includes 6 AG modules + characteristics
- Module interface: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 2

**Testing:**
```bash
npm test -- "modules/primitives/*.spec.ts"
npm test -- "modules/anti-gaming/*.spec.ts"
npm test -- "modules/employment/*.spec.ts"
```

**Deliverable:** All 14 modules fully implemented, unit tested (>90% coverage), ready for orchestration

---

#### 1.3 Complete Wave Orchestrator (Stage 3) — 60 hours

**Current State:** `orchestration/wave-orchestrator.service.ts` exists but logic incomplete.

**Wave Sequence (from Analysys_specs_architecture.md Section 1.6):**

```
Wave 1 (parallel): AG1, AG2, AG3 — ~2s
  ↓
Wave 2a (conditional): AG4 — ~20s if AG1/AG3 triggered, else skip
  ↓
Waves 2b, 2c, 2d (parallel): P1–P5 — ~1s
  ↓
Wave 3 (batched LLM): P6, AG5 + message quality scoring + employment verification rungs 1–3 — ~25s
  ↓
Wave 4: Brief assembly + narrative LLM calls + interview question generation — ~20s
```

**Implementation Checklist:**

1. [ ] **Wave 1 Executor:** Run AG1, AG2, AG3 in parallel, collect results/flags
2. [ ] **Wave 2a Gate:** Check if AG1 OR AG3 raised flags → trigger AG4, else skip
3. [ ] **Waves 2b/c/d Executor:** Run independent waves concurrently
4. [ ] **Wave 2 Consolidation:** Merge results before Wave 3
5. [ ] **Wave 3 LLM Batch:** Prepare API call with all needed context, call Deepseek v4, parse response, populate P6 + AG5 confidence
6. [ ] **Wave 4 LLM Calls:** Narrative generation + interview question generation (separate calls)
7. [ ] **Error Handling:** Module errors → confidence=observability_gap + flag + interview probe
8. [ ] **Tracing:** Console.log at every wave gate with timing

**Files to Update:**
- `orchestration/wave-orchestrator.service.ts` — Main orchestration logic
- `orchestration/job-dispatcher.service.ts` — Job lifecycle + state transitions
- `orchestration/analysis-state-machine.ts` — State management (queued → wave_1 → wave_2a → wave_2b → wave_3 → wave_4 → complete)

**Testing:**
```bash
npm test -- "orchestration/wave-orchestrator.spec.ts"
npm test -- "orchestration/job-dispatcher.spec.ts"
```

**Deliverable:** Wave orchestrator fully functional, all waves executing in correct order with parallel execution where applicable

---

### PHASE 2: DATA COLLECTION & LLM INTEGRATION (Weeks 3–4)

**Goal:** Data collection complete, LLM calls working, brief assembly functional.

#### 2.1 Complete Data Collector (Stage 4) — 80 hours

**Current State:** Group collectors exist (A–G) but integration incomplete, circuit breaker basic.

**Group Collectors (Light Mode):**

| Group | Files | Estimated Hours | Status |
|-------|-------|---|---|
| A (Identity) | `group-a.collector.ts` | 5 | Basic |
| B (Repositories) | `group-b.collector.ts` | 10 | Needs GraphQL optimization |
| C (Commits) | `group-c.collector.ts` | 15 | Needs sampling + histogram |
| D (Collaboration) | `group-d.collector.ts` | 10 | Needs PR pagination |
| E (Engineering) | `group-e.collector.ts` | 15 | Needs CI trajectory + secret scanning check |
| F (Impact) | `group-f.collector.ts` | 15 | Needs npm/PyPI/Cargo lookups |
| G (Anti-gaming) | `group-g.collector.ts` | 10 | Mostly deterministic |

**Integration Points:**
1. [ ] Parallel collection of independent groups (A/B/D/F parallel → C/E parallel → G)
2. [ ] Rate limit management via circuit breaker
3. [ ] Partial corpus snapshot when circuit break triggers
4. [ ] Merge logic for Light → Deep upgrade (only fetch private repos + clone deltas)

**Deep Mode Additions (Group C & E deltas):**
1. [ ] Private repo enumeration via GitHub App
2. [ ] Clone worker orchestration (`clone-worker-manager.ts`)
3. [ ] Tool runners: scc (complexity), tokei (test ratio), gitleaks (secrets), copilot detector
4. [ ] Merge cloned insights into corpus

**Files to Update:**
- `data-collector/data-collector.service.ts` — Main coordinator
- `data-collector/group-collectors/*.ts` — 7 group implementations
- `data-collector/circuit-breaker.service.ts` — Rate limit + partial snapshot
- `data-collector/corpus-builder.service.ts` — Merge builder (Light → Deep)
- `data-collector/deep/*.ts` — Clone workers + tool runners

**Testing:**
```bash
npm test -- "data-collector/group-collectors/*.spec.ts"
npm test -- "data-collector/circuit-breaker.spec.ts"
npm test -- "data-collector/deep/*.spec.ts"
```

**Deliverable:** Data collection fully functional for Light & Deep modes, circuit breaker working, partial corpus handling

---

#### 2.2 Complete LLM Integration (Stage 5) — 30 hours

**Current State:** `llm/deepseek-client.ts` exists but integration with Wave 3 & 4 incomplete.

**Wave 3 Batch Call (Message Quality + P6 + AG5):**
1. [ ] Collect message samples from corpus.commit_signals.message_quality_raw
2. [ ] Collect PR descriptions from corpus.collaboration_signals.pr_description_raw
3. [ ] Collect review comments from corpus.collaboration_signals.review_comment_raw
4. [ ] Prepare batch LLM prompt (system + user message with structured output schema)
5. [ ] Call Deepseek v4 with JSON output mode
6. [ ] Parse response → populate message_quality_scores, review_depth_scores, P6 confidence, AG5 confidence
7. [ ] Handle retries + JSON parse errors

**Wave 4 LLM Calls:**
1. [ ] Narrative generation (Sections A, B, C) → separate call
2. [ ] Interview question generation → separate call
3. [ ] Error handling → fallback to default text if LLM fails

**Files to Update:**
- `llm/deepseek-client.ts` — API client + retry logic
- `llm/llm-integration.service.ts` — Call orchestration
- `llm/llm-prompt-templates.ts` — Prompt construction
- `llm/llm-response.types.ts` — Response parsing

**Environment Variables:**
```bash
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_MAX_TOKENS=4096
DEEPSEEK_TEMPERATURE=0
DEEPSEEK_TIMEOUT_MS=35000
```

**Testing:**
```bash
npm test -- "llm/llm-integration.spec.ts"
npm test -- "llm/deepseek-client.spec.ts"  # Integration tests with mock
```

**Deliverable:** LLM integration complete, Wave 3 batch call working, Wave 4 narratives & interview questions generating

---

### PHASE 3: BRIEF ASSEMBLY & SWAGGER (Weeks 5–6)

**Goal:** Brief rendering complete, Swagger docs comprehensive, full end-to-end working.

#### 3.1 Complete Brief Assembler (Stage 6) — 50 hours

**Current State:** `brief/brief-assembler.service.ts` started, `brief/brief-renderer.ts` exists.

**Sections to Implement (Evidence Brief format):**

1. [ ] **Section A: Profile in 90 Seconds** — Seniority assessment + key stats (commits, languages, OSS)
2. [ ] **Section B: CV Claims Cross-Reference** — Mapping CV roles/companies/dates to GitHub signals + verification rungs
3. [ ] **Section C: Work Pattern Intelligence** — Commit cadence, collaboration style, engineering rigor
4. [ ] **Section D: Red Flags** — Flags raised by AG modules (with severity + escalation)
5. [ ] **Section E: Interview Probes** — Questions for low/observability_gap confidence scores
6. [ ] **Section F: Technical Assessment** — P1–P5 scores + confidence levels + evidence summaries
7. [ ] **Section G: What This Evaluation Cannot Tell You** — Data limitations, blind spots

**Rendering:**
1. [ ] Markdown template for each section
2. [ ] JSON structure for structured export
3. [ ] Seniority weighting (`seniority-weighting.ts`) — Adjust thresholds for intern/junior/mid/senior/staff/principal
4. [ ] Confidence language mapping (`confidence-language.ts`) — Human-readable confidence descriptions

**Files to Update:**
- `brief/brief-assembler.service.ts` — Main orchestration
- `brief/brief-renderer.ts` — Markdown + JSON rendering
- `brief/seniority-weighting.ts` — Threshold adjustments by role level
- `brief/confidence-language.ts` — Confidence → human text mapping

**PDF Generation (Optional Stage 8+):**
- HTML template + Puppeteer → PDF (out of scope for initial migration)

**Testing:**
```bash
npm test -- "brief/brief-assembler.spec.ts"
npm test -- "brief/brief-renderer.spec.ts"
```

**Deliverable:** Brief assembly complete, Markdown + JSON output, all 7 sections rendering correctly

---

#### 3.2 Comprehensive Swagger Documentation — 20 hours

**Current State:** AnalysisV2Controller has basic @ApiTags and @ApiOperation but lacking detail.

**Endpoints to Document:**

1. [ ] **POST /api/v2/analysis/light**
   - Request body (CreateLightAnalysisDto): githubUsername, config (seniority, role_archetype, jd_text)
   - Response (AnalysisCreateResponseDto): jobId, status
   - Error responses: 400 (invalid input), 500 (internal error)
   - Example request/response

2. [ ] **POST /api/v2/analysis/cv-verify**
   - Request body (CreateCvVerifyDto): githubUsername, cvText, config
   - Response: jobId, CV claims extracted count
   - Error responses

3. [ ] **POST /api/v2/analysis/deep**
   - Request body (CreateDeepAnalysisDto): githubUsername, installationId, config
   - Response: jobId, reposCloned, secretLeaksFound
   - Error responses: 401 (no GitHub app), 403 (insufficient permissions)

4. [ ] **GET /api/v2/analysis/:jobId**
   - Response (AnalysisStatusResponseDto): jobId, status, progress, result (if complete)
   - Status values: queued, wave_1, wave_2a, wave_2b, wave_2c, wave_2d, wave_3, wave_4, completed, failed
   - Result structure: briefMarkdown, moduleResults[], flags[], interviewQuestions[], totalDurationMs

5. [ ] **GET /api/v2/analysis/status**
   - Health check endpoint
   - Response: { status: 'healthy', serviceVersion: ... }

**DTOs with Full @ApiProperty:**
- AnalysisConfigDto (seniority enum, role_archetype enum, jd_text string)
- CreateLightAnalysisDto
- CreateCvVerifyDto
- CreateDeepAnalysisDto
- AnalysisResultDto (all fields with descriptions)
- ModuleResultDto (module_id, primitive_id, confidence, score_label, evidence[], flags[], interview_probe)

**Swagger Generation:**
```bash
npm run build  # Generates OpenAPI JSON
# Swagger available at http://localhost:3000/api/docs
```

**Files to Update:**
- `analysis/analysis-v2.controller.ts` — Add comprehensive @Api* decorators
- `analysis/analysis-v2.dto.ts` — Add @ApiProperty to all fields
- `modules/module-result.types.ts` — Add descriptions
- `brief/brief.renderer.ts` — Document output structure

**Deliverable:** Swagger UI fully documented, all endpoints callable from /api/docs, with example requests/responses

---

### PHASE 4: TESTING & VERIFICATION (Weeks 7–8)

**Goal:** Full e2e test suite passing, legacy tests still passing, migration complete.

#### 4.1 End-to-End Test Suite — 40 hours

**Test Coverage (per FINAL_USER_FLOWS.md):**

1. [ ] **Light Mode Full Flow**
   ```
   POST /api/v2/analysis/light ← corpus cache miss ← data collection (9.5s) 
   → wave orchestration (50ms) → LLM processing (35s) → brief assembly (5ms) 
   → GET /api/v2/analysis/:jobId (complete)
   ```

2. [ ] **Light Mode Cache Hit**
   ```
   POST /api/v2/analysis/light ← corpus cache hit (skip collection, 30s saved)
   → wave orchestration → brief assembly
   ```

3. [ ] **CV Verification Flow**
   ```
   POST /api/v2/analysis/cv-verify ← CV extraction → Light Mode with claims
   → Brief Section B cross-reference populated
   ```

4. [ ] **Deep Mode Full Flow**
   ```
   POST /api/v2/analysis/deep ← Light corpus auto-fetch if missing ← private repos
   → clone workers (3 repos, 250s) ← tool runs (scc, tokei, gitleaks)
   → wave orchestration with enriched corpus → brief assembly
   ```

5. [ ] **Error Scenarios**
   - Invalid GitHub username → 400 error
   - Rate limit hit → partial corpus stored, modules adapt (confidence=observability_gap)
   - LLM failure → fallback to default narrative
   - Missing corpus group → module preflight catch, confidence downgrade

6. [ ] **Swagger Verification**
   - All endpoints callable from /api/docs
   - All request/response schemas validated
   - Example requests return 201/200 responses

**Test Files to Create:**
```
test/
├── analysis/
│   ├── analysis-light-mode.e2e-spec.ts       (Light flow)
│   ├── analysis-light-cache.e2e-spec.ts      (Cache hit)
│   ├── analysis-cv-verify.e2e-spec.ts        (CV flow)
│   ├── analysis-deep-mode.e2e-spec.ts        (Deep flow)
│   ├── analysis-error-handling.e2e-spec.ts   (Error scenarios)
│   └── analysis-swagger.e2e-spec.ts          (Swagger validation)
```

**Run All Tests:**
```bash
npm test:e2e -- "test/analysis/*.e2e-spec.ts"
```

**Deliverable:** Full e2e test suite passing (>95% success rate for happy paths)

---

#### 4.2 Legacy Test Preservation & Mode Transition — 20 hours

**Goal:** No regression in legacy system during migration, smooth transition path.

**Actions:**
1. [ ] Run all existing legacy tests: `npm test -- "test/analysis-*.e2e-spec.ts"`
2. [ ] Verify legacy AnalysisController still works (if not fully deprecated)
3. [ ] Create migration adapter: Legacy API request → route to v2 if available
4. [ ] Document deprecation timeline (legacy endpoints marked @Deprecated in Swagger)
5. [ ] Plan legacy shutdown (v3, v4 only use v2)

**Deliverable:** Zero regressions in legacy tests, clear migration timeline documented

---

### PHASE 5: INTEGRATION & CLEANUP (Week 8)

**Goal:** Full system integration, legacy system cleanly deprecated or removed.

#### 5.1 Wire v2 into AppModule — 5 hours

**Current State:** AnalysisV2Module exists but AppModule may not fully utilize it.

**Actions:**
1. [ ] Verify AnalysisV2Module is imported in AppModule
2. [ ] Verify all dependencies are provided (Redis, Prisma, Octokit, etc.)
3. [ ] Test /api/v2/analysis/* endpoints on local + staging

**Files to Check:**
- `src/app.module.ts` — Verify AnalysisV2Module imported
- `src/modules/analysis/analysis/analysis-v2.module.ts` — Verify imports complete

**Deliverable:** V2 endpoints live and callable

---

#### 5.2 Deprecate Legacy Endpoints — 10 hours

**Strategy A: Parallel Operation (recommended)**
- Keep legacy `/api/analysis/*` endpoints working
- Add deprecation header: `Deprecation: true`
- Redirect logs to console: "Legacy API called, migrate to /api/v2/analysis"
- Timeline: Support for 2 quarters, then remove

**Strategy B: Immediate Cutover**
- Remove legacy AnalysisController
- Migrate any external consumers to v2 endpoints
- Risk: Breaking changes if external systems depend on old API

**Recommended:** Strategy A (backward compatible deprecation)

**Files to Update:**
- `src/modules/scoring/analysis/analysis.controller.ts` — Add @Deprecated, log warnings
- API docs — Mark /api/analysis/* as deprecated in favor of /api/v2/analysis/*

**Deliverable:** Clear migration path, no breaking changes for consumers

---

#### 5.3 Documentation & Handoff — 10 hours

**Deliverables:**

1. **API Consumers Guide**
   - How to migrate from /api/analysis to /api/v2/analysis
   - New request/response formats
   - Status polling examples

2. **Architecture Overview**
   - 3-layer pipeline explained
   - Data flow diagrams (Corpus → Modules → Brief)
   - Wave execution sequence

3. **Operations Guide**
   - Environment variables required (DEEPSEEK_API_KEY, etc.)
   - Monitoring & tracing via console.log (with TRACING_LEVEL setting)
   - Troubleshooting common issues

4. **Developer Guide**
   - How to add a new analysis module
   - How to add a new corpus group
   - How to add a new wave gate

---

## VERIFICATION CHECKLIST: TARGET ARCHITECTURE GOALS

### Goal 1: Decouple Data Collection from Analysis ✅

- [x] Signal Corpus abstraction implemented (Redis, 7d TTL)
- [x] DataCollector separate from ModuleRegistry
- [x] Modules are stateless functions (no external API calls)
- [ ] **TO DO:** Verify no module makes direct API calls in final review

### Goal 2: Support 3 Analysis Modes ✅

- [ ] **Light Mode** — Public APIs only, ~2–3 minutes
  - [ ] Corpus collected
  - [ ] All 14 modules run (AG, P1–P5 deterministic, P6/AG5 LLM-dependent)
  - [ ] Brief generated
  - [ ] Integration test: `npm test:e2e -- test/analysis/analysis-light-mode.e2e-spec.ts`

- [ ] **Deep Mode** — Private repos + local tools, ~5–10 minutes
  - [ ] Light corpus auto-fetched or reused
  - [ ] Private repos cloned + analyzed
  - [ ] Same 14 modules but with enriched corpus
  - [ ] Integration test: `npm test:e2e -- test/analysis/analysis-deep-mode.e2e-spec.ts`

- [ ] **CV Verifier** — Light Mode + CV claims, ~2–3 minutes
  - [ ] CV text extracted → structured claims
  - [ ] Employment Verification module enriches with claims
  - [ ] Section B renders cross-reference table
  - [ ] Integration test: `npm test:e2e -- test/analysis/analysis-cv-verify.e2e-spec.ts`

### Goal 3: Re-scoring Without Re-fetching ✅

- [x] Corpus cached in Redis (7d TTL)
- [ ] **TO DO:** Test: Fetch once, score 5 times with different AnalysisConfig (seniority/role changes)
  - Expected: Only first request does collection, next 4 skip collection
  - Integration test: `npm test:e2e -- test/analysis/analysis-light-cache.e2e-spec.ts`

### Goal 4: Modular Analysis System ✅

- [x] All 14 modules implement AnalysisModule interface
- [ ] **TO DO:** Verify no inter-module dependencies (pure functions)
- [ ] **TO DO:** Verify Waves 2b, 2c, 2d run in parallel with 0 blocking
- [ ] **TO DO:** Verify Wave 2a conditional gate works (only runs if AG1 OR AG3 triggered)

### Goal 5: LLM Integration (Deepseek v4) ✅

- [ ] **TO DO:** Wave 3 batch call: P6, AG5, message quality scoring, EV rungs 1–3
  - Verify LLM prompt includes all necessary context
  - Verify response parsing handles JSON output
  - Verify retries on failure

- [ ] **TO DO:** Wave 4 narrative calls: Sections A, B, C narrative text
  - Verify fallback narrative if LLM fails
  - Verify token usage stays within limits

### Goal 6: Multi-Mode, Re-scorable Pipeline ✅

- [ ] **TO DO:** Test upgrades: Light corpus fetched, then fetch Deep later
  - Expected: Only private repo delta fetched, Light data reused
  - Saves ~40% of API calls

### Goal 7: Comprehensive Brief Assembly ✅

- [ ] **TO DO:** Section A: Profile in 90 Seconds (with seniority weighting)
- [ ] **TO DO:** Section B: CV Claims Cross-Reference (EV module output + claims table)
- [ ] **TO DO:** Section C: Work Pattern Intelligence (commitment, cadence, collaboration)
- [ ] **TO DO:** Section D: Red Flags (all AG flags, severity levels, escalation rules)
- [ ] **TO DO:** Section E: Interview Probes (for low confidence scores + medium confidence with caveats)
- [ ] **TO DO:** Section F: Technical Assessment (P1–P7 narrative with evidence)
- [ ] **TO DO:** Section G: Limitations (data gaps, blind spots, observability gaps)

### Goal 8: All User Flows via Swagger ✅

- [ ] **TO DO:** All endpoints documented in Swagger with:
  - Request body schema with enums (seniority, role_archetype)
  - Response schema with example values
  - Error responses (400, 401, 403, 500) with descriptions
  - "Try it out" example requests

- [ ] **TO DO:** Verify Swagger UI at /api/docs shows all v2 endpoints

- [ ] **TO DO:** Test each endpoint from Swagger UI (no external client needed)

### Goal 9: Tracing & Observability ✅

- [x] Tracing framework implemented (console.log with [Component] phase=X format)
- [ ] **TO DO:** Every architectural boundary emits trace logs
- [ ] **TO DO:** Verify trace logs match FINAL_USER_FLOWS.md exact sequence
- [ ] **TO DO:** Test TRACING_LEVEL environment variable (off | summary | detailed)

### Goal 10: Error Resilience & Partial Corpus ✅

- [ ] **TO DO:** Circuit breaker triggers → partial corpus saved
- [ ] **TO DO:** Missing corpus group → module adapts (preflight returns missing groups, module returns observability_gap)
- [ ] **TO DO:** LLM failure → fallback behavior (return default narrative)
- [ ] **TO DO:** Test: Corpus collection stops at 50% → brief still generated with observability_gap flags

---

## EXECUTION ROADMAP: WEEK-BY-WEEK

### Week 1: Stages 1–2 (Corpus + Modules)
- **Days 1–2:** Verify corpus layer, run tests
- **Days 3–5:** Complete & test 14 modules, each fully implemented per spec
- **Days 6–7:** Create module fixtures, integration tests

**Deliverable:** Corpus + all 14 modules passing unit tests

### Week 2: Stage 3 (Orchestration)
- **Days 1–3:** Complete wave orchestrator, state machine
- **Days 4–5:** Test wave sequencing, parallel execution
- **Days 6–7:** Test conditional Wave 2a gate, error handling

**Deliverable:** Wave orchestrator fully functional, all waves execute in order

### Week 3: Stage 4 (Data Collection)
- **Days 1–3:** Complete group collectors (A–G), parallel collection
- **Days 4–5:** Circuit breaker integration, partial corpus handling
- **Days 6–7:** Test data collection, corpus merge (Light→Deep)

**Deliverable:** Data collection complete, all groups collected for Light mode

### Week 4: Stage 5 (LLM) + Deep Mode Prep
- **Days 1–4:** Complete LLM integration, Wave 3 batch call, Wave 4 narratives
- **Days 5–7:** Clone worker + tool runners, Deep mode collection

**Deliverable:** LLM working, Deep mode ready

### Week 5: Stage 6 (Brief Assembly)
- **Days 1–3:** Implement all 7 brief sections (A–G)
- **Days 4–5:** Markdown + JSON rendering, seniority weighting
- **Days 6–7:** Comprehensive testing of brief output

**Deliverable:** Brief assembly complete, Markdown + JSON rendering working

### Week 6: Swagger Documentation
- **Days 1–4:** Comprehensive API documentation, @ApiProperty on all fields
- **Days 5–7:** Swagger UI testing, example requests

**Deliverable:** Full Swagger coverage, all endpoints documented

### Week 7: E2E Testing
- **Days 1–3:** Light mode e2e test suite (cache hit, cache miss, error scenarios)
- **Days 4–5:** Deep mode e2e tests, CV verification tests
- **Days 6–7:** Full suite running, >95% pass rate

**Deliverable:** E2e test suite complete, all flows tested

### Week 8: Integration & Cleanup
- **Days 1–2:** Wire v2 into AppModule, integration verification
- **Days 3–4:** Legacy deprecation, migration path documentation
- **Days 5–7:** Final verification checklist, handoff documentation

**Deliverable:** Full system integrated, ready for production

---

## CRITICAL SUCCESS FACTORS

1. **Modules must be pure functions** — No external API calls, only corpus consumption
2. **Wave gates must be tested** — Parallel execution in 2b/c/d, conditional 2a
3. **LLM integration must handle failures gracefully** — Fallback narratives, no broken briefs
4. **Swagger must be 100% complete** — Every endpoint, every parameter documented
5. **E2E tests must cover all user flows** — Light, Deep, CV, cache hits, errors
6. **Tracing must match spec exactly** — Trace logs must align with FINAL_USER_FLOWS.md

---

## ROLLBACK PLAN

If issues are discovered during migration:

1. **Stage-level rollback**: Each stage is independently reversible
   - Roll back to previous stage, fix issue, re-deploy
2. **Legacy fallback**: Keep legacy system live until v2 fully stable
   - Route requests to /api/analysis (legacy) if v2 fails
3. **Hotfix path**: Can patch individual modules without full re-deployment
   - v2 controller routes to individual module, bypasses orchestrator if needed

---

## SUMMARY: EFFORT ESTIMATE

| Phase | Duration | Effort |
|-------|----------|--------|
| Phase 1: Core Infrastructure | Weeks 1–2 | 185 hours |
| Phase 2: Data Collection + LLM | Weeks 3–4 | 110 hours |
| Phase 3: Brief Assembly + Swagger | Weeks 5–6 | 70 hours |
| Phase 4: Testing & Verification | Week 7 | 40 hours |
| Phase 5: Integration & Cleanup | Week 8 | 25 hours |
| **TOTAL** | **8 weeks** | **430 hours** |

**Recommended Team:** 1 senior backend engineer + 1 mid-level engineer (full-time)  
**Milestone Reviews:** End of each week for approval before proceeding

---

## NEXT STEPS

1. **Immediate (This Week)**
   - Review this plan with team
   - Assign ownership for Phases 1–5
   - Create JIRA epics for each stage
   - Set up test environments (local + staging)

2. **Week 1 Start**
   - Begin Stage 1 verification (corpus layer)
   - Begin Stage 2 implementation (14 modules)
   - Create test fixtures

3. **Ongoing**
   - Daily standup on blockers
   - Weekly milestone review + approval
   - Monitor tracing output via console.log
   - Iterate based on test feedback

---

## APPENDIX A: Key File References

### Specification Documents
- `DEEPSEEK_V4_REFACTOR_PLAN.md` — Master refactor plan (Stages 0–8)
- `Analysys_specs_architecture.md` — Target architecture specification
- `ARCHITECTURE_REFACTOR_ANALYSIS.md` — Gap analysis: legacy vs. target
- `src/modules/analysis/FINAL_USER_FLOWS.md` — User flow traces

### Implementation Files (Refactored)
- `src/modules/analysis/` — New architecture root
  - `corpus/` — Signal corpus abstraction
  - `modules/` — 14 analysis modules
  - `orchestration/` — Wave orchestrator
  - `data-collector/` — Data collection layer
  - `llm/` — Deepseek v4 integration
  - `brief/` — Brief assembly
  - `analysis/` — V2 controller & DTOs

### Legacy Files (To Deprecate)
- `src/modules/scoring/analysis/` — Legacy analysis API
- `src/modules/scoring/scoring-service/` — Monolithic scoring

---

## APPENDIX B: Glossary

| Term | Definition |
|------|-----------|
| **Corpus** | Signal Corpus; intermediate representation of all observable signals (7 groups: A–G) |
| **Module** | Analysis Module; stateless function (P1–P7, AG1–AG6, EV) |
| **Wave** | Execution wave; numbered 1–4, with parallel gates and conditional branches |
| **Evidence** | Single data point cited by a module, with corpus field path + interpretation |
| **Flag** | Security or authenticity concern raised by a module (AG modules primary source) |
| **Brief** | Evidence Brief; final output with 7 sections (A–G), Markdown + JSON |
| **Light Mode** | Public GitHub APIs only, ~2–3 minutes |
| **Deep Mode** | Private repos + local tools (clone + analyze), ~5–10 minutes |
| **CV Verifier** | Light Mode enriched with CV claims extraction & employment verification |
| **Seniority** | Career level: intern, junior, mid, senior, staff, principal (affects scoring thresholds) |
| **Role Archetype** | Job function: backend, frontend, platform, data_ml, security, mobile, generalist |

---

**Document Version:** 1.0  
**Last Updated:** June 1, 2026  
**Status:** Ready for Implementation Planning Review
