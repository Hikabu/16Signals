# GitHub Engineering Intelligence System (GEIS) v5
## Master Architecture Reference

> **Scope:** This document covers the analyser and scoring system upgrade only. Employer dashboard, SaaS B2B UI, and hiring workflow UX are out of scope for this implementation phase.

---

## 1. What Is Changing and Why

The current system (`oldPlan1.md` / `PLAN__1_.md`) is a lightweight capability scorer built around 8–13 GitHub signals. It produces a recruiter card with three capability scores (Backend/Frontend/DevOps), ownership counts, and impact qualifiers.

**The v5 upgrade replaces this with:**

| Current | v5 Target |
|---|---|
| 3 capability scores (Backend/Frontend/DevOps) | 7 canonical primitives assessed independently |
| Composite-style recruiter card | Evidence Brief — no composite score, full citation chain |
| Light API-only fetch | Two modes: Light (API-only, <3min) + Deep (clone + tools, 8–15min) |
| 8–13 signals with confidence modifier | Every primitive has explicit confidence level + observability gap language |
| Rule-based summary generator | LLM API for NLP analysis (commit quality, PR depth, AI-generation detection) |
| No employment verification | 3-rung employment verification ladder |
| Basic fork filter | Full anti-gaming detection layer (7 pattern types) |
| Stack fingerprint display-only | Seniority-adjusted primitive weighting + role archetype signal emphasis |

---

## 2. Non-Negotiable Design Rules (carry forward from current system)

These ADRs from the current architecture are preserved unchanged:

| ADR | Rule | Reason |
|---|---|---|
| ADR001 | Modular monolith (NestJS modules) | Unchanged — extract to microservices later |
| ADR002 | BullMQ on Redis for async analysis | Deep Mode is 8–15min; sync is impossible |
| ADR003 | AnalysisJob is source of truth | Preserved |
| ADR009 | 24h result cache by username | Extended to cache-by-mode (Light vs Deep get separate cache entries) |
| ADR010 | Output schema locked before scoring logic | v5 schema defined in `01_OUTPUT_SCHEMA.md` before any scoring is written |
| ADR012 | Headless analysis API callable without user account | Preserved |

**New ADRs for v5:**

| ADR | Rule | Reason |
|---|---|---|
| ADR026 | No composite score — ever | A number hides evidence and invites decisions based on the number, not the reasoning |
| ADR027 | Every primitive has a mandatory confidence level | Partial evidence presented as full evidence is worse than no evidence |
| ADR028 | Observability gaps are surfaced explicitly, never as penalties | Senior enterprise engineers have thin public profiles; that is correlation with seniority, not anti-correlation |
| ADR029 | LLM API replaces all custom NLP | Commit quality, PR depth, AI-generation detection — all via LLM API. No custom NLP pipeline |
| ADR030 | External tool delegation over custom build | scc, tokei, gitinspector, gitleaks, semgrep, actionlint — no reimplementation |
| ADR031 | Deep Mode repos cloned in-memory analysis only | Source code never stored. Only derived metrics persist |
| ADR032 | Anti-gaming flags surface as interview probes, never auto-reject | Every flag has a confidence level and a recommended interview question |
| ADR033 | Seniority-adjusted weighting, not fixed primitive weights | Junior engineer is not penalised for lacking Collaboration Leverage they haven't had the opportunity to build |

---

## 3. System Modes

### Mode 1 — Light Analysis
- **Trigger:** GitHub username submitted (no candidate action needed)
- **Token:** Platform system token (shared GitHub App installation token)
- **Data:** Public repositories, public PRs, public profile, contribution calendar (public events only)
- **Tools:** No local tool execution — API-only
- **Output:** Evidence Brief, all 7 primitives at moderate-to-low confidence
- **Time:** <3 minutes

### Mode 2 — Deep Analysis
- **Trigger:** Candidate authenticates via GitHub OAuth, installs GitHub App
- **Token:** Candidate-specific installation token (per-candidate isolated rate limit)
- **Data:** All public + private repos (with consent), org membership, full commit history, CI/CD history, code scanning alerts, Dependabot
- **Tools:** scc, tokei, gitinspector, gitleaks, semgrep, actionlint — top 30 repos cloned, 4 parallel workers
- **Output:** Evidence Brief, all 7 primitives at higher confidence
- **Time:** 8–15 minutes (async, notification on completion)

> **Note for this implementation phase:** The employer-facing trigger for Deep Mode (evaluation link flow) is out of scope. Implement Deep Mode as an API-callable mode. The candidate OAuth flow IS in scope because it generates the installation token.

---

## 4. Module Structure (extending current `src/` layout)

```
src/
├── main.ts / app.module.ts
├── config/env.schema.ts             # Add new env vars (see 09_ENV_VARS.md)
├── prisma/prisma.service.ts
├── redis/redis.service.ts
│
├── modules/
│   ├── auth/                        # GitHub OAuth + JWT — extend for Deep Mode installation token
│   ├── analysis/                    # AnalysisJob CRUD — extend for mode field + new progress stages
│   ├── profile/
│   └── admin/
│
├── scoring/
│   ├── github-adapter/
│   │   ├── light-fetcher.service.ts         # (replaces current lightweight fetcher)
│   │   └── deep-fetcher.service.ts          # NEW — clone + tool orchestration
│   │
│   ├── signal-extractor/
│   │   ├── data-groups.service.ts           # NEW — Groups A–G collection
│   │   ├── github-signals.service.ts        # UPGRADE from S1–S8
│   │   ├── ecosystem-classifier.service.ts  # S9–S10 (existing, preserve)
│   │   ├── stack-fingerprint.service.ts     # S13 (existing, preserve)
│   │   └── anti-gaming.service.ts           # NEW — 7 detection algorithms
│   │
│   ├── primitives/                          # NEW module — 7 canonical primitives
│   │   ├── p1-execution-reliability.service.ts
│   │   ├── p2-systems-evolution.service.ts
│   │   ├── p3-collaboration-leverage.service.ts
│   │   ├── p4-technical-depth.service.ts
│   │   ├── p5-operational-maturity.service.ts
│   │   ├── p6-ai-leverage.service.ts
│   │   ├── p7-authenticity-confidence.service.ts
│   │   └── primitive-aggregator.service.ts  # Seniority weighting + role archetype
│   │
│   ├── employment-verification/             # NEW — 3-rung ladder
│   │   └── employment-verifier.service.ts
│   │
│   ├── llm-analysis/                        # NEW — LLM API delegation
│   │   ├── llm-client.service.ts
│   │   ├── commit-quality-analyser.ts
│   │   ├── pr-depth-analyser.ts
│   │   ├── ai-generation-detector.ts
│   │   └── prompts/                         # All LLM prompts as typed constants
│   │       ├── commit-quality.prompt.ts
│   │       ├── pr-depth.prompt.ts
│   │       └── ai-generation.prompt.ts
│   │
│   ├── external-tools/                      # NEW — delegated tool wrappers
│   │   ├── scc.service.ts
│   │   ├── tokei.service.ts
│   │   ├── gitinspector.service.ts
│   │   ├── gitleaks.service.ts
│   │   ├── semgrep.service.ts
│   │   └── actionlint.service.ts
│   │
│   ├── similarity-detection/               # NEW — laundering detection
│   │   ├── github-code-search.service.ts
│   │   └── copyleaks.service.ts            # optional, secondary confirmation
│   │
│   ├── evidence-brief/                     # NEW — replaces scoring-service + summary-generator
│   │   ├── evidence-brief.service.ts
│   │   ├── confidence-assessor.service.ts
│   │   └── interview-probe-generator.ts
│   │
│   ├── scoring-service/                    # PRESERVED but demoted — feeds primitives
│   ├── summary-generator/                  # PRESERVED for backward compat, deprecated path
│   └── web3-adapter/                       # PRESERVED unchanged
│
├── queues/
│   ├── analysis.processor.ts               # UPGRADE — two mode branches
│   ├── deep-analysis.processor.ts          # NEW — separate queue for Deep Mode
│   ├── rescore.processor.ts
│   └── notification.processor.ts
│
└── shared/
    ├── guards/ decorators/ interceptors/
    ├── crypto.util.ts
    └── confidence.types.ts                 # NEW — mandatory confidence language enums
```

---

## 5. Data Flow (v5)

### Light Mode Pipeline

```
POST /analysis { githubUsername, mode: "light", targetSeniority?, roleArchetype? }
↓
AnalysisJob created → jobId returned
↓
Cache check (key: username:light:seniority:role) → hit? return cached
↓
BullMQ → analysis.processor (light branch)
↓
┌─ light-fetcher.service ─────────────────────────────────────────────┐
│  Groups A (Identity), B-public (Repos), C-api (Commits),            │
│  D-public (PRs), F (External signals)                               │
│  GraphQL-first: ~60% REST savings                                   │
│  Rate limit circuit breaker: pause at <500 remaining               │
└─────────────────────────────────────────────────────────────────────┘
↓
┌─ Parallel ──────────────────────────────────────────────────────────┐
│  A: data-groups.service → Groups A+B+C+D+F                         │
│  B: anti-gaming.service → commit inflation, fork dump, burst/dorm   │
│     GitHub Code Search API → code similarity spot-checks            │
└─────────────────────────────────────────────────────────────────────┘
↓
┌─ llm-analysis ──────────────────────────────────────────────────────┐
│  Batch LLM API call:                                                 │
│  · commit-quality-analyser (sampled commit messages)                │
│  · pr-depth-analyser (PR descriptions)                              │
│  · ai-generation-detector (pattern scoring 0–100)                   │
└─────────────────────────────────────────────────────────────────────┘
↓
┌─ primitives ────────────────────────────────────────────────────────┐
│  P1 Execution Reliability                                            │
│  P2 Systems Evolution                                                │
│  P3 Collaboration Leverage                                           │
│  P4 Technical Depth                                                  │
│  P5 Operational Maturity                                             │
│  P6 AI Leverage Quality                                              │
│  P7 Authenticity Confidence                                          │
│  Each → evidence array + confidence level                            │
└─────────────────────────────────────────────────────────────────────┘
↓
primitive-aggregator → seniority-adjusted weighting + role archetype
↓
employment-verifier → Rung 1 (Light Mode: email domain only)
↓
evidence-brief.service → Sections A–G
↓
Result stored → cache set → job complete
```

### Deep Mode Pipeline

```
POST /analysis { githubUsername, mode: "deep", installationId, targetSeniority?, roleArchetype? }
↓
[same AnalysisJob flow]
↓
BullMQ → deep-analysis.processor
↓
deep-fetcher.service:
  · Full repo inventory (public + private via installation token)
  · Top 30 repos selected (stars + forks + commit_count × recency_weight)
  · Clone via HTTPS (token-authenticated)
  · 4 parallel workers → scc + tokei + gitinspector + gitleaks + semgrep
↓
[same parallel anti-gaming + LLM analysis]
↓
employment-verifier → Rung 1 + 2 + 3 (org membership + contribution fingerprint)
↓
[same primitives + aggregator + evidence-brief]
```

---

## 6. What Is Preserved from Current System

| Component | Status | Notes |
|---|---|---|
| `AnalysisJob` entity | Extended | Add `mode`, `targetSeniority`, `roleArchetype`, `installationId` fields |
| BullMQ queue infrastructure | Extended | Add second queue for Deep Mode |
| GitHub OAuth + JWT auth | Extended | Add GitHub App installation flow |
| Cache service | Extended | Cache key includes mode, seniority, role |
| `web3-adapter` | Unchanged | Solana signals feed into P4 Technical Depth and P1 Execution Reliability |
| `ecosystem-classifier` | Unchanged | S9/S10 feed into P4 Technical Depth |
| `stack-fingerprint` | Unchanged | Feeds into Evidence Brief Section B (Tech Reality vs CV Claims) |
| `scoring-service` | Deprecated but preserved | Outputs still computed for backward compat; deprecated in favour of primitives |
| Rate limit circuit breaker | Preserved | Unchanged logic, new monitoring hooks |
| 24h cache TTL | Extended | Light Mode: 24h. Deep Mode: 12h (more expensive to rerun) |

---

## 7. Key Invariants (LLM Drift Guards)

These invariants must hold in every generated file. Test against them explicitly.

1. **No composite score is ever computed or stored.** There is no `totalScore`, `overallScore`, `finalScore`, or weighted average of primitives.
2. **Every primitive assessment carries exactly one confidence level** from the enum: `STRONG_EVIDENCE | MODERATE_EVIDENCE | LOW_EVIDENCE | OBSERVABILITY_GAP | INSUFFICIENT_DATA`.
3. **Observability gaps are never treated as penalties.** A missing primitive is surfaced as `OBSERVABILITY_GAP` with a recommended interview question, never as a zero score.
4. **Anti-gaming flags never produce automatic rejection.** Every flag produces: evidence string, confidence number (0–100), interview probe string.
5. **LLM analysis is the only NLP path.** No regex-based commit quality scoring, no custom NLP pipeline.
6. **Source code is never persisted.** Only derived metrics from tool output are stored.
7. **The Evidence Brief has exactly 7 sections (A–G).** No section is ever omitted, including Section G (epistemic boundaries).
