# GitIntel — Light Mode & Deep Mode User Flows

## Complete Pipeline Tracing for Both Modes

---

## Light Mode — End-to-End Trace

```
POST /api/v2/analysis/light { githubUsername: "torvalds", config: { seniority: "senior", role_archetype: "backend" } }
```

### Phase 1: Request & Dispatch
```
[AnalysisV2Controller] phase=light_request jobId=light_a1b2c3 username=torvalds seniority=senior
[JobDispatcher]     phase=dispatch jobId=light_a1b2c3 mode=light username=torvalds
```

### Phase 2a: Corpus Acquisition — Cache Hit (fast path, ~30s saved)
```
[JobDispatcher]     phase=corpus_acquisition jobId=light_a1b2c3 username=torvalds
[CorpusCache]       phase=cache_hit username=torvalds mode=light key=corpus:torvalds:light
[JobDispatcher]     phase=corpus_cache_hit jobId=light_a1b2c3 corpusId=cor_xxx groups=A,B,C,D,E,F,G
```

### Phase 2b: Corpus Acquisition — Cache Miss (full collection, ~30s)
```
[JobDispatcher]     phase=corpus_cache_miss jobId=light_a1b2c3 username=torvalds
[DataCollector]     phase=collect_start jobId=light_a1b2c3 username=torvalds mode=light
[DataCollector]     phase=group_complete group=A durationMs=320
[DataCollector]     phase=group_complete group=B durationMs=1450
[DataCollector]     phase=group_complete group=D durationMs=1800
[DataCollector]     phase=group_complete group=F durationMs=800
  ← Phase 1: A, B, D, F in parallel (independent groups)
[DataCollector]     phase=group_complete group=C durationMs=2800
[DataCollector]     phase=group_complete group=E durationMs=2200
  ← Phase 2: C, E in parallel (depend on B's repo list)
[DataCollector]     phase=group_complete group=G durationMs=150
  ← Phase 3: G is computational (depends on B + C)
[DataCollector]     phase=collect_complete totalDurationMs=9520 groupsCollected=A,B,C,D,E,F,G
[CorpusCache]       phase=corpus_stored key=corpus:torvalds:light ttl=7d groupsPresent=A,B,C,D,E,F,G
```

### Phase 3: Wave Orchestration (~50ms sync execution)
```
[JobDispatcher]     phase=wave_orchestration jobId=light_a1b2c3 corpusId=cor_xxx groups=A,B,C,D,E,F,G
[WaveOrchestrator]  phase=orchestration_start jobId=light_a1b2c3 corpusId=cor_xxx mode=light

  Wave 1 — Anti-gaming (AG1, AG2, AG3) in parallel
[WaveOrchestrator]  phase=wave_start jobId=light_a1b2c3 wave=1 modules=ag1,ag2,ag3
[Module:ag1]        phase=run_complete confidence=strong flags=0
[Module:ag2]        phase=run_complete confidence=strong flags=0
[Module:ag3]        phase=run_complete confidence=strong flags=0
[WaveOrchestrator]  phase=wave_complete jobId=light_a1b2c3 wave=1 durationMs=52

  Wave 2a — Repository Laundering (conditional — skipped if no AG1/AG3 flags)
[WaveOrchestrator]  phase=wave_skip jobId=light_a1b2c3 wave=2a reason=no_triggers

  Waves 2b, 2c, 2d — Primitives in parallel
[WaveOrchestrator]  phase=wave_start jobId=light_a1b2c3 wave=2b modules=p1,p2,p5
[WaveOrchestrator]  phase=wave_start jobId=light_a1b2c3 wave=2c modules=p3
[WaveOrchestrator]  phase=wave_start jobId=light_a1b2c3 wave=2d modules=p4
  (All 3 waves execute concurrently since they have no inter-dependencies)
[Module:p1]         phase=run_complete confidence=strong
[Module:p2]         phase=run_complete confidence=moderate
[Module:p5]         phase=run_complete confidence=observability_gap
[Module:p3]         phase=run_complete confidence=strong
[Module:p4]         phase=run_complete confidence=strong

  Wave 3 — LLM-dependent modules (P6, AG5)
[Module:p6]         phase=run_complete confidence=observability_gap classification=traditional
[Module:ag5]        phase=run_complete confidence=observability_gap

[WaveOrchestrator]  phase=orchestration_complete totalDurationMs=340
[JobDispatcher]     phase=orchestration_done jobId=light_a1b2c3 moduleCount=14 strong=8 moderate=3 low=0 obsGap=3
```

### Phase 4: LLM Processing (~35s for 3 calls)
```
[JobDispatcher]     phase=llm_batch jobId=light_a1b2c3
[DeepseekLLM]       phase=call_start callType=wave3_batch tokenEstimate=3500
[DeepseekLLM]       phase=call_complete callType=wave3_batch durationMs=22000 tokensUsed=3450
[JobDispatcher]     phase=llm_wave3_done jobId=light_a1b2c3 aiClassification=traditional

[DeepseekLLM]       phase=call_start callType=narrative tokenEstimate=2500
[DeepseekLLM]       phase=call_complete callType=narrative durationMs=15000 tokensUsed=1200
[JobDispatcher]     phase=narrative_done jobId=light_a1b2c3 sectionALength=420

[DeepseekLLM]       phase=call_start callType=interview_questions tokenEstimate=2000
[DeepseekLLM]       phase=call_complete callType=interview_questions durationMs=12000 tokensUsed=800
[JobDispatcher]     phase=interview_questions_done jobId=light_a1b2c3 count=4
```

### Phase 5: Brief Assembly (~5ms)
```
[JobDispatcher]     phase=brief_assembly jobId=light_a1b2c3
[BriefAssembler]    phase=assembly_start jobId=light_a1b2c3 moduleCount=14
[BriefAssembler]    phase=section_complete jobId=light_a1b2c3 section=weighting
[BriefAssembler]    phase=section_complete jobId=light_a1b2c3 section=A  ← Profile in 90 Seconds
[BriefAssembler]    phase=section_complete jobId=light_a1b2c3 section=B  ← CV Claims (none)
[BriefAssembler]    phase=section_complete jobId=light_a1b2c3 section=C  ← Work Patterns
[BriefAssembler]    phase=section_complete jobId=light_a1b2c3 section=D  ← Red Flags (none)
[BriefAssembler]    phase=section_complete jobId=light_a1b2c3 section=E  ← Interview Q's (4)
[BriefAssembler]    phase=section_complete jobId=light_a1b2c3 section=G  ← Limitations
[BriefAssembler]    phase=assembly_complete jobId=light_a1b2c3 durationMs=340

[JobDispatcher]     phase=complete jobId=light_a1b2c3 totalDurationMs=45200 briefMarkdownLength=3200 flags=0 modules=14
[AnalysisV2Controller] phase=light_complete jobId=light_a1b2c3 status=complete durationMs=45200
```

### Response
```json
{
  "jobId": "light_a1b2c3",
  "status": "queued",
  "briefMarkdown": "# Evidence Brief: @torvalds\n\n**Analysis Mode:** light | **Generated:** ...\n\n## A. Profile in 90 Seconds\n...\n## C. Work Pattern Intelligence\n...\n## G. What This Evaluation Cannot Tell You\n..."
}
```

---

## Deep Mode — End-to-End Trace

```
POST /api/v2/analysis/deep { githubUsername: "torvalds", installationId: 12345, config: { ... } }
```

### Phase 1: Request & Light Corpus Acquisition
```
[AnalysisV2Controller] phase=deep_request jobId=deep_d4e5f6 username=torvalds
[JobDispatcher]        phase=dispatch jobId=deep_d4e5f6 mode=deep username=torvalds
[DeepCollector]        phase=collect_start jobId=deep_d4e5f6 username=torvalds mode=deep installationId=12345
[CorpusCache]          phase=cache_hit username=torvalds mode=light
[DeepCollector]        phase=light_corpus_ready jobId=deep_d4e5f6 corpusId=cor_xxx groups=A,B,C,D,E,F,G
```

### Phase 2: Fetch Private Repos via GitHub App
```
[DeepCollector]        phase=private_repos_fetched jobId=deep_d4e5f6 total=3
[DeepCollector]        phase=private_repos jobId=deep_d4e5f6 count=3 repos=torvalds/linux, torvalds/subsurface, torvalds/private-tool
```

### Phase 3: Clone & Analyze (Parallel Batches of 4)
```
[DeepCollector]        phase=clone_batch jobId=deep_d4e5f6 batch=1/1 repos=linux,subsurface,private-tool

[CloneWorkerManager]   phase=clone_start repo=linux
[CloneWorkerManager]   phase=cloning repo=linux target=/tmp/deep-clone/linux
[CloneWorkerManager]   phase=clone_complete repo=linux success=true
[CloneWorkerManager]   phase=tool_start repo=linux tool=scc
[CloneWorkerManager]   phase=tool_complete repo=linux tool=scc
[CloneWorkerManager]   phase=tool_start repo=linux tool=tokei
[CloneWorkerManager]   phase=tool_complete repo=linux tool=tokei
[CloneWorkerManager]   phase=tool_start repo=linux tool=gitleaks
[CloneWorkerManager]   phase=tool_complete repo=linux tool=gitleaks
[CloneWorkerManager]   phase=worker_complete repo=linux durationMs=120000 scc=ok tokei=ok gitleaks=ok
[CloneWorkerManager]   phase=cleanup_complete repo=linux
  ← Same pattern for subsurface (85s), private-tool (45s)

[DeepCollector]        phase=clone_results jobId=deep_d4e5f6 total=3 succeeded=3 failed=0
```

### Phase 4: Extract Deep Signals & Merge
```
[CorpusCache]          phase=merge_delta username=torvalds fromMode=light toMode=deep
[CorpusCache]          phase=merge_complete username=torvalds groupsPresent=A,B,C,D,E,F,G corpusId=cor_deep_xxx

[DeepCollector]        phase=collect_complete jobId=deep_d4e5f6 totalDurationMs=120500 reposCloned=3 reposSucceeded=3
```

### Phase 5: Wave Orchestration (uses enriched corpus)
```
[WaveOrchestrator]     phase=orchestration_start corpusId=cor_deep_xxx mode=deep
  ... same wave flow as Light Mode but with enriched groups C, E, G ...
[Module:ag5]           phase=run_complete classification=traditional
  ← Deep-only fields now populate: per_repo_author_stats, test_to_code_ratio,
    complexity_trend, secret_leak_details, sast_finding_density
```

### Phase 6: LLM + Brief Assembly (same as Light Mode)

### Response
```json
{
  "jobId": "deep_d4e5f6",
  "status": "queued",
  "reposCloned": 3,
  "reposSucceeded": 3,
  "secretLeaksFound": 2,
  "totalDurationMs": 175000
}
```

---

## CV Verification Flow (Enrichment Layer)

```
POST /api/v2/analysis/cv-verify { githubUsername: "torvalds", cvText: "...", config: {...} }
```

```
[AnalysisV2Controller] phase=cv_request jobId=cv_g7h8i9 username=torvalds cvTextLength=2450
[CvClaimExtractor]     phase=extract_complete claims=7 companies=2 roles=2 dates=2 techs=1
[AnalysisV2Controller] phase=cv_extracted jobId=cv_g7h8i9 claims=7 companies=2 roles=2
```
Then the standard Light Mode flow is called with `config.cv_claims` populated.
The EV module receives these claims and enriches its 3-rung verification.
The Brief Assembler Section B renders the claim-by-claim cross-reference table.

---

## Architecture Summary

```
┌────────────────────────────────────────────────────────────────┐
│                   API LAYER (NestJS)                           │
│  POST /api/v2/analysis/light    ← Light Mode (sync)            │
│  POST /api/v2/analysis/cv-verify ← Light + CV claims (sync)    │
│  POST /api/v2/analysis/deep     ← Deep Mode (sync)             │
└─────────────────────────┬──────────────────────────────────────┘
                          │
                   ┌──────▼──────┐
                   │JobDispatcher│
                   │(phases 1-5) │
                   └──────┬──────┘
                          │
              ┌───────────┼───────────┐
              │           │           │
        ┌─────▼────┐ ┌───▼────┐ ┌───▼───────┐
        │CorpusCache│ │DataColl│ │DeepCollect│
        │(Light 7d) │ │(A-G)   │ │(clone+run)│
        └───────────┘ └────────┘ └───────────┘
                          │
              ┌───────────▼───────────┐
              │   WaveOrchestrator    │
              │  Wave 1: AG1-AG3 (∥)  │
              │  Wave 2a: AG4 (cond)  │
              │  Wave 2b,c,d: P1-P5   │
              │  Wave 3: P6,AG5 (LLM) │
              └───────────┬───────────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
  ┌──────▼──────┐ ┌──────▼──────┐ ┌───────▼──────┐
  │14 Modules   │ │Deepseek v4  │ │BriefAssembler│
  │(P1-P7,AG1-6,│ │LLM Service  │ │(7 sections)  │
  │ EV + CV xref)│ │Waves 3 & 4  │ │+ CV Extractor│
  └─────────────┘ └─────────────┘ └──────────────┘
                          │
              ┌───────────▼───────────┐
              │    Evidence Brief      │
              │ (Markdown + JSON)      │
              └───────────────────────┘