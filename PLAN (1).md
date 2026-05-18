# COLOSSEUM

## Table of Contents

- [0. Core Thesis](#0-core-thesis)
- [1. Tech Stack](#1-tech-stack)
- [2. Project Structure](#2-project-structure)
- [3. Architecture](#3-architecture)
  - [3.1 Architecture Decision Records](#31-architecture-decision-records)
  - [3.2 System Architecture Pipeline](#32-system-architecture-pipeline)
- [4. Scoring Model, Capability-Based Engine](#4-scoring-model--capability-based-engine)
  - [4.1 Design Principles](#41-design-principles)
  - [4.2 Signal Set, 8 High-Signal Inputs](#42-signal-set--8-high-signal-inputs)
  - [4.3 Capability Scoring](#43-capability-scoring)
  - [4.4 Ownership Scoring](#44-ownership-scoring)
  - [4.5 Impact Scoring](#45-impact-scoring)
  - [4.6 Confidence, Inline Modifier, Not a Peer Score](#46-confidence--inline-modifier-not-a-peer-score)
  - [4.7 Data Completeness & Visibility](#47-data-completeness--visibility)
  - [4.8 What Was Removed and Why](#48-what-was-removed-and-why)
- [5. Output Format](#5-output-format)
  - [5.1 Result Schema](#51-result-schema)
  - [5.2 AnalysisJob Entity](#52-analysisjob-entity)
  - [5.3 Recruiter Card, Example Output](#53-recruiter-card--example-output)
- [6. Job Processing Pipeline](#6-job-processing-pipeline)
  - [6.1 Queue Stages](#61-queue-stages)
  - [6.2 Data Fetcher, Lightweight Only](#62-data-fetcher--lightweight-only)
  - [6.3 Caching Strategy](#63-caching-strategy)
- [7. API Contract](#7-api-contract)
  - [7.1 Analysis](#71-analysis)
  - [7.2 Auth & User](#72-auth--user)
- [8. Web3 / Solana Integration](#8-web3--solana-integration)
  - [8.1 Who This Covers](#81-who-this-covers)
  - [8.2 What Was Cut and Why](#82-what-was-cut-and-why)
  - [8.3 Signal Set, Stage 3 Additions](#83-signal-set--stage-3-additions)
  - [8.4 Stack Fingerprint Signal](#84-stack-fingerprint-signal)
  - [8.5 How Signals Merge](#85-how-signals-merge)
  - [8.6 Three-Mode Operation](#86-three-mode-operation)
  - [8.7 Unified Scoring Layer](#87-unified-scoring-layer)
- [9. Key Database Models](#9-key-database-models)
- [10. Environment Variables](#10-environment-variables)
- [11. Verification Plan](#11-verification-plan)
- [12. Development Roadmap](#12-development-roadmap)
- [13. Success Metrics](#13-success-metrics)

---

## 0. Core Thesis

### The Fundamental Shift

A CV is a claim. Colosseum is evidence. The system replaces traditional CVs with automatically generated proof-of-work profiles derived from real developer activity, requiring zero manual input from the candidate. A developer's GitHub activity contains most of what a hiring decision actually requires: ownership patterns, project longevity, tech stack signals, collaboration breadth, and consistency over time.

For Web3 developers, on-chain deployment history, program ownership, ecosystem achievements, and curated credential NFTs add a cryptographic layer of proof that no CV can replicate.

The problem is that raw GitHub and on-chain data is noisy, visibility-uneven, and easy to over-engineer into low-signal complexity. Colosseum filters, interprets, and presents that data as a recruiter-ready output, not a dashboard, not a score dump, not an analytics platform.

### The Question the System Answers

> "What has this developer actually done, what are they good at, and how confident are we in this assessment?"

### Structural Problems This Solves

1. CVs are claims, the system replaces them with observable evidence
2. Role-based self-reporting is inaccurate, capabilities are inferred automatically
3. Noisy metrics (commit counts, lines of code) obscure real signal, they are excluded
4. Confidence is often conflated with ability, they are separated per dimension
5. Unequal visibility across candidates (public vs. private work), data completeness is surfaced as a qualifier, not a penalty
6. Recruiter outputs are not actionable, the system produces a plain-English summary, not a score dump
7. Wallet-based proof of work has no structured home, the schema is designed to absorb Solana signals without redesign
8. Web3 developers who never deploy programs are invisible to wallet-based systems, ecosystem signals from GitHub cover the full developer population

---

## 1. Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 LTS |
| Framework | NestJS 10, TypeScript 5, `"module": "commonjs"` |
| ORM | Prisma 7 |
| Database | PostgreSQL 15 |
| Cache + Queue | Redis 7 + BullMQ + @nestjs/bullmq |
| GitHub Client | @octokit/rest + @octokit/graphql |
| Auth | passport-github2 + @nestjs/jwt + passport-jwt |
| Token Security | Node.js crypto AES-256-GCM |
| Web3 (Solana) | @solana/web3.js (read-only, RPC-native), Stage 3 |
| Config | @nestjs/config + Zod env schema (fail at startup) |
| Validation | zod + nestjs-zod |
| Security | helmet, @nestjs/throttler |
| Logging | nestjs-pino + pino-http |
| Error tracking | @sentry/node |
| Testing | jest, @nestjs/testing, supertest |

---

## 2. Project Structure

```
src/
├── main.ts / app.module.ts
├── config/env.schema.ts             # Zod, fail at startup
├── prisma/prisma.service.ts
├── redis/redis.service.ts
│
├── modules/
│   ├── auth/                        # GitHub OAuth + JWT
│   ├── analysis/                    # AnalysisJob CRUD, status, result
│   ├── profile/                     # Candidate profile, wallet address
│   └── admin/                       # Queue stats, cache management
│
├── scoring/                         # Pure domain, no HTTP surface
│   ├── github-adapter/              # Lightweight data fetcher
│   ├── signal-extractor/            # 8+4 signal extraction from raw data
│   │   ├── github-signals.service.ts    # S1–S8 (existing)
│   │   ├── ecosystem-classifier.service.ts  # S9–S10 (new)
│   │   └── stack-fingerprint.service.ts     # S13 (new)
│   ├── scoring-service/             # Capability + Ownership + Impact scoring
│   ├── summary-generator/           # Plain-English summary from top dimensions
│   └── web3-adapter/                # Stage 3, Solana signal fetch
│       ├── solana-adapter.service.ts
│       ├── achievement-whitelist.service.ts
│       └── whitelists/
│           ├── colosseum-mints.json
│           └── superteam-mints.json
│
├── queues/
│   ├── analysis.processor.ts        # Main pipeline orchestrator
│   ├── rescore.processor.ts         # Manual recompute trigger
│   └── notification.processor.ts
│
└── shared/
    ├── guards/ decorators/ interceptors/
    └── crypto.util.ts
```

---

## 3. Architecture

### 3.1 Architecture Decision Records

| ADR | Decision | Rationale |
|---|---|---|
| ADR001 | Modular monolith (NestJS modules) | Clean domain boundaries; extract to microservices later without redesign |
| ADR002 | BullMQ on Redis for async analysis | GitHub data fetch is 3–10s per profile; sync is infeasible |
| ADR003 | AnalysisJob is the source of truth | Not users, not sessions, the job anchors the entire system |
| ADR004 | No role-based scoring | Requires user input; self-reports are inaccurate; hybrid developers break classification |
| ADR005 | Confidence is an inline modifier, not a peer score | A recruiter needs "backend: 82 (high confidence)", not "confidence: 72" as a standalone number |
| ADR006 | Collaboration is Impact, not a Capability | Collaboration is a behavioral signal. Backend / Frontend / DevOps are technical skills. These are different categories |
| ADR007 | 8 GitHub signals maximum | Diminishing returns beyond this; each additional signal adds noise, maintenance cost, and explainability loss |
| ADR008 | No deep commit or diff parsing | Commit counts and lines of code are noisy and gameable; contribution graph summary is sufficient |
| ADR009 | 24h result cache by username | Protects GitHub API rate limits; critical for demo reliability |
| ADR010 | Output schema locked before scoring logic is written | The schema is the contract; all layers build toward it |
| ADR011 | Lightweight fetcher only, no deep repo analysis at MVP | Repo list + contribution graph + external PRs covers all 8 signals without deep parsing |
| ADR012 | Headless analysis API callable without user account | Testing and CI pipelines decouple from the user session layer |
| ADR013 | Wallet address extends the same job input | No redesign needed when Solana signals are added, same AnalysisJob, same schema |
| ADR014 | Summary is rule-based at MVP, not AI-generated | Template-driven summaries are consistent, auditable, and fast. AI generation is a Stage 4 enhancement |
| ADR015 | Progress stages defined before queue implementation | Stages must map 1:1 to UI messages; define them once, use them everywhere |
| ADR016 | No EVM integration | Adds an entire second chain for zero Solana-specific signal. Revisit if product expands to multi-chain |
| ADR017 | Unique callers over transaction count for program traction | Transaction counts are trivially gameable. Unique fee payers require real distinct users |
| ADR018 | Achievement whitelist is a curated JSON config, not a DB table | Small, changes infrequently, benefits from code review and version history. DB adds overhead with no benefit |
| ADR019 | Superteam achievement detection via NFT whitelist, not API | No stable public API exists. NFT parsing by known minters is more reliable and requires no external dependency |
| ADR020 | Wallet signals can only upgrade confidence, never downgrade | Absence of a wallet is not negative signal. Many strong developers have no on-chain footprint |
| ADR021 | Wallet-only mode is first-class, not a fallback | Some web3 developers have minimal public GitHub. Their on-chain work is their CV |
| ADR022 | Ecosystem classifier runs on existing fetched data, no new GitHub API calls | Topics and PR repo names are already fetched. The classifier is a filter, not a fetcher |
| ADR023 | 7d cache TTL for Solana program data | Programs deploy slowly; upgrade authority transfers are rare |
| ADR024 | Stack fingerprint reads only dependency keys, not values or lock files | Enough to detect tooling presence; avoids the cost and noise of parsing full manifests |
| ADR025 | Stack fingerprint is display-only on recruiter card, not a scored dimension | Tooling presence is factual, not evaluative. Scores are for capabilities, counts for ownership, descriptors for impact |

### 3.2 System Architecture Pipeline

```
[ POST /analysis ]  ←  { githubUsername?, walletAddress? }  (at least one required)
↓
[ AnalysisJob created → jobId returned ]
↓
[ Cache check, hit? → return cached result immediately ]
↓ (cache miss)
[ BullMQ queue → analysis.processor ]
↓
┌──────────────────────────────────────────┐  ┌──────────────────────────────────────────┐
│ GitHub Data Fetcher (if githubUsername)  │  │ Solana Adapter (if walletAddress)        │
│ · User profile                           │  │ · getProgramAccounts by upgrade authority│
│ · Repo list: name, language, stars,      │  │ · getSignaturesForAddress (traction)     │
│   forks, topics, created_at, pushed_at,  │  │ · getAssetsByOwner (DAS, NFT scan)      │
│   is_fork, description                   │  │ · Filter against achievement whitelists  │
│ · Root manifest scan: package.json +     │  └──────────────────────────────────────────┘
│   Cargo.toml, dependency keys only      │
│ · Contribution graph (weekly summary)    │
│ · External PR contributions (count +     │
│   repo names)                            │
└──────────────────────────────────────────┘
↓
[ Signal Extractor, 12 signals total ]
  GitHub signals (S1–S8, existing):
    S1  Ownership depth
    S2  Project longevity
    S3  Activity consistency
    S4  Tech stack breadth
    S5  External contributions
    S6  Project meaningfulness
    S7  Stack identity
    S8  Data completeness
  Ecosystem signals (S9–S10, new, GitHub data, no new fetches):
    S9  Ecosystem identity
    S10 Ecosystem contribution credibility
  Wallet signals (S11–S12, new, optional):
    S11 On-chain program ownership + traction
    S12 Ecosystem achievements (Colosseum wins + Superteam bounties)
  Stack signal (S13, new, lightweight manifest read):
    S13 Stack fingerprint
↓
[ Web3 Merge Service ]
  · Applies confidence upgrade rules (wallet can only upgrade, never downgrade)
  · Resolves GitHub ↔ wallet signal agreement/conflict
  · Flags private-work indicators
↓
[ Scoring Service ]
  · Capabilities (Backend / Frontend / DevOps) ← S4, S7, S11 reinforcement
  · Ownership (owned projects, maintained, deployed programs) ← S1, S2, S11
  · Impact (activity, consistency, external, ecosystem PRs) ← S3, S5, S6, S10
  · Confidence modifier applied inline per dimension ← S8, cross-source agreement
↓
[ Summary Generator, rule-based 1–2 sentence description ]
↓
[ Result stored → cache set → job marked complete ]
↓
[ GET /analysis/:jobId/result ]
```

---

## 4. Scoring Model, Capability-Based Engine

### 4.1 Design Principles

**Capability-based, not role-based.** Strengths are inferred automatically. The user selects nothing.

**Describe, do not classify.** Output strengths and patterns. Do not force a developer into a single label.

**High-signal only.** Ownership, project longevity, consistency, and meaningful contributions. Not commit counts, lines of code, or repo complexity.

**Simple and explainable.** Every score must be explainable in one sentence.

**Confidence as a modifier.** Confidence qualifies each dimension inline. It is not a separate dimension.

**Fast and scalable.** No deep repo parsing. Lightweight fetcher only.

**Wallet-compatible.** Schema designed to absorb Solana signals without structural change. The wallet enhances, it never penalises.

### 4.2 Signal Set, 8 High-Signal Inputs (GitHub)

| # | Signal | Computed From | Why It Matters |
|---|---|---|---|
| S1 | Ownership depth | Non-fork repos owned, maintained > 3 months | Distinguishes real work from clones and toy experiments |
| S2 | Project longevity | Average age of actively maintained repos | Signals commitment vs. short-lived projects |
| S3 | Activity consistency | Contribution graph: active weeks / 52 | Sustained pattern of work over time, not raw commit volume |
| S4 | Tech stack breadth | Unique languages across owned repos | Generalist vs. specialist; feeds capability inference |
| S5 | External contributions | PRs merged into repos not owned by user | Collaboration quality and real-world credibility |
| S6 | Project meaningfulness | Stars + forks + topic tags on owned repos | Evidence that others found the work useful |
| S7 | Stack identity | Top 2 languages by repo count and bytes written | Primary build environment, primary driver of capability scoring |
| S8 | Data completeness | Public repo count, contribution visibility, account age | Confidence modifier applied inline to each dimension |

### 4.3 Capability Scoring

Capability scores (0–100) are inferred from S7 (stack identity) and S4 (tech stack breadth). A developer can score high on multiple capabilities, no single label is forced.

| Capability | Primary Language Signals | Secondary Signals |
|---|---|---|
| Backend | Python, Go, Rust, Java, Node.js, PHP, Ruby | API-topic repos, database configs, server-side frameworks |
| Frontend | TypeScript, JavaScript with UI topics, CSS | React/Vue/Svelte/Angular repos, CSS-heavy repos, UI component topics |
| DevOps | Shell, HCL, YAML-dominant repos | Docker, Kubernetes, CI/CD configs, infra topics, Terraform |

Each capability score carries an inline confidence qualifier (low / medium / high) derived from S8. In Stage 3, wallet signals (S11) can reinforce capability scoring, a Rust-heavy GitHub profile with deployed Solana programs upgrades backend confidence one tier.

### 4.4 Ownership Scoring

Ownership is expressed as counts, not a weighted score. Recruiters can read counts directly.

- `ownedProjects`, count of non-fork repos maintained > 3 months (S1)
- `activelyMaintained`, count of repos with a push in the last 6 months (S2)
- `deployedPrograms`, count of Solana programs where wallet holds upgrade authority (S11, optional)
- `confidence`, derived from S8

### 4.5 Impact Scoring

Impact uses qualitative descriptors rather than a 0–100 score.

- `activityLevel`, high / medium / low, from S3 (active weeks / 52)
- `consistency`, strong / moderate / sparse, from S3 trend over time
- `externalContributions`, count of PRs merged into external repos, from S5 + S10 (ecosystem PRs increment this count)
- `confidence`, derived from S8

Collaboration (external contributions) sits here under Impact. It is a behavioral signal, not a technical skill.

### 4.6 Confidence, Inline Modifier, Not a Peer Score

Confidence is not a top-level dimension. It is a qualifier that travels with each dimension. The value comes from S8 (data completeness). In Stage 3, cross-source agreement between GitHub and wallet signals can upgrade confidence, but wallet signals can never downgrade it.

```json
// Correct
{ "backend": { "score": 82, "confidence": "high" } }

// Incorrect, confidence as a peer score adds nothing
{ "backend": 82, "confidence": 72 }
```

Factors affecting confidence:
- Public repo count (< 5 → low)
- Account age (< 1 year → low)
- Contribution visibility (sparse graph → medium)
- Profile completeness
- Cross-source agreement with wallet signals (GitHub Rust + deployed programs → upgrade one tier)

### 4.7 Data Completeness & Visibility

| Scenario | Behaviour |
|---|---|
| Rich public history (≥ 10 owned repos, active graph) | All signals compute fully; confidence: high across dimensions |
| Mixed (5–9 repos, partial graph) | All signals compute; confidence: medium |
| Sparse public profile (< 5 repos or < 1yr account) | Signals compute from available data; confidence: low; note surfaced to recruiter |
| Zero public data | Job fails gracefully; recruiter shown: "Insufficient public data to generate a profile" |
| Private-heavy developers | Not scored lower. Scored on what is visible with honest confidence qualifier. `privateWorkIndicatorsDetected` note added when high S3 consistency + low S8 completeness |
| Wallet supplements sparse GitHub | Wallet programs present → confidence upgrades, private work note updated to include on-chain evidence |

### 4.8 What Was Removed and Why

| Removed | Reason |
|---|---|
| Role-based scoring | Requires user input; self-reports are inaccurate; hybrid developers break it |
| Commit count as primary metric | Gameable; no meaningful correlation with hiring decisions |
| Lines of code | The most gameable metric available; conveys nothing about quality |
| Repo complexity scoring | Expensive to compute; poorly defined; no recruiter interpretability |
| PR/issue micro-metrics | Simplified into S5 external contributions count |
| Time decay functions | Replaced by S3 activity consistency, simpler and more intuitive |
| Collaboration as a Capability | Collaboration is behavioral; moved to Impact as externalContributions |
| Confidence as a top-level score | Restructured as an inline modifier |
| Deep commit and diff parsing | Not needed; all signals compute from repo metadata and contribution graph |
| EVM / viem integration | Adds an entire second chain for zero Solana-specific signal |
| SPL token / DeFi / NFT financial activity | Financial behaviour tells a recruiter nothing about what was built |
| Transaction volume counts | Gameable; no correlation with developer ability |
| Superteam API dependency | No stable public API. NFT whitelist parsing is more reliable |
| Solana Attestation Service | Near-zero adoption. Revisit Stage 5 |
| Superteam member NFT | Membership ≠ delivered work. Bounty completion NFTs are higher signal |
| Hackathon participation NFTs | Participation ≠ winning. Indistinguishable from submission farms |

---

## 5. Output Format

### 5.1 Result Schema

This schema is locked. All scoring logic builds toward this contract.

```json
{
  "summary": "string, 1–2 sentence plain-English description of primary strengths",

  "capabilities": {
    "backend":  { "score": 0, "confidence": "low | medium | high" },
    "frontend": { "score": 0, "confidence": "low | medium | high" },
    "devops":   { "score": 0, "confidence": "low | medium | high" }
  },

  "ownership": {
    "ownedProjects":      0,
    "activelyMaintained": 0,
    "deployedPrograms":   0,
    "confidence": "low | medium | high"
  },

  "impact": {
    "activityLevel":         "high | medium | low",
    "consistency":           "strong | moderate | sparse",
    "externalContributions":  0,
    "confidence": "low | medium | high"
  },

  "stack": {
    "languages": ["Rust", "TypeScript", "Python"],
    "tools":     ["Anchor", "BullMQ", "AWS", "Foundry", "Docker"]
  },

  "web3": {
    "ecosystem": "solana | null",
    "ecosystemPRs": 0,
    "deployedPrograms": [
      {
        "programId":     "string",
        "deployedAt":    "ISO timestamp",
        "isActive":      true,
        "uniqueCallers": 0
      }
    ],
    "achievements": [
      {
        "type":   "hackathon_win | bounty_completion",
        "source": "colosseum | superteam",
        "label":  "string",
        "year":    0
      }
    ]
  }
}
```

`stack` is always present (populated from GitHub). `web3` is null if no wallet is provided and no ecosystem signals are detected.

### 5.2 AnalysisJob Entity

The AnalysisJob is the source of truth for the entire system. Not users, not sessions.

```json
{
  "id":     "job_abc123",
  "status": "pending | running | completed | failed",
  "input": {
    "githubUsername": "string",
    "walletAddress":  "string (optional)"
  },
  "progress": {
    "stage":      "queued | fetching_data | analyzing_signals | building_profile | complete",
    "percentage":  0
  },
  "result":    {},
  "userId":    "optional, attached on auth",
  "createdAt": "ISO timestamp",
  "updatedAt": "ISO timestamp"
}
```

### 5.3 Recruiter Card, Example Output

```
Alex Chen, GitHub + Solana Wallet

Backend-focused Solana developer with strong program ownership. Primarily building
in Rust and TypeScript. Has contributed to coral-xyz/anchor and deployed 2 active
programs with 340+ unique callers.

CAPABILITIES
Backend   87  ██████████████████░░  high confidence
Frontend  24  █████░░░░░░░░░░░░░░░  medium confidence
DevOps    40  ████████░░░░░░░░░░░░  medium confidence

OWNERSHIP
GitHub repos: 4  |  Actively maintained: 2  |  Deployed programs: 2  |  Confidence: high

IMPACT
Activity: high  |  Consistency: strong  |  External contributions: 8  (3 ecosystem)

STACK
Languages:  Rust  TypeScript  Python
Tools:      Anchor  BullMQ  AWS  Docker  PostgreSQL

WEB3 CREDENTIALS  ✦ on-chain verified
Colosseum Hackathon Winner  2024
Superteam Bounty Completions: 3
Deployed programs: 2 active  |  Unique callers: 340+
```

---

## 6. Job Processing Pipeline

### 6.1 Queue Stages

Progress stages are defined here and used verbatim in both queue and UI. No divergence.

| Stage | Description |
|---|---|
| queued | Job created; waiting in BullMQ queue |
| fetching_data | GitHub adapter + Solana adapter running in parallel |
| analyzing_signals | Signal extractor processing raw data into 12 signals |
| building_profile | Scoring service computing capabilities, ownership, impact |
| complete | Result stored; cache set; job closed |

### 6.2 Data Fetcher, Lightweight Only

The fetcher pulls only what the signals need. No deep analysis.

**GitHub, fetched:**
- User profile (account age, public repo count, followers)
- Repo list per repo: `name`, `language`, `stars`, `forks`, `topics`, `created_at`, `pushed_at`, `is_fork`, `description`
- Root manifest: `package.json` and/or `Cargo.toml`, dependency keys only, no values, no lock files
- Contribution graph, weekly summary (active weeks count)
- External PR contributions, count and repo names only

**GitHub, not fetched:**
- Commit-level data
- Diff or line-count data
- README content
- Per-file language breakdown
- Full manifest values, lock files, or nested dependencies

**Solana, fetched (if walletAddress provided):**
- Programs where wallet holds upgrade authority (`getProgramAccounts` on BPF_LOADER_UPGRADEABLE_ID)
- Per program: first slot timestamp, recent signature sample for traction (capped at 500)
- NFT holdings via `getAssetsByOwner` (Helius DAS API or equivalent), filtered against whitelists

**Solana, not fetched:**
- Token balances
- Transaction history beyond traction sample
- DeFi / swap / NFT financial activity
- Any EVM data

### 6.3 Caching Strategy

Cache is checked before enqueuing. On hit, result is returned immediately without touching the queue.

| Cache | Key | TTL |
|---|---|---|
| GitHub-only result | `analysis:{githubUsername}` | 24h |
| GitHub + wallet result | `analysis:{githubUsername}:{walletAddress}` | 24h |
| Wallet-only result | `analysis:wallet:{walletAddress}` | 24h |
| Solana program data | `solana:programs:{walletAddress}` | 7d |
| Achievement NFT scan | `solana:achievements:{walletAddress}` | 24h |

Manual recompute bypasses cache:

```http
POST /analysis/recompute
Body: { "githubUsername": "...", "force": true }
```

---

## 7. API Contract

### 7.1 Analysis

| Method | Path | Guard | Description |
|---|---|---|---|
| POST | /analysis | Public | Create AnalysisJob. Body: `{ githubUsername?, walletAddress? }` (at least one required). Returns `{ jobId }` |
| GET | /analysis/:jobId/status | Public | `{ status, stage, percentage }` |
| GET | /analysis/:jobId/result | Public | Full result when `status: completed` |
| POST | /analysis/recompute | X-InternalKey | Force re-analysis bypassing cache |
| POST | /analysis/:jobId/attach | JWT | Attach job to authenticated user |

### 7.2 Auth & User

| Method | Path | Guard | Description |
|---|---|---|---|
| GET | /auth/github | Public | GitHub OAuth redirect |
| GET | /auth/github/callback | Public | Exchange → JWT |
| POST | /auth/refresh | Bearer | Rotate refresh token |
| POST | /auth/logout | JWT | Revoke refresh token |
| GET | /api/me/analyses | JWT | List of jobs attached to authenticated user |
| DELETE | /api/me | JWT | GDPR hard delete |

---

## 8. Web3 / Solana Integration

> **Design principle:** The wallet enhances. It never penalises. GitHub alone produces a complete profile. GitHub + wallet produces a reinforced profile. Wallet alone produces a credentialed web3 profile. All three modes are first-class.

### 8.1 Who This Covers

The original Stage 3 design implicitly optimised for smart contract developers who deploy with their own wallet. That is a minority of the Solana developer population.

| Developer Type | GitHub Signal | Wallet Signal |
|---|---|---|
| Smart contract dev (own wallet) | Rust repos, anchor-lang topics | Program upgrade authority ✦ |
| Smart contract dev (company wallet) | Rust repos, anchor-lang topics | No wallet signal, GitHub only |
| Protocol contributor | PRs into Solana core, Anchor, Metaplex | Typically none |
| SDK / tooling developer | TypeScript/Rust, solana deps in manifests | Typically none |
| Frontend / dApp developer | TS repos, @solana/web3.js in package.json | Possibly achievement NFTs |
| Infrastructure / validator | Systems Rust, private repos | Possibly none |

Consequence: the GitHub ecosystem classifier (S9, S10) and stack fingerprint (S13) do the heavy lifting for most web3 developers. The wallet layer is additive.

### 8.2 What Was Cut and Why

| Cut | Reason |
|---|---|
| EVM / viem integration | Adds an entire second chain for zero Solana-specific signal |
| SPL token activity | Financial behaviour. Tells a recruiter nothing about what was built |
| Transaction volume / counts | Gameable. No correlation with developer ability |
| DeFi / swap / NFT financial history | Financial noise |
| Solana Attestation Service | Near-zero adoption in 2025. Revisit Stage 5 |
| Superteam member NFT | Membership ≠ delivered work |
| Hackathon participation NFTs | Participation ≠ winning. Indistinguishable from bulk submissions |
| Superteam API dependency | No stable public API exists. NFT whitelist is more reliable |

### 8.3 Signal Set, Stage 3 Additions

#### S9, Ecosystem Identity

Computed from existing repo topics (S6 already fetches these) and repo descriptions. Zero new API calls.

```typescript
const SOLANA_TOPICS = [
  'solana', 'anchor', 'anchor-lang', 'solana-program',
  'spl-token', 'metaplex', 'web3js', 'program-derived-address',
  'solana-web3', 'coral-xyz', 'helius', 'jito', 'drift'
];

const ecosystemIdentity = repos.some(r =>
  r.topics.some(t => SOLANA_TOPICS.includes(t))
) ? 'solana' : null;
```

Output: `"solana" | null`. Binary. Not a score.

#### S10, Ecosystem Contribution Credibility

Computed from existing S5 external PR data cross-referenced against a curated list of canonical Solana ecosystem repositories. Zero new API calls.

```typescript
const SOLANA_ECOSYSTEM_REPOS = [
  'solana-labs/solana',
  'coral-xyz/anchor',
  'metaplex-foundation/mpl-token-metadata',
  'jito-foundation/jito-solana',
  'helius-labs/helius-sdk',
  'orca-so/whirlpools',
  'drift-protocol/protocol-v2',
  'openbook-dex/openbook-v2',
  'solana-developers/program-examples',
  'solana-developers/solana-cookbook',
  // ~20 total, manually curated, quarterly review
];

const ecosystemPRs = externalPRs.filter(pr =>
  SOLANA_ECOSYSTEM_REPOS.includes(pr.repo)
).length;
```

Output: integer. Increments `externalContributions` in Impact and adds an ecosystem note to the summary.

#### S11, On-Chain Program Ownership + Traction

One Solana RPC call. Cached 7 days.

```typescript
// Programs owned by wallet
const programs = await connection.getParsedProgramAccounts(
  BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
  { filters: [{ memcmp: { offset: 13, bytes: walletAddress } }] }
);

// Traction: unique fee payers (not raw tx count)
// Cap at 500 signatures per program
const sigs = await connection.getSignaturesForAddress(programId, { limit: 500 });
const uniqueCallers = new Set(sigs.map(s => s.feePayer)).size;
const isActive = sigs.some(s => s.blockTime > Date.now()/1000 - 90*86400);
```

Output per program: `{ programId, deployedAt, isActive, uniqueCallers }`.

Unique callers are used instead of transaction counts because transaction volume is trivially gameable. 200 distinct wallets calling a program is meaningful; 50,000 transactions from 3 bots is not.

#### S12, Ecosystem Achievements

Two curated whitelists. NFT parsing by known minters. No external API dependency.

**Colosseum Hackathon Wins:**
- Fetch NFTs held by the wallet via `getAssetsByOwner` (Helius DAS API or equivalent)
- Filter against `whitelists/colosseum-mints.json`, winner mint authorities only
- Participation NFTs explicitly excluded
- Output: `[{ type: "hackathon_win", source: "colosseum", label, year }]`

**Superteam Bounty Completions:**
- Same NFT scan, filter against `whitelists/superteam-mints.json`, completion credential mints
- Output: `[{ type: "bounty_completion", source: "superteam", label, year }]`

Both whitelists are JSON files in the repository, versioned, reviewed quarterly.

### 8.4 Stack Fingerprint Signal

#### S13, Stack Fingerprint

Computed from root-level `package.json` and/or `Cargo.toml` across owned repos. Dependency keys only, no values, no lock files, no transitive dependencies.

The fetcher reads one file per repo. It extracts the keys from `dependencies` and `devDependencies` (package.json) or `[dependencies]` (Cargo.toml) and passes them to the classifier.

**Tool detection map (illustrative, not exhaustive):**

| Detected Dependency | Tag |
|---|---|
| `@coral-xyz/anchor`, `anchor-lang` | Anchor |
| `@solana/web3.js` | Solana web3.js |
| `bullmq`, `bull` | BullMQ |
| `kafkajs`, `kafka-node` | Kafka |
| `amqplib`, `rhea` | RabbitMQ |
| `@aws-sdk/*`, `aws-sdk` | AWS |
| `@clickhouse/client`, `clickhouse` | ClickHouse |
| `@graphprotocol/graph-ts` | The Graph |
| `hardhat`, `@nomicfoundation/hardhat-*` | Hardhat |
| `@foundry-rs/*`, (Cargo: `forge-std`) | Foundry |
| `prisma`, `@prisma/client` | Prisma |
| `typeorm` | TypeORM |
| `redis`, `ioredis` | Redis |
| `pg`, `postgres` | PostgreSQL |
| `mongoose` | MongoDB |
| `docker` topics / `Dockerfile` present | Docker |

**Output:**
```json
{
  "languages": ["Rust", "TypeScript", "Python"],
  "tools": ["Anchor", "BullMQ", "AWS", "Docker", "PostgreSQL"]
}
```

Stack is **display-only** on the recruiter card. It is not a scored dimension. Languages come from S7 (already computed). Tools come from S13 manifest scan. Together they form a factual stack fingerprint, what the developer demonstrably uses, inferred without asking them.

### 8.5 How Signals Merge

No new top-level scoring dimensions are added. Wallet and ecosystem signals feed into existing dimensions or surface as the `web3` and `stack` blocks.

| Signal | Maps To | Effect |
|---|---|---|
| S9 Ecosystem identity | Summary + recruiter card tag | Adds "Solana ecosystem" label if detected |
| S10 Ecosystem PRs | Impact → externalContributions | Increments count; adds ecosystem note in summary |
| S11 Program ownership | Ownership → deployedPrograms | New count field |
| S11 Rust + deployed programs | Capabilities → backend confidence | Upgrades backend confidence one tier |
| S11 Active programs + callers | Impact → activityLevel | Active programs with unique callers can upgrade activityLevel |
| S12 Achievements | web3.achievements block | Verifiable credentials, not a score |
| S13 Stack fingerprint | stack block (display only) | Languages + tools shown on recruiter card |

**Confidence upgrade rules, wallet can only upgrade, never downgrade:**

| GitHub State | Wallet Present | Result |
|---|---|---|
| Sparse repos + high consistency | Programs deployed | Confidence upgrades to medium; private work note updated |
| Strong Rust GitHub profile | Programs deployed | Backend confidence upgrades one tier |
| TypeScript dApp repos | Achievements present | Summary notes full-stack web3 capability |
| Strong profile | No wallet provided | No change, profile is complete |
| No GitHub | Programs + achievements | Wallet-only profile, confidence low-medium, clearly surfaced |

### 8.6 Three-Mode Operation

All three input combinations produce a valid, complete profile. No mode is a degraded fallback.

| Mode | Input | Profile Contains |
|---|---|---|
| GitHub only | `githubUsername` | Full S1–S8 profile + S9/S10 ecosystem signals if detected + S13 stack fingerprint |
| GitHub + Wallet | `githubUsername` + `walletAddress` | Full profile + all 4 wallet signals + web3 credentials block + confidence upgrades |
| Wallet only | `walletAddress` | S11 program ownership + S12 achievements. Capabilities inferred from program type. Confidence low-medium, clearly surfaced. |

### 8.7 Unified Scoring Layer

```
[ GitHub Signals S1–S10, S13 ]    [ Solana Signals S11–S12 ]
              ↘                              ↙
         [ Web3 Merge Service ]
         Capabilities / Ownership / Impact
         (confidence modifier from both sources)
                      ↓
             [ Same result schema ]
             [ Same recruiter card ]
```

---

## 9. Key Database Models

| Model | Key Fields | Purpose |
|---|---|---|
| AnalysisJob | id, status, stage, percentage, input (Json), result (Json), userId?, createdAt, updatedAt | Source of truth for every analysis |
| User | id, email, role, accountStatus | Optional; links to attached jobs |
| GithubProfile | githubUsername, encryptedToken (AES-256-GCM), syncStatus, rawDataSnapshot (Json) | GitHub OAuth token encrypted at rest; raw fetch cache |
| Web3Profile | solanaAddress?, onChainMetrics (Json) | Opt-in; format validation only (base58 check); no signature proof required |
| CachedResult | cacheKey (username + optional wallet), result (Json), expiresAt | 24h TTL cache; checked before enqueue |

---

## 10. Environment Variables

| Variable | Description |
|---|---|
| DATABASE_URL | PostgreSQL connection string |
| REDIS_URL | Redis connection string |
| GITHUB_CLIENT_ID | GitHub OAuth app client ID |
| GITHUB_CLIENT_SECRET | GitHub OAuth app client secret |
| GITHUB_SYSTEM_TOKEN | System-level token for headless analysis |
| JWT_SECRET | JWT signing secret |
| JWT_REFRESH_SECRET | JWT refresh token secret |
| INTERNAL_API_KEY | X-Internal-Key for headless scorecard endpoint |
| SENTRY_DSN | Sentry error tracking DSN |
| SOLANA_RPC_URL | Solana RPC endpoint, Stage 3 |
| HELIUS_API_KEY | Helius DAS API key for NFT scanning, Stage 3 |

---

## 11. Verification Plan

| Stage | Test | Expected | Version |
|---|---|---|---|
| 2 | Signal extraction | All 8 signals return valid values for 5 seed usernames | v2 refactor |
| 2 | Capability scoring | Backend/Frontend/DevOps scores correlate with known developer profiles | v2 refactor |
| 2 | Confidence modifier | Developer with < 5 repos returns confidence: "low" across all dimensions | v2 refactor |
| 2 | Cache hit | Second request for same username returns immediately without re-queuing | v2 refactor |
| 2 | Cache miss | New username triggers full pipeline and sets cache on completion | v2 refactor |
| 2 | Headless API | POST /analysis with seed username returns correct result schema | v2 refactor |
| 2 | Private-heavy profile | Developer with high consistency + sparse repos gets confidence: "low" with private work note | v2 refactor |
| 2 | Zero public data | Pipeline fails gracefully; job status: failed with clear reason | v2 refactor |
| 3 | S9 Ecosystem detection | GitHub-only Solana dev with anchor topics → ecosystemIdentity: "solana" | v3 |
| 3 | S10 Ecosystem PRs | Dev with merged PR into coral-xyz/anchor → ecosystemPRs > 0 | v3 |
| 3 | S10 Non-ecosystem PR | Dev with external PR into unrelated repo → ecosystemPRs: 0 | v3 |
| 3 | S13 Stack fingerprint | Repo with bullmq in package.json → tools includes "BullMQ" | v3 |
| 3 | S13 Cargo detection | Rust repo with anchor-lang → tools includes "Anchor" | v3 |
| 3 | Three-mode routing | POST /analysis with walletAddress only → valid job, wallet-only processor | v3 |
| 3 | Input validation | POST /analysis with neither field → 400 error | v3 |
| 3 | Invalid wallet format | Non-base58 walletAddress → 400 error with clear message | v3 |
| 3 | S11 Program ownership | Known wallet with deployed programs → ownership.deployedPrograms count correct | v3 |
| 3 | S11 Traction | Active program → isActive: true, uniqueCallers populated | v3 |
| 3 | S11 Confidence upgrade | Rust GitHub + deployed programs → backend confidence upgrades one tier | v3 |
| 3 | S11 RPC timeout | Solana RPC unavailable → job completes with GitHub signals only, no failure | v3 |
| 3 | S12 Colosseum NFT | Wallet with Colosseum winner NFT → achievements contains hackathon_win entry | v3 |
| 3 | S12 Superteam NFT | Wallet with Superteam completion NFT → achievements contains bounty_completion entry | v3 |
| 3 | S12 No achievements | Wallet with no whitelisted NFTs → achievements: [] | v3 |
| 3 | Wallet-only no footprint | Wallet with no programs and no NFTs → job fails gracefully with clear reason | v3 |
| 3 | Full pipeline benchmark | GitHub + wallet, cache miss → total < 12s | v3 |
| 3 | Cache hit with wallet | Second request for same username + wallet → returns immediately | v3 |
| All | Coverage | ≥ 80% via jest --coverage | all |
| All | CI | lint → tsc --noEmit → prisma validate → jest → jest:e2e on every PR | all |

---

## 12. Development Roadmap

> Stages 1 and 2 are built. The roadmap continues from Stage 2's scoring refactor. Each stage extends the system progressively without redesigning what came before.

### Stage 3, Web3 / Solana Layer + Stack Fingerprint

This is an extension, not a rebuild. The API contract, job service, queue infrastructure, and Stage 2 scoring logic are not changing. Four new signals are added (two from existing GitHub data, two from the wallet). A stack fingerprint is added to the recruiter card. Three-mode input is introduced.

**What does not change:**
- POST /analysis, GET /analysis/:id/status, GET /analysis/:id/result API contract
- Stage 2 result schema fields, all existing fields, names, and types are frozen
- BullMQ queue infrastructure and processor structure
- GitHub data fetcher, only extended with manifest read, nothing removed
- S1–S8 signal extraction and scoring logic

**Phase 1, Ecosystem Classifier (zero new infrastructure)**

Deliverable: S9 + S10 live. Web3 developers get ecosystem tagging and ecosystem PR recognition from existing data with no new API calls.

- Define `SOLANA_TOPICS` constant in signal-extractor module
- Build `EcosystemClassifierService`, takes existing repo list + external PR list, returns `{ ecosystemIdentity, ecosystemPRs }`
- Wire S9 result into summary generator, add "Solana ecosystem developer" language when detected
- Wire S10 into `externalContributions`, increment count + add note distinguishing ecosystem PRs
- Extend locked schema TypeScript interface with optional `web3` block (null by default)
- Unit tests: protocol contributor (Anchor PRs, no wallet), dApp dev (web3.js repos, no wallet), non-web3 dev

**Phase 2, Stack Fingerprint (S13)**

Deliverable: Stack section live on recruiter card. Languages + detected tools shown for all profiles.

- Extend GitHub fetcher: read root `package.json` and `Cargo.toml` per repo, dependency keys only
- Build `StackFingerprintService`, takes dependency key lists, returns `{ languages, tools }`
- Maintain tool detection map as a typed constant (see Section 8.4)
- Wire S13 output into `stack` block in result schema
- Stack block is display-only, wire into card renderer, not into any scoring logic
- Unit tests: repo with BullMQ → tools includes "BullMQ"; Rust repo with anchor-lang → tools includes "Anchor"; repo with no recognisable deps → tools: []
- Benchmark: manifest fetch adds < 1s to total pipeline time

**Phase 3, Three-Mode Input & Job Routing**

Deliverable: API accepts all three input modes. Routing logic dispatches to correct fetcher combination.

- Extend POST /analysis body schema: `{ githubUsername?, walletAddress? }`, at least one required
- Add input validation: Solana base58 address format check on `walletAddress`
- Add job routing in `analysis.processor`: `github-only | github+wallet | wallet-only`
- Wallet-only mode: skip GitHub fetcher entirely; signal extractor receives null for S1–S10
- Extend `AnalysisJob` Prisma schema: add `walletAddress` field (optional string)
- Extend cache key logic to include `walletAddress` when present
- Integration tests: verify all three input modes reach correct processor branch

**Phase 4, On-Chain Program Ownership + Traction (S11)**

Deliverable: Program ownership and traction live. Wallet-only profiles produce valid output. Confidence upgrade rules active.

- Install/confirm `@solana/web3.js` in package.json
- Build `SolanaAdapterService`:
  - `fetchProgramsByAuthority(walletAddress)`, getProgramAccounts filtered by upgrade authority offset 13
  - `fetchProgramTraction(programId)`, getSignaturesForAddress capped at 500, deduplicate feePayer, return `{ uniqueCallers, isActive }`
- Wire program ownership count into `ownership.deployedPrograms`
- Implement confidence upgrade rules in `Web3MergeService`: Rust stack + deployed programs → backend confidence +1 tier
- Wire active programs with callers into activityLevel upgrade consideration
- Redis cache with 7d TTL keyed by walletAddress
- Graceful failure: RPC timeout → log, continue, wallet signals null, GitHub profile unaffected
- Unit tests: wallet with programs, wallet with no programs, RPC timeout handling

**Phase 5, Achievement Signals (S12)**

Deliverable: Colosseum wins and Superteam bounty completions surface as verifiable credentials.

- Build `AchievementWhitelistService`, loads `colosseum-mints.json` and `superteam-mints.json` from config
- Seed initial whitelists with known Colosseum winner and Superteam completion credential mint authorities
- Build NFT scan: `getAssetsByOwner` via Helius DAS API → filter against whitelists → extract label + year from metadata
- Wire achievements into `web3.achievements` array in result schema
- Extend `SummaryGenerator` to include achievement language where present
- Document quarterly whitelist review process in README
- Unit tests: wallet with Colosseum NFT, wallet with Superteam NFT, wallet with neither

**Phase 6, Validation**

Deliverable: End-to-end validated across all three modes and all new signals.

- End-to-end tests on 5 seed profiles: GitHub-only web3 dev, GitHub + wallet smart contract dev, wallet-only dev with programs, GitHub-only non-web3 dev, sparse profile with achievements
- Manual review of generated summaries for 10 diverse real Solana profiles
- Verify confidence upgrade rules produce correct output across all mode combinations
- Verify wallet-only profile with zero developer footprint fails gracefully with clear reason
- Benchmark: full GitHub + wallet analysis < 12s on cache miss (fetchers run in parallel)
- Cache hit verification: second request for same username + wallet returns immediately

**Deliverable:** Wallet-linked analysis live. GitHub + Solana signals merge into same result schema. Stack fingerprint on all cards. Three-mode input supported. Same recruiter card format.

---

### Stage 4, CV Replacement & Decision Layer

- `DecisionCardGenerator`, PROCEED / REVIEW / REJECT based on capability scores + confidence levels
- `GapAnalysisEngine`, runs at apply-time against a job description; DEALBREAKER / SIGNIFICANT / MINOR severity
- `JobDescriptionParser`, Google API; extracts required capabilities and stack; HR confirmation before saving
- `InterviewProbeLibrary`, STAR-format questions generated from gap severity; mandatory for DEALBREAKERs
- `ApplicationsModule`, POST /api/jobs/:id/apply → freeze DecisionCard + GapReport at apply time
- HR Application Views, ranked list with DecisionCard + summary card; full detail with GapReport + interview probes
- Candidate self-gap view, GET /api/me/gap-preview?jobId=:id, sees gaps without interview probes
- Rescore queue, triggered on job description weight change
- AI-generated summaries replace rule-based SummaryGenerator (Stage 4 enhancement, not MVP)

**Deliverable:** Full CV replacement loop. HR sees DecisionCard first. STAR-format probes live.

---

### Stage 5, Outcomes, ROI & Fairness

- `HireOutcome`, POST /api/outcomes; capture decision snapshot + 90-day performance rating
- Calibration analytics, capability score → performance correlation; which signals predict real outcomes
- ROI dashboard, GET /api/hr/orgs/:orgId/roi; cold-start shows industry benchmarks
- Fairness report, pass/reject rate by confidence tier; score distribution by ecosystem; contestation volume
- GDPR deletion, DELETE /api/me hard delete; soft anonymise applications; flush Redis
- Load test (k6): 100 concurrent analysis events; p95 < 2.5s
- Solana Attestation Service integration, revisit if adoption has grown sufficiently
- @sentry/node initialised; correlationId via AsyncLocalStorage; BullMQ duration_ms logging

**Deliverable:** Feedback loop live. GDPR compliant. Fairness reporting. ROI dashboard operational.

---

### Stage 6, ATS & Commercial

- ATS connectors, Greenhouse (OAuth 2.0, two-way), Lever (OAuth 2.0, two-way), Workday (OAuth/SOAP push)
- POST /api/hr/orgs/:orgId/ats/connect, OAuth flow
- POST /api/hr/orgs/:orgId/ats/sync, manual sync trigger
- Multi-tenancy load test: 20 concurrent orgs; RLS isolation verified under load
- GDPR DPA endpoint, DELETE /api/admin/orgs/:orgId permanently removes all applicant data on DPA termination
- E2E test suite: full analysis → gap report → DecisionCard → ATS sync → ROI → fairness

**Deliverable:** ATS-integrated commercial product. Multi-tenant verified. Commercially ready.

---

## 13. Success Metrics

| Metric | Target | What It Validates |
|---|---|---|
| Developer agreement rate: % who agree their scorecard is fair | > 80% in 30d | Capability inference is accurate; confidence qualifiers are honest |
| Recruiter time-to-decision | 50% reduction vs. CV review baseline | Output is actionable without additional investigation |
| Capability score correlation with hire outcome | Statistically significant | Scores predict real ability, not GitHub activity volume |
| Average analysis time (cache miss) | < 10s GitHub only / < 12s GitHub + wallet | Lightweight fetcher is sufficient; pipeline is not over-engineered |
| Profile share rate: % who actively share Colosseum profile | > 40% | Candidates perceive the profile as a net positive CV replacement |
| Cache hit rate after first wave of users | > 60% | Cache is serving real traffic and protecting GitHub API limits |
| Confidence qualifier accuracy | Statistically significant | The confidence system is calibrated, it accurately signals uncertainty |
| Zero-effort rate: % of profiles generated with no candidate input | 100% | The zero-manual-input goal is maintained end to end |
| Web3 developer ecosystem recognition rate | > 90% of Solana devs correctly tagged | S9/S10 ecosystem classifier covers the full developer population |
| Stack fingerprint accuracy | < 5% false positive tool detection | Manifest scan is tight enough; no noise introduced by over-matching |

### The Honest Ceiling

A 10/10 hiring tool would correctly predict developer performance in every context. That ceiling is not achievable from GitHub and on-chain signals alone, and claiming otherwise would be dishonest. The system cannot assess system design thinking, communication quality, cultural alignment, or management capability. The confidence qualifier layer makes this clear in every output. A system that is honest about its limits and accurate within them is more valuable than one that overclaims.