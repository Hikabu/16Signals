# User Flows & Target Architecture Goals Verification Guide

**Date:** June 1, 2026  
**Purpose:** Ensure all user flows are callable via Swagger and all target architecture goals are met  
**How to Use:** Checklist for final verification before production cutover

---

## SECTION 1: USER FLOWS — SWAGGER CALLABLE VERIFICATION

### User Flow 1: Light Mode Analysis (Public Signals Only)

**Endpoint:** `POST /api/v2/analysis/light`

**Request:**
```json
{
  "githubUsername": "torvalds",
  "config": {
    "seniority": "senior",
    "role_archetype": "backend",
    "jd_text": "Optional: job description for gap analysis"
  }
}
```

**Expected Response (201):**
```json
{
  "jobId": "light_a1b2c3d4e5f6",
  "status": "queued"
}
```

**Polling:** `GET /api/v2/analysis/{jobId}` returns:
```json
{
  "jobId": "light_a1b2c3d4e5f6",
  "status": "completed",
  "progress": 100,
  "result": {
    "briefMarkdown": "# Evidence Brief: @torvalds...",
    "briefJson": {
      "sectionA": "Profile in 90 Seconds...",
      "sectionB": "CV Claims...",
      "sectionC": "Work Pattern Intelligence...",
      "sectionD": "Red Flags...",
      "sectionE": "Interview Probes...",
      "sectionF": "Technical Assessment...",
      "sectionG": "What This Cannot Tell You..."
    },
    "moduleResults": [
      {
        "module_id": "p1_execution_reliability",
        "primitive_id": "p1",
        "confidence": "strong",
        "score_label": "Demonstrates execution reliability...",
        "evidence": [
          {
            "signal": "Commit cadence consistency",
            "corpus_field": "commit_signals.commit_frequency_by_month",
            "value": { "activeMonths": 10 },
            "interpretation": "Active in 10 of trailing 12 months..."
          }
        ],
        "flags": [],
        "interview_probe": null,
        "raw_signals_used": ["commit_signals.commit_frequency_by_month", "..."]
      },
      // ... 13 more modules
    ],
    "flags": [],
    "totalDurationMs": 45230
  }
}
```

**Verification Checklist:**
- [ ] POST endpoint returns 201 with jobId immediately (< 1s response time)
- [ ] GET returns status=queued initially, then completed when ready (~2–3 min for Light Mode)
- [ ] result.briefMarkdown readable and contains all 7 sections
- [ ] result.briefJson structured with sectionA–G keys
- [ ] result.moduleResults contains exactly 14 modules (P1–P7, AG1–AG6, EV)
- [ ] Each module has confidence, score_label, evidence[], flags[], raw_signals_used[]
- [ ] Swagger UI shows full schema for request + response

**Callability Test:**
```bash
# From Swagger UI at /api/docs:
# 1. Click "Try it out" on POST /api/v2/analysis/light
# 2. Enter example body
# 3. Click Execute → expect 201 with jobId
# 4. Copy jobId
# 5. Click "Try it out" on GET /api/v2/analysis/{jobId}
# 6. Paste jobId → expect 200 with status + result
```

---

### User Flow 2: CV Verification (Light Mode + CV Claims)

**Endpoint:** `POST /api/v2/analysis/cv-verify`

**Request:**
```json
{
  "githubUsername": "torvalds",
  "cvText": "Linus Torvalds, Senior Engineer at Linux Foundation (2010–present)...",
  "config": {
    "seniority": "senior",
    "role_archetype": "backend"
  }
}
```

**Expected Response (201):**
```json
{
  "jobId": "cv_g7h8i9j0",
  "status": "queued",
  "cvClaimsExtracted": 7
}
```

**Polling:** `GET /api/v2/analysis/{jobId}` returns:
```json
{
  "jobId": "cv_g7h8i9j0",
  "status": "completed",
  "result": {
    "briefMarkdown": "# Evidence Brief (CV Verification)...",
    "briefJson": {
      "sectionB": "[CV Claims Cross-Reference]\n\n| Claim | GitHub Evidence | Confidence | Rung 1 | Rung 2 | Rung 3 |\n| Company: Linux Foundation | Found: torvalds/linux maintainer | strong | ✓ | ✓ | ✓ |\n| Role: Senior Engineer | Inferred: complex contributions, high-quality reviews | strong | ? | ✓ | ✓ |\n..."
    },
    "moduleResults": [
      // ... all 14 modules, but EV module enhanced with CV claims
      {
        "module_id": "ev_employment_verification",
        "confidence": "strong",
        "score_label": "Employment claims verified across 3 rungs...",
        "evidence": [
          {
            "signal": "CV company claim verified by GitHub activity",
            "corpus_field": "identity.github_org_memberships",
            "value": ["Linux Foundation", "..."],
            "interpretation": "Rung 1 (dates) + Rung 2 (tech) + Rung 3 (contrib level) all verified"
          }
        ]
      }
    ]
  }
}
```

**Verification Checklist:**
- [ ] POST endpoint returns 201 with jobId + cvClaimsExtracted count
- [ ] CV text parsed correctly (companies, roles, dates, techs extracted)
- [ ] GET returns result with sectionB containing cross-reference table
- [ ] EV module result shows 3 rungs (dates, tech stack, contribution level)
- [ ] Confidence elevated if all rungs pass (strong → "employment claims verified")
- [ ] Swagger UI shows cvText parameter with large text example

**Callability Test:** Same as Light Mode, but POST body includes cvText

---

### User Flow 3: Deep Mode Analysis (Private Repos + Tools)

**Endpoint:** `POST /api/v2/analysis/deep`

**Request:**
```json
{
  "githubUsername": "torvalds",
  "installationId": 12345,
  "config": {
    "seniority": "senior",
    "role_archetype": "backend"
  }
}
```

**Expected Response (201):**
```json
{
  "jobId": "deep_d4e5f6g7",
  "status": "queued",
  "expectedDuration": "5–10 minutes"
}
```

**Polling:** `GET /api/v2/analysis/{jobId}` returns:
```json
{
  "jobId": "deep_d4e5f6g7",
  "status": "wave_2b",  // Can see intermediate progress
  "progress": 35,
  "lastUpdate": "clone worker completed 2/3 repos, now running orchestration"
}
// ... later ...
{
  "jobId": "deep_d4e5f6g7",
  "status": "completed",
  "result": {
    "briefMarkdown": "# Evidence Brief (Deep Mode)...",
    "briefJson": {
      "sectionC": "Work Pattern Intelligence...\n\nDeep Mode Insights:\n- Complexity trend analysis (2008–2025)\n- Test-to-code ratios: kernel 0.45, subsurface 0.32\n- Secret scanning: 0 critical leaks detected (gitleaks)"
    },
    "cloneStats": {
      "reposCloned": 3,
      "reposSucceeded": 3,
      "reposFailed": 0,
      "totalCloneTime": 245000,
      "secretLeaksFound": 0,
      "criticalSastFindings": 0
    }
  }
}
```

**Verification Checklist:**
- [ ] POST endpoint returns 201 with jobId (private repo fetch happens in background)
- [ ] GET polls show intermediate status (wave_1, wave_2a, wave_2b, etc.)
- [ ] Result includes cloneStats: reposCloned, reposSucceeded, secretLeaksFound
- [ ] Brief includes Deep-only signals (complexity trends, test ratios, secret details)
- [ ] P1–P5 scores potentially elevated due to enriched corpus
- [ ] Swagger UI shows installationId field (GitHub App installation ID)

**Callability Test:** Similar to Light Mode, but installationId required

---

### User Flow 4: Status Polling (Any Mode)

**Endpoint:** `GET /api/v2/analysis/{jobId}`

**Expected Responses by Status:**

| Status | Progress | Result | Use Case |
|--------|----------|--------|----------|
| `queued` | 0–5 | null | Job enqueued, not started |
| `wave_1` | 10 | null | Anti-gaming modules running |
| `wave_2a` | 15 | null | Repository laundering (if triggered) running |
| `wave_2b` | 20 | null | P1/P2/P5 modules running |
| `wave_2c` | 25 | null | P3 module running |
| `wave_2d` | 30 | null | P4 module running |
| `wave_3` | 40 | null | LLM batch call processing |
| `wave_4` | 80 | null | LLM narrative + interview generation |
| `completed` | 100 | {...} | Analysis complete, brief ready |
| `failed` | — | null | Analysis failed, error message present |

**Verification Checklist:**
- [ ] GET /api/v2/analysis/{jobId} works with any valid jobId
- [ ] Response includes all fields: jobId, status, progress, result (if complete)
- [ ] Progress is numerical 0–100
- [ ] Status values match FINAL_USER_FLOWS.md exactly
- [ ] Failed status includes error field with descriptive message
- [ ] Polling every 5s shows state progression over time
- [ ] Swagger UI allows polling with jobId parameter

---

### User Flow 5: Error Scenarios (Swagger Callable)

**Invalid GitHub Username:**
```bash
POST /api/v2/analysis/light
{
  "githubUsername": "invalid-user-that-does-not-exist-xyz",
  "config": { ... }
}
# Expected: 400 Bad Request (or 404 if GitHub returns unfound)
# Error response: { error: "GitHub user not found", code: "USER_NOT_FOUND" }
```

**Missing Required CV Text:**
```bash
POST /api/v2/analysis/cv-verify
{
  "githubUsername": "torvalds",
  "cvText": "",  // ← Empty
  "config": { ... }
}
# Expected: 400 Bad Request
# Error: { error: "cvText is required and must not be empty" }
```

**Invalid Seniority Enum:**
```bash
POST /api/v2/analysis/light
{
  "githubUsername": "torvalds",
  "config": {
    "seniority": "super-senior",  # ← Invalid
    "role_archetype": "backend"
  }
}
# Expected: 400 Bad Request
# Error: { error: "seniority must be one of: intern, junior, mid, senior, staff, principal" }
```

**Verification Checklist:**
- [ ] /api/docs shows error response codes (400, 401, 403, 500) for each endpoint
- [ ] Error responses have schemas with error message + code
- [ ] Swagger UI allows sending invalid requests → shows error response
- [ ] Error messages are descriptive (not generic "Internal Server Error")

---

## SECTION 2: TARGET ARCHITECTURE GOALS VERIFICATION

### Goal 1: Decouple Data Collection from Analysis

**Verification:**
- [ ] **Corpus abstraction layer exists:** `corpus/corpus.types.ts` defines SignalCorpus with 7 groups
- [ ] **Corpus caching implemented:** `corpus/corpus-cache.service.ts` stores/retrieves from Redis with 7d TTL
- [ ] **Analysis modules are stateless:** No module makes direct API calls; all data from corpus
- [ ] **No re-fetching on re-score:** 
  ```bash
  # Test implementation:
  1. POST /api/v2/analysis/light (corpus cache miss, ~30s)
  2. Wait for completion
  3. POST /api/v2/analysis/light (same username, different seniority) → corpus cache hit, ~5s
  4. Verify second request skipped data collection entirely
  ```
- [ ] **Test in unit tests:** `npm test -- "corpus/corpus-cache.service.spec.ts"`

---

### Goal 2: Support 3 Analysis Modes with Shared Corpus

**Light Mode Verification:**
- [ ] Endpoint: `POST /api/v2/analysis/light` callable
- [ ] Uses public GitHub APIs only (Groups A, B, D, F)
- [ ] Completes in ~2–3 minutes
- [ ] Produces complete brief with all 7 sections

**Deep Mode Verification:**
- [ ] Endpoint: `POST /api/v2/analysis/deep` callable with installationId
- [ ] Builds on Light corpus (reuses if < 7d old, else full re-collection)
- [ ] Clones private repos + runs tools (scc, tokei, gitleaks)
- [ ] Enriches Groups C (per-repo complexity) and E (test ratios, secrets)
- [ ] Completes in ~5–10 minutes
- [ ] Same 14 modules run but with enriched corpus data

**CV Verification Verification:**
- [ ] Endpoint: `POST /api/v2/analysis/cv-verify` callable
- [ ] Extracts CV claims (companies, roles, dates, tech skills)
- [ ] Runs Light Mode with CV claims passed to EV module
- [ ] Section B renders cross-reference table (CV claim ↔ GitHub evidence)
- [ ] EV module confidence elevated when claims verified
- [ ] Completes in ~2–3 minutes

**Test Implementation:**
```bash
npm test:e2e -- "test/analysis/analysis-light-mode.e2e-spec.ts"
npm test:e2e -- "test/analysis/analysis-deep-mode.e2e-spec.ts"
npm test:e2e -- "test/analysis/analysis-cv-verify.e2e-spec.ts"
```

---

### Goal 3: Re-scoring Without Re-fetching

**Test Scenario:**
```
1. Fetch corpus for user: corpus_id = cor_123 (takes ~30s)
2. Store in Redis with key: corpus:torvalds:light
3. Run analysis with seniority=junior → brief A
4. Run analysis with seniority=senior → brief B (same corpus, different weighting)
5. Verify Step 4 skipped data collection (< 5s total, not 30s)
```

**Verification Checklist:**
- [ ] CorpusCacheService.get() checks Redis before fetching
- [ ] Console logs show `[CorpusCache] phase=cache_hit` on second request
- [ ] Wave orchestration runs quickly (modules re-execute with new config, no external calls)
- [ ] Brief differences are only seniority-weighted thresholds, not different signals
- [ ] Test: `npm test:e2e -- "test/analysis/analysis-light-cache.e2e-spec.ts"`

---

### Goal 4: Modular Analysis System (14 Independent Modules)

**Verification:**
- [ ] All 14 modules exist: `modules/primitives/p*.ts` + `modules/anti-gaming/ag*.ts` + `modules/employment/ev-*.ts`
- [ ] Each module implements AnalysisModule interface
- [ ] Each module is a pure function: `run(corpus, config): ModuleResult`
- [ ] No inter-module dependencies (one module never calls another)
- [ ] Each module cites exact corpus field paths in evidence
- [ ] Module registry in `module-registry.ts` registers all 14
- [ ] Each module tested independently: `npm test -- "modules/**/*.spec.ts"`
- [ ] ModuleResult structure consistent across all modules

**Wave Execution Verification:**
- [ ] Wave 1: AG1, AG2, AG3 execute in parallel (< 10% overhead vs. sequential)
- [ ] Wave 2a: Conditional, only runs if Wave 1 raised AG1 or AG3 flags
- [ ] Waves 2b, 2c, 2d: Run in parallel (all start after Wave 1, no inter-dependencies)
- [ ] Wave 3: Waits for all prior waves, executes LLM batch call
- [ ] Wave 4: Waits for Wave 3, executes brief assembly

**Tracing Verification:**
```bash
# Run with TRACING_LEVEL=detailed
TRACING_LEVEL=detailed npm start
# Request: POST /api/v2/analysis/light
# Verify console.log output matches FINAL_USER_FLOWS.md exactly
# Expected: [Module:p1_execution_reliability] phase=run_start ...
```

---

### Goal 5: LLM Integration (Deepseek v4)

**Wave 3 LLM Call Verification:**
- [ ] Deepseek v4 client initialized (new OpenAI SDK with base URL)
- [ ] Wave 3 prepares batch context: message samples, PR descriptions, EV rungs 1–3
- [ ] Prompt includes structured output schema (JSON mode)
- [ ] API call succeeds with response: message_quality_scores, P6 confidence, AG5 confidence, EV rung scores
- [ ] Response parsed correctly (JSON parse error handling works)
- [ ] Retries on failure: up to 2 attempts with exponential backoff
- [ ] Timeout handling: 35s max, fallback behavior if exceeded

**Wave 4 LLM Calls Verification:**
- [ ] Narrative generation call (Sections A, B, C) succeeds
- [ ] Interview question generation call (4–6 questions) succeeds
- [ ] LLM failures handled gracefully: fallback to default narrative
- [ ] Token usage stays within budget (~3.5k Wave 3, ~2.5k narrative, ~2k questions)

**Environment Verification:**
```bash
# Check env vars set
echo $DEEPSEEK_API_KEY
echo $DEEPSEEK_BASE_URL
echo $DEEPSEEK_MODEL
# Expected: sk-..., https://api.deepseek.com/v1, deepseek-chat
```

**Test Implementation:**
```bash
npm test -- "llm/deepseek-client.spec.ts"
npm test -- "llm/llm-integration.spec.ts"
```

---

### Goal 6: Multi-Mode, Re-scorable Pipeline

**Verification:**
- [ ] **Light Mode corpus:** Stored in Redis with key `corpus:torvalds:light`
- [ ] **Upgrade to Deep Mode:** If Deep corpus requested, fetch only private repo delta
- [ ] **Merge delta:** Existing Light corpus merged with Deep-only outputs (Groups C/E enrichments)
- [ ] **API call savings:** ~40% reduction in API calls vs. full Deep re-collection
- [ ] **Console logs:** Show `[CorpusCache] phase=merge_delta fromMode=light toMode=deep`

**Test Implementation:**
```bash
# Scenario:
1. POST /api/v2/analysis/light (torvalds)
2. Wait for completion
3. POST /api/v2/analysis/deep (same user, installationId=12345)
4. Verify: data collection only fetches private repos, not public repos
```

---

### Goal 7: Comprehensive Brief Assembly (7 Sections)

**Verification:**

| Section | Content | Verification |
|---------|---------|---|
| **A** | Profile in 90 Seconds | [ ] Seniority inferred, key stats (commits, languages, OSS), GHE summary |
| **B** | CV Claims Cross-Reference | [ ] CV→GitHub mapping, 3-rung verification table, confidence per claim |
| **C** | Work Pattern Intelligence | [ ] Cadence, collaboration style, engineering rigor trends |
| **D** | Red Flags | [ ] All AG flags with severity, evidence paths, escalation guidance |
| **E** | Interview Probes | [ ] 4–6 targeted questions for low/observability_gap confidence |
| **F** | Technical Assessment | [ ] P1–P7 scores with confidence, evidence summaries |
| **G** | Limitations | [ ] Data gaps, blind spots, observability gaps listed explicitly |

**Markdown Quality Verification:**
- [ ] All sections render as readable Markdown (headings, tables, bullet lists)
- [ ] No broken formatting, no unescaped special characters
- [ ] Evidence citations include corpus field paths
- [ ] PDF generation possible (future enhancement)

**JSON Export Verification:**
- [ ] Brief JSON includes all sections as nested keys
- [ ] All module results preserved in full (not summarized)
- [ ] Parseable by JSON parsers (valid JSON structure)

**Test Implementation:**
```bash
npm test -- "brief/brief-assembler.spec.ts"
npm test -- "brief/brief-renderer.spec.ts"
```

---

### Goal 8: All User Flows Callable via Swagger (API Contracts)

**Swagger UI Verification:**
```bash
# Start server
npm start
# Open http://localhost:3000/api/docs
```

**Checklist:**
- [ ] **POST /api/v2/analysis/light** shown with full schema
  - Request body: githubUsername (string, required), config (AnalysisConfigDto, required)
  - Response: jobId, status
  - Try it out: Send example request → Get 201 response

- [ ] **POST /api/v2/analysis/cv-verify** shown with full schema
  - Request body: githubUsername, cvText (required), config
  - Response: jobId, status, cvClaimsExtracted
  - Try it out works

- [ ] **POST /api/v2/analysis/deep** shown with full schema
  - Request body: githubUsername, installationId (uint, required), config
  - Response: jobId, status, expectedDuration
  - Try it out works

- [ ] **GET /api/v2/analysis/{jobId}** shown with parameter
  - Parameter: jobId (string, required)
  - Response: jobId, status, progress, result (if complete), error (if failed)
  - Try it out works

- [ ] **Error Responses** documented
  - 400: Invalid request (bad field type, invalid enum, missing required)
  - 401: Unauthorized (future: auth required for some endpoints)
  - 403: Forbidden (future: insufficient permissions)
  - 404: Resource not found (jobId doesn't exist)
  - 500: Internal server error

- [ ] **Enums** documented in Swagger UI
  - seniority: [intern, junior, mid, senior, staff, principal]
  - role_archetype: [backend, frontend, platform, data_ml, security, mobile, generalist]
  - status: [queued, wave_1, wave_2a, wave_2b, wave_2c, wave_2d, wave_3, wave_4, completed, failed]
  - confidence: [strong, moderate, low, observability_gap, insufficient_data]

**Test Implementation:**
```bash
npm test:e2e -- "test/analysis/analysis-swagger.e2e-spec.ts"
```

---

### Goal 9: Tracing & Observability

**Console Log Verification (TRACING_LEVEL=detailed):**

```bash
TRACING_LEVEL=detailed npm start
# Request: POST /api/v2/analysis/light
# Expected output:
[AnalysisV2Controller] phase=light_request jobId=light_... username=...
[JobDispatcher] phase=dispatch jobId=... mode=light ...
[CorpusCache] phase=cache_miss username=... mode=light
[DataCollector] phase=collect_start ...
[DataCollector] phase=group_complete group=A durationMs=...
... (continue through all groups)
[DataCollector] phase=collect_complete totalDurationMs=...
[WaveOrchestrator] phase=orchestration_start ...
[WaveOrchestrator] phase=wave_start wave=1 ...
[Module:ag1_commit_inflation] phase=run_start ...
[Module:ag1_commit_inflation] phase=run_complete confidence=... durationMs=...
... (all modules)
[DeepseekLLM] phase=call_start callType=wave3_batch ...
[DeepseekLLM] phase=call_complete callType=wave3_batch durationMs=...
[BriefAssembler] phase=assembly_start ...
[BriefAssembler] phase=assembly_complete durationMs=...
[JobDispatcher] phase=complete jobId=... totalDurationMs=...
```

**Verification:**
- [ ] Output matches FINAL_USER_FLOWS.md trace exactly
- [ ] All component tags: [ComponentName] format
- [ ] All traces include: phase=X jobId=... username=...
- [ ] Timing data (durationMs) present for all boundary points
- [ ] TRACING_LEVEL environment variable controls verbosity

---

### Goal 10: Error Resilience & Partial Corpus

**Circuit Breaker Verification:**
- [ ] If rate limit hit during data collection, circuit breaker triggers
- [ ] Partial corpus saved with groups_present listing which groups were collected
- [ ] Missing groups marked in groups_present: ["A", "B", "D", "F"] (C, E, G missing)
- [ ] Modules requiring absent groups return observability_gap confidence

**Partial Corpus Handling Test:**
```bash
# Simulate: Collect runs for 40s, then rate limit triggers
# Expected:
# - partial corpus labeled as 'light_partial' in Redis
# - Modules requiring Group C: "required_corpus_groups=['C', 'E']"
#   - preflight() detects C is missing
#   - run() returns confidence=observability_gap
# - Brief Section G lists: "Commit analysis incomplete due to rate limiting"
```

**LLM Failure Recovery:**
- [ ] If LLM call fails, timeout after 35s
- [ ] Return default narrative instead of crashing
- [ ] Flag raised: "LLM narrative unavailable, fallback text used"

**Verification Checklist:**
- [ ] Circuit breaker integrated into data collector
- [ ] Partial corpus snapshot tested
- [ ] Modules handle missing groups gracefully
- [ ] Brief indicates data gaps in Section G

---

## SECTION 3: FINAL VERIFICATION CHECKLIST

**Pre-Production Verification:**

### Functional Tests
- [ ] Light Mode: End-to-end from POST to complete result (2–3 min)
- [ ] Deep Mode: End-to-end with private repo cloning (5–10 min)
- [ ] CV Verification: End-to-end with Section B populated
- [ ] Cache Hit: Second request with same user, different config (< 5s)
- [ ] Error Scenarios: Invalid input, GitHub 404, LLM timeout
- [ ] Status Polling: All wave states show up in GET /{jobId}

### Swagger Documentation Tests
- [ ] All 5 endpoints appear in /api/docs
- [ ] All request/response DTOs fully documented
- [ ] Example requests work from Swagger UI
- [ ] Error responses (400, 401, 403, 500) documented
- [ ] Enums fully listed in documentation

### Architecture Tests
- [ ] Corpus caching verified (7d TTL, Redis)
- [ ] Modules are stateless (no external API calls)
- [ ] Wave orchestration correct (Wave 1→2a[cond]→2b/c/d[parallel]→3→4)
- [ ] LLM integration working (Wave 3 batch, Wave 4 narratives)
- [ ] Brief assembly complete (7 sections Markdown + JSON)

### Performance Tests
- [ ] Light Mode completes within 3 minutes
- [ ] Deep Mode completes within 10 minutes
- [ ] Cache hit response < 5 seconds
- [ ] P99 latency acceptable (no spike outliers)

### Data Quality Tests
- [ ] All 14 modules represented in results
- [ ] Evidence citations are accurate corpus field paths
- [ ] Confidence levels reflect actual data quality
- [ ] Flags appropriately raised by AG modules
- [ ] Interview probes generated when confidence < strong

### Backwards Compatibility
- [ ] Legacy /api/analysis/* endpoints still work (if not removed)
- [ ] Legacy responses same as before (no breaking changes)
- [ ] Deprecation headers on legacy endpoints
- [ ] Migration guide provided to consumers

---

## COMMAND REFERENCE FOR VERIFICATION

```bash
# 1. Start development server
npm start

# 2. Open Swagger UI
open http://localhost:3000/api/docs

# 3. Run all analysis tests
npm test -- "analysis/"

# 4. Run all analysis e2e tests
npm test:e2e -- "test/analysis/"

# 5. Run with tracing enabled
TRACING_LEVEL=detailed npm start

# 6. Check module coverage
npm test -- "modules/" --coverage

# 7. Lint analysis files
npm run lint -- "src/modules/analysis/"

# 8. Build production bundle
npm run build
```

---

## SUCCESS CRITERIA

**✅ Migration is COMPLETE when:**

1. All 5 Swagger endpoints callable with valid responses
2. All 5 user flows work end-to-end (Light, Deep, CV, cache hit, errors)
3. All 14 modules tested + passing
4. Full e2e test suite passing (>95% success)
5. Trace logs match FINAL_USER_FLOWS.md exactly
6. Zero breaking changes to legacy API (or clear deprecation timeline)
7. Brief assembly produces readable 7-section markdown + JSON
8. Partial corpus handling verified (circuit breaker works)
9. Swagger UI fully documented with examples
10. Performance targets met (Light < 3 min, Deep < 10 min, cache hit < 5s)

---

**Document Version:** 1.0  
**Last Updated:** June 1, 2026  
**Status:** Ready for Verification Review
