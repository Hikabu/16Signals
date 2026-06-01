# GitIntel Implementation Checklist & Quick Start Guide

**Date:** June 1, 2026  
**Purpose:** Day-to-day implementation tracking for each stage  
**Owner:** Backend Engineering Team

---

## QUICK START: Where We Are

### ✅ COMPLETE (Use as-is)

- [x] Corpus types & schema (corpus.types.ts, corpus-cache.service.ts)
- [x] Module interface contracts (module.interface.ts, module-result.types.ts)
- [x] Module registry (module-registry.ts) 
- [x] AnalysisV2Controller shell with 3 endpoints
- [x] All 14 module files created
- [x] Wave orchestrator shell files created
- [x] Data collector group collector files created
- [x] LLM integration shell files created
- [x] Brief assembler shell files created
- [x] CV claim extractor shell file created
- [x] Employment verification module shell created
- [x] Deep collector + clone worker manager shell created
- [x] Prisma schema with signal_corpora, evidence_briefs, usage_events tables

### 🟡 PARTIAL (Review & Complete)

- [ ] **Module implementations (14 files)** — All exist but need verification for:
  - Correct evidence collection (cites exact corpus paths)
  - Proper confidence level determination
  - Flag raising logic (if applicable)
  - Interview probe generation
  - Seniority weighting integration

- [ ] **Wave orchestrator** — Basic structure exists, needs:
  - Wave 1 execution (AG1, AG2, AG3 parallel)
  - Wave 2a conditional gate (check AG1 OR AG3 flags)
  - Waves 2b/c/d parallel execution
  - Wave 3 LLM batch preparation + calling
  - Wave 4 narrative generation
  - Error handling at each wave

- [ ] **Data collector** — Group collectors exist, need:
  - Light mode parallel collection (A/B/D/F → C/E → G)
  - Circuit breaker integration
  - Partial corpus snapshot on circuit break
  - Deep mode private repo fetching
  - Clone worker + tool runner orchestration

- [ ] **LLM integration** — Client exists, needs:
  - Wave 3 batch call construction
  - Message quality scoring prompt
  - P6 AI leverage detection prompt
  - AG5 AI generation classification prompt
  - Employment verification enrichment
  - Wave 4 narrative generation
  - Wave 4 interview question generation
  - Retry logic + error handling
  - JSON parse error recovery

- [ ] **Brief assembly** — Started, needs:
  - Section A: Profile in 90 Seconds
  - Section B: CV Claims Cross-Reference
  - Section C: Work Pattern Intelligence
  - Section D: Red Flags (with severity)
  - Section E: Interview Probes (with reasoning)
  - Section F: Technical Assessment (P1–P7)
  - Section G: Limitations (observability gaps)
  - Markdown rendering
  - JSON export
  - Seniority weighting

- [ ] **Swagger documentation** — Controller exists, needs:
  - Comprehensive @Api* decorators on all endpoints
  - Request/response DTOs with @ApiProperty on every field
  - Example values & descriptions
  - Error response codes (400, 401, 403, 500)
  - Status enum documentation (queued, wave_1, wave_2a, ... wave_4, completed, failed)

### ❌ NOT IMPLEMENTED

- [ ] E2E test suite (all 6 flows)
- [ ] Integration tests for each module
- [ ] Error handling e2e tests
- [ ] Swagger UI validation
- [ ] Legacy to v2 migration adapter
- [ ] Production monitoring/alerting setup
- [ ] PDF generation (Stage 8+)

---

## STAGE-BY-STAGE IMPLEMENTATION CHECKLIST

### STAGE 0: Prerequisites (✅ COMPLETE)

- [x] Prisma schema updated (signal_corpora, evidence_briefs, usage_events)
- [x] Migration run successfully
- [x] Zod validation schemas created
- [x] Tracing config implemented

**Verification:**
```bash
npm test -- "corpus/corpus-schema.spec.ts"
```

---

### STAGE 1: Signal Corpus Layer (✅ COMPLETE)

- [x] CorpusCacheService (Redis 7d TTL)
- [x] CorpusBuilderService (raw data → corpus transformation)
- [x] Corpus types (Groups A–G interfaces)

**Quick Verification:**
```bash
npm test -- "corpus/corpus-cache.service.spec.ts"
npm test -- "corpus/corpus-builder.service.spec.ts"
```

**Status:** ✅ Ready for Stage 2

---

### STAGE 2: Module System (🟡 50% DONE)

#### P1–P7 Primitives

**File:** `src/modules/analysis/modules/primitives/`

| Module | Status | Verification | Notes |
|--------|--------|---|---|
| `p1-execution-reliability.module.ts` | 🟡 STARTED | [ ] Verify evidence collection | Cadence, size, CI, semver, tests, dependabot |
| `p2-systems-evolution.module.ts` | ❌ SHELL | [ ] Implement full logic | Complexity trend, code quality |
| `p3-collaboration-leverage.module.ts` | ❌ SHELL | [ ] Implement full logic | PR review quality, seniority weighting |
| `p4-technical-depth.module.ts` | ❌ SHELL | [ ] Implement full logic | Stack diversity, OSS, publications |
| `p5-operational-maturity.module.ts` | ❌ SHELL | [ ] Implement full logic | Infrastructure, observability, monitoring |
| `p6-ai-leverage.module.ts` | ❌ SHELL | [ ] WAVES 3+4 dependent | AI tool usage, copilot markers, LLM analysis |
| `p7-authenticity-confidence.module.ts` | ❌ SHELL | [ ] Implement logic | Role archetype fit, specialization |

#### AG1–AG6 Anti-Gaming

**File:** `src/modules/analysis/modules/anti-gaming/`

| Module | Status | Verification | Notes |
|--------|--------|---|---|
| `ag1-commit-inflation.module.ts` | ❌ SHELL | [ ] Verify ratio calculation | Statistical anomaly in commit count |
| `ag2-fork-dump.module.ts` | ❌ SHELL | [ ] Verify fork ratio | Farm detection threshold |
| `ag3-burst-dormancy.module.ts` | ❌ SHELL | [ ] Verify temporal anomaly | Last 30d avg / trailing 12m avg |
| `ag4-repository-laundering.module.ts` | ❌ SHELL | [ ] Needs Code Search API | Cross-repo similarity, GitHub Search rate limits |
| `ag5-ai-generation-detection.module.ts` | ❌ SHELL | [ ] WAVE 3 LLM-dependent | Style patterns, LLM scoring, authenticity |
| `ag6-credential-leak.module.ts` | ❌ SHELL | [ ] Verify secret scanning | gitleaks integration, revocation status |

#### EV Employment Verification

**File:** `src/modules/analysis/modules/employment/`

| Module | Status | Verification | Notes |
|--------|--------|---|---|
| `ev-employment-verification.module.ts` | ❌ SHELL | [ ] Implement 3-rung logic | CV claims ↔ GitHub dates/companies/roles |

#### Tests Required

For each module (14 total):
- [ ] Unit test file with fixtures
- [ ] Happy path test (normal data)
- [ ] Edge case tests (minimal corpus, missing fields)
- [ ] Flag raising tests (if applicable)
- [ ] Interview probe generation tests

**Test Template:**
```typescript
// test/analysis/modules/primitives/p1-execution-reliability.spec.ts
describe('P1ExecutionReliabilityModule', () => {
  it('should return strong confidence for mature commit patterns', async () => { /* ... */ });
  it('should return observability_gap if commit_frequency_by_month absent', async () => { /* ... */ });
  it('should generate interview probe if confidence < strong', async () => { /* ... */ });
});
```

**Completion Checklist:**
- [ ] All 14 module logic fully implemented
- [ ] All 14 modules passing unit tests
- [ ] Module registry successfully injects all 14 modules at boot
- [ ] Test coverage >90% per module

**Run Tests:**
```bash
npm test -- "modules/primitives/*.spec.ts"
npm test -- "modules/anti-gaming/*.spec.ts"
npm test -- "modules/employment/*.spec.ts"
```

---

### STAGE 3: Wave Orchestrator (🟡 30% DONE)

**Files:**
- `src/modules/analysis/orchestration/wave-orchestrator.service.ts`
- `src/modules/analysis/orchestration/job-dispatcher.service.ts`
- `src/modules/analysis/orchestration/analysis-state-machine.ts`

#### Wave 1: Anti-Gaming (Parallel)
- [ ] Initialize AG1, AG2, AG3
- [ ] Run all 3 in parallel with Promise.all()
- [ ] Collect results + flags
- [ ] Determine if Wave 2a should trigger (AG1 OR AG3 raised flags?)

#### Wave 2a: Conditional Repository Laundering
- [ ] Gate check: only run if Wave 1 provided AG1 OR AG3 triggers
- [ ] Initialize AG4
- [ ] Call GitHub Code Search API (requires rate limit routing)
- [ ] Handle rate limit errors gracefully

#### Waves 2b, 2c, 2d: Primitive Scoring (Parallel)
- [ ] Wave 2b: P1, P2, P5 (deterministic scoring, no deps)
- [ ] Wave 2c: P3 (deterministic scoring, no deps)
- [ ] Wave 2d: P4 (deterministic scoring, no deps)
- [ ] Run all 3 waves concurrently (no inter-dependencies)

#### Wave 3: LLM Batch Call
- [ ] Wait for Wave 1 results (for AG flags detection)
- [ ] Wait for Waves 2b/c/d results (for context)
- [ ] Prepare batch LLM context (message samples, PR descriptions, EV rungs 1–3)
- [ ] Call Deepseek v4 API
- [ ] Parse response → populate P6, AG5 confidence + flags

#### Wave 4: Brief Assembly
- [ ] Wait for all Wave 3 results
- [ ] Call LLM for narrative generation (Sections A, B, C)
- [ ] Call LLM for interview questions
- [ ] Run BriefAssembler
- [ ] Render final brief Markdown + JSON

#### State Machine
- [ ] Job states: queued → wave_1 → wave_2a → wave_2b → wave_2c → wave_2d → wave_3 → wave_4 → completed
- [ ] Failed states: any module error → set confidence=observability_gap + flag, continue to next wave
- [ ] Status polling: GET /api/v2/analysis/:jobId returns current state

**Tracing Points:**
```
[WaveOrchestrator] phase=wave_start wave=1 jobId=... modules=ag1,ag2,ag3
[WaveOrchestrator] phase=wave_complete wave=1 durationMs=...
[WaveOrchestrator] phase=wave_skip wave=2a reason=no_triggers
[WaveOrchestrator] phase=wave_start wave=2b modules=p1,p2,p5
... (concurrent waves)
[WaveOrchestrator] phase=orchestration_complete totalDurationMs=...
```

**Completion Checklist:**
- [ ] All 5 waves execute in correct order
- [ ] Waves 2b/c/d run in parallel (< 10% overhead)
- [ ] Wave 2a gate works correctly
- [ ] Wave 3 LLM batch call prepared correctly
- [ ] Wave 4 brief assembly orchestrates narrative + interview questions
- [ ] State machine tracks job through all waves
- [ ] Tracing output matches FINAL_USER_FLOWS.md exactly

**Run Tests:**
```bash
npm test -- "orchestration/wave-orchestrator.spec.ts"
npm test -- "orchestration/job-dispatcher.spec.ts"
```

---

### STAGE 4: Data Collector Refactor (🟡 40% DONE)

**Files:**
- `src/modules/analysis/data-collector/data-collector.service.ts` — Main coordinator
- `src/modules/analysis/data-collector/group-collectors/group-*.collector.ts` — 7 collectors
- `src/modules/analysis/data-collector/circuit-breaker.service.ts` — Rate limiting
- `src/modules/analysis/data-collector/corpus-builder.service.ts` — Merge builder
- `src/modules/analysis/data-collector/deep/deep-collector.service.ts` — Private repo fetching
- `src/modules/analysis/data-collector/deep/clone-worker-manager.ts` — Clone + tool runners

#### Light Mode Collection (all 7 groups)

| Group | Collector | Estimated Hours | Checklist |
|-------|-----------|---|---|
| A | `group-a.collector.ts` | 5 | [ ] Fetch identity (GraphQL user query) |
| B | `group-b.collector.ts` | 10 | [ ] Fetch repos (GraphQL batch), paginate for 100+; compute quality_score |
| C | `group-c.collector.ts` | 15 | [ ] Fetch commits, build histogram, p25/median, sub_5_line_ratio, work_hour_distribution, message_quality_raw |
| D | `group-d.collector.ts` | 10 | [ ] Fetch PRs, paginate, compute substantive review ratio, avg description length |
| E | `group-e.collector.ts` | 15 | [ ] Scan CI configs, fetch releases, scan for test/docker/iac/linting, compute semver discipline |
| F | `group-f.collector.ts` | 15 | [ ] Fetch npm/PyPI/Cargo packages, StackOverflow reputation, OSS contrib count |
| G | `group-g.collector.ts` | 10 | [ ] Compute deterministic ratios (burst_dormancy, fork_dump, commit_inflation) |

#### Parallel Collection Strategy
```
Phase 1 (parallel): A, B, D, F (independent from repos)
Phase 2 (parallel): C, E (depend on B's repo list)
Phase 3 (sequential): G (depends on C timing)
```

**Completion Checklist — Light Mode:**
- [ ] All 7 group collectors implemented
- [ ] Parallel execution order verified
- [ ] Rate limit tracking via RateLimitGuard
- [ ] Corpus built correctly from collected groups
- [ ] Circuit breaker triggers on rate limit → partial corpus saved

**Completion Checklist — Deep Mode:**
- [ ] Private repos enumerated via GitHub App
- [ ] Clone worker spawns parallel clone jobs
- [ ] Tool runners execute: scc (complexity), tokei (tests), gitleaks (secrets)
- [ ] Deep delta merged into Light corpus
- [ ] Secret leak details + complexity trends populated in Groups C/E

**Run Tests:**
```bash
npm test -- "data-collector/group-collectors/*.spec.ts"
npm test -- "data-collector/circuit-breaker.spec.ts"
npm test -- "data-collector/deep/*.spec.ts"
```

---

### STAGE 5: LLM Integration (Deepseek v4) (🟡 20% DONE)

**Files:**
- `src/modules/analysis/llm/deepseek-client.ts` — OpenAI-compatible client
- `src/modules/analysis/llm/llm-integration.service.ts` — Call orchestration
- `src/modules/analysis/llm/llm-prompt-templates.ts` — Prompt construction
- `src/modules/analysis/llm/llm-response.types.ts` — Response parsing

#### Environment Setup
```bash
# .env additions
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_MAX_TOKENS=4096
DEEPSEEK_TEMPERATURE=0
DEEPSEEK_TIMEOUT_MS=35000
```

#### Wave 3 Batch Call (Message Quality + P6 + AG5)

**Prompt Structure:**
```
System: "You are analyzing software engineering signals..."

User: [
  "Analyze commit messages for quality: [samples]",
  "Analyze PR descriptions for depth: [samples]", 
  "Classify AI tool usage: [copilot markers, etc.]",
  "Assign AI generation confidence: [style patterns, etc.]",
  "Grade employment verification rungs: [CV claims vs. signals]"
]

Response format: {
  message_quality_scores: [0–100 per message],
  review_comment_depth_scores: [0–100 per review],
  p6_confidence_classification: "strong|moderate|low|observability_gap",
  ag5_confidence_classification: "strong|moderate|low|observability_gap",
  ev_rungs: { rung_1: score, rung_2: score, rung_3: score },
  reasoning: "..."
}
```

**Completion Checklist:**
- [ ] Deepseek client initialized with OpenAI SDK
- [ ] Wave 3 prompt templates created + tested
- [ ] Batch call prepared with all context
- [ ] JSON response parsing works + error handling for parse failures
- [ ] Retry logic: 2 attempts with exponential backoff
- [ ] Timeout handling: 35s max, return default values on timeout

#### Wave 4 Narrative Calls (Section A, B, C + Interview Questions)

**Narrative Call:**
```
System: "Generate concise technical narrative for Evidence Brief..."
User: "Profile: {modules}, Config: {seniority, role}, Evidence: {key signals}""
Response: "{markdown text for Sections A, B, C}"
```

**Interview Question Call:**
```
System: "Generate 4 targeted interview questions..."
User: "Gaps: {low confidence modules}, Evidence: {relevant signals}"
Response: "[{question: "...", rationale: "..."}, ...]"
```

**Completion Checklist:**
- [ ] Narrative generation prompt templates created
- [ ] Interview question generation prompt templates created
- [ ] LLM calls execute in Wave 4 after Wave 3 completes
- [ ] Fallback: if LLM fails, return default narrative + interview questions
- [ ] Response parsing handles both success + failure cases

**Run Tests:**
```bash
npm test -- "llm/llm-integration.spec.ts"
npm test -- "llm/deepseek-client.spec.ts"
```

---

### STAGE 6: Brief Assembler (🟡 30% DONE)

**Files:**
- `src/modules/analysis/brief/brief-assembler.service.ts` — Main orchestration
- `src/modules/analysis/brief/brief-renderer.ts` — Markdown + JSON rendering
- `src/modules/analysis/brief/seniority-weighting.ts` — Threshold adjustments
- `src/modules/analysis/brief/confidence-language.ts` — Confidence descriptions
- `src/modules/analysis/brief/cv-claim-extractor.service.ts` — CV text extraction

#### Section A: Profile in 90 Seconds
- [ ] Candidate name, GitHub profile link
- [ ] Seniority level (inferred from P1–P5 scores + config)
- [ ] Key stats: lifetime commits, languages, OSS packages
- [ ] GHE summary: "Shipped X projects, contributed to Y repos, managed Z"

#### Section B: CV Claims Cross-Reference
- [ ] Extract from CV: companies, roles, dates, tech skills
- [ ] Map to GitHub: find commits/repos matching dates/companies/techs
- [ ] EV module scores: Rung 1 (date match), Rung 2 (tech match), Rung 3 (contrib level)
- [ ] Render table: Claim → GitHub Evidence → Confidence

#### Section C: Work Pattern Intelligence
- [ ] Commit cadence: "Active X of 12 months, Y commits/month avg"
- [ ] Collaboration style: "Authored Z PRs, reviewed W, avg review time T"
- [ ] Engineering rigor: "CI pass rate T%, tests-to-code ratio R, semver discipline"

#### Section D: Red Flags
- [ ] List all flags from AG modules with severity
- [ ] Explanation + evidence path
- [ ] Escalation guidance: "Clear in interview" vs. "Hiring manager review needed"

#### Section E: Interview Probes
- [ ] Questions for each low/observability_gap confidence module
- [ ] Rationale: "We observed X, wondering about Y"
- [ ] 4–6 targeted questions based on gaps

#### Section F: Technical Assessment
- [ ] P1–P7 scores with confidence levels
- [ ] Evidence summaries ("Execution reliability: strong due to consistent cadence...")
- [ ] Seniority-adjusted interpretation

#### Section G: What This Evaluation Cannot Tell You
- [ ] Data limitations: "No private code analysis (public repos only in Light Mode)"
- [ ] Observability gaps: "No real-time collaboration data, self-reported skills only"
- [ ] Missing signals: "No custom assessments, no team feedback"

**Rendering:**

- [ ] Markdown template for each section
- [ ] JSON export (nested structure preserving all module results)
- [ ] Seniority weighting: Adjust confidence thresholds by [intern/junior/mid/senior/staff/principal]
- [ ] Confidence language mapping: {strong→"demonstrates", moderate→"suggests", low→"limited evidence", observability_gap→"insufficient observable data"}

**Completion Checklist:**
- [ ] All 7 sections implemented
- [ ] Markdown rendering produces readable, professional output
- [ ] JSON export includes all underlying data for programmatic consumption
- [ ] Seniority weighting adjusts scores appropriately
- [ ] Brief assembler orchestrates narrative generation (LLM Wave 4)
- [ ] CV claim extractor parses CV text correctly

**Run Tests:**
```bash
npm test -- "brief/brief-assembler.spec.ts"
npm test -- "brief/brief-renderer.spec.ts"
npm test -- "brief/cv-claim-extractor.spec.ts"
```

---

### STAGE 7: Multi-Mode Dispatcher & API Migration (🟡 40% DONE)

**Files:**
- `src/modules/analysis/analysis/analysis-v2.controller.ts` — REST API
- `src/modules/analysis/analysis/analysis-v2.dto.ts` — Request/response classes
- `src/modules/analysis/orchestration/job-dispatcher.service.ts` — Task dispatcher

#### Swagger Documentation (CRITICAL)

**Endpoint 1: POST /api/v2/analysis/light**

```typescript
@Post('light')
@ApiOperation({
  summary: 'Create Light Mode analysis',
  description: 'Analyze GitHub profile using public signals only...'
})
@ApiBody({ type: CreateLightAnalysisDto })
@ApiResponse({
  status: 201,
  description: 'Analysis job created',
  type: AnalysisCreateResponseDto
})
@ApiResponse({ status: 400, description: 'Invalid request' })
@ApiResponse({ status: 500, description: 'Internal error' })
async createLightAnalysis(@Body() dto: CreateLightAnalysisDto) { ... }
```

**Request DTO:**
```typescript
export class CreateLightAnalysisDto {
  @ApiProperty({ example: 'torvalds', description: 'GitHub username' })
  @IsString() @MinLength(1)
  githubUsername: string;

  @ApiProperty({ type: AnalysisConfigDto, description: 'Analysis configuration' })
  @Type(() => AnalysisConfigDto)
  @ValidateNested()
  config: AnalysisConfigDto;
}

export class AnalysisConfigDto {
  @ApiProperty({
    enum: ['intern', 'junior', 'mid', 'senior', 'staff', 'principal'],
    description: 'Career level'
  })
  @IsEnum(['intern', 'junior', 'mid', 'senior', 'staff', 'principal'])
  seniority: string;

  @ApiProperty({
    enum: ['backend', 'frontend', 'platform', 'data_ml', 'security', 'mobile', 'generalist'],
    description: 'Job function'
  })
  @IsEnum(['backend', 'frontend', 'platform', 'data_ml', 'security', 'mobile', 'generalist'])
  role_archetype: string;

  @ApiProperty({ example: 'Looking for senior backend engineer...', required: false })
  @IsOptional() @IsString()
  jd_text?: string;
}
```

**Response DTO:**
```typescript
export class AnalysisCreateResponseDto {
  @ApiProperty({ example: 'light_abc123def456', description: 'Job ID for polling' })
  jobId: string;

  @ApiProperty({ example: 'queued', description: 'Initial status' })
  status: 'queued';
}
```

**Endpoint 2: GET /api/v2/analysis/:jobId**

```typescript
@Get(':jobId')
@ApiParam({ name: 'jobId', description: 'Job ID from POST endpoint' })
@ApiResponse({
  status: 200,
  description: 'Job status and result (if complete)',
  type: AnalysisStatusResponseDto
})
async getAnalysisStatus(@Param('jobId') jobId: string) { ... }
```

**Response DTO (polling):**
```typescript
export class AnalysisStatusResponseDto {
  @ApiProperty({ example: 'light_abc123def456' })
  jobId: string;

  @ApiProperty({
    enum: ['queued', 'wave_1', 'wave_2a', 'wave_2b', 'wave_2c', 'wave_2d', 'wave_3', 'wave_4', 'completed', 'failed'],
    description: 'Current pipeline stage'
  })
  status: string;

  @ApiProperty({ example: 45, description: 'Completion percentage (0–100)' })
  progress: number;

  @ApiProperty({
    type: AnalysisResultDto,
    required: false,
    description: 'Result (present when status === "completed")'
  })
  result?: AnalysisResultDto;

  @ApiProperty({ required: false, description: 'Error message (if failed)' })
  error?: string;
}

export class AnalysisResultDto {
  @ApiProperty({ description: 'Evidence Brief in Markdown format' })
  briefMarkdown: string;

  @ApiProperty({ description: 'Parsed brief in JSON' })
  briefJson: {
    sectionA: string;
    sectionB: string;
    sectionC: string;
    sectionD: string;
    sectionE: string;
    sectionF: string;
    sectionG: string;
  };

  @ApiProperty({ type: [ModuleResultDto], description: 'All module results' })
  moduleResults: ModuleResultDto[];

  @ApiProperty({ type: [Object], description: 'All flags raised' })
  flags: Array<{
    flagType: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    description: string;
  }>;

  @ApiProperty({ example: 45230, description: 'Total analysis duration in milliseconds' })
  totalDurationMs: number;
}

export class ModuleResultDto {
  @ApiProperty({ example: 'p1_execution_reliability' })
  module_id: string;

  @ApiProperty({ example: 'p1', required: false })
  primitive_id: string | null;

  @ApiProperty({ enum: ['strong', 'moderate', 'low', 'observability_gap', 'insufficient_data'] })
  confidence: string;

  @ApiProperty({ description: 'Human-readable score label' })
  score_label: string;

  @ApiProperty({ type: [Object] })
  evidence: Evidence[];

  @ApiProperty({ type: [Object] })
  flags: Flag[];
}
```

**Endpoints 3–5: CV Verify, Deep, Status (similar pattern)**

**Completion Checklist:**
- [ ] All 5 endpoints documented with full @Api* decorators
- [ ] All request/response DTOs have @ApiProperty on every field
- [ ] Example values provided (no bare "string", include realistic examples)
- [ ] Error responses documented (400, 401, 403, 500 with descriptions)
- [ ] Enum fields have full value lists
- [ ] Nested objects have @Type(() => DTO) for proper deserialization
- [ ] Swagger UI generates correctly: `npm run build && open http://localhost:3000/api/docs`
- [ ] "Try it out" examples work from Swagger UI

**Run Tests:**
```bash
npm test:e2e -- "test/analysis/analysis-swagger.e2e-spec.ts"
```

---

### STAGE 8: Deep Mode & Clone Workers (🟡 20% DONE)

**Files:**
- `src/modules/analysis/data-collector/deep/deep-collector.service.ts`
- `src/modules/analysis/data-collector/deep/clone-worker-manager.ts`

#### Deep Mode Collection Flow
1. [ ] Light corpus auto-fetched (or reuse if < 7d old)
2. [ ] GitHub App authorization verified (installationId provided)
3. [ ] Private repos enumerated via GraphQL query
4. [ ] Clone jobs spawned in parallel (max 4 concurrent)
5. [ ] Each clone: git clone → tool runners → cleanup
6. [ ] Tools: scc (complexity), tokei (test ratio), gitleaks (secrets), copilot detector
7. [ ] Results merged into corpus (Groups C/E deltas)
8. [ ] Wave orchestration proceeds with enriched corpus

**Completion Checklist:**
- [ ] Private repo enumeration working
- [ ] Clone worker spawns child processes safely
- [ ] Tool outputs parsed correctly
- [ ] Clone failures don't block analysis (observability_gap)
- [ ] Cleanup happens even on errors (no disk leak)

---

## DETAILED MODULE COMPLETION CHECKLIST

### For Each Analysis Module (P1–P7, AG1–AG6, EV)

**Template:**
```typescript
// src/modules/analysis/modules/[type]/[module].module.ts

@Injectable()
export class [Module]Module implements AnalysisModule {
  module_id = '[identifier]';
  primitive_id = '[p1–p7 or null]';
  required_corpus_groups = [/* enum of CorpusGroup */];
  required_collection_mode: 'light' | 'deep' | 'either' = '...';

  preflight(corpus): CorpusGroup[] {
    return this.required_corpus_groups.filter(g => !corpus.groups_present.includes(g));
  }

  run(corpus, config): ModuleResult {
    // ✅ 1. Verify required groups present
    const missing = this.preflight(corpus);
    if (missing.length > 0) return this.insufficientDataResult();

    // ✅ 2. Gather evidence with exact corpus field citations
    const evidence: Evidence[] = [];
    evidence.push({
      signal: '...',
      corpus_field: 'corpus.path.to.field',  // MUST cite exact path
      value: ...,
      interpretation: '...'
    });

    // ✅ 3. Determine confidence (strong|moderate|low|observability_gap|insufficient_data)
    const confidence = this.determineConfidence(...);

    // ✅ 4. Generate score_label (mandatory language per spec)
    const score_label = this.buildScoreLabel(confidence, config);

    // ✅ 5. Raise flags if applicable (AG modules primarily)
    const flags: Flag[] = [];
    if (/* condition */) {
      flags.push({
        flag_id: '...',
        flag_type: 'SOFT' | 'HARD',
        severity: 'INFO' | 'WARNING' | 'CRITICAL',
        module_id: this.module_id,
        description: '...',
        evidence_paths: [/* corpus field paths */],
        escalate_to_hiring_manager: false,  // NEVER true
        clear_without_interview: boolean,
        auto_reject: false,  // NEVER true
        interview_probe: '...'
      });
    }

    // ✅ 6. Generate interview probe if confidence < strong
    const interview_probe = confidence !== 'strong'
      ? this.generateInterviewProbe(...)
      : null;

    // ✅ 7. List all corpus fields used
    const raw_signals_used = [/*  exact corpus paths */];

    return {
      module_id: this.module_id,
      primitive_id: this.primitive_id,
      confidence,
      score_label,
      evidence,
      flags,
      interview_probe,
      raw_signals_used
    };
  }

  private determineConfidence(...): 'strong' | 'moderate' | 'low' | 'observability_gap' | 'insufficient_data' {
    // Seniority-adjusted determination
    // Consider: config.seniority, evidence collected, thresholds
  }

  private buildScoreLabel(confidence: string, config: AnalysisConfig): string {
    // Mandatory language mapping per Analysys_specs_architecture.md Section 6.2
    // Example: "strong" → "Demonstrates consistent X capability"
  }

  private generateInterviewProbe(/*context*/): string {
    // Generate targeted question for interviewer
    // Example: "We observed limited PR reviews—tell us about your collaboration approach."
  }
}
```

**For Each Module, Create Test File:**
```typescript
// test/analysis/modules/[type]/[module].spec.ts
describe('[Module] Module', () => {
  it('should return strong confidence for [happy path]', async () => { /* ... */ });
  it('should return observability_gap if required groups absent', async () => { /* ... */ });
  it('should generate interview probe if confidence < strong', async () => { /* ... */ });
  it('should cite exact corpus field paths in evidence', async () => { /* ... */ });
  it('[AG only] should raise CRITICAL flag when condition triggers', async () => { /* ... */ });
});
```

---

## SWAGGER DOCUMENTATION QUICK CHECKLIST

For AnalysisV2Controller, verify all decorators present:

```typescript
@ApiTags('Analysis v2')
@Controller('api/v2/analysis')
export class AnalysisV2Controller {
  
  @Post('light')
  @ApiOperation({ summary, description })
  @ApiBody({ type: CreateLightAnalysisDto })
  @ApiResponse({ status: 201, type: AnalysisCreateResponseDto })
  @ApiResponse({ status: 400, description: '...' })
  @ApiResponse({ status: 500, description: '...' })
  async createLightAnalysis(@Body() dto: CreateLightAnalysisDto): Promise<AnalysisCreateResponseDto> { ... }

  @Post('cv-verify')
  @ApiOperation({ summary, description })
  @ApiBody({ type: CreateCvVerifyDto })
  @ApiResponse({ status: 201, type: AnalysisCreateResponseDto })
  // ... error responses
  async createCvVerify(@Body() dto: CreateCvVerifyDto): Promise<AnalysisCreateResponseDto> { ... }

  @Post('deep')
  @ApiOperation({ summary, description })
  @ApiBody({ type: CreateDeepAnalysisDto })
  @ApiResponse({ status: 201, type: AnalysisCreateResponseDto })
  // ... error responses
  async createDeepAnalysis(@Body() dto: CreateDeepAnalysisDto): Promise<AnalysisCreateResponseDto> { ... }

  @Get(':jobId')
  @ApiParam({ name: 'jobId', description: '...' })
  @ApiResponse({ status: 200, type: AnalysisStatusResponseDto })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getAnalysisStatus(@Param('jobId') jobId: string): Promise<AnalysisStatusResponseDto> { ... }

  @Get('status')
  @ApiResponse({ status: 200 })
  async getHealth(): Promise<{ status: string }> { ... }
}
```

---

## TESTING COMMAND REFERENCE

```bash
# Unit tests for individual components
npm test -- "corpus/*.spec.ts"
npm test -- "modules/primitives/*.spec.ts"
npm test -- "modules/anti-gaming/*.spec.ts"
npm test -- "orchestration/*.spec.ts"
npm test -- "data-collector/*.spec.ts"
npm test -- "llm/*.spec.ts"
npm test -- "brief/*.spec.ts"

# All analysis tests
npm test -- "analysis/"

# E2E tests
npm test:e2e -- "test/analysis/analysis-light-mode.e2e-spec.ts"
npm test:e2e -- "test/analysis/analysis-deep-mode.e2e-spec.ts"
npm test:e2e -- "test/analysis/analysis-cv-verify.e2e-spec.ts"
npm test:e2e -- "test/analysis/analysis-swagger.e2e-spec.ts"

# Full test run
npm test && npm test:e2e
```

---

## QUICK START FOR NEW DEVELOPER

1. **Understand the architecture**
   - Read: DEEPSEEK_V4_REFACTOR_PLAN.md (Stages 0–3)
   - Read: Analysys_specs_architecture.md (3-layer pipeline)
   - Read: FINAL_USER_FLOWS.md (end-to-end traces)

2. **Pick a task from the checklist above (Stages 2–8)**

3. **Implement + test**
   ```bash
   # Create feature branch
   git checkout -b feat/stage-X-[module-name]
   
   # Implement
   # ... edit files ...
   
   # Run tests
   npm test -- "path/to/module.spec.ts"
   
   # Commit + push
   git push origin feat/stage-X-[module-name]
   ```

4. **Mark off in checklist above**

5. **Integration test before merging**
   ```bash
   npm test:e2e -- "test/analysis/analysis-*.e2e-spec.ts"
   ```

---

**Last Updated:** June 1, 2026  
**Next Review:** Weekly (Friday standup)  
**Owner:** @backend-engineering-team
