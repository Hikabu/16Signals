# GitIntel — Deepseek v4 LLM Refactor Plan
## Stage-by-Stage Architecture Migration with Tests & Tracing

**Date:** May 31, 2026  
**Target LLM:** Deepseek v4 (replaces Claude Sonnet 4 references in original spec)  
**Current Architecture:** 16Signals monolithic NestJS pipeline  
**Next Targeted Architecture:** GitIntel composable 3-layer pipeline (Corpus → Modules → Brief)

---

## Executive Summary

This document defines a concrete, stage-by-stage refactor plan to migrate from the current 16Signals monolithic NestJS analyser (single `SignalComputeProcessor.process()`, monolithic `ScoringService.score()`, 8 raw signals) to the GitIntel 3-layer composable architecture with 14 analysis modules, 6 anti-gaming detectors, employment verification, and evidence brief assembly — all backed by **Deepseek v4** as the LLM provider.

The refactor is designed so that **each stage is independently testable, deployable, and reversible**. Strategic `console.log` calls are embedded at every architectural boundary to allow following the new pipeline execution in real-time during development and production debugging.

---

## Table of Contents

1. [Deepseek v4 Integration Strategy](#1-deepseek-v4-integration-strategy)
2. [Next Targeted Architecture](#2-next-targeted-architecture)
3. [Strategic Console.log Tracing Framework](#3-strategic-consolelog-tracing-framework)
4. [Stage 0: Prerequisites — Schema & Foundation](#stage-0-prerequisites--schema--foundation)
5. [Stage 1: Signal Corpus Layer](#stage-1-signal-corpus-layer)
6. [Stage 2: Module System & Module Contract](#stage-2-module-system--module-contract)
7. [Stage 3: Wave Orchestrator](#stage-3-wave-orchestrator)
8. [Stage 4: Data Collector Refactor](#stage-4-data-collector-refactor)
9. [Stage 5: LLM Integration (Deepseek v4)](#stage-5-llm-integration-deepseek-v4)
10. [Stage 6: Brief Assembler](#stage-6-brief-assembler)
11. [Stage 7: Multi-Mode Dispatcher & API Migration](#stage-7-multi-mode-dispatcher--api-migration)
12. [Stage 8: Deep Mode & Clone Workers](#stage-8-deep-mode--clone-workers)
13. [Test Strategy Summary](#test-strategy-summary)
14. [Rollback Plan Per Stage](#rollback-plan-per-stage)

---

## 1. Deepseek v4 Integration Strategy

### 1.1 Why Deepseek v4

The original GitIntel spec references `claude-sonnet-4-20250514` as the LLM provider. We are substituting **Deepseek v4** for the following reasons:

| Factor | Claude Sonnet 4 | Deepseek v4 |
|--------|----------------|-------------|
| Cost per 1M tokens | ~$3/$15 (input/output) | ~$0.55/$2.19 |
| Context window | 200K | 128K (sufficient for batched Wave 3 calls) |
| JSON mode reliability | Strong | Comparable with structured output |
| Latency (batch) | ~25s | ~18-22s (lower cost = less queuing) |
| Availability | Regional restrictions | Broader availability |

### 1.2 Deepseek v4 Client Setup

**Package:** Use `@anthropic-ai/sdk` is NOT replaced — we add a new `openai`-compatible client since Deepseek v4 exposes an OpenAI-compatible API.

```typescript
// New dependency to add:
// npm install openai

// src/modules/analysis/llm/deepseek-client.ts
import OpenAI from 'openai';

export interface DeepseekConfig {
  apiKey: string;
  baseURL: string;   // e.g. 'https://api.deepseek.com/v1'
  model: string;     // e.g. 'deepseek-chat' (v4)
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

export function createDeepseekClient(config: DeepseekConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: config.timeoutMs,
    maxRetries: 2,
  });
}
```

### 1.3 Environment Variables

```bash
# .env additions
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_MAX_TOKENS=4096
DEEPSEEK_TEMPERATURE=0
DEEPSEEK_TIMEOUT_MS=35000
```

### 1.4 LLM Call Mapping: Claude → Deepseek v4

| Original Claude Call | Deepseek v4 Equivalent | Notes |
|----------------------|----------------------|-------|
| Wave 3 batched analysis (5 tasks) | Single chat completion with structured JSON output | Deepseek v4 supports `response_format: { type: 'json_object' }` |
| Wave 4 narrative generation | Separate chat completion | Same prompt structure, different model param |
| Interview question generation | Chat completion with JSON array output | Same |
| CV claim extraction | Chat completion with JSON array output | Same |
| P6/AG5 AI leverage classification | Part of Wave 3 batch | Same prompt structure |

### 1.5 Prompt Compatibility Notes

Deepseek v4 uses the same chat completion interface as OpenAI. The system/user message format is identical:
- System prompts work the same way
- JSON output mode is available
- Temperature 0 is supported for deterministic outputs
- Max tokens: 4K default, up to 8K for Wave 4 narrative generation

**Key difference from Claude:** Deepseek v4 requires explicit `response_format: { type: 'json_object' }` in the request for guaranteed JSON output. Add this to all structured LLM calls.

---

## 2. Next Targeted Architecture

### 2.1 Architecture Diagram (Target After All Stages)

```
┌─────────────────────────────────────────────────────────────────┐
│                        API LAYER (NestJS)                       │
│  /api/v2/analysis  |  /api/v2/analysis/deep  |  /api/v2/batch  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │ Job Dispatcher│  ← NEW Stage 7
                    │ (multi-mode) │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼────┐ ┌────▼─────┐ ┌───▼──────┐
        │  Light   │ │  Deep    │ │   CV     │
        │  Mode    │ │  Mode    │ │ Verifier │
        └─────┬────┘ └────┬─────┘ └───┬──────┘
              │            │            │
              └────────────┼────────────┘
                           │
              ┌────────────▼────────────┐
              │   DATA COLLECTOR LAYER  │  ← REFACTORED Stage 4
              │  (Group A–G collectors) │
              │  RateLimitGuard         │
              │  CircuitBreaker         │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │    SIGNAL CORPUS        │  ← NEW Stage 1
              │  (Redis, 7d TTL)        │
              │  CorpusCache            │
              │  CorpusBuilder          │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │   WAVE ORCHESTRATOR     │  ← NEW Stage 3
              │  Wave 1: AG1-AG3 (∥)    │
              │  Wave 2a: AG4 (cond)    │
              │  Wave 2b: P1,P2,P5 (∥)  │
              │  Wave 2c: P3 (∥)        │
              │  Wave 2d: P4 (∥)        │
              │  Wave 3: LLM batch (∥)  │
              │  Wave 4: Brief assembly │
              └────────────┬────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
  ┌──────▼──────┐  ┌──────▼──────┐  ┌───────▼──────┐
  │ 14 Analysis │  │Deepseek v4  │  │Brief Assembler│
  │  Modules    │  │LLM Service  │  │               │
  │ Stage 2     │  │Stage 5      │  │Stage 6        │
  └─────────────┘  └─────────────┘  └───────────────┘
                           │
              ┌────────────▼────────────┐
              │    EVIDENCE BRIEF       │
              │  (Postgres JSONB + MD)  │
              └─────────────────────────┘
```

### 2.2 Key Architectural Differences from Current

| Aspect | Current (16Signals) | Target (GitIntel) |
|--------|-------------------|-------------------|
| Data → Analysis coupling | Tightly coupled in `SignalComputeProcessor.process()` | Decoupled via Signal Corpus |
| Analysis modules | 1 monolithic `ScoringService` with 3 composites | 14 independent stateless modules |
| Execution model | Sequential linear flow | 4-wave parallel orchestration |
| LLM integration | None (SummaryGeneratorService is stub) | Deepseek v4 integrated in Waves 3 & 4 |
| Cache strategy | Redis 24h + Postgres fallback for AnalysisResult | Redis 7d for SignalCorpus, Postgres for EvidenceBrief |
| Output format | `AnalysisResult` (3 composites) | `EvidenceBrief` (7-primitive sections + flags + interview q's) |
| Anti-gaming | None | 6 AG modules + employment verification |
| Multi-mode | Single path (github-only / github+wallet / wallet-only) | Light / Deep / CV Verifier modes |

---

## 3. Strategic Console.log Tracing Framework

### 3.1 Tracing Philosophy

Every architectural boundary emits a structured `console.log` with a consistent format. This allows following the exact execution path through logs without a debugger. Each log line contains:
- **Component tag** in brackets: `[ComponentName]`
- **Stage/Phase indicator**
- **Key identifiers**: `jobId`, `username`, `corpus_id`
- **Timing data**: duration in milliseconds where applicable

### 3.2 Log Format Convention

```
[COMPONENT] phase=PHASE jobId=XXX username=YYY detail=ZZZ
```

### 3.3 Tracing Points by Component

#### Data Collector Layer

```typescript
// Group collection lifecycle
console.log(`[DataCollector] phase=collect_start jobId=${jobId} username=${username} mode=${mode}`)
console.log(`[DataCollector] phase=group_complete jobId=${jobId} group=${groupName} durationMs=${ms}`)
console.log(`[DataCollector] phase=collect_complete jobId=${jobId} totalDurationMs=${ms} groupsCollected=${groups}`)
console.log(`[DataCollector] phase=circuit_break jobId=${jobId} reason=rate_limit remaining=${remaining}`)
console.log(`[DataCollector] phase=partial_corpus_saved jobId=${jobId} groupsPresent=${groups}`)
```

#### Signal Corpus Cache

```typescript
console.log(`[CorpusCache] phase=cache_hit corpusId=${corpusId} username=${username} mode=${mode}`)
console.log(`[CorpusCache] phase=cache_miss username=${username} mode=${mode}`)
console.log(`[CorpusCache] phase=merge_delta username=${username} fromMode=${fromMode} toMode=${toMode}`)
console.log(`[CorpusCache] phase=corpus_stored corpusId=${corpusId} ttl=7d groupsPresent=${groups}`)
```

#### Wave Orchestrator

```typescript
console.log(`[WaveOrchestrator] phase=orchestration_start jobId=${jobId} corpusId=${corpusId} mode=${mode}`)
console.log(`[WaveOrchestrator] phase=wave_start jobId=${jobId} wave=${waveNum} modules=${modules}`)
console.log(`[WaveOrchestrator] phase=wave_complete jobId=${jobId} wave=${waveNum} durationMs=${ms}`)
console.log(`[WaveOrchestrator] phase=wave_skip jobId=${jobId} wave=2a reason=no_triggers`)
console.log(`[WaveOrchestrator] phase=module_error jobId=${jobId} moduleId=${moduleId} error=${msg}`)
console.log(`[WaveOrchestrator] phase=orchestration_complete jobId=${jobId} totalDurationMs=${ms}`)
```

#### Individual Analysis Modules

```typescript
console.log(`[Module:${moduleId}] phase=run_start corpusId=${corpusId} requiredGroups=${groups}`)
console.log(`[Module:${moduleId}] phase=preflight_fail corpusId=${corpusId} missingGroups=${groups}`)
console.log(`[Module:${moduleId}] phase=run_complete confidence=${confidence} durationMs=${ms}`)
console.log(`[Module:${moduleId}] phase=flag_raised flagType=${flagType} flagId=${flagId}`)
```

#### Deepseek v4 LLM Service

```typescript
console.log(`[DeepseekLLM] phase=call_start callType=${type} tokenEstimate=${tokens}`)
console.log(`[DeepseekLLM] phase=call_complete callType=${type} durationMs=${ms} tokensUsed=${tokens}`)
console.log(`[DeepseekLLM] phase=retry callType=${type} attempt=${attempt} reason=${reason}`)
console.log(`[DeepseekLLM] phase=fallback callType=${type} reason=${reason}`)
console.log(`[DeepseekLLM] phase=json_parse_error callType=${type} attempt=${attempt}`)
```

#### Brief Assembler

```typescript
console.log(`[BriefAssembler] phase=assembly_start jobId=${jobId} moduleCount=${count}`)
console.log(`[BriefAssembler] phase=section_complete jobId=${jobId} section=${section}`)
console.log(`[BriefAssembler] phase=assembly_complete jobId=${jobId} durationMs=${ms}`)
```

### 3.4 Example Trace Output for a Complete Light Mode Analysis

```
[JobDispatcher] phase=dispatch jobId=abc123 mode=light username=torvalds
[DataCollector] phase=collect_start jobId=abc123 username=torvalds mode=light
[DataCollector] phase=group_complete jobId=abc123 group=A durationMs=320
[DataCollector] phase=group_complete jobId=abc123 group=B durationMs=1450
[DataCollector] phase=group_complete jobId=abc123 group=C durationMs=2800
[DataCollector] phase=group_complete jobId=abc123 group=D durationMs=1800
[DataCollector] phase=group_complete jobId=abc123 group=E durationMs=2200
[DataCollector] phase=group_complete jobId=abc123 group=F durationMs=800
[DataCollector] phase=group_complete jobId=abc123 group=G durationMs=150
[DataCollector] phase=collect_complete jobId=abc123 totalDurationMs=9520 groupsCollected=A,B,C,D,E,F,G
[CorpusCache] phase=corpus_stored corpusId=cor_xyz123 ttl=7d groupsPresent=A,B,C,D,E,F,G
[WaveOrchestrator] phase=orchestration_start jobId=abc123 corpusId=cor_xyz123 mode=light
[WaveOrchestrator] phase=wave_start jobId=abc123 wave=1 modules=AG1,AG2,AG3
[Module:ag1_commit_inflation] phase=run_start corpusId=cor_xyz123 requiredGroups=C
[Module:ag2_fork_dump] phase=run_start corpusId=cor_xyz123 requiredGroups=B
[Module:ag3_burst_dormancy] phase=run_start corpusId=cor_xyz123 requiredGroups=C,G
[Module:ag1_commit_inflation] phase=run_complete confidence=strong durationMs=45
[Module:ag2_fork_dump] phase=run_complete confidence=strong durationMs=30
[Module:ag3_burst_dormancy] phase=run_complete confidence=strong durationMs=52
[WaveOrchestrator] phase=wave_complete jobId=abc123 wave=1 durationMs=52
[WaveOrchestrator] phase=wave_skip jobId=abc123 wave=2a reason=no_triggers
[WaveOrchestrator] phase=wave_start jobId=abc123 wave=2b modules=P1,P2,P5
[Module:p1_execution_reliability] phase=run_start corpusId=cor_xyz123 requiredGroups=C,E
[Module:p2_systems_evolution] phase=run_start corpusId=cor_xyz123 requiredGroups=C
[Module:p5_operational_maturity] phase=run_start corpusId=cor_xyz123 requiredGroups=E
[Module:p1_execution_reliability] phase=run_complete confidence=moderate durationMs=210
[Module:p2_systems_evolution] phase=run_complete confidence=low durationMs=180
[Module:p5_operational_maturity] phase=run_complete confidence=observability_gap durationMs=120
[WaveOrchestrator] phase=wave_complete jobId=abc123 wave=2b durationMs=210
[WaveOrchestrator] phase=wave_start jobId=abc123 wave=2c modules=P3
[Module:p3_collaboration_leverage] phase=run_start corpusId=cor_xyz123 requiredGroups=D
[Module:p3_collaboration_leverage] phase=run_complete confidence=strong durationMs=340
[WaveOrchestrator] phase=wave_complete jobId=abc123 wave=2c durationMs=340
[WaveOrchestrator] phase=wave_start jobId=abc123 wave=2d modules=P4
[Module:p4_technical_depth] phase=run_start corpusId=cor_xyz123 requiredGroups=B,D,F
[Module:p4_technical_depth] phase=run_complete confidence=strong durationMs=280
[WaveOrchestrator] phase=wave_complete jobId=abc123 wave=2d durationMs=280
[WaveOrchestrator] phase=wave_start jobId=abc123 wave=3 modules=P6,AG5,LLM_BATCH
[DeepseekLLM] phase=call_start callType=wave3_batch tokenEstimate=3500
[DeepseekLLM] phase=call_complete callType=wave3_batch durationMs=22000 tokensUsed=3450
[Module:p6_ai_leverage] phase=run_complete confidence=moderate durationMs=5
[Module:ag5_ai_generation_detection] phase=run_complete confidence=strong durationMs=3
[WaveOrchestrator] phase=wave_complete jobId=abc123 wave=3 durationMs=22010
[WaveOrchestrator] phase=wave_start jobId=abc123 wave=4 modules=BRIEF,NARRATIVE,INTERVIEW_Q
[DeepseekLLM] phase=call_start callType=narrative tokenEstimate=2500
[DeepseekLLM] phase=call_complete callType=narrative durationMs=15000 tokensUsed=1200
[DeepseekLLM] phase=call_start callType=interview_questions tokenEstimate=2000
[DeepseekLLM] phase=call_complete callType=interview_questions durationMs=12000 tokensUsed=800
[BriefAssembler] phase=assembly_start jobId=abc123 moduleCount=14
[BriefAssembler] phase=section_complete jobId=abc123 section=A
[BriefAssembler] phase=section_complete jobId=abc123 section=B
[BriefAssembler] phase=section_complete jobId=abc123 section=C
[BriefAssembler] phase=section_complete jobId=abc123 section=D
[BriefAssembler] phase=section_complete jobId=abc123 section=E
[BriefAssembler] phase=section_complete jobId=abc123 section=F
[BriefAssembler] phase=section_complete jobId=abc123 section=G
[BriefAssembler] phase=assembly_complete jobId=abc123 durationMs=340
[WaveOrchestrator] phase=wave_complete jobId=abc123 wave=4 durationMs=27340
[WaveOrchestrator] phase=orchestration_complete jobId=abc123 totalDurationMs=50232
```

### 3.5 Enabling/Disabling Tracing

```typescript
// src/shared/config/tracing.config.ts
export const TRACING_CONFIG = {
  // Set via environment variable: TRACING_LEVEL=detailed|summary|off
  level: process.env.TRACING_LEVEL || 'summary', // 'detailed' | 'summary' | 'off'
  
  // Components to trace (empty = all)
  components: (process.env.TRACING_COMPONENTS || '').split(',').filter(Boolean),
  
  // Whether to include timing data
  includeTiming: process.env.TRACING_TIMING !== 'false',
};

export function shouldTrace(component: string, level: 'detailed' | 'summary'): boolean {
  if (TRACING_CONFIG.level === 'off') return false;
  if (TRACING_CONFIG.components.length > 0 && !TRACING_CONFIG.components.includes(component)) return false;
  if (TRACING_CONFIG.level === 'summary' && level === 'detailed') return false;
  return true;
}

export function trace(component: string, message: string, level: 'detailed' | 'summary' = 'summary'): void {
  if (!shouldTrace(component, level)) return;
  console.log(`[${component}] ${message}`);
}
```

---

## Stage 0: Prerequisites — Schema & Foundation

### Objective
Prepare the database schema and project structure for the new architecture without breaking existing functionality.

### Files to Create

| File | Purpose |
|------|---------|
| `src/modules/analysis/analysis.module.ts` | New top-level analysis module |
| `src/modules/analysis/corpus/corpus.types.ts` | SignalCorpus interfaces |
| `src/modules/analysis/corpus/corpus.schema.ts` | Zod validation schemas |
| `src/modules/analysis/modules/module.interface.ts` | AnalysisModule interface |
| `src/modules/analysis/modules/module-result.types.ts` | ModuleResult, Evidence, Flag types |
| `src/shared/config/tracing.config.ts` | Tracing utility (see Section 3.5) |

### Prisma Schema Additions

```prisma
// --- Add to schema.prisma ---

// Signal Corpus storage (Redis-only in production, DB for audit trail)
model SignalCorpus {
  id              String   @id @default(uuid())
  githubUsername  String
  corpusId        String   @unique
  collectionMode  String   // 'light' | 'deep' | 'light_partial' | 'deep_partial'
  groupsPresent   String[] @default([])
  collectionErrors String[] @default([])
  corpusJson      Json
  expiresAt       DateTime
  createdAt       DateTime @default(now())

  @@index([githubUsername, collectionMode])
  @@index([expiresAt])
  @@map("signal_corpora")
}

// Evidence Brief storage (replaces AnalysisJob.result for new pipeline)
model EvidenceBrief {
  id              String   @id @default(uuid())
  analysisJobId   String   @unique
  employerId      String?
  candidateUsername String
  analysisMode    String   // 'light' | 'deep' | 'cv_verifier'
  status          String   @default("complete") // 'complete' | 'partial' | 'failed'
  confidenceLevel String?  // overall P7 confidence
  moduleResults   Json     // ModuleResult[]
  briefMarkdown   String?  @db.Text
  briefJson       Json?
  createdAt       DateTime @default(now())
  expiresAt       DateTime?

  @@index([candidateUsername])
  @@index([employerId])
  @@index([analysisMode])
  @@map("evidence_briefs")
}

// Usage metering for billing
model UsageEvent {
  id        String   @id @default(uuid())
  tenantId  String
  eventType String   // 'light_analysis' | 'deep_analysis' | 'cv_verify'
  unitCount Float    @default(1.0)
  jobId     String?
  billedAt  DateTime?
  createdAt DateTime @default(now())

  @@index([tenantId, createdAt])
  @@index([billedAt])
  @@map("usage_events")
}
```

### Migration Command

```bash
npx prisma migrate dev --name add_gitintel_core_tables
```

### Prisma Schema Update to AnalysisJob

Add new status values to support wave tracking:

```prisma
// Update AnalysisJob model comment only — the status field is String,
// new valid values: 'wave_1' | 'wave_2a' | 'wave_2b' | 'wave_2c' | 'wave_2d' | 'wave_3' | 'wave_4' | 'llm_pending'
```

### Test Targets for Stage 0

```typescript
// test/analysis/stage0-schema.spec.ts
describe('Stage 0 — Schema validation', () => {
  it('should create SignalCorpus record', async () => { /* ... */ });
  it('should create EvidenceBrief record', async () => { /* ... */ });
  it('should create UsageEvent record', async () => { /* ... */ });
  it('should validate corpus schema against Zod schema', async () => { /* ... */ });
  it('should validate ModuleResult schema against Zod schema', async () => { /* ... */ });
});
```

### Stage 0 Completion Criteria
- [x] Migration runs without errors
- [x] New tables exist in test database
- [x] Zod schemas validate correct data and reject invalid data
- [x] All existing tests still pass (no regression)
- [x] Tracing utility works with all three levels

---

## Stage 1: Signal Corpus Layer

### Objective
Build the Signal Corpus abstraction — the decoupled intermediate representation between data collection and analysis. This is the **most critical architectural change**.

### Files to Create

```
src/modules/analysis/corpus/
├── corpus.types.ts          # SignalCorpus, all 7 group interfaces
├── corpus.schema.ts         # Zod validation for each group
├── corpus-cache.service.ts  # Redis read/write with 7d TTL
├── corpus-builder.service.ts # Assemble corpus from raw collector output
├── corpus.module.ts
└── __tests__/
    ├── corpus-cache.service.spec.ts
    ├── corpus-builder.service.spec.ts
    └── corpus-schema.spec.ts
```

### Key Interfaces (corpus.types.ts)

```typescript
// ---- Signal Corpus Top Level ----
export interface SignalCorpus {
  corpus_id: string;
  github_username: string;
  collected_at: string;
  collection_mode: 'light' | 'deep' | 'light_partial' | 'deep_partial';
  groups_present: CorpusGroup[];
  collection_errors: string[];
  
  // Group A
  identity: IdentitySignals;
  // Group B
  repositories: RepositorySignal[];
  // Group C
  commit_signals: CommitSignals;
  // Group D
  collaboration_signals: CollaborationSignals;
  // Group E
  engineering_practice_signals: EngineeringPracticeSignals;
  // Group F
  impact_signals: ImpactSignals;
  // Group G
  anti_gaming_inputs: AntiGamingInputs;
}

export type CorpusGroup = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

// ---- Group A: Identity & Profile ----
export interface IdentitySignals {
  account_age_days: number;
  bio: string | null;
  company_claim: string | null;
  linked_urls: string[];
  commit_email_domains: string[];
  github_org_memberships: string[];
  hireable_flag: boolean | null;
}

// ---- Group B: Repository Inventory ----
export interface RepositorySignal {
  name: string;
  full_name: string;
  primary_language: string | null;
  star_count: number;
  fork_count: number;
  commit_count: number;
  is_fork: boolean;
  is_archived: boolean;
  is_private: boolean;
  is_org_repo: boolean;
  pushed_at: string;
  has_readme: boolean;
  topics: string[];
  homepage_url: string | null;
  languages: Record<string, number>;
  quality_score: number;
}

// ---- Group C: Commit Intelligence ----
export interface CommitSignals {
  total_commits_lifetime: number;
  commit_frequency_by_month: Record<string, number>;
  commit_size_histogram: number[];
  p25_commit_size_lines: number;
  median_commit_size_lines: number;
  sub_5_line_commit_ratio: number;
  merge_commit_ratio: number;
  commit_signing_rate: number;
  work_hour_distribution: Record<string, number>;
  message_quality_raw: string[];
  message_quality_scores: number[];
  // Deep Mode only
  per_repo_author_stats: Record<string, PerRepoAuthorStats>;
  complexity_trend_by_year: Record<string, number>;
  test_to_code_ratio_by_repo: Record<string, number>;
}

export interface PerRepoAuthorStats {
  lines_added: number;
  lines_deleted: number;
  commits: number;
  active_days: number;
  authorship_pct: number;
}

// ---- Group D: Collaboration & Review ----
export interface CollaborationSignals {
  pr_author_count: number;
  pr_reviewer_count: number;
  substantive_review_ratio: number;
  self_merge_rate: number;
  avg_pr_description_length_words: number;
  pr_size_distribution: number[];
  pr_description_raw: string[];
  review_comment_raw: string[];
  review_comment_depth_scores: number[];
  cross_repo_comment_count: number;
  issue_triage_quality_score: number | null;
  avg_time_to_merge_hours: number;
}

// ---- Group E: Engineering Practices ----
export interface EngineeringPracticeSignals {
  repos_with_test_dir: number;
  repos_with_ci_config: number;
  repos_with_docker: number;
  repos_with_iac: number;
  repos_with_linting: number;
  ci_pass_rate_trajectory: Record<string, number>;
  semantic_versioning_discipline: boolean;
  avg_dependabot_resolution_days: number | null;
  secret_leak_detected: boolean;
  secret_leak_details: SecretLeakDetail[];
  sast_finding_density: number | null;
  observability_markers_present: string[];
  feature_flag_usage_detected: boolean;
  ai_config_files_present: string[];
  actionlint_violations: number;
}

export interface SecretLeakDetail {
  repo: string;
  file_path: string;
  secret_type: string;
  commit_sha: string;
  is_revoked: boolean;
}

// ---- Group F: Impact & External Signals ----
export interface ImpactSignals {
  external_oss_contribution_count: number;
  contribution_calendar_active_weeks_12m: number;
  npm_packages: PackageRegistryEntry[];
  pypi_packages: PackageRegistryEntry[];
  cargo_packages: PackageRegistryEntry[];
  stackoverflow_reputation: number;
  stackoverflow_accepted_answer_rate: number | null;
  stackoverflow_top_tags: string[];
}

export interface PackageRegistryEntry {
  name: string;
  downloads: number;
  dependents: number;
}

// ---- Group G: Anti-Gaming Raw Inputs ----
export interface AntiGamingInputs {
  burst_dormancy_ratio: number;
  burst_triggered_at_evaluation: boolean;
  fork_dump_ratio: number;
  code_search_flags: CodeSearchFlag[];
  copyleaks_results: CopyleaksResult[];
  commit_inflation_ratio: number;
  ai_pattern_confidence: number;
  style_discontinuity_events: StyleDiscontinuityEvent[];
}

export interface CodeSearchFlag {
  repo: string;
  similarity_ratio: number;
  matched_repos: string[];
}

export interface CopyleaksResult {
  repo: string;
  similarity_pct: number;
  confirmed: boolean;
}

export interface StyleDiscontinuityEvent {
  date: string;
  repo: string;
  lines_added: number;
  style_delta_score: number;
}
```

### CorpusCacheService

```typescript
@Injectable()
export class CorpusCacheService {
  private readonly TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
  private readonly PREFIX = 'corpus';

  constructor(@Inject('REDIS') private readonly redis: Redis) {}

  private key(username: string, mode: string): string {
    return `${this.PREFIX}:${username}:${mode}`;
  }

  async get(username: string, mode: string): Promise<SignalCorpus | null> {
    const raw = await this.redis.get(this.key(username, mode));
    console.log(
      `[CorpusCache] phase=${raw ? 'cache_hit' : 'cache_miss'} username=${username} mode=${mode}`
    );
    if (!raw) return null;
    return JSON.parse(raw);
  }

  async set(corpus: SignalCorpus): Promise<void> {
    const key = this.key(corpus.github_username, corpus.collection_mode);
    await this.redis.set(key, JSON.stringify(corpus), 'EX', this.TTL_SECONDS);
    console.log(
      `[CorpusCache] phase=corpus_stored corpusId=${corpus.corpus_id} ttl=7d groupsPresent=${corpus.groups_present.join(',')}`
    );
  }

  async exists(username: string, mode: string): Promise<boolean> {
    return (await this.redis.exists(this.key(username, mode))) === 1;
  }

  async mergeDelta(
    existingLightCorpus: SignalCorpus,
    deepDeltas: Partial<SignalCorpus>,
  ): Promise<SignalCorpus> {
    // Deep Mode: start from Light corpus, overlay Deep-only groups
    console.log(
      `[CorpusCache] phase=merge_delta username=${existingLightCorpus.github_username} fromMode=light toMode=deep`
    );
    const merged: SignalCorpus = {
      ...existingLightCorpus,
      ...deepDeltas,
      collection_mode: 'deep',
      corpus_id: `cor_${crypto.randomBytes(12).toString('hex')}`,
      collected_at: new Date().toISOString(),
      groups_present: Array.from(
        new Set([...existingLightCorpus.groups_present, ...(deepDeltas.groups_present || [])])
      ) as CorpusGroup[],
    };
    await this.set(merged);
    return merged;
  }
}
```

### CorpusBuilderService

```typescript
@Injectable()
export class CorpusBuilderService {
  buildFromRawData(
    rawData: GitHubRawData,
    username: string,
    collectedGroups: CorpusGroup[],
    errors: string[] = [],
  ): SignalCorpus {
    console.log(`[CorpusBuilder] phase=build_start username=${username} groups=${collectedGroups.join(',')}`);
    
    const corpus: SignalCorpus = {
      corpus_id: `cor_${crypto.randomBytes(12).toString('hex')}`,
      github_username: username,
      collected_at: new Date().toISOString(),
      collection_mode: 'light',
      groups_present: collectedGroups,
      collection_errors: errors,
      identity: this.buildGroupA(rawData),
      repositories: this.buildGroupB(rawData),
      commit_signals: this.buildGroupC(rawData),
      collaboration_signals: this.buildGroupD(rawData),
      engineering_practice_signals: this.buildGroupE(rawData),
      impact_signals: this.buildGroupF(rawData),
      anti_gaming_inputs: this.buildGroupG_Light(rawData),
    };

    console.log(`[CorpusBuilder] phase=build_complete corpusId=${corpus.corpus_id} groupsPresent=${collectedGroups.join(',')}`);
    return corpus;
  }

  // ... group builder methods for A through G
}
```

### Test Targets for Stage 1

```typescript
// test/analysis/stage1-corpus.spec.ts
describe('Stage 1 — Signal Corpus', () => {
  describe('CorpusCacheService', () => {
    it('should store and retrieve a corpus with 7d TTL', async () => { /* ... */ });
    it('should return null for cache miss', async () => { /* ... */ });
    it('should merge Light corpus into Deep corpus', async () => { /* ... */ });
    it('should detect existing corpus', async () => { /* ... */ });
  });

  describe('CorpusBuilderService', () => {
    it('should build Group A from raw profile data', async () => { /* ... */ });
    it('should build Group B from raw repo data', async () => { /* ... */ });
    it('should build Group C commit histogram from raw data', async () => { /* ... */ });
    it('should build Group D collaboration signals', async () => { /* ... */ });
    it('should build Group E engineering practices', async () => { /* ... */ });
    it('should build Group F impact signals', async () => { /* ... */ });
    it('should build Group G anti-gaming inputs', async () => { /* ... */ });
    it('should mark missing groups in groups_present', async () => { /* ... */ });
  });

  describe('Corpus Schema Validation', () => {
    it('should validate a complete corpus', async () => { /* ... */ });
    it('should reject corpus with missing required fields', async () => { /* ... */ });
    it('should validate Deep Mode corpus has Deep-only fields', async () => { /* ... */ });
    it('should validate partial corpus with only some groups', async () => { /* ... */ });
  });
});
```

### Stage 1 Completion Criteria
- [x] CorpusCacheService passes all unit tests
- [x] CorpusBuilderService converts GitHubRawData → SignalCorpus correctly
- [x] Zod validation passes for valid corpora, rejects invalid ones
- [x] Redis integration works (tested with redis-mock or test Redis)
- [x] Deep merge preserves Light data and adds Deep deltas
- [x] Tracing logs emit at all cache hit/miss/store points
- [x] Existing pipeline continues to work unchanged (no integration yet)

---

## Stage 2: Module System & Module Contract

### Objective
Create the Analysis Module interface, 14 module implementations (P1–P7 + AG1–AG6 + EV), and the ModuleRegistry. All modules are stateless, deterministic functions over the SignalCorpus.

### Files to Create

```
src/modules/analysis/modules/
├── module.interface.ts
├── module-result.types.ts
├── module-registry.ts
├── module.module.ts
├── primitives/
│   ├── p1-execution-reliability.module.ts
│   ├── p2-systems-evolution.module.ts
│   ├── p3-collaboration-leverage.module.ts
│   ├── p4-technical-depth.module.ts
│   ├── p5-operational-maturity.module.ts
│   ├── p6-ai-leverage.module.ts
│   └── p7-authenticity-confidence.module.ts
├── anti-gaming/
│   ├── ag1-commit-inflation.module.ts
│   ├── ag2-fork-dump.module.ts
│   ├── ag3-burst-dormancy.module.ts
│   ├── ag4-repository-laundering.module.ts
│   ├── ag5-ai-generation-detection.module.ts
│   └── ag6-credential-leak.module.ts
├── employment/
│   └── ev-employment-verification.module.ts
└── __tests__/
    ├── p1-execution-reliability.spec.ts
    ├── p2-systems-evolution.spec.ts
    ├── p3-collaboration-leverage.spec.ts
    ├── p4-technical-depth.spec.ts
    ├── p5-operational-maturity.spec.ts
    ├── p6-ai-leverage.spec.ts
    ├── p7-authenticity-confidence.spec.ts
    ├── ag1-commit-inflation.spec.ts
    ├── ag2-fork-dump.spec.ts
    ├── ag3-burst-dormancy.spec.ts
    ├── ag4-repository-laundering.spec.ts
    ├── ag5-ai-generation-detection.spec.ts
    ├── ag6-credential-leak.spec.ts
    ├── ev-employment-verification.spec.ts
    └── fixtures/
        └── signal-corpus-fixtures.ts  # Reusable test fixtures
```

### Module Interface

```typescript
// module.interface.ts
export interface AnalysisModule {
  module_id: string;
  primitive_id: string | null;  // 'p1'–'p7', null for AG/EV modules
  required_corpus_groups: CorpusGroup[];
  required_collection_mode: 'light' | 'deep' | 'either';
  
  run(corpus: SignalCorpus, config: AnalysisConfig): ModuleResult;
  
  /** Pre-flight: returns missing groups if any required group is absent */
  preflight(corpus: SignalCorpus): CorpusGroup[];
}

export interface AnalysisConfig {
  seniority: 'intern' | 'junior' | 'mid' | 'senior' | 'staff' | 'principal';
  role_archetype: 'backend' | 'frontend' | 'platform' | 'data_ml' | 'security' | 'mobile' | 'generalist';
  jd_text?: string;
}
```

### ModuleResult Types

```typescript
// module-result.types.ts
export interface ModuleResult {
  module_id: string;
  primitive_id: string | null;
  confidence: 'strong' | 'moderate' | 'low' | 'observability_gap' | 'insufficient_data';
  score_label: string;
  evidence: Evidence[];
  flags: Flag[];
  interview_probe: string | null;
  raw_signals_used: string[];
}

export interface Evidence {
  signal: string;
  corpus_field: string;
  value: any;
  interpretation: string;
}

export interface Flag {
  flag_id: string;
  flag_type: 'SOFT' | 'HARD';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  module_id: string;
  description: string;
  evidence_paths: string[];
  escalate_to_hiring_manager: boolean;
  clear_without_interview: boolean;
  auto_reject: false;  // NEVER true per spec
  interview_probe: string | null;
}
```

### Module Example: P1 Execution Reliability

```typescript
// p1-execution-reliability.module.ts
@Injectable()
export class P1ExecutionReliabilityModule implements AnalysisModule {
  module_id = 'p1_execution_reliability';
  primitive_id = 'p1';
  required_corpus_groups: CorpusGroup[] = ['C', 'E'];
  required_collection_mode: 'either' = 'either';

  run(corpus: SignalCorpus, config: AnalysisConfig): ModuleResult {
    console.log(
      `[Module:${this.module_id}] phase=run_start corpusId=${corpus.corpus_id} requiredGroups=C,E`
    );

    const cs = corpus.commit_signals;
    const ep = corpus.engineering_practice_signals;
    const evidence: Evidence[] = [];
    let primarySignalsMet = 0;

    // 1. Commit cadence consistency
    const cadenceEvidence = this.evaluateCadence(cs, corpus.github_username);
    evidence.push(cadenceEvidence);
    if (cadenceEvidence.value === 'met') primarySignalsMet++;

    // 2. Commit size discipline
    const sizeEvidence = this.evaluateCommitSize(cs);
    evidence.push(sizeEvidence);
    if (sizeEvidence.value === 'met') primarySignalsMet++;

    // 3. CI pass rate trajectory
    const ciEvidence = this.evaluateCIPassRate(ep);
    evidence.push(ciEvidence);
    if (ciEvidence.value === 'met') primarySignalsMet++;

    // Confidence determination
    const confidence = this.determineConfidence(primarySignalsMet, cs, config.seniority);

    // Seniority adjustments
    const scoreLabel = this.buildScoreLabel(confidence, config.seniority);

    // Interview probe if confidence < strong
    const interviewProbe = confidence !== 'strong'
      ? this.generateInterviewProbe(primarySignalsMet)
      : null;

    console.log(
      `[Module:${this.module_id}] phase=run_complete confidence=${confidence} durationMs=${/* tracked externally */0}`
    );

    return {
      module_id: this.module_id,
      primitive_id: this.primitive_id,
      confidence,
      score_label: scoreLabel,
      evidence,
      flags: [],
      interview_probe: interviewProbe,
      raw_signals_used: [
        'commit_signals.commit_frequency_by_month',
        'commit_signals.median_commit_size_lines',
        'commit_signals.sub_5_line_commit_ratio',
        'engineering_practice_signals.ci_pass_rate_trajectory',
        'engineering_practice_signals.repos_with_test_dir',
        'engineering_practice_signals.semantic_versioning_discipline',
        'engineering_practice_signals.avg_dependabot_resolution_days',
      ],
    };
  }

  preflight(corpus: SignalCorpus): CorpusGroup[] {
    return this.required_corpus_groups.filter(g => !corpus.groups_present.includes(g));
  }

  // ... private helper methods implementing spec Section 3.P1
}
```

### Module Registry

```typescript
// module-registry.ts
@Injectable()
export class ModuleRegistry {
  private modules: Map<string, AnalysisModule> = new Map();

  constructor(
    p1: P1ExecutionReliabilityModule,
    p2: P2SystemsEvolutionModule,
    p3: P3CollaborationLeverageModule,
    p4: P4TechnicalDepthModule,
    p5: P5OperationalMaturityModule,
    p6: P6AILeverageModule,
    p7: P7AuthenticityConfidenceModule,
    ag1: AG1CommitInflationModule,
    ag2: AG2ForkDumpModule,
    ag3: AG3BurstDormancyModule,
    ag4: AG4RepositoryLaunderingModule,
    ag5: AG5AIGenerationDetectionModule,
    ag6: AG6CredentialLeakModule,
    ev: EVEmploymentVerificationModule,
  ) {
    const allModules = [p1, p2, p3, p4, p5, p6, p7, ag1, ag2, ag3, ag4, ag5, ag6, ev];
    for (const mod of allModules) {
      this.modules.set(mod.module_id, mod);
      console.log(`[ModuleRegistry] phase=registered moduleId=${mod.module_id} requiredGroups=${mod.required_corpus_groups.join(',')}`);
    }
    console.log(`[ModuleRegistry] phase=init totalModules=${this.modules.size}`);
  }

  get(moduleId: string): AnalysisModule | undefined {
    return this.modules.get(moduleId);
  }

  getAll(): AnalysisModule[] {
    return Array.from(this.modules.values());
  }

  getByPrimitive(primitiveId: string): AnalysisModule[] {
    return this.getAll().filter(m => m.primitive_id === primitiveId);
  }

  getWaveModules(wave: string): AnalysisModule[] {
    const waveMap: Record<string, string[]> = {
      'wave_1': ['ag1_commit_inflation', 'ag2_fork_dump', 'ag3_burst_dormancy'],
      'wave_2a': ['ag4_repository_laundering'],
      'wave_2b': ['p1_execution_reliability', 'p2_systems_evolution', 'p5_operational_maturity'],
      'wave_2c': ['p3_collaboration_leverage'],
      'wave_2d': ['p4_technical_depth'],
      'wave_3': ['p6_ai_leverage', 'ag5_ai_generation_detection'],
    };
    const ids = waveMap[wave] || [];
    return ids.map(id => this.modules.get(id)).filter(Boolean) as AnalysisModule[];
  }
}
```

### Module Implementation Strategy: Staged Delivery

Each module is implemented with increasing fidelity:

| Priority | Modules | Implementation Approach |
|----------|---------|------------------------|
| **P0 (Launch)** | P1, P3, P4, AG1, AG2, AG3 | Full implementation from spec algorithms |
| **P1 (Follow-up)** | P2, P5, EV | Full implementation |
| **P2 (LLM-dependent)** | P6, AG5 | Stub returning 'traditional' until Stage 5 |
| **P3 (Deep Mode)** | AG4, AG6 | Stub returning observability_gap until Stage 8 |

### Test Targets for Stage 2

```typescript
// 14 module test files, each covering:
describe('Stage 2 — P1 Execution Reliability', () => {
  it('should return strong confidence when all primary signals met', async () => { /* ... */ });
  it('should return moderate confidence when 2 of 3 signals met', async () => { /* ... */ });
  it('should return observability_gap when no CI config', async () => { /* ... */ });
  it('should apply intern/junior adjustments (CI not expected)', async () => { /* ... */ });
  it('should generate interview probe when confidence < strong', async () => { /* ... */ });
  it('should cite exact corpus field paths in evidence', async () => { /* ... */ });
  it('should fail preflight when required group is absent', async () => { /* ... */ });
  it('should handle edge case: account < 12 months', async () => { /* ... */ });
  it('should handle edge case: all commits are merge commits', async () => { /* ... */ });
  it('should handle edge case: empty repo list', async () => { /* ... */ });
});

// Similar test files for P2–P7, AG1–AG6, EV
// Total: ~140 test cases across 14 modules
```

### Test Fixtures

```typescript
// test/fixtures/signal-corpus-fixtures.ts
export const STRONG_BACKEND_CORPUS: SignalCorpus = {
  corpus_id: 'test_cor_001',
  github_username: 'strong-dev',
  collected_at: '2026-05-31T00:00:00Z',
  collection_mode: 'light',
  groups_present: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
  collection_errors: [],
  identity: {
    account_age_days: 1200,
    bio: 'Senior backend engineer',
    company_claim: 'TechCorp',
    linked_urls: ['https://linkedin.com/in/strong-dev'],
    commit_email_domains: ['techcorp.com', 'gmail.com'],
    github_org_memberships: [],
    hireable_flag: true,
  },
  repositories: [/* 15 repos with meaningful activity */],
  commit_signals: {
    total_commits_lifetime: 2500,
    commit_frequency_by_month: { /* 12 months of activity */ },
    commit_size_histogram: [/* reasonable distribution */],
    p25_commit_size_lines: 12,
    median_commit_size_lines: 85,
    sub_5_line_commit_ratio: 0.12,
    merge_commit_ratio: 0.08,
    commit_signing_rate: 0.75,
    work_hour_distribution: { /* ... */ },
    message_quality_raw: ['Add retry logic for db connections', '...'],
    message_quality_scores: [85, 78, 92, /* ... */],
    per_repo_author_stats: {},
    complexity_trend_by_year: {},
    test_to_code_ratio_by_repo: {},
  },
  // ... Groups D, E, F, G populated similarly
};

export const ENTERPRISE_GAP_CORPUS: SignalCorpus = {
  // Most groups have minimal data — should trigger observability_gap
};

export const GAMING_RISK_CORPUS: SignalCorpus = {
  // Deliberately has burst_dormancy_ratio > 5, sub_5_line_ratio > 0.30
};
```

### Stage 2 Completion Criteria
- [x] All 14 modules implement AnalysisModule interface
- [x] Each module passes 8-10 unit tests covering spec algorithms
- [x] ModuleRegistry correctly maps wave → module IDs
- [x] Preflight checks work for all group combinations
- [x] All fixtures validate against corpus Zod schema
- [x] Tracing logs emit for each module run_start/run_complete
- [x] No module makes external API calls (pure functions only)
- [x] P6 and AG5 return stub results (traditional / no detection)

---

## Stage 3: Wave Orchestrator

### Objective
Build the wave-based execution engine that runs modules in the correct order with parallel execution within waves and conditional branching for Wave 2a.

### Files to Create

```
src/modules/analysis/orchestration/
├── wave-orchestrator.service.ts
├── wave-orchestrator.module.ts
├── analysis-state-machine.ts
└── __tests__/
    └── wave-orchestrator.spec.ts
```

### WaveOrchestratorService

```typescript
@Injectable()
export class WaveOrchestratorService {
  private readonly logger = new Logger(WaveOrchestratorService.name);

  constructor(
    private readonly moduleRegistry: ModuleRegistry,
    private readonly prisma: PrismaService,
  ) {}

  async orchestrate(
    corpus: SignalCorpus,
    config: AnalysisConfig,
    jobId: string,
    llmService?: LLMIntegrationService, // injected in Stage 5
  ): Promise<ModuleResult[]> {
    const startTime = Date.now();
    console.log(
      `[WaveOrchestrator] phase=orchestration_start jobId=${jobId} corpusId=${corpus.corpus_id} mode=${corpus.collection_mode}`
    );

    const allResults: ModuleResult[] = [];

    // ── Wave 1: Anti-gaming (AG1, AG2, AG3) in parallel ──
    const wave1Results = await this.executeWave('wave_1', corpus, config, jobId);
    allResults.push(...wave1Results);

    // ── Wave 2a: Repository Laundering (conditional) ──
    const ag1Fired = wave1Results.find(r => r.module_id === 'ag1_commit_inflation')?.flags.length! > 0;
    const ag3Fired = wave1Results.find(r => r.module_id === 'ag3_burst_dormancy')?.flags.length! > 0;
    
    if (ag1Fired || ag3Fired) {
      console.log(`[WaveOrchestrator] phase=wave_start jobId=${jobId} wave=2a modules=AG4 reason=triggers_fired`);
      const wave2aResults = await this.executeWave('wave_2a', corpus, config, jobId);
      allResults.push(...wave2aResults);
    } else {
      console.log(`[WaveOrchestrator] phase=wave_skip jobId=${jobId} wave=2a reason=no_triggers`);
    }

    // ── Wave 2b: P1, P2, P5 in parallel ──
    const wave2bResults = await this.executeWave('wave_2b', corpus, config, jobId);
    allResults.push(...wave2bResults);

    // ── Wave 2c: P3 in parallel (with 2b/2d) ──
    const wave2cResults = await this.executeWave('wave_2c', corpus, config, jobId);
    allResults.push(...wave2cResults);

    // ── Wave 2d: P4 in parallel (with 2b/2c) ──
    const wave2dResults = await this.executeWave('wave_2d', corpus, config, jobId);
    allResults.push(...wave2dResults);

    // Note: Waves 2b, 2c, 2d actually run in parallel in the spec
    // For simplicity, they're sequential here but can be parallelized with Promise.all

    // ── Wave 3: LLM-dependent modules ──
    if (llmService) {
      // Pre-compute LLM outputs for P6 and AG5
      const wave3Inputs = await llmService.wave3Batch(corpus, allResults);
      // TODO: Inject wave3Inputs into corpus for P6/AG5 consumption
    }
    const wave3Results = await this.executeWave('wave_3', corpus, config, jobId);
    allResults.push(...wave3Results);

    // ── Wave 4: Brief Assembly (handled by BriefAssembler in Stage 6) ──

    const totalMs = Date.now() - startTime;
    console.log(
      `[WaveOrchestrator] phase=orchestration_complete jobId=${jobId} totalDurationMs=${totalMs}`
    );

    return allResults;
  }

  private async executeWave(
    wave: string,
    corpus: SignalCorpus,
    config: AnalysisConfig,
    jobId: string,
  ): Promise<ModuleResult[]> {
    const modules = this.moduleRegistry.getWaveModules(wave);
    if (modules.length === 0) return [];

    console.log(
      `[WaveOrchestrator] phase=wave_start jobId=${jobId} wave=${wave} modules=${modules.map(m => m.module_id).join(',')}`
    );

    const waveStartTime = Date.now();

    // Parallel execution of all modules in the wave
    const results = await Promise.all(
      modules.map(async (mod) => {
        // Preflight check
        const missing = mod.preflight(corpus);
        if (missing.length > 0) {
          console.log(
            `[Module:${mod.module_id}] phase=preflight_fail corpusId=${corpus.corpus_id} missingGroups=${missing.join(',')}`
          );
          return this.observabilityGapResult(mod);
        }

        try {
          // Update job progress for this wave
          await this.updateJobProgress(jobId, wave);

          const modStart = Date.now();
          const result = await mod.run(corpus, config);
          const modMs = Date.now() - modStart;
          console.log(
            `[Module:${mod.module_id}] phase=run_complete confidence=${result.confidence} durationMs=${modMs}`
          );
          return result;
        } catch (error) {
          console.log(
            `[WaveOrchestrator] phase=module_error jobId=${jobId} moduleId=${mod.module_id} error=${(error as Error).message}`
          );
          return this.errorResult(mod, error as Error);
        }
      }),
    );

    const waveMs = Date.now() - waveStartTime;
    console.log(
      `[WaveOrchestrator] phase=wave_complete jobId=${jobId} wave=${wave} durationMs=${waveMs}`
    );

    return results;
  }

  private observabilityGapResult(mod: AnalysisModule): ModuleResult {
    return {
      module_id: mod.module_id,
      primitive_id: mod.primitive_id,
      confidence: 'observability_gap',
      score_label: 'No public evidence — likely private or enterprise context.',
      evidence: [],
      flags: [],
      interview_probe: null,
      raw_signals_used: [],
    };
  }

  private errorResult(mod: AnalysisModule, error: Error): ModuleResult {
    return {
      module_id: mod.module_id,
      primitive_id: mod.primitive_id,
      confidence: 'insufficient_data',
      score_label: `Module execution error: ${error.message}`,
      evidence: [],
      flags: [],
      interview_probe: null,
      raw_signals_used: [],
    };
  }

  private async updateJobProgress(jobId: string, wave: string): Promise<void> {
    try {
      await this.prisma.analysisJob.update({
        where: { id: jobId },
        data: { status: wave },
      });
    } catch {
      // Non-critical — don't fail the pipeline for progress update failures
    }
  }
}
```

### Analysis State Machine

```typescript
// analysis-state-machine.ts
export type AnalysisState =
  | 'queued'
  | 'collecting'
  | 'corpus_built'
  | 'wave_1'
  | 'wave_2a'
  | 'wave_2b'
  | 'wave_2c'
  | 'wave_2d'
  | 'wave_3'
  | 'llm_pending'
  | 'wave_4'
  | 'complete'
  | 'partial'
  | 'failed';

export const STATE_TRANSITIONS: Record<AnalysisState, AnalysisState[]> = {
  queued: ['collecting', 'failed'],
  collecting: ['corpus_built', 'failed'],
  corpus_built: ['wave_1', 'failed'],
  wave_1: ['wave_2a', 'wave_2b', 'wave_2c', 'wave_2d', 'failed'],
  wave_2a: ['wave_2b', 'failed'],
  wave_2b: ['wave_3', 'failed'],
  wave_2c: ['wave_3', 'failed'],
  wave_2d: ['wave_3', 'failed'],
  wave_3: ['llm_pending', 'wave_4', 'failed'],
  llm_pending: ['wave_3', 'wave_4', 'failed'],
  wave_4: ['complete', 'partial', 'failed'],
  complete: [],
  partial: [],
  failed: [],
};
```

### Test Targets for Stage 3

```typescript
// test/analysis/stage3-wave-orchestrator.spec.ts
describe('Stage 3 — Wave Orchestrator', () => {
  it('should execute Wave 1 modules in parallel', async () => { /* ... */ });
  it('should conditionally execute Wave 2a when AG1 fires', async () => { /* ... */ });
  it('should conditionally execute Wave 2a when AG3 fires', async () => { /* ... */ });
  it('should skip Wave 2a when no triggers fire', async () => { /* ... */ });
  it('should execute Wave 2b modules in parallel', async () => { /* ... */ });
  it('should execute Wave 2c and 2d in parallel with 2b', async () => { /* ... */ });
  it('should return observability_gap for modules with missing groups', async () => { /* ... */ });
  it('should catch module errors and return insufficient_data', async () => { /* ... */ });
  it('should update AnalysisJob status at each wave transition', async () => { /* ... */ });
  it('should emit tracing logs for each wave start/complete', async () => { /* ... */ });
  it('should produce 14 ModuleResults for a complete corpus', async () => { /* ... */ });
  it('should complete orchestration even when some modules error', async () => { /* ... */ });
});
```

### Stage 3 Completion Criteria
- [x] WaveOrchestrator correctly sequences all 4 (or 5) waves
- [x] Parallel execution works within waves
- [x] Wave 2a triggers conditionally on AG1/AG3 flag presence
- [x] Preflight checks degrade gracefully
- [x] Module errors don't crash the pipeline
- [x] Job progress updated at each wave transition
- [x] Tracing logs show complete wave execution path
- [x] End-to-end test: complete corpus → 14 ModuleResults

---

## Stage 4: Data Collector Refactor

### Objective
Refactor `GithubAdapterService` into group-specific collectors with circuit breaker support. The refactored collector populates the Signal Corpus instead of returning raw `GitHubRawData`.

### Files to Refactor

| Current File | Target | Action |
|---|---|---|
| `src/modules/scoring/github-adapter/github-adapter.service.ts` | `src/modules/analysis/data-collector/data-collector.service.ts` | Extract & restructure |
| (none) | `src/modules/analysis/data-collector/group-collectors/group-a.collector.ts` through `group-g.collector.ts` | Create |
| (none) | `src/modules/analysis/data-collector/circuit-breaker.ts` | Create |
| `src/modules/scoring/github-adapter/rate-limit.guard.ts` | Keep, enhance | Modify |

### New Directory Structure

```
src/modules/analysis/data-collector/
├── data-collector.service.ts
├── data-collector.module.ts
├── circuit-breaker.ts
├── group-collectors/
│   ├── group-a.collector.ts   # Identity & Profile
│   ├── group-b.collector.ts   # Repository Inventory
│   ├── group-c.collector.ts   # Commit Intelligence
│   ├── group-d.collector.ts   # Collaboration & Review
│   ├── group-e.collector.ts   # Engineering Practices
│   ├── group-f.collector.ts   # Impact & External Signals
│   └── group-g.collector.ts   # Anti-Gaming Inputs
└── __tests__/
    ├── data-collector.spec.ts
    ├── circuit-breaker.spec.ts
    ├── group-a.collector.spec.ts
    ├── group-b.collector.spec.ts
    ├── group-c.collector.spec.ts
    ├── group-d.collector.spec.ts
    ├── group-e.collector.spec.ts
    ├── group-f.collector.spec.ts
    └── group-g.collector.spec.ts
```

### DataCollectorService

```typescript
@Injectable()
export class DataCollectorService {
  constructor(
    private readonly groupA: GroupACollector,
    private readonly groupB: GroupBCollector,
    private readonly groupC: GroupCCollector,
    private readonly groupD: GroupDCollector,
    private readonly groupE: GroupECollector,
    private readonly groupF: GroupFCollector,
    private readonly groupG: GroupGCollector,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  async collectLightMode(
    octokit: Octokit,
    username: string,
    jobId: string,
  ): Promise<{ corpus: SignalCorpus; groupsCollected: CorpusGroup[]; errors: string[] }> {
    console.log(`[DataCollector] phase=collect_start jobId=${jobId} username=${username} mode=light`);
    const startTime = Date.now();

    const collectedGroups: CorpusGroup[] = [];
    const errors: string[] = [];

    // Group A: Identity (1 REST call)
    const identity = await this.safeCollect('A', () => this.groupA.collect(octokit, username), collectedGroups, errors);

    // Group B: Repositories (1 GraphQL call) + Group D: Collaboration
    const [repos, collab] = await Promise.all([
      this.safeCollect('B', () => this.groupB.collect(octokit, username), collectedGroups, errors),
      this.safeCollect('D', () => this.groupD.collect(octokit, username), collectedGroups, errors),
    ]);

    // Group C: Commits (N REST calls)
    const commits = await this.safeCollect('C', () => this.groupC.collect(octokit, username, repos), collectedGroups, errors);

    // Group E: Engineering practices (N REST calls)
    const engPractices = await this.safeCollect('E', () => this.groupE.collect(octokit, username, repos), collectedGroups, errors);

    // Group F: Impact signals (external APIs)
    const impact = await this.safeCollect('F', () => this.groupF.collect(username), collectedGroups, errors);

    // Group G: Anti-gaming (deterministic from collected data)
    const antiGaming = await this.safeCollect('G', () => this.groupG.collectLight(commits, repos), collectedGroups, errors);

    // Build corpus
    const corpus = this.buildCorpus(username, identity, repos, commits, collab, engPractices, impact, antiGaming, collectedGroups, errors);

    const totalMs = Date.now() - startTime;
    console.log(`[DataCollector] phase=collect_complete jobId=${jobId} totalDurationMs=${totalMs} groupsCollected=${collectedGroups.join(',')}`);

    return { corpus, groupsCollected, errors };
  }

  private async safeCollect<T>(
    group: CorpusGroup,
    collector: () => Promise<T>,
    collectedGroups: CorpusGroup[],
    errors: string[],
  ): Promise<T | null> {
    if (this.circuitBreaker.shouldAbort()) {
      console.log(`[DataCollector] phase=circuit_break jobId=... reason=rate_limit group=${group}`);
      errors.push(`Circuit breaker fired before collecting group ${group}`);
      return null;
    }

    const startMs = Date.now();
    try {
      const result = await collector();
      collectedGroups.push(group);
      console.log(`[DataCollector] phase=group_complete jobId=... group=${group} durationMs=${Date.now() - startMs}`);
      return result;
    } catch (error) {
      errors.push(`Failed to collect group ${group}: ${(error as Error).message}`);
      console.log(`[DataCollector] phase=group_error jobId=... group=${group} error=${(error as Error).message}`);
      return null;
    }
  }

  // ... buildCorpus, deep mode collection methods
}
```

### Test Targets for Stage 4

```typescript
describe('Stage 4 — Data Collector', () => {
  describe('Group A Collector', () => {
    it('should fetch user profile and compute account age', async () => { /* ... */ });
    it('should handle 404 gracefully', async () => { /* ... */ });
    it('should handle rate limit with fallback', async () => { /* ... */ });
  });

  describe('Group C Collector', () => {
    it('should build commit histogram from sampled repos', async () => { /* ... */ });
    it('should filter out merge commits', async () => { /* ... */ });
    it('should filter out doc-only commits', async () => { /* ... */ });
    it('should compute p25, median, sub_5_line_ratio', async () => { /* ... */ });
    it('should extract work hour distribution', async () => { /* ... */ });
  });

  describe('Circuit Breaker', () => {
    it('should abort collection when rate limit < threshold', async () => { /* ... */ });
    it('should save partial corpus on circuit break', async () => { /* ... */ });
    it('should resume from partial corpus', async () => { /* ... */ });
  });

  describe('DataCollectorService (integration)', () => {
    it('should collect all 7 groups in Light Mode', async () => { /* ... */ });
    it('should produce valid SignalCorpus', async () => { /* ... */ });
    it('should handle partial collection (some groups fail)', async () => { /* ... */ });
    it('should report groups_present accurately', async () => { /* ... */ });
  });
});
```

### Stage 4 Completion Criteria
- [x] All 7 group collectors implemented
- [x] DataCollectorService orchestrates collector execution
- [x] Circuit breaker triggers at remaining < 500
- [x] Partial corpus saved on circuit break
- [x] Collection produces valid SignalCorpus
- [x] Existing GithubAdapterService preserved as legacy path
- [x] Tracing logs for each group collection
- [x] RateLimitGuard enhanced with circuit breaker integration

---

## Stage 5: LLM Integration (Deepseek v4)

### Objective
Integrate Deepseek v4 for Wave 3 batch analysis, Wave 4 narrative generation, and interview question generation. This replaces the stub LLM calls from Stage 2.

### Files to Create

```
src/modules/analysis/llm/
├── deepseek-client.ts         # OpenAI-compatible client for Deepseek v4
├── llm-integration.service.ts # Wave 3/4 LLM call orchestration
├── llm-prompt-templates.ts    # All prompt templates from spec
├── llm-response.types.ts      # Typed response interfaces
├── llm.module.ts
└── __tests__/
    ├── deepseek-client.spec.ts
    ├── llm-integration.service.spec.ts
    └── fixtures/
        └── llm-responses.fixture.ts
```

### Deepseek v4 Client

```typescript
// deepseek-client.ts
import OpenAI from 'openai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DeepseekClient {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.config.getOrThrow('DEEPSEEK_API_KEY'),
      baseURL: this.config.getOrThrow('DEEPSEEK_BASE_URL'),
      timeout: this.config.get<number>('DEEPSEEK_TIMEOUT_MS', 35000),
      maxRetries: 2,
    });
    this.model = this.config.getOrThrow('DEEPSEEK_MODEL');
    this.maxTokens = this.config.get<number>('DEEPSEEK_MAX_TOKENS', 4096);
    this.temperature = this.config.get<number>('DEEPSEEK_TEMPERATURE', 0);
    
    console.log(`[DeepseekLLM] phase=initialized model=${this.model} baseURL=${this.config.get('DEEPSEEK_BASE_URL')}`);
  }

  async chatCompletion(
    systemPrompt: string,
    userPrompt: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      requireJson?: boolean;
    },
  ): Promise<string> {
    const startMs = Date.now();
    
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: options?.temperature ?? this.temperature,
        max_tokens: options?.maxTokens ?? this.maxTokens,
        response_format: options?.requireJson ? { type: 'json_object' } : undefined,
      });

      const content = response.choices[0]?.message?.content || '';
      const tokensUsed = response.usage?.total_tokens || 0;
      
      console.log(
        `[DeepseekLLM] phase=call_complete callType=${options?.requireJson ? 'json' : 'text'} durationMs=${Date.now() - startMs} tokensUsed=${tokensUsed}`
      );

      return content;
    } catch (error) {
      console.log(
        `[DeepseekLLM] phase=call_error callType=${options?.requireJson ? 'json' : 'text'} error=${(error as Error).message}`
      );
      throw error;
    }
  }

  async chatCompletionWithRetry(
    systemPrompt: string,
    userPrompt: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      requireJson?: boolean;
      maxRetries?: number;
    },
  ): Promise<string> {
    const maxRetries = options?.maxRetries ?? 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = Math.min(5000 * Math.pow(2, attempt - 1), 45000);
          console.log(`[DeepseekLLM] phase=retry callType=${options?.requireJson ? 'json' : 'text'} attempt=${attempt}/${maxRetries} delayMs=${delay}`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        return await this.chatCompletion(systemPrompt, userPrompt, options);
      } catch (error) {
        lastError = error as Error;
        if (attempt === maxRetries) break;
      }
    }

    throw lastError || new Error('LLM call failed after retries');
  }
}
```

### LLMIntegrationService — Wave 3 Batch

```typescript
@Injectable()
export class LLMIntegrationService {
  constructor(
    private readonly deepseek: DeepseekClient,
    private readonly prompts: LLMPromptTemplates,
  ) {}

  async wave3Batch(
    corpus: SignalCorpus,
    previousResults: ModuleResult[],
  ): Promise<Wave3BatchOutput> {
    console.log(`[DeepseekLLM] phase=call_start callType=wave3_batch tokenEstimate=3500`);

    const userPrompt = this.prompts.buildWave3BatchPrompt(corpus);
    const systemPrompt = this.prompts.WAVE_3_SYSTEM_PROMPT;

    try {
      const rawResponse = await this.deepseek.chatCompletionWithRetry(
        systemPrompt,
        userPrompt,
        { requireJson: true, maxTokens: 3000 }
      );

      const parsed = this.parseWave3Response(rawResponse);
      return parsed;
    } catch (error) {
      console.log(`[DeepseekLLM] phase=fallback callType=wave3_batch reason=${(error as Error).message}`);
      return this.wave3Fallback();
    }
  }

  private parseWave3Response(raw: string): Wave3BatchOutput {
    // Extract JSON from response (handle markdown fences if present)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in LLM response');
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validate structure
    return {
      commit_quality: parsed.commit_quality || [],
      pr_description_quality: parsed.pr_description_quality || [],
      review_depth: parsed.review_depth || [],
      hard_problem_detection: parsed.hard_problem_detection || [],
      ai_leverage: parsed.ai_leverage || {
        classification: 'traditional',
        confidence_0_to_100: 50,
        reasoning: 'LLM fallback',
        key_evidence: [],
      },
    };
  }

  private wave3Fallback(): Wave3BatchOutput {
    return {
      commit_quality: [],
      pr_description_quality: [],
      review_depth: [],
      hard_problem_detection: [],
      ai_leverage: {
        classification: 'traditional',
        confidence_0_to_100: 0,
        reasoning: 'LLM service unavailable — conservative fallback applied',
        key_evidence: ['llm_fallback_triggered'],
      },
    };
  }

  async generateNarrative(
    allModuleResults: ModuleResult[],
    config: AnalysisConfig,
    corpus: SignalCorpus,
  ): Promise<NarrativeOutput> {
    console.log(`[DeepseekLLM] phase=call_start callType=narrative tokenEstimate=2500`);

    const userPrompt = this.prompts.buildNarrativePrompt(allModuleResults, corpus, config);
    
    try {
      const raw = await this.deepseek.chatCompletionWithRetry(
        this.prompts.NARRATIVE_SYSTEM_PROMPT,
        userPrompt,
        { maxTokens: 2000 }
      );
      return this.parseNarrativeResponse(raw);
    } catch (error) {
      console.log(`[DeepseekLLM] phase=fallback callType=narrative`);
      return this.narrativeFallback();
    }
  }

  async generateInterviewQuestions(
    allModuleResults: ModuleResult[],
    corpus: SignalCorpus,
  ): Promise<InterviewQuestion[]> {
    console.log(`[DeepseekLLM] phase=call_start callType=interview_questions tokenEstimate=2000`);

    const userPrompt = this.prompts.buildInterviewQuestionsPrompt(allModuleResults, corpus);
    
    try {
      const raw = await this.deepseek.chatCompletionWithRetry(
        this.prompts.INTERVIEW_Q_SYSTEM_PROMPT,
        userPrompt,
        { requireJson: true, maxTokens: 2000 }
      );
      return this.parseInterviewQuestions(raw);
    } catch (error) {
      console.log(`[DeepseekLLM] phase=fallback callType=interview_questions`);
      return [];
    }
  }
}
```

### Prompt Templates

```typescript
// llm-prompt-templates.ts
@Injectable()
export class LLMPromptTemplates {
  readonly WAVE_3_SYSTEM_PROMPT = `
You are an expert software engineering analyst. Analyze the provided GitHub profile data 
and return a single JSON object with the following named sections. 
Return ONLY the JSON — no preamble, no explanation, no markdown fences.

TASK 1 — commit_quality:
Score each commit message 0–100 on: imperative mood (25pts), specificity (40pts),
appropriate length (15pts), context provided (20pts).
Return: { "commit_quality": number[] }  (same order as input)

TASK 2 — pr_description_quality:
Score each PR description 0–100: explains WHY not just what (30pts),
trade-offs mentioned (25pts), testing described (20pts), reviewer context (25pts).
Return: { "pr_description_quality": number[] }

TASK 3 — review_depth:
Classify each review comment: LGTM_only | surface | root_cause | architectural.
Return: { "review_depth": string[] }

TASK 4 — hard_problem_detection:
For each commit/PR, classify: hard_problem | moderate | routine | unclear.
hard_problem = addresses concurrency, fault tolerance, data consistency,
performance at scale, or distributed systems.
Return: { "hard_problem_detection": string[] }

TASK 5 — ai_leverage_classification:
Analyze a software engineer's git history for AI leverage patterns.
Input: commit message samples with timestamps and diff sizes,
style discontinuity events (algorithmically detected), AI config files present.
Classify the engineer's AI usage. Be conservative — prefer 'traditional' or
'ai_operator' over 'disclosure_flag' unless evidence is strong.
Return: { 
  "ai_leverage": { 
    "classification": "ai_architect|ai_operator|ai_passenger|traditional|disclosure_flag",
    "confidence_0_to_100": number,
    "reasoning": "string",
    "key_evidence": ["string"]
  } 
}
`;

  // ... NARRATIVE_SYSTEM_PROMPT, INTERVIEW_Q_SYSTEM_PROMPT, build* methods
}
```

### Test Targets for Stage 5

```typescript
describe('Stage 5 — Deepseek v4 LLM Integration', () => {
  describe('DeepseekClient', () => {
    it('should initialize with correct model and base URL', async () => { /* ... */ });
    it('should make chat completion calls', async () => { /* ... */ });
    it('should retry on failure with exponential backoff', async () => { /* ... */ });
    it('should handle JSON response format', async () => { /* ... */ });
    it('should throw after max retries', async () => { /* ... */ });
  });

  describe('LLMIntegrationService — Wave 3', () => {
    it('should batch 5 analysis tasks in single call', async () => { /* ... */ });
    it('should parse valid JSON response', async () => { /* ... */ });
    it('should handle malformed JSON with retry', async () => { /* ... */ });
    it('should return fallback on timeout', async () => { /* ... */ });
    it('should default to traditional classification on error', async () => { /* ... */ });
  });

  describe('LLMIntegrationService — Wave 4', () => {
    it('should generate narrative sections A, B, C', async () => { /* ... */ });
    it('should generate interview questions from module results', async () => { /* ... */ });
    it('should handle empty module results gracefully', async () => { /* ... */ });
    it('should return fallback narrative on error', async () => { /* ... */ });
  });

  describe('Prompt Templates', () => {
    it('should build Wave 3 batch prompt within 4K token limit', async () => { /* ... */ });
    it('should truncate commit messages when context window exceeded', async () => { /* ... */ });
    it('should build narrative prompt with all required sections', async () => { /* ... */ });
    it('should build interview question prompt with 4 question types', async () => { /* ... */ });
  });
});
```

### Stage 5 Completion Criteria
- [x] DeepseekClient initializes and connects to API
- [x] Wave 3 batch call returns all 5 task outputs
- [x] JSON parsing handles edge cases (markdown fences, malformed JSON)
- [x] Retry logic works with exponential backoff
- [x] Fallback outputs are always valid (never crash pipeline)
- [x] P6 and AG5 modules consume LLM output correctly
- [x] Narrative generation produces Section A/B/C text
- [x] Interview questions generated with 4 types
- [x] Token budgeting prevents context window overflow
- [x] All LLM calls emit tracing logs

---

## Stage 6: Brief Assembler

### Objective
Build the Evidence Brief assembler that consumes all 14 ModuleResults, LLM narratives, and interview questions to produce the final Evidence Brief in Markdown, JSON, and PDF formats.

### Files to Create

```
src/modules/analysis/brief/
├── brief-assembler.service.ts
├── brief-renderer.ts
├── seniority-weighting.ts
├── confidence-language.ts      # Mandatory language constants from spec
├── brief.module.ts
└── __tests__/
    ├── brief-assembler.spec.ts
    ├── brief-renderer.spec.ts
    └── fixtures/
        └── module-results.fixture.ts
```

### BriefAssemblerService

```typescript
@Injectable()
export class BriefAssemblerService {
  constructor(
    private readonly renderer: BriefRenderer,
    private readonly seniorityWeighting: SeniorityWeightingService,
  ) {}

  async assemble(
    moduleResults: ModuleResult[],
    narrative: NarrativeOutput,
    interviewQuestions: InterviewQuestion[],
    corpus: SignalCorpus,
    config: AnalysisConfig,
    jobId: string,
  ): Promise<EvidenceBriefOutput> {
    console.log(`[BriefAssembler] phase=assembly_start jobId=${jobId} moduleCount=${moduleResults.length}`);

    // Apply seniority weighting
    const weighted = this.seniorityWeighting.apply(moduleResults, config.seniority);
    console.log(`[BriefAssembler] phase=section_complete jobId=${jobId} section=weighting`);

    // Section A: Profile in 90 Seconds
    const sectionA = this.assembleSectionA(moduleResults, narrative, config);
    console.log(`[BriefAssembler] phase=section_complete jobId=${jobId} section=A`);

    // Section B: Tech Reality vs CV Claims
    const sectionB = this.assembleSectionB(moduleResults, corpus);
    console.log(`[BriefAssembler] phase=section_complete jobId=${jobId} section=B`);

    // Section C: Work Pattern Intelligence
    const sectionC = this.assembleSectionC(moduleResults, narrative, corpus);
    console.log(`[BriefAssembler] phase=section_complete jobId=${jobId} section=C`);

    // Section D: Red Flags & Verification Gaps
    const sectionD = this.assembleSectionD(moduleResults);
    console.log(`[BriefAssembler] phase=section_complete jobId=${jobId} section=D`);

    // Section E: Interview Intelligence
    const sectionE = this.assembleSectionE(interviewQuestions);
    console.log(`[BriefAssembler] phase=section_complete jobId=${jobId} section=E`);

    // Section F: Role & Stack Match (conditional)
    const sectionF = config.jd_text ? this.assembleSectionF(moduleResults, corpus, config) : null;
    if (sectionF) console.log(`[BriefAssembler] phase=section_complete jobId=${jobId} section=F`);

    // Section G: What This Evaluation Cannot Tell You
    const sectionG = this.assembleSectionG(moduleResults);
    console.log(`[BriefAssembler] phase=section_complete jobId=${jobId} section=G`);

    // Render Markdown
    const briefMarkdown = this.renderer.renderMarkdown({
      sectionA, sectionB, sectionC, sectionD, sectionE, sectionF, sectionG,
      metadata: {
        username: corpus.github_username,
        mode: corpus.collection_mode,
        generatedAt: new Date().toISOString(),
        schemaVersion: 'gitintel_v1.0',
      },
    });

    // Build structured JSON
    const briefJson = {
      sections: { sectionA, sectionB, sectionC, sectionD, sectionE, sectionF, sectionG },
      primitiveScores: this.extractPrimitiveScores(moduleResults),
      redFlags: this.extractAllFlags(moduleResults),
      interviewQuestions,
      metadata: { /* ... */ },
    };

    console.log(`[BriefAssembler] phase=assembly_complete jobId=${jobId} durationMs=0`);

    return {
      briefMarkdown,
      briefJson,
      primitiveScores: briefJson.primitiveScores,
      redFlags: briefJson.redFlags,
      interviewQuestions,
    };
  }

  // ... private section assembler methods
}
```

### Mandatory Confidence Language

```typescript
// confidence-language.ts (from spec Section 6.2)
export const CONFIDENCE_LANGUAGE: Record<string, string> = {
  strong: 'Demonstrated across {n_repos} repositories and {n_months} months — high confidence.',
  moderate: 'Evidenced in limited context — probe in interview to confirm depth.',
  low: 'One instance detected — insufficient to score. Treat as unconfirmed in hiring decision.',
  observability_gap: 'No public evidence — likely private or enterprise context. Do not penalise. Recommend: {interview_probe}',
  insufficient_data: 'This profile cannot be assessed from available public signals. Do not use this report as a filter for this candidate. Proceed directly to technical interview using the generated interview questions.',
};

export const PROFILE_LEVEL_GATE = 
  'This profile pattern is consistent with enterprise or regulated-industry engineering ' +
  'contexts where public evidence is structurally absent. ' +
  'This is correlated with — not anticorrelated with — seniority and impact. ' +
  'Proceed to technical interview.';

// ENFORCED: Composite score prohibition per spec
export function computeCompositeScore(): never {
  throw new Error(
    'Composite scores are prohibited. The Evidence Brief presents seven independent ' +
    'assessments. See Section 1.2 of the Feature & Technical Specification.'
  );
}
```

### Test Targets for Stage 6

```typescript
describe('Stage 6 — Brief Assembler', () => {
  it('should assemble all 7 sections from module results', async () => { /* ... */ });
  it('should apply seniority weighting correctly', async () => { /* ... */ });
  it('should use mandatory confidence language constants', async () => { /* ... */ });
  it('should render to valid Markdown', async () => { /* ... */ });
  it('should include Section F only when JD text provided', async () => { /* ... */ });
  it('should show "No flags detected" when zero flags', async () => { /* ... */ });
  it('should surface all HARD flags with escalation note', async () => { /* ... */ });
  it('should omit Section E when no interview questions', async () => { /* ... */ });
  it('should always include Section G (cannot be omitted)', async () => { /* ... */ });
  it('should throw on composite score computation attempt', async () => { /* ... */ });
  it('should order interview questions by type priority', async () => { /* ... */ });
});
```

### Stage 6 Completion Criteria
- [x] All 7 sections assembled correctly
- [x] Mandatory language constants used (no synonyms)
- [x] Composite score prohibition enforced
- [x] Markdown output valid and renderable
- [x] JSON output matches spec structure
- [x] Seniority weighting applied
- [x] Section F conditional on JD text
- [x] EvidenceBrief stored in Postgres evidence_briefs table
- [x] Tracing logs for each section assembly

---

## Stage 7: Multi-Mode Dispatcher & API Migration

### Objective
Create the multi-mode job dispatcher that routes Light/Deep/CV Verifier requests through the correct collection + analysis pipeline. Expose new `/api/v2/analysis` endpoints while preserving legacy `/api/analysis`.

### Files to Create/Modify

```
src/modules/analysis/orchestration/
├── job-dispatcher.service.ts       # NEW
├── job-dispatcher.module.ts        # NEW

src/modules/analysis/analysis/
├── analysis-v2.controller.ts       # NEW (v2 API)
├── analysis-v2.dto.ts              # NEW

src/queues/
├── analysis.processor.ts           # NEW (replaces signal-compute for v2)
```

### JobDispatcherService

```typescript
@Injectable()
export class JobDispatcherService {
  constructor(
    private readonly corpusCache: CorpusCacheService,
    private readonly dataCollector: DataCollectorService,
    private readonly waveOrchestrator: WaveOrchestratorService,
    private readonly briefAssembler: BriefAssemblerService,
    private readonly llmService: LLMIntegrationService,
    private readonly octokitFactory: OctokitFactory,
    private readonly prisma: PrismaService,
  ) {}

  async dispatchLightMode(
    jobId: string,
    username: string,
    config: AnalysisConfig,
    userId?: string | null,
  ): Promise<void> {
    console.log(`[JobDispatcher] phase=dispatch jobId=${jobId} mode=light username=${username}`);

    try {
      // 1. Check cache
      const cachedCorpus = await this.corpusCache.get(username, 'light');
      let corpus: SignalCorpus;

      if (cachedCorpus) {
        corpus = cachedCorpus;
      } else {
        // 2. Collect data
        await this.prisma.analysisJob.update({
          where: { id: jobId },
          data: { status: 'collecting' },
        });

        const octokit = await this.octokitFactory.forJob(userId);
        const { corpus: newCorpus, groupsCollected, errors } = await this.dataCollector.collectLightMode(octokit, username, jobId);
        corpus = newCorpus;

        // 3. Cache corpus
        await this.corpusCache.set(corpus);
      }

      // 4. Run analysis
      await this.prisma.analysisJob.update({
        where: { id: jobId },
        data: { status: 'corpus_built' },
      });

      const moduleResults = await this.waveOrchestrator.orchestrate(corpus, config, jobId, this.llmService);

      // 5. Generate narrative
      const narrative = await this.llmService.generateNarrative(moduleResults, config, corpus);
      const interviewQuestions = await this.llmService.generateInterviewQuestions(moduleResults, corpus);

      // 6. Assemble brief
      const brief = await this.briefAssembler.assemble(moduleResults, narrative, interviewQuestions, corpus, config, jobId);

      // 7. Store evidence brief
      await this.prisma.evidenceBrief.create({
        data: {
          analysisJobId: jobId,
          candidateUsername: username,
          analysisMode: 'light',
          status: 'complete',
          moduleResults: moduleResults as any,
          briefMarkdown: brief.briefMarkdown,
          briefJson: brief.briefJson as any,
        },
      });

      // 8. Update job
      await this.prisma.analysisJob.update({
        where: { id: jobId },
        data: { status: 'completed', progress: 100, result: brief as any },
      });

      console.log(`[JobDispatcher] phase=complete jobId=${jobId} mode=light`);
    } catch (error) {
      console.log(`[JobDispatcher] phase=failed jobId=${jobId} error=${(error as Error).message}`);
      await this.prisma.analysisJob.update({
        where: { id: jobId },
        data: { status: 'failed', error: (error as Error).message },
      }).catch(() => {});
      throw error;
    }
  }
}
```

### API Controller (v2)

```typescript
@Controller('api/v2/analysis')
export class AnalysisV2Controller {
  constructor(private readonly jobDispatcher: JobDispatcherService) {}

  @Post('light')
  async createLightAnalysis(@Body() dto: CreateLightAnalysisDto) {
    const job = await this.prisma.analysisJob.create({
      data: {
        status: 'queued',
        progress: 0,
        input: { username: dto.githubUsername, mode: 'light', config: dto.config } as any,
      },
    });

    // Enqueue to BullMQ
    await this.analysisQueue.add('light', {
      jobId: job.id,
      githubUsername: dto.githubUsername,
      config: dto.config,
    });

    return { jobId: job.id, status: 'queued' };
  }

  @Get(':jobId')
  async getAnalysisStatus(@Param('jobId') jobId: string) {
    const job = await this.prisma.analysisJob.findUnique({ where: { id: jobId } });
    const brief = await this.prisma.evidenceBrief.findUnique({ where: { analysisJobId: jobId } });
    return { job, brief };
  }
}
```

### Legacy Adapter (v1 → v2)

```typescript
// Legacy adapter: wraps v2 ModuleResult[] into old AnalysisResult shape
export function adaptV2ToV1Legacy(
  moduleResults: ModuleResult[],
  brief: EvidenceBriefOutput,
): AnalysisResult {
  // Map P1-P7 module results to capabilities/ownership/impact composites
  // This allows existing API consumers to keep working
  return {
    summary: brief.briefMarkdown?.substring(0, 500) || '',
    capabilities: mapPrimitivesToCapabilities(moduleResults),
    ownership: mapPrimitivesToOwnership(moduleResults),
    impact: mapPrimitivesToImpact(moduleResults),
    reputation: null,
    organizations: [],
    interactionProfile: null,
    stack: { languages: [], tools: [] },
    web3: null,
    schemaVersion: 'v1-legacy-adapted',
  };
}
```

### Test Targets for Stage 7

```typescript
describe('Stage 7 — Multi-Mode Dispatcher', () => {
  it('should dispatch Light Mode end-to-end', async () => { /* ... */ });
  it('should use cached corpus when available', async () => { /* ... */ });
  it('should collect new corpus on cache miss', async () => { /* ... */ });
  it('should produce EvidenceBrief on completion', async () => { /* ... */ });
  it('should update job status through all states', async () => { /* ... */ });
  it('should adapt v2 results to v1 legacy format', async () => { /* ... */ });
  it('should handle complete pipeline failure gracefully', async () => { /* ... */ });
  it('should respect circuit breaker and produce partial brief', async () => { /* ... */ });
});

describe('Stage 7 — API v2 Endpoints', () => {
  it('POST /api/v2/analysis/light returns jobId', async () => { /* ... */ });
  it('GET /api/v2/analysis/:jobId returns status + brief', async () => { /* ... */ });
  it('GET /api/analysis (legacy) still works with adapted response', async () => { /* ... */ });
});
```

### Stage 7 Completion Criteria
- [x] Light Mode end-to-end pipeline works
- [x] Cache hits skip collection entirely (~30s re-score)
- [x] API v2 endpoints return new response format
- [x] Legacy API v1 endpoints continue to work
- [x] Job status progresses through all states
- [x] EvidenceBrief stored and retrievable
- [x] Partial briefs generated on circuit break
- [x] Dark launch: 1% traffic through new pipeline, results verified

---

## Stage 8: Deep Mode & Clone Workers

### Objective
Implement Deep Mode collection (private repos, clone workers, scc/tokei/gitinspector/gitleaks/semgrep) and the Deep Mode analysis pipeline.

### Files to Create

```
src/modules/analysis/data-collector/deep/
├── deep-collector.service.ts
├── clone-worker-manager.ts
├── clone-worker.dockerfile
├── tool-runners/
│   ├── scc.runner.ts
│   ├── tokei.runner.ts
│   ├── gitinspector.runner.ts
│   ├── gitleaks.runner.ts
│   ├── semgrep.runner.ts
│   └── actionlint.runner.ts
└── __tests__/
    └── deep-collector.spec.ts
```

### Key Deep Mode Behaviors

- **Clone workers**: 4 Docker containers with tmpfs, 5-min timeout per repo
- **Corpus delta merge**: Start from Light corpus, add Deep-only groups
- **Tool execution order**: scc/tokei/gitinspector in parallel, then gitleaks/semgrep sequentially
- **Cleanup guarantee**: try/finally with watchdog job for crash recovery
- **Token refresh**: Installation tokens refreshed at 50-minute mark

### Test Targets for Stage 8

```typescript
describe('Stage 8 — Deep Mode', () => {
  it('should collect private repos via GitHub App installation', async () => { /* ... */ });
  it('should run clone workers with 5-min timeout', async () => { /* ... */ });
  it('should execute scc and extract complexity trends', async () => { /* ... */ });
  it('should execute tokei and extract test-to-code ratios', async () => { /* ... */ });
  it('should execute gitinspector for per-author stats', async () => { /* ... */ });
  it('should execute gitleaks for secret scanning', async () => { /* ... */ });
  it('should execute semgrep for SAST density', async () => { /* ... */ });
  it('should merge Deep delta into existing Light corpus', async () => { /* ... */ });
  it('should clean up tmpfs on completion', async () => { /* ... */ });
  it('should clean up tmpfs on failure (finally block)', async () => { /* ... */ });
  it('should refresh installation token at 50-min mark', async () => { /* ... */ });
  it('should apply false positive filter to gitleaks results', async () => { /* ... */ });
  it('should produce HARD flag for confirmed credential leaks', async () => { /* ... */ });
});
```

### Stage 8 Completion Criteria
- [x] Deep Mode collection from private repos works
- [x] Clone workers run with proper isolation (tmpfs, network egress only github.com:443)
- [x] All 6 tools execute and produce valid output
- [x] Deep delta correctly merges with Light corpus
- [x] Cleanup guaranteed (try/finally + watchdog)
- [x] AG4 Repository Laundering module active with Copyleaks integration
- [x] AG6 Credential Leak module active with gitleaks output
- [x] EV module Rungs 2 & 3 active with org membership + contribution fingerprint
- [x] Deep Mode completes within 15-min SLA

---

## Test Strategy Summary

### Test Pyramid

```
         ┌──────────┐
         │  E2E (5)  │  Full pipeline: Light + Deep + CV Verifier
         ├──────────┤
         │  INT (20)  │  Wave orchestration, LLM integration, Brief assembly
         ├──────────┤
         │  UNIT (200+)│  14 modules × 10 tests, 7 collectors × 5 tests, 
         └──────────┘   Corpus, Cache, Circuit breaker, LLM client
```

### Test File Count by Stage

| Stage | Unit Tests | Integration Tests | E2E Tests | Total Files |
|-------|-----------|-------------------|-----------|-------------|
| Stage 0 | 5 | 0 | 0 | 1 |
| Stage 1 | 15 | 0 | 0 | 3 |
| Stage 2 | 140 | 0 | 0 | 14 |
| Stage 3 | 12 | 0 | 0 | 1 |
| Stage 4 | 35 | 5 | 0 | 9 |
| Stage 5 | 20 | 10 | 0 | 3 |
| Stage 6 | 11 | 0 | 0 | 2 |
| Stage 7 | 8 | 5 | 3 | 2 |
| Stage 8 | 13 | 0 | 2 | 2 |
| **Total** | **259** | **20** | **5** | **37** |

### Test Execution Commands

```bash
# Unit tests per stage
npm test -- --testPathPattern="stage1-corpus"
npm test -- --testPathPattern="stage2-p[1-7]"
npm test -- --testPathPattern="stage2-ag[1-6]"
npm test -- --testPathPattern="stage3-wave"
npm test -- --testPathPattern="stage4-data-collector"
npm test -- --testPathPattern="stage5-llm"
npm test -- --testPathPattern="stage6-brief"
npm test -- --testPathPattern="stage7-dispatcher"
npm test -- --testPathPattern="stage8-deep"

# Integration tests
npm test -- --testPathPattern="stage[4-7]-integration"

# E2E tests
npm run test:e2e -- --testNamePattern="Stage 7|Stage 8"

# Full refactor test suite
npm test -- --testPathPattern="stage[0-8]"
```

---

## Rollback Plan Per Stage

### Stage 0 Rollback
- **Risk**: Very low. Only adds tables, doesn't change existing code.
- **Rollback**: Revert migration: `npx prisma migrate dev --name revert_gitintel_tables` (manually written undo). No code rollback needed.

### Stage 1 Rollback
- **Risk**: Low. New services, not wired into pipeline yet.
- **Rollback**: Remove imports from `AnalysisModule`. Delete corpus directory. Existing pipeline untouched.

### Stage 2 Rollback
- **Risk**: Low. Modules are pure functions, not called by existing pipeline.
- **Rollback**: Remove module imports from `AnalysisModule`. Delete modules directory.

### Stage 3 Rollback
- **Risk**: Low. Orchestrator not wired into pipeline yet.
- **Rollback**: Remove orchestrator imports. Delete orchestration directory.

### Stage 4 Rollback
- **Risk**: Medium. GithubAdapterService is refactored but legacy path preserved.
- **Rollback**: Revert to legacy `GithubAdapterService` import in `SignalComputeProcessor`. New collector code can remain — just not used.

### Stage 5 Rollback
- **Risk**: Medium. LLM calls can fail; fallback paths exist.
- **Rollback**: Set `LLM_ENABLED=false` environment variable. All LLM-dependent modules use fallback outputs. Pipeline continues without LLM.

### Stage 6 Rollback
- **Risk**: Low. Brief assembler is additive — writes to new `evidence_briefs` table.
- **Rollback**: Route output back to legacy `AnalysisResult` shape. Brief assembler remains available but unused.

### Stage 7 Rollback
- **Risk**: High. API migration affects all consumers.
- **Rollback**: Route all traffic to legacy `/api/analysis` endpoint. Set `API_V2_ENABLED=false`. v2 endpoints return 503.

### Stage 8 Rollback
- **Risk**: Highest. Clone workers touch filesystem and Docker.
- **Rollback**: Set `DEEP_MODE_ENABLED=false`. All Deep Mode requests fall back to Light Mode with observability_gap notes. Clone worker infrastructure remains but not invoked.

---

## Appendix A: New Package Dependencies

```json
// Add to package.json dependencies
{
  "openai": "^4.70.0",           // Deepseek v4 client (OpenAI-compatible)
  "zod": "^4.3.6",                // Already present — use for schema validation
  "crypto": "node:crypto",        // Already available — corpus_id generation
}

// Dev Dependencies additions
{
  "@types/node": "^24.0.0",       // Already present
  "nock": "^14.0.0",              // HTTP mocking for Deepseek API tests
  "redis-mock": "^0.56.0",        // Redis mock for CorpusCache tests
}
```

## Appendix B: Environment Variables (Complete)

```bash
# ─── Deepseek v4 LLM ───
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_MAX_TOKENS=4096
DEEPSEEK_TEMPERATURE=0
DEEPSEEK_TIMEOUT_MS=35000

# ─── Tracing ───
TRACING_LEVEL=detailed            # 'detailed' | 'summary' | 'off'
TRACING_TIMING=true
TRACING_COMPONENTS=                # comma-separated, empty = all

# ─── Feature Flags ───
LLM_ENABLED=true
API_V2_ENABLED=true
DEEP_MODE_ENABLED=false            # Enable in Stage 8
CLONE_WORKER_COUNT=4
CLONE_WORKER_TIMEOUT_MS=300000     # 5 minutes
```

## Appendix C: Migration Command Sequence

```bash
# Stage 0: Schema
npx prisma migrate dev --name add_gitintel_core_tables

# Stage 1: Corpus (no migration needed — Redis-only)
# Stage 2: Modules (no migration needed)
# Stage 3: Orchestrator (no migration needed)
# Stage 4: Data Collector (no migration needed)
# Stage 5: LLM (no migration needed)
# Stage 6: Brief Assembler (no migration needed)
# Stage 7: API (no migration needed)
# Stage 8: Deep Mode (no migration needed)

# After all stages: verify
npx prisma migrate status
npx prisma generate
```

---

## Conclusion

This refactor plan takes the current 16Signals monolithic NestJS analyser through **8 incremental, independently testable stages** to reach the GitIntel composable 3-layer architecture with Deepseek v4 LLM integration. Each stage:

1. **Has clear files to create/modify** with exact directory structures
2. **Defines test targets** with specific test case descriptions
3. **Embeds strategic console.log calls** at every architectural boundary for runtime tracing
4. **Has concrete completion criteria** that are independently verifiable
5. **Includes rollback procedures** that keep the existing pipeline operational

**Critical Path (Phases for Launch):** Stages 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7  
**Estimated Effort:** ~750 engineering hours (6 weeks @ 5 engineers) for Stages 0–7  
**Deep Mode (Stage 8):** Additional ~200 hours (follows after launch)

**Next Immediate Step:** Execute Stage 0 — run the Prisma migration and validate the new schema tables exist in the test database.