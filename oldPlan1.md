## 3. Architecture

### 3.1 Architecture Decision Records

| ADR | Decision | Rationale |
|---|---|---|
| ADR001 | Modular monolith (NestJS modules) | Clean domain boundaries; extract to microservices later without redesign |
| ADR002 | BullMQ on Redis for async analysis | GitHub data fetch is 3–10s per profile; sync is infeasible |
| ADR003 | AnalysisJob is the source of truth | Not users, not sessions — the job anchors the entire system |
| ADR004 | No role-based scoring | Requires user input; self-reports are inaccurate; hybrid developers break classification |
| ADR005 | Confidence is an inline modifier, not a peer score | A recruiter needs "backend: 82 (high confidence)", not "confidence: 72" as a standalone number |
| ADR006 | Collaboration is Impact, not a Capability | Collaboration is a behavioral signal. Backend / Frontend / DevOps are technical skills. These are different categories |
| ADR007 | 8 GitHub signals maximum | Diminishing returns beyond this; each additional signal adds noise, maintenance cost, and explainability loss |
| ADR008 | No deep commit or diff parsing | Commit counts and lines of code are noisy and gameable; contribution graph summary is sufficient |
| ADR009 | 24h result cache by username | Protects GitHub API rate limits; critical for demo reliability |
| ADR010 | Output schema locked before scoring logic is written | The schema is the contract; all layers build toward it |
| ADR011 | Lightweight fetcher only — no deep repo analysis at MVP | Repo list + contribution graph + external PRs covers all 8 signals without deep parsing |
| ADR012 | Headless analysis API callable without user account | Testing and CI pipelines decouple from the user session layer |
| ADR013 | Wallet address extends the same job input | No redesign needed when Solana signals are added — same AnalysisJob, same schema |
| ADR014 | Summary is rule-based at MVP, not AI-generated | Template-driven summaries are consistent, auditable, and fast. AI generation is a Stage 4 enhancement |
| ADR015 | Progress stages defined before queue implementation | Stages must map 1:1 to UI messages; define them once, use them everywhere |
| ADR016 | No EVM integration | Adds an entire second chain for zero Solana-specific signal. Revisit if product expands to multi-chain |
| ADR017 | Unique callers over transaction count for program traction | Transaction counts are trivially gameable. Unique fee payers require real distinct users |
| ADR018 | Achievement whitelist is a curated JSON config, not a DB table | Small, changes infrequently, benefits from code review and version history. DB adds overhead with no benefit |
| ADR019 | Superteam achievement detection via NFT whitelist, not API | No stable public API exists. NFT parsing by known minters is more reliable and requires no external dependency |
| ADR020 | Wallet signals can only upgrade confidence, never downgrade | Absence of a wallet is not negative signal. Many strong developers have no on-chain footprint |
| ADR021 | Wallet-only mode is first-class, not a fallback | Some web3 developers have minimal public GitHub. Their on-chain work is their CV |
| ADR022 | Ecosystem classifier runs on existing fetched data — no new GitHub API calls | Topics and PR repo names are already fetched. The classifier is a filter, not a fetcher |
| ADR023 | 7d cache TTL for Solana program data | Programs deploy slowly; upgrade authority transfers are rare |
| ADR024 | Stack fingerprint reads only dependency keys, not values or lock files | Enough to detect tooling presence; avoids the cost and noise of parsing full manifests |
| ADR025 | Stack fingerprint is display-only on recruiter card, not a scored dimension | Tooling presence is factual, not evaluative. Scores are for capabilities, counts for ownership, descriptors for impact |

### 3.2 System Architecture Pipeline

```
[ POST /analysis ]  ←  { githubUsername?, walletAddress? }  (at least one required)
↓
[ AnalysisJob created → jobId returned ]
↓
[ Cache check — hit? → return cached result immediately ]
↓ (cache miss)
[ BullMQ queue → analysis.processor ]
↓
┌──────────────────────────────────────────┐  ┌──────────────────────────────────────────┐
│ GitHub Data Fetcher (if githubUsername)  │  │ Solana Adapter (if walletAddress)        │
│ · User profile                           │  │ · getProgramAccounts by upgrade authority│
│ · Repo list: name, language, stars,      │  │ · getSignaturesForAddress (traction)     │
│   forks, topics, created_at, pushed_at,  │  │ · getAssetsByOwner (DAS — NFT scan)      │
│   is_fork, description                   │  │ · Filter against achievement whitelists  │
│ · Root manifest scan: package.json +     │  └──────────────────────────────────────────┘
│   Cargo.toml — dependency keys only      │
│ · Contribution graph (weekly summary)    │
│ · External PR contributions (count +     │
│   repo names)                            │
└──────────────────────────────────────────┘
↓
[ Signal Extractor — 12 signals total ]
  GitHub signals (S1–S8, existing):
    S1  Ownership depth
    S2  Project longevity
    S3  Activity consistency
    S4  Tech stack breadth
    S5  External contributions
    S6  Project meaningfulness
    S7  Stack identity
    S8  Data completeness
  Ecosystem signals (S9–S10, new — GitHub data, no new fetches):
    S9  Ecosystem identity
    S10 Ecosystem contribution credibility
  Wallet signals (S11–S12, new — optional):
    S11 On-chain program ownership + traction
    S12 Ecosystem achievements (Colosseum wins + Superteam bounties)
  Stack signal (S13, new — lightweight manifest read):
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
[ Summary Generator — rule-based 1–2 sentence description ]
↓
[ Result stored → cache set → job marked complete ]
↓
[ GET /analysis/:jobId/result ]
```

---

## 4. Scoring Model — Capability-Based Engine

### 4.1 Design Principles

**Capability-based, not role-based.** Strengths are inferred automatically. The user selects nothing.

**Describe, do not classify.** Output strengths and patterns. Do not force a developer into a single label.

**High-signal only.** Ownership, project longevity, consistency, and meaningful contributions. Not commit counts, lines of code, or repo complexity.

**Simple and explainable.** Every score must be explainable in one sentence.

**Confidence as a modifier.** Confidence qualifies each dimension inline. It is not a separate dimension.

**Fast and scalable.** No deep repo parsing. Lightweight fetcher only.

**Wallet-compatible.** Schema designed to absorb Solana signals without structural change. The wallet enhances — it never penalises.

### 4.2 Signal Set — 8 High-Signal Inputs (GitHub)

| # | Signal | Computed From | Why It Matters |
|---|---|---|---|
| S1 | Ownership depth | Non-fork repos owned, maintained > 3 months | Distinguishes real work from clones and toy experiments |
| S2 | Project longevity | Average age of actively maintained repos | Signals commitment vs. short-lived projects |
| S3 | Activity consistency | Contribution graph: active weeks / 52 | Sustained pattern of work over time — not raw commit volume |
| S4 | Tech stack breadth | Unique languages across owned repos | Generalist vs. specialist; feeds capability inference |
| S5 | External contributions | PRs merged into repos not owned by user | Collaboration quality and real-world credibility |
| S6 | Project meaningfulness | Stars + forks + topic tags on owned repos | Evidence that others found the work useful |
| S7 | Stack identity | Top 2 languages by repo count and bytes written | Primary build environment — primary driver of capability scoring |
| S8 | Data completeness | Public repo count, contribution visibility, account age | Confidence modifier applied inline to each dimension |

### 4.3 Capability Scoring

Capability scores (0–100) are inferred from S7 (stack identity) and S4 (tech stack breadth). A developer can score high on multiple capabilities — no single label is forced.

| Capability | Primary Language Signals | Secondary Signals |
|---|---|---|
| Backend | Python, Go, Rust, Java, Node.js, PHP, Ruby | API-topic repos, database configs, server-side frameworks |
| Frontend | TypeScript, JavaScript with UI topics, CSS | React/Vue/Svelte/Angular repos, CSS-heavy repos, UI component topics |
| DevOps | Shell, HCL, YAML-dominant repos | Docker, Kubernetes, CI/CD configs, infra topics, Terraform |

Each capability score carries an inline confidence qualifier (low / medium / high) derived from S8. In Stage 3, wallet signals (S11) can reinforce capability scoring — a Rust-heavy GitHub profile with deployed Solana programs upgrades backend confidence one tier.

### 4.4 Ownership Scoring

Ownership is expressed as counts, not a weighted score. Recruiters can read counts directly.

- `ownedProjects` — count of non-fork repos maintained > 3 months (S1)
- `activelyMaintained` — count of repos with a push in the last 6 months (S2)
- `deployedPrograms` — count of Solana programs where wallet holds upgrade authority (S11, optional)
- `confidence` — derived from S8

### 4.5 Impact Scoring

Impact uses qualitative descriptors rather than a 0–100 score.

- `activityLevel` — high / medium / low — from S3 (active weeks / 52)
- `consistency` — strong / moderate / sparse — from S3 trend over time
- `externalContributions` — count of PRs merged into external repos — from S5 + S10 (ecosystem PRs increment this count)
- `confidence` — derived from S8

Collaboration (external contributions) sits here under Impact. It is a behavioral signal, not a technical skill.

### 4.6 Confidence — Inline Modifier, Not a Peer Score

Confidence is not a top-level dimension. It is a qualifier that travels with each dimension. The value comes from S8 (data completeness). In Stage 3, cross-source agreement between GitHub and wallet signals can upgrade confidence — but wallet signals can never downgrade it.

```json
// Correct
{ "backend": { "score": 82, "confidence": "high" } }

// Incorrect — confidence as a peer score adds nothing
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
|

### 4.8 What Was Removed and Why

| Removed | Reason |
|---|---|
| Role-based scoring | Requires user input; self-reports are inaccurate; hybrid developers break it |
| Commit count as primary metric | Gameable; no meaningful correlation with hiring decisions |
| Lines of code | The most gameable metric available; conveys nothing about quality |
| Repo complexity scoring | Expensive to compute; poorly defined; no recruiter interpretability |
| PR/issue micro-metrics | Simplified into S5 external contributions count |
| Time decay functions | Replaced by S3 activity consistency — simpler and more intuitive |
| Collaboration as a Capability | Collaboration is behavioral; moved to Impact as externalContributions |
| Confidence as a top-level score | Restructured as an inline modifier |
| Deep commit and diff parsing | Not needed; all signals compute from repo metadata and contribution graph |

---

## 5. Output Format

### 5.1 Result Schema

This schema is locked. All scoring logic builds toward this contract.

```json
{
  "summary": "string — 1–2 sentence plain-English description of primary strengths",

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
  "userId":    "optional — attached on auth",
  "createdAt": "ISO timestamp",
  "updatedAt": "ISO timestamp"
}
```

### 5.3 Recruiter Card — Example Output

```
Alex Chen — GitHub + Solana Wallet

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

### 6.2 Data Fetcher — Lightweight Only

The fetcher pulls only what the signals need. No deep analysis.

**GitHub — fetched:**
- User profile (account age, public repo count, followers)
- Repo list per repo: `name`, `language`, `stars`, `forks`, `topics`, `created_at`, `pushed_at`, `is_fork`, `description`
- Root manifest: `package.json` and/or `Cargo.toml` — dependency keys only, no values, no lock files
- Contribution graph — weekly summary (active weeks count)
- External PR contributions — count and repo names only

**GitHub — not fetched:**
- Commit-level data
- Diff or line-count data
- README content
- Per-file language breakdown
- Full manifest values, lock files, or nested dependencies

**Solana — fetched (if walletAddress provided):**
- Programs where wallet holds upgrade authority (`getProgramAccounts` on BPF_LOADER_UPGRADEABLE_ID)
- Per program: first slot timestamp, recent signature sample for traction (capped at 500)
- NFT holdings via `getAssetsByOwner` (Helius DAS API or equivalent) — filtered against whitelists

**Solana — not fetched:**
- Token balances
- Transaction history beyond traction sample
- DeFi / swap / NFT financial activity
- Any EVM data
