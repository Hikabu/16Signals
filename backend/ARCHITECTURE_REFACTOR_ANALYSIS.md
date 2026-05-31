# GitIntel HR Platform — Architecture Refactor Analysis

## Principal Architect Assessment  
Date: May 31, 2026  
Scope: Transformation from 16Signals MVP to GitIntel HR Platform SaaS  
Status: Analysis &amp; Planning Phase

---

## EXECUTIVE SUMMARY

The current 16Signals architecture is a **monolithic NestJS analysis engine** optimized for single-candidate deep profiling. The target GitIntel architecture is a **composable three-layer pipeline** designed for multi-tenant SaaS with three analysis modes (Light / Deep / CV Verifier) and 14 independent analysis modules.

**Key Vector of Change:** Decoupling data collection from analysis via a Signal Corpus abstraction layer enables Light Mode speed (&lt;3 minutes), mode composition, and re-scoring without re-fetching.

- **Existing alignment: ~35%** — Queue infrastructure, GitHub rate limiting, basic analysis services
- **Components to refactor: ~40%** — Scoring service, signal extraction, cache strategy  
- **Components to build: ~25%** — Signal Corpus abstraction, module system, multi-mode orchestration, LLM integration, brief assembly

---

## 1. CURRENT ARCHITECTURE MAP

### 1.1 High-Level Component Topology

```
┌─────────────────────────────────────────────────────────────┐
│                    API LAYER (NestJS)                       │
├─────────────────────────────────────────────────────────────┤
│  AnalysisController | GithubSyncService | ScorecardService  │
└────────────┬────────────────────────────────────┬───────────┘
             │                                    │
          QUEUING (BullMQ + Redis)               │
             │                                    │
    ┌────────▼──────────┬──────────────┐         │
    │                   │              │         │
┌───▼─────────┐  ┌─────▼──────┐  ┌────▼──────┐ │
│   signal-   │  │ github-sync │  │   email   │ │
│   compute   │  │    queue    │  │   queue   │ │
└───┬─────────┘  └─────┬──────┘  └────┬──────┘ │
    │                  │              │        │
    │                  │              │        │
┌───▼──────────────────▼──────────────▼──────┐ │
│              WORKER POOL (Separate Process)│ │
│  SignalComputeProcessor | GithubSyncProcessor│
│           EmailProcessor                    │ │
└───┬─────────────────────────────────────────┘ │
    │                                            │
    │                                            │
┌───▼──────────────────────────────────────────┐ │
│         ANALYSIS & ENRICHMENT SERVICES       │ │
├───────────────────────────────────────────────┤ │
│  • GithubAdapterService                       │ │
│  • SignalExtractorService (8 raw signals)     │ │
│  • ScoringService (3 composites: C/O/I)       │ │
│  • OrgAnalyserService                         │ │
│  • EcosystemClassifierService                 │ │
│  • InteractionProfileService                  │ │
│  • StackFingerprintService                    │ │
│  • SummaryGeneratorService                    │ │
│  • SolanaAdapterService                       │ │
│  • Web3MergeService                           │ │
│  • CacheService (Redis + Postgres dual-cache)│ │
│  • RateLimitGuard                             │ │
│  • OctokitFactory                             │ │
└───┬──────────────────────────────────────────┘ │
    │                                            │
    └────────────────────────────────────────────┘
            │
            │
        ┌───▼─────────────┐
        │ DATA LAYER      │
        ├─────────────────┤
        │ Prisma (PG)     │
        │ Redis (7d TTL)  │
        │ External APIs   │
        │ - GitHub        │
        │ - Solana RPC    │
        └─────────────────┘
```

### 1.2 Current Pipeline Flow (Single Path: signal-compute)

```
GitHub OAuth Connect
        ↓
GithubSyncService.connectGithub()
        ↓
Enqueue github-sync job
        ↓
GithubSyncProcessor
  - Fetch raw data (GithubAdapterService)
  - Store rawDataSnapshot in GithubProfile
        ↓
Enqueue signal-compute job (or manual trigger)
        ↓
SignalComputeProcessor.process()
  │ 
  ├─ Fetch/cache GitHub data (GithubAdapterService)
  │   └─ Groups: repos, contributions, org data, external PRs
  │
  ├─ Parse wallet (optional)
  │
  ├─ Extract 8 raw signals (SignalExtractorService)
  │   - ownershipDepth (S1)
  │   - projectLongevity (S2)
  │   - activityConsistency (S3)
  │   - techStackBreadth (S4)
  │   - externalContributions (S5)
  │   - projectMeaningfulness (S6)
  │   - stackIdentity (S7)
  │   - dataCompleteness (S8)
  │
  ├─ Score via ScoringService (monolithic)
  │   └─ computeCapabilities()
  │   └─ computeOwnership()
  │   └─ computeImpact()
  │
  ├─ Enrich via sub-services
  │   └─ OrgAnalyserService
  │   └─ EcosystemClassifierService
  │   └─ InteractionProfileService
  │   └─ StackFingerprintService
  │   └─ SummaryGeneratorService
  │
  ├─ Optionally: SolanaAdapterService + Web3MergeService
  │
  ├─ Cache result (CacheService)
  │   └─ Redis (24h TTL) + Postgres fallback
  │
  └─ Return AnalysisResult to DB + UI
```

### 1.3 Current Prisma Schema Relevance

**Utilized Models:**
- `GithubProfile` — encrypted token, sync status, rawDataSnapshot
- `DeveloperProfile` — identity, sync cooldowns
- `Candidate` — user link, ai scorecard (JSON)
- `AnalysisJob` — tracks async job progress, result, error
- `CachedResult` — dual-cache fallback

**Not in Play (but will be crucial for GitIntel):**
- `JobPost`, `Shortlist`, `Company` — Hiring workflow (Phase 2+)
- `User`, `AuthAccount` — Multi-tenant identity (Phase 2+)

### 1.4 Current Services Inventory

| Service | Responsibility | Mode Coverage | LLM Used? | External Calls |
|---------|---|---|---|---|
| GithubAdapterService | Fetch raw data, rate limiting, GraphQL queries | Light + Deep (hypothetical) | No | GitHub API |
| SignalExtractorService | 8 raw signals (S1–S8) from raw data | Both | No | None (pure function) |
| ScoringService | 3 composites (Capabilities/Ownership/Impact) | Both | No | None |
| OrgAnalyserService | Org detection, contrib verification | Both | No | None |
| EcosystemClassifierService | Stack fingerprinting, ecosystem detection | Both | No | None |
| InteractionProfileService | Starred repo affinity, topic clustering | Both | No | None |
| StackFingerprintService | Language &amp; tool extraction | Both | No | None |
| SummaryGeneratorService | Narrative generation | Both | No | None (LLM calls in SCP) |
| SolanaAdapterService | Web3 data fetch | Both | No | Solana RPC |
| Web3MergeService | Merge Web3 signals into result | Both | No | None |
| CacheService | Redis + Postgres dual cache, TTL mgmt | Both | No | Redis, Postgres |
| RateLimitGuard | GitHub rate limit tracking | Light | No | GitHub API headers |
| OctokitFactory | Octokit instance mgmt, token handling | Both | No | None |

---

## 2. DEPENDENCY GRAPH

### 2.1 Current Service Dependency Map

```
SignalComputeProcessor
├─ GithubAdapterService
│  ├─ PrismaService
│  ├─ Redis (REDIS injection)
│  ├─ RateLimitGuard
│  └─ OctokitFactory
├─ ScoringService
│  ├─ SignalExtractorService
│  ├─ OrgAnalyserService
│  ├─ EcosystemClassifierService
│  ├─ InteractionProfileService
│  ├─ StackFingerprintService
│  ├─ SummaryGeneratorService (NO-OP currently)
│  └─ ConfigService (for version constant)
├─ CacheService
│  ├─ PrismaService
│  └─ Redis (REDIS injection)
├─ SolanaAdapterService
│  ├─ ConfigService
│  └─ HTTP client (axios?)
└─ Web3MergeService

GithubSyncService
├─ PrismaService
├─ ConfigService
├─ Redis (REDIS injection)
├─ ProfileResolverService
├─ github-sync BullMQ Queue (to enqueue)
└─ Crypto utils

GithubSyncProcessor
├─ GithubAdapterService
├─ PrismaService
├─ OctokitFactory
└─ signal-compute BullMQ Queue (to downstream)

AnalysisController
├─ signal-compute BullMQ Queue (to enqueue)
├─ CacheService
├─ PrismaService
├─ ProfileResolverService
├─ GithubAdapterService
├─ SolanaAdapterService
├─ SignalExtractorService
├─ ScoringService
├─ Web3MergeService
└─ Redis (REDIS injection)
```

### 2.2 Circularity Analysis: NONE DETECTED

- Signal extraction is pure-functional (no external deps)
- Scoring is pure-functional (depends on signals only)
- GithubAdapterService is isolated (external API boundary)
- Cache is isolated (external data boundary)
- No circular imports observed

**Current state: Clean hierarchical dependency model.**

### 2.3 Coupling Hotspots

1. **SignalComputeProcessor directly orchestrates everything** — In target, this becomes "Wave orchestration" that is decoupled from individual modules.
2. **Scoring is monolithic** — Must be decomposed into 14 independent module functions.
3. **GithubAdapterService does fetching + normalization + caching** — In target, this becomes "Data Collector" + "Signal Corpus Builder".
4. **CacheService is Redis-first, Postgres is fallback** — In target, corpus is Redis-only (7d TTL), results go to evidence_briefs table.

---

## 3. EXISTING COMPONENTS THAT SATISFY TARGET ARCHITECTURE

### 3.1 Fully Aligned (Use As-Is)

| Component | Current | Target | Status |
|-----------|---------|--------|--------|
| **Rate Limiting Guard** | Tracks X-RateLimit-Remaining, enforces thresholds | Circuit breaker with partial corpus snapshot | ✅ **Adapt slightly** — add partial corpus handling |
| **OctokitFactory** | Creates Octokit instances with token mgmt | Factory pattern for multi-mode tokens | ✅ **Keep core logic** — extend for Deep Mode tokens |
| **Dual-Cache Strategy** | Redis 24h + Postgres fallback | Signal Corpus in Redis 7d, results in evidence_briefs table | ✅ **Refactor TTL &amp; schema** only |
| **Solana Adapter** | Queries Solana RPC, returns Web3 data | Part of anti-gaming inputs (ai_config_files, etc.) | ✅ **Keep** — no changes needed |
| **Web3Merge Service** | Merges Web3 data into final result | Same role in target | ✅ **Minimal change** — adjust signal shape |

### 3.2 Partially Aligned (Extract &amp; Adapt)

| Component | Current Role | Target Role | Refactor Scope |
|-----------|---|---|---|
| **GithubAdapterService** | Monolithic fetcher (raw data) | Becomes "Data Collector" — fetches raw, builds corpus | **High refactor** — Split into: <br> • GraphQL bulk fetch (Light) <br> • REST collection pipeline <br> • Clone worker orchestration (Deep) <br> • Corpus builder <br> • Circuit breaker |
| **SignalExtractorService** | 8 raw signals from single data object | Part of corpus population (Groups B–G) | **Low refactor** — Signals already match target Groups B/C/D/E/F/G. Just rename &amp; organize. |
| **ScoringService** | 3 composite scores | Becomes Wave 2b/2c/2d (P1–P5 deterministic scoring) | **Medium refactor** — Extract 5 module functions from scoring logic |
| **OrgAnalyserService** | Org detection | Becomes part of P3 (Collaboration Leverage), remains standalone | ✅ **No change** |
| **EcosystemClassifierService** | Stack fingerprinting | Part of P4 (Technical Depth) signal inputs | ✅ **No change** |
| **InteractionProfileService** | Starred repo clustering | Part of P4 inputs | ✅ **No change** |
| **StackFingerprintService** | Language/tool extraction | Same role in Brief Assembly (P7 alternative signals) | ✅ **No change** |

### 3.3 Queue Infra (Foundational, Expand)

| Component | Current | Target | Action |
|-----------|---------|--------|--------|
| **BullMQ + Redis** | 3 queues (github-sync, signal-compute, email) | Same base, add priority lanes + job distribution | ✅ **Extend for priority scheduling** |
| **Job status tracking** | AnalysisJob table with status + progress | Extend to track corpus fetch vs. analysis phases | ✅ **Extend schema** |
| **DLQ handling** | Exists (removeOnFail: 500) | Same + circuit break resume | ✅ **Add resume job logic** |

---

## 4. COMPONENTS THAT MUST BE MODIFIED

### 4.1 High-Impact Refactors (>30% code change)

#### **1. GithubAdapterService** → **DataCollector** (NEW) + **CorpusBuilder** (NEW)

**Current State:**
- Single `fetchRawData()` method (~1100 LOC)
- Returns nested object with repos, contributions, etc.
- No explicit grouping

**Target State:**
- **DataCollector Layer:**
  - `collectGroupA()` — Identity signals, 1 REST call
  - `collectGroupB()` — Repos, 1 GraphQL call
  - `collectGroupC()` — Commits, N REST calls (sampled)
  - `collectGroupD()` — Collaboration, GraphQL paginated
  - `collectGroupE()` — Engineering practices, N REST calls
  - `collectGroupF()` — Impact signals, external APIs (npm, PyPI, StackOverflow)
  - `collectGroupG_LightOnly()` — Anti-gaming deterministic inputs
  - `collectGroupG_DeepOnly()` — Secret scanning, SAST, clone tool outputs
  
- **CorpusBuilder Layer:**
  - `buildCorpusFromGroups()` — Merge collected groups into SignalCorpus
  - `enrichCorpusFromClonedRepos()` — Deep Mode: add Groups C delta (complexity, tests)
  - `snapshotPartialCorpus()` — Circuit break: save what was collected, mark missing groups

**Why:** Target explicitly separates API fetching from analysis grouping. Current code mixes them.

**Refactor Effort:** 
- Extract 60% of current GithubAdapterService
- Create 2 new service classes
- Update 15+ test cases
- **Estimate: 80 hours**

---

#### **2. ScoringService** → **14 Independent Analysis Module Functions**

**Current State:**
```typescript
score(data: GitHubRawData, walletAddress?: string): AnalysisResult {
  const signals = this.signalExtractor.extract(data);
  const capabilities = this.computeCapabilities(signals);
  const ownership = this.computeOwnership(data);
  const impact = this.computeImpact(signals, data);
  // ... returns composite result
}
```

**Target State:**
```typescript
// P1 Execution Reliability module
P1_ExecutionReliability(corpus: SignalCorpus, config: AnalysisConfig): ModuleResult
// P2 Systems Evolution module
P2_SystemsEvolution(corpus: SignalCorpus, config: AnalysisConfig): ModuleResult
// ... (12 more modules + 5 anti-gaming modules)

// Each module:
// - Takes only corpus + config
// - Returns ModuleResult with confidence, evidence, flags
// - Cites exact corpus field paths
// - No side effects, no external calls
```

**Why:** Target is modular composition of stateless functions. Current is monolithic with interdependencies.

**Decomposition List (P1–P7 + AG1–AG5):**
- **P1 Execution Reliability** — cadence, commit size, CI pass, test ratio, semver, dependabot
- **P2 Systems Evolution** — complexity trend, code quality trajectory
- **P3 Collaboration Leverage** — PR review quality, collaboration depth
- **P4 Technical Depth** — stack diversity, OSS impact, publication record
- **P5 Operational Maturity** — infrastructure practices, observability
- **P6 AI Leverage** — LLM call (Wave 3) output
- **P7 Domain Specialization** — role archetype fit, specialization signaling
- **AG1 Commit Inflation** — Statistical anomaly detection
- **AG2 Fork Dump** — Fork-to-owned ratio & farm detection
- **AG3 Burst/Dormancy** — Temporal anomaly on commit frequency
- **AG4 Repository Laundering** — Code Search cross-repo similarity
- **AG5 AI Generation Detection** — LLM-based pattern scoring

**Refactor Effort:**
- Create ModuleResult interface
- Extract 14 module implementations from ScoringService + sub-services
- Add LLM input pre-computation layer (Wave 3 batch dispatcher)
- Update Wave 1/2/3/4 orchestration logic
- **Estimate: 120 hours**

---

#### **3. SignalComputeProcessor** → **Wave Orchestrator + Job State Machine**

**Current State:**
- Single monolithic `process()` method (~350 LOC)
- Linear flow: fetch → extract → score → cache → return
- No wave concept, no parallel execution of independent modules
- Job state is coupled to BullMQ job.progress()

**Target State:**
```
Job enqueued → Wave 1 (AG1/AG2/AG3 parallel)
            ↓
           Wave 2a (AG4 conditional)
            ↓
        Wave 2b/2c/2d (P1–P5 parallel, deterministic)
            ↓
           Wave 3 (P6 + AG5 + LLM batch call)
            ↓
           Wave 4 (Brief Assembler + interview q gen)
            ↓
        Store evidence_brief, update job status
```

**Why:** Target defines explicit wave ordering with conditional branches. Current is sequential.

**Refactor Effort:**
- Create WaveOrchestrator class
- Implement parallel module executor (Promise.all for independent modules)
- Add wave gate logic (Wave 3 waits for Wave 1 results before running)
- Add conditional Wave 2a trigger (if AG1 OR AG3 fires)
- Update job state machine (queued → fetching → wave_1 → wave_2a → wave_2b → wave_3 → wave_4 → complete)
- **Estimate: 60 hours**

---

#### **4. CacheService** → **SignalCorpusCache + AnalysisResultCache** (Split)

**Current State:**
```typescript
// Single cache service, Redis 24h TTL, Postgres fallback
cache.get(cacheKey) // for AnalysisResult
cache.set(cacheKey, result)
```

**Target State:**
```typescript
// Separate concerns
SignalCorpusCache.get(username, mode) // Redis 7d TTL, NO Postgres fallback
SignalCorpusCache.set(corpus) // Overwrite if newer mode (Deep supersedes Light)

AnalysisResultCache.get(userId, brief_id) // evidence_briefs table + Redis short-term
AnalysisResultCache.set(result, brief_id)
```

**Why:** Target schema has signal_corpora (Redis only, 7d) vs. evidence_briefs (Postgres, queryable by employer).

**Refactor Effort:**
- New `SignalCorpusCache` class
- New `AnalysisResultCache` class
- Update Prisma schema (ADD signal_corpora table? Or Redis-only?)
- Update cache key logic (username:{mode} for corpus, brief_id for result)
- **Estimate: 30 hours**

---

### 4.2 Medium-Impact Refactors (10–30% code change)

#### **5. AnalysisController** → Remove Direct Orchestration, Delegate to Wave Orchestrator

**Current State:**
```typescript
@Post()
async createAnalysis(body: CreateAnalysisDto) {
  // ... validation
  this.signalQueue.add('analyze', { jobId, githubUsername, mode, ... });
  return { jobId };
}
```

**Target State:**
```typescript
@Post()
async createAnalysis(body: CreateAnalysisDto) {
  // 1. Validate tenant usage budget
  // 2. Reserve overage unit (not yet billed)
  // 3. Enqueue job with parsed AnalysisConfig
  // 4. Return immediate poll endpoint
}

// Billing happens in Wave 4 callback (BriefAssembler result)
```

**Why:** Target adds usage metering interception + budget checks at the API Gateway layer.

**Refactor Effort:**
- Add usage budget check via Metering service (TBD)
- Change job payload shape (add AnalysisConfig object)
- Remove direct cache lookup; delegate to BullMQ completion
- **Estimate: 15 hours**

---

#### **6. Prisma Schema Evolution** (Non-breaking additions)

**Add Tables:**
```prisma
// Signal corpus storage (if Postgres-backed, optional layer)
table signal_corpora {
  id uuid pk
  github_username string indexed
  collection_mode: 'light' | 'deep' | 'light_partial' | 'deep_partial'
  collected_at timestamp
  corpus_json jsonb
  groups_present string[]
  expires_at timestamp indexed
}

// Evidence briefs (replace current AnalysisJob partial storage)
table evidence_briefs {
  id uuid pk
  analysis_job_id uuid fk
  employer_id uuid fk
  candidate_username string
  analysis_mode 'light' | 'deep' | 'cv_verifier' indexed
  module_results moduel_result[]
  status 'complete' | 'partial' | 'failed'
  brief_markdown text
  brief_json jsonb (full ModuleResult[])
  created_at timestamp
  expires_at timestamp indexed
}

// Usage metering (billing table)
table usage_events {
  id uuid pk
  tenant_id uuid fk indexed
  event_type 'light_analysis' | 'deep_analysis' | 'cv_verify' indexed
  unit_count int (1 or fractional < 1 for partial)
  billed_at timestamp nullable (null = pending, set on invoice close)
}
```

**Refactor Effort:**
- Prisma schema update + migration
- Update SignalCorpusCache to query this table (optional, depends on architecture decision)
- **Estimate: 10 hours**

---

#### **7. LLM Integration Layer** (NEW SERVICE, but ties into ScoringService refactor)

**Current State:**
- No LLM integration (SummaryGeneratorService is a stub)
- ScoringService returns hardcoded fallback results

**Target State:**
```typescript
LLMService.batchWave3Call(corpus, flags) // P6 + AG5 + commit_message_quality + pr_description_depth
  → { 
      p6_scores, 
      ai_generation_confidence, 
      commit_quality_scores, 
      pr_depth_scores 
    }

BriefAssemblerService.generateNarrativeSections(all_module_results) // Wave 4
  → Evidence Brief markdown (Sections A, B, C narrative)

InterviewQuestionGenerator.generateQuestions(module_results, role_config) // Wave 4
  → Evidence Brief interview_questions field
```

**Refactor Effort:**
- New `LLMIntegrationService` (Claude API v1 with batch processing)
- Update `BriefAssemblerService` (currently stub)
- Add LLM error handling (timeout, rate limit, fallback narrative)
- **Estimate: 50 hours**

---

### 4.3 Low-Impact Refactors (<10% code change)

| Component | Change | Reason | Effort |
|-----------|--------|--------|--------|
| **OrgAnalyserService** | No major change | Logic aligns with P3 Collaboration Leverage | 5h |
| **InteractionProfileService** | Rename signals, adjust GroupF scoring | Maps to P4 Technical Depth | 5h |
| **StackFingerprintService** | No change | Maps direct to Brief assembly | 0h |
| **EcosystemClassifierService** | Ensure Web3 detection in P4 + P7 | Already works, just integrate output | 5h |
| **SolanaAdapterService** | No change | Web3 signals remain, no architectural change | 0h |
| **RateLimitGuard** | Add partial corpus snapshot logic | Circuit breaker partial resume | 10h |
| **OctokitFactory** | Support Deep Mode token provisioning | Add token type detection | 10h |

---

## 5. COMPONENTS THAT MUST BE ADDED

### 5.1 Core New Components (Critical Path)

#### **1. Signal Corpus Abstraction Layer** (NEW)

**File Structure:**
```
src/modules/analysis/corpus/
├── corpus.types.ts         // SignalCorpus interface
├── corpus.schema.ts        // Zod schema for corpus validation
├── corpus-cache.service.ts // Redis corpus storage
├── corpus-builder.service.ts // Assemble corpus from groups
└── corpus.module.ts
```

**Contracts:**
```typescript
interface SignalCorpus {
  corpus_id: string;
  github_username: string;
  collected_at: ISO8601;
  collection_mode: 'light' | 'deep' | 'light_partial' | 'deep_partial';
  groups_present: string[]; // ['a', 'b', 'c', 'd', 'e', 'f', 'g'] or subset
  collection_errors: string[];
  // 7 groups: identity, repositories, commit_signals, collaboration_signals, engineering_practice_signals, impact_signals, anti_gaming_inputs
}

// Each group is fully specified in Analysys_specs_architecture.md
```

**Responsibility:**
- Validate corpus structure
- Persist to Redis with 7d TTL
- Detect and merge mode upgrades (Light → Deep corpus merge)
- Provide group-presence checks for module pre-flight

**Effort Estimate: 40 hours**

---

#### **2. Analysis Module System** (NEW)

**File Structure:**
```
src/modules/analysis/modules/
├── module.interface.ts
├── module-result.types.ts
├── primitives/
│  ├── p1-execution-reliability.module.ts
│  ├── p2-systems-evolution.module.ts
│  ├── p3-collaboration-leverage.module.ts
│  ├── p4-technical-depth.module.ts
│  ├── p5-operational-maturity.module.ts
│  ├── p6-ai-leverage.module.ts (LLM-dependent)
│  └── p7-domain-specialization.module.ts
├── anti-gaming/
│  ├── ag1-commit-inflation.module.ts
│  ├── ag2-fork-dump.module.ts
│  ├── ag3-burst-dormancy.module.ts
│  ├── ag4-repository-laundering.module.ts (conditional, API-call required)
│  └── ag5-ai-generation-detection.module.ts (LLM-dependent)
├── module-registry.ts
└── module.module.ts
```

**Key Contracts:**
```typescript
interface AnalysisModule {
  module_id: string;
  required_corpus_groups: string[];
  run(corpus: SignalCorpus, config: AnalysisConfig): ModuleResult;
}

interface ModuleResult {
  module_id: string;
  primitive_id: string | null; // 'p1'–'p7' or null for AG
  confidence: 'strong' | 'moderate' | 'low' | 'observability_gap' | 'insufficient_data';
  score_label: string;
  evidence: Evidence[];
  flags: Flag[];
  interview_probe: string | null;
  raw_signals_used: string[];
}

interface AnalysisConfig {
  seniority: 'intern' | 'junior' | 'mid' | 'senior' | 'staff' | 'principal';
  role_archetype: 'backend' | 'frontend' | 'platform' | 'data_ml' | 'security' | 'mobile' | 'generalist';
  jd_text?: string;
}
```

**Responsibility:**
- Instantiate 14 module instances
- Pre-flight check (corpus groups present?)
- Execute modules in wave order
- Aggregate results

**Effort Estimate: 150 hours** (14 modules × 10 hours each + registry + orchestration)

---

#### **3. Wave Orchestrator** (NEW)

**File:**
```
src/modules/analysis/orchestration/wave-orchestrator.service.ts
```

**Responsibility:**
- Execute Wave 1: AG1, AG2, AG3 in parallel
- Execute Wave 2a: AG4 (conditional, only if W1 flags trigger)
- Execute Wave 2b/2c/2d: P1–P5 in parallel (no dependencies between these)
- Execute Wave 3: P6 + AG5 (requires LLM in Wave 3, fetched via LLMService)
- Execute Wave 4: Brief Assembler (depends on all prior results)
- Handle exceptions: partial corpus → skip modules requiring missing groups
- Emit progress events to job tracker

**Key Methods:**
```typescript
orchestrateAnalysis(corpus: SignalCorpus, config: AnalysisConfig): Promise<ModuleResult[]>
  → Executes all 4 waves, returns aggregated results
```

**Effort Estimate: 60 hours**

---

#### **4. LLM Integration Service** (NEW)

**File:**
```
src/modules/analysis/llm/llm-integration.service.ts
src/modules/analysis/llm/claude-batch-dispatcher.ts
```

**Responsibility:**
- Batch LLM calls for Wave 3 (commit quality + PR depth + P6 + AG5)
- Batch LLM calls for Wave 4 (narrative generation + interview questions)
- Handle token limits (batch payloads must fit within model context)
- Retry logic (exponential backoff, fallback narratives)
- Cache LLM outputs (same corpus + config → reuse narrative)

**Contracts:**
```typescript
LLMService.wave3Batch(corpus: SignalCorpus, flags: Flag[])
  → { p6_scores, ai_generation_confidence, message_quality_scores, pr_depth_scores }

LLMService.wave4Narrative(all_module_results: ModuleResult[], config: AnalysisConfig)
  → { section_a_narrative, section_b_narrative, section_c_narrative }

LLMService.generateInterviewQuestions(all_module_results: ModuleResult[], role: string)
  → InterviewQuestionSet[]
```

**Effort Estimate: 80 hours**

---

#### **5. Brief Assembler Service** (NEW)

**File:**
```
src/modules/analysis/brief/brief-assembler.service.ts
src/modules/analysis/brief/brief-renderer.ts
```

**Responsibility:**
- Consume all 14 ModuleResults + LLM outputs
- Apply seniority weighting to scores
- Assemble Evidence Brief structure (Sections A–D, interview questions, citations)
- Render Markdown output
- Generate PDF on demand
- Marshal to evidence_briefs Postgres table

**Contracts:**
```typescript
BriefAssembler.assemble(
  module_results: ModuleResult[],
  llm_narrative: LLMNarrativeOutput,
  config: AnalysisConfig
): EvidenceBrief

interface EvidenceBrief {
  brief_id: string;
  section_a_executive_summary: string; // LLM narrative
  section_b_primitive_scores: Map<string, PrimitiveScore>;
  section_c_anti_gaming_flags: Flag[];
  section_d_interview_questions: InterviewQuestion[];
  role_fit_analysis: string;
  cv_cross_check?: CVVerifierResult; // if CV Verifier mode
  metadata: BriefMetadata;
}
```

**Effort Estimate: 70 hours**

---

#### **6. Multi-Mode Job Dispatcher** (NEW)

**File:**
```
src/modules/analysis/orchestration/job-dispatcher.service.ts
```

**Responsibility:**
- Detect analysis mode from request (Light / Deep / CV Verifier)
- Light Mode: Fetch Light corpus (or full if not cached) → run modules → cache → brief
- Deep Mode: Fetch Deep corpus delta (merge with Light if exists) → run modules → cache → brief
- CV Verifier Mode: Fetch/cache Light corpus → extract CV claims → run CV verification modules → brief
- Compose appropriate job payload for BullMQ

**Effort Estimate: 40 hours**

---

### 5.2 Infrastructure and Integration Components (Secondary)

#### **7. Batch Job Processor** (NEW) — For Scale-up tier

**File:**
```
src/modules/batch/batch-processor.service.ts
src/queues/batch.processor.ts
```

**Responsibility:**
- Ingest CSV with 500 GitHub usernames
- Enqueue 500 jobs (light mode) with priority lane
- Track batch completion
- Aggregate results for export (PDF or JSON)
- Push to ATS webhook on completion

**Effort Estimate: 40 hours**

---

#### **8. Usage Metering Service** (NEW) — For billing

**File:**
```
src/modules/billing/metering.service.ts
```

**Responsibility:**
- Intercept every analysis start → reserve overage unit
- On brief completion or partial break → confirm billed/half-billed
- Emit usage_events to Postgres for invoice generation
- Query tenant usage for dashboard

**Effort Estimate: 30 hours**

---

#### **9. Tenant Context Middleware** (NEW) — For multi-tenancy

**File:**
```
src/shared/middleware/tenant-context.middleware.ts
src/shared/context/tenant-context.service.ts
```

**Responsibility:**
- Extract tenant_id from JWT or subdomain
- Inject tenant context into all requests
- Enforce tenant data isolation in queries

**Effort Estimate: 20 hours**

---

#### **10. ATS Webhook Integration Service** (NEW, Phase 4)

**File:**
```
src/modules/integration/ats/ats-webhook.service.ts
src/modules/integration/ats/providers/lever.adapter.ts
src/modules/integration/ats/providers/greenhouse.adapter.ts
src/modules/integration/ats/providers/ashby.adapter.ts
```

**Responsibility:** Webhook ingestion &amp; delivery to Lever, Greenhouse, Ashby.

**Effort Estimate: 50 hours**

---

### 5.3 Utility & Testing Components

| Component | Purpose | Effort |
|-----------|---------|--------|
| **AnalysisConfig Validator** (Zod schema) | Validate role archetype, seniority, JD text | 5h |
| **ModuleResult Validator** | Schema validation for module outputs | 5h |
| **SignalCorpus Fixtures** | Test data for all 7 groups | 20h |
| **Module Integration Tests** | 14 modules × 5h test coverage | 70h |
| **Wave Orchestrator Tests** | Test parallel execution, waves, conditional logic | 30h |
| **Brief Assembly Tests** | Test rendering, seniority adjustments | 20h |

---

## 6. COMPONENTS THAT SHOULD NOT BE CHANGED (Already Aligned)

### 6.1 Fundamental Infrastructure (Keep Unchanged)

| Component | Reason | Stability Rating |
|-----------|--------|------------------|
| **BullMQ Queue System** | Already supports priority lanes, retry logic, circuit breaker. Exactly matches target use. | ✅ High |
| **RedisCache for Corpus** | Current cache TTL logic can be adapted for 7d corpus; Redis connection already optimized. | ✅ High |
| **Postgres Dual-Store** | Used for evidence_briefs (new table) instead of current AnalysisJob. Schema only extends, no breaking changes. | ✅ High |
| **GitHub API Rate Limiting** | RateLimitGuard logic is sound; only needs partial corpus snapshot on circuit break. | ✅ High |
| **Solana Adapter** | Web3 signals remain unchanged; slot into P4 + P7 modules without modification. | ✅ High |
| **OctokitFactory Token Mgmt** | Token rotation logic works for both Light &amp; Deep; just add Deep Mode variant. | ✅ High |

### 6.2 Service Logic (Minimal Change Required)

| Component | Current State | Target State | Change Type | Stability |
|-----------|---|---|---|---|
| **OrgAnalyserService** | Standalone org detection | Feeds into P3 module | Input/output shape unchanged | ✅ Low risk |
| **EcosystemClassifierService** | Stack fingerprinting | Feeds into P4 + P7 modules | Already deterministic | ✅ Low risk |
| **InteractionProfileService** | Repo affinity clustering | Feeds into P4 module | Corpus source changes slightly | ✅ Low risk |
| **StackFingerprintService** | Language + tool extraction | Same role in Brief assembly | Already stateless | ✅ Low risk |

### 6.3 What to NOT Refactor

- **Worker.ts** — Keep process separation, only update imports
- **App.module.ts** — Extend imports for new services, do NOT restructure
- **Redis connection pool** — Reuse existing REDIS injection
- **Prisma migration system** — Leverage existing migrations, add new tables only
- **E2E test infrastructure** — Reuse existing test harness, add new test cases
- **Docker deployment** — Keep same containerization; memory only increases for LLM tokenization

---

## 7. MIGRATION RISK ASSESSMENT

### 7.1 Risk Matrix

| Category | Risk | Severity | Mitigation | Owner |
|----------|------|----------|-----------|-------|
| **Data Loss — Corpus Cache Expiry** | Partial corpuses in-flight when TTL strategy changes | HIGH | Pre-TTL migration: extend current cache TTL to 7d, ensure all in-flight analyses complete before schema change | Ops |
| **API Breaking Change** | Current AnalysisResult shape vs. ModuleResult[] shape | HIGH | Dual-mode API: new `/v2/analysis` endpoint returns ModuleResult[], keep `/v1/analysis` legacy adapter wrapping new logic | API Gate |
| **LLM Latency SLA Miss** | Wave 3 LLM call adds 25s; total now ~130s vs. 3min SLA | MEDIUM | Timeout at 60s with fallback narrative; client-side progress polling shows LLM delay; SLA is soft (3min is aspirational, not hard) | Eng Lead |
| **Wave 2a Conditional Logic** | AG4 (Code Search) only runs if AG1/AG3 fire; complex state machine | MEDIUM | Unit tests for all wave paths; trace logging; dark launch with shadow mode | QA |
| **Rate Limit Circuit Break — Partial Corpus Handling** | Modules dependent on missing groups must gracefully degrade | MEDIUM | Pre-flight checks in each module; confidence drops to 'observability_gap'; tests cover all group subsets | Dev |
| **Corpus Mode Merging** | Deep Mode merge with existing Light corpus requires careful conflict resolution | MEDIUM | Deep Mode is strictly additive; no overwrite logic; test matrix for all merge scenarios | Dev |
| **LLM Token Budgeting** | Single batch call with many candidates × corpus data could exceed token limit | MEDIUM | Chunk batch calls to max 10 candidates per LLM request; queue on separate worker pool | Eng Lead |
| **Parking Lot: CV Verifier Mode** | Not in Phase 1; requires CV extraction ML model | LOW | Phase 3+; design skeleton now, implement later; no blocker for Phases 1–2 | PM |
| **Parking Lot: ATS Webhooks** | Not in Phase 1; requires ATS adapter layer | LOW | Phase 3+; design skeleton now, implement later; no blocker for Phases 1–2 | PM |
| **Parking Lot: Multi-tenancy Auth** | Not in Phase 1; requires SCIM + SSO | LOW | Phase 4+; design skeleton now, implement later; no blocker for Phases 1–3 | PM |
| **Performance — Module Execution Time** | 14 modules × 1–30s each in waves; could exceed 3min SLA | MEDIUM | Profile each module; parallelize Waves 2b/2c/2d; skip non-essential modules for trial tier | Perf Team |

---

### 7.2 Phase-Based Rollout Strategy

#### **Phase 1: Foundation (3–4 weeks)**
- ✅ Build Signal Corpus abstraction + Redis TTL
- ✅ Build Analysis Module System (14 modules, deterministic)
- ✅ Build Wave Orchestrator (Waves 1–4, no LLM)
- ✅ Light Mode only; no Deep Mode yet
- ✅ Launch with legacy `/v1` API adapter wrapping new logic
- ✅ Dark launch: send Light requests through new pipeline 1% traffic, verify results match legacy

**Risk:** Logic regression. **Mitigation:** Detailed diff testing (old output vs. new output for 1000 candidates).

---

#### **Phase 2: LLM Integration (2–3 weeks)**
- ✅ Build LLM Integration Service (Claude API)
- ✅ Build Brief Assembler Service
- ✅ Enable Wave 3 (LLM batch calls)
- ✅ Integrate new Evidence Brief as primary output (replace AnalysisResult)
- ✅ Implement seniority weighting

**Risk:** LLM API failures, token overages. **Mitigation:** Fallback narratives, rate limits, cost monitoring.

---

#### **Phase 3: Deep Mode + Extended Features (4–5 weeks)**
- ✅ Implement Deep Mode data collection (clone workers)
- ✅ Add Groups C delta (complexity, test coverage, code quality)
- ✅ Implement Wave 2a (AG4 Repository Laundering, optional)
- ✅ Batch job processor for CSV uploads
- ✅ Usage metering + overages billing

**Risk:** Clone worker orchestration complexity, tmpfs disk pressure. **Mitigation:** Timeouts, containerized isolation, watchdog jobs.

---

#### **Phase 4: Multi-Tenancy &amp; Extensions (6–8 weeks)**
- ✅ Tenant context middleware + data isolation
- ✅ ATS webhook adapters (Lever, Greenhouse, Ashby)
- ✅ CV Verifier mode + CV extraction service
- ✅ SSO/SCIM provisioning
- ✅ White-label theming

**Risk:** Data isolation bugs, coupling between tenants. **Mitigation:** Isolation tests, tenant-specific test fixtures.

---

### 7.3 Backward Compatibility Strategy

**Legacy Clients (Phase 1):**
```
POST /api/analysis (legacy request)
  → AnalysisController.createAnalysis_V1()
    → Enqueue new wave pipeline
    → On completion, wrap ModuleResult[] into AnalysisResult shape
    → Return legacy response
```

**New Clients (Phase 2+):**
```
POST /api/v2/analysis (new request with AnalysisConfig)
  → AnalysisController.createAnalysis_V2()
    → Enqueue new wave pipeline
    → On completion, return ModuleResult[] + EvidenceBrief directly
```

**Deprecation Timeline:**
- Phase 1–2: Both `/api/analysis` and `/api/v2/analysis` active
- Phase 3: Deprecation notice on `/api/analysis`
- Phase 4: Remove `/api/analysis` entirely

---

### 7.4 Testing Strategy

#### **Unit Tests**
- 14 module functions covering all signal paths, edge cases, seniority variants
- Wave orchestrator logic (conditional AG4, parallelism)
- Corpus grouping and merge logic
- LLM batch composition and token budgeting

#### **Integration Tests**
- Full pipeline for 50–100 test candidates (Light Mode)
- Partial corpus (circuit break) → module degradation
- Cache hits vs. misses (valid cache vs. expired)
- LLM fallback on timeout

#### **E2E Tests**
- End-to-end Light Mode: OAuth → analysis → brief → export
- End-to-end Deep Mode (Phase 3): OAuth → analysis + clone → brief → export
- Batch upload (Phase 3): CSV → 500 queue jobs → aggregated results

#### **Load Tests**
- 100 concurrent Light Mode requests (3min SLA)
- Measure Wave execution times per tier (trial vs. paid)
- LLM batch throughput (candidates/sec)

---

### 7.5 Rollback Plan

**If Phase 1 fails (modules regress):**
- Kill new pipeline deployment
- Route all traffic to legacy AnalysisController → old ScoringService
- Investigate regression via diff logs
- Fix and re-deploy

**If Phase 2 fails (LLM API issues):**
- Fallback to hardcoded narrative templates
- Continue module execution (briefs are non-LLM)
- Page on-call to debug LLM service
- RTO: 30 minutes

**If Phase 3 fails (clone workers crash):**
- Revert Deep Mode data collection
- Light Mode + Wave 1–4 still operational
- RTO: 15 minutes

---

## APPENDIX A: EFFORT ESTIMATION SUMMARY

### A.1 Total Engineering Hours by Category

| Category | Components | Estimate | Weeks (5 eng) |
|----------|-----------|----------|---|
| **High-Refactor Services** | GithubAdapterService, ScoringService, SignalComputeProcessor, CacheService | **290h** | 11.6w |
| **New Core Components** | Corpus abstraction, Module system, Wave orchestrator, LLM integration, Brief assembler | **380h** | 15.2w |
| **Integration &amp; Utilities** | Batch processor, Usage metering, Tenant middleware, ATS webhooks, Config validators | **135h** | 5.4w |
| **Testing** (unit + integration + e2e) | Module tests, integration tests, load tests | **120h** | 4.8w |
| **Schema &amp; Migration** | Prisma schema updates, data migration scripts | **20h** | 0.8w |
| **Documentation &amp; Code Review** | API docs, architecture docs, peer review cycles | **75h** | 3.0w |
| **Buffer (15% contingency)** | Unforeseen refactors, bug fixes, performance tuning | **150h** | 6.0w |
| **TOTAL** | | **1150h** | **46.8w** (9.4 weeks @ 5 eng) |

### A.2 Critical Path (Phases 1–2, for product launch)

| Phase | Components | Hours | Weeks (5 eng) | Owner |
|-------|-----------|-------|---|---|
| **Phase 1: Foundation** | Corpus, Modules, Orchestrator (no LLM) | 530h | 4.2w | Backend Lead |
| **Phase 2: LLM + Brief** | LLM service, Brief assembler, integration | 220h | 1.8w | ML + Backend |
| **TOTAL (Launch)** | | **750h** | **6.0w** | |

---

## APPENDIX B: FILE STRUCTURE (Target)

```
backend/
├── src/
│  ├── modules/
│  │  ├── analysis/
│  │  │  ├── corpus/
│  │  │  │  ├── corpus.types.ts
│  │  │  │  ├── corpus.schema.ts
│  │  │  │  ├── corpus-cache.service.ts
│  │  │  │  ├── corpus-builder.service.ts
│  │  │  │  └── corpus.module.ts
│  │  │  ├── modules/
│  │  │  │  ├── module.interface.ts
│  │  │  │  ├── module-result.types.ts
│  │  │  │  ├── module-registry.ts
│  │  │  │  ├── primitives/
│  │  │  │  │  ├── p1-execution-reliability.module.ts
│  │  │  │  │  ├── p2-systems-evolution.module.ts
│  │  │  │  │  ├── ... (P3–P7)
│  │  │  │  │  └── p7-domain-specialization.module.ts
│  │  │  │  ├── anti-gaming/
│  │  │  │  │  ├── ag1-commit-inflation.module.ts
│  │  │  │  │  ├── ... (AG2–AG5)
│  │  │  │  │  └── ag5-ai-generation-detection.module.ts
│  │  │  │  └── module.module.ts
│  │  │  ├── orchestration/
│  │  │  │  ├── wave-orchestrator.service.ts
│  │  │  │  ├── job-dispatcher.service.ts
│  │  │  │  └── analysis-state-machine.ts
│  │  │  ├── llm/
│  │  │  │  ├── llm-integration.service.ts
│  │  │  │  ├── claude-batch-dispatcher.ts
│  │  │  │  └── llm-prompt-templates.ts
│  │  │  ├── brief/
│  │  │  │  ├── brief-assembler.service.ts
│  │  │  │  ├── brief-renderer.ts
│  │  │  │  └── seniority-weighting.ts
│  │  │  ├── data-collector/
│  │  │  │  ├── data-collector.service.ts
│  │  │  │  ├── group-collectors/
│  │  │  │  │  ├── group-a.collector.ts (Identity)
│  │  │  │  │  ├── group-b.collector.ts (Repos)
│  │  │  │  │  ├── ... (C–G)
│  │  │  │  │  └── group-g.collector.ts (Anti-gaming)
│  │  │  │  └── circuit-breaker.ts
│  │  │  └── analysis.module.ts
│  │  ├── batch/
│  │  │  ├── batch-processor.service.ts
│  │  │  └── batch.module.ts
│  │  ├── billing/
│  │  │  ├── metering.service.ts
│  │  │  ├── usage-event.entity.ts
│  │  │  └── billing.module.ts
│  │  ├── integration/
│  │  │  ├── ats/
│  │  │  │  ├── ats-webhook.service.ts
│  │  │  │  ├── providers/
│  │  │  │  │  ├── lever.adapter.ts
│  │  │  │  │  ├── greenhouse.adapter.ts
│  │  │  │  │  └── ashby.adapter.ts
│  │  │  │  └── ats.module.ts
│  │  │  └── integration.module.ts
│  │  └── ...existing modules...
│  ├── shared/
│  │  ├── middleware/
│  │  │  └── tenant-context.middleware.ts
│  │  ├── context/
│  │  │  └── tenant-context.service.ts
│  │  └── ...existing shared utilities...
│  └── ...existing app.module.ts, main.ts...

├── prisma/
│  ├── migrations/
│  │  └── 2026MMDD_add_evidence_briefs_and_corpus/
│  └── schema.prisma (extended with signal_corpora, evidence_briefs, usage_events tables)

└── test/
   ├── analysis/
   │  ├── modules/
   │  │  ├── p1-execution-reliability.spec.ts
   │  │  ├── ... (14 modules)
   │  │  └── ag5-ai-generation-detection.spec.ts
   │  ├── orchestration/
   │  │  ├── wave-orchestrator.spec.ts
   │  │  └── job-dispatcher.spec.ts
   │  ├── corpus/
   │  │  └── corpus.spec.ts
   │  └── e2e/
   │     ├── light-mode.e2e-spec.ts
   │     ├── deep-mode.e2e-spec.ts (Phase 3)
   │     └── batch-processing.e2e-spec.ts (Phase 3)
   └── fixtures/
      ├── signal-corpus-fixtures.ts
      └── analysis-config-fixtures.ts
```

---

## CONCLUSION

**Migration feasibility: GREEN — Proceed with confidence**

The current 16Signals codebase has **strong foundational alignment** with the target GitIntel architecture. The three main vectors of change — **Corpus abstraction, Module system decomposition, and Wave-based orchestration** — are all additive and non-breaking. Existing services (RateLimitGuard, OctokitFactory, CacheService, analysis sub-services) can be refactored in-place with low risk.

**Critical success factors:**
1. **Parallel development** — Build new components (Corpus, Modules, Orchestrator) in feature branch while legacy pipeline remains operational
2. **Dark launch** — Send 1% traffic through new pipeline, verify result equivalence before cutover
3. **Phase isolation** — Complete Phase 1 (Light Mode + Modules) before enabling Phase 2 (LLM). Do NOT couple.
4. **Testing rigor** — Invest 120+ hours in integration + load tests to catch wave execution bugs early

**Recommended start date:** June 3, 2026 (Monday)  
**Target launch (Phases 1–2):** July 14, 2026 (6 weeks)

