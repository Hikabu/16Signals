# Colosseum v5 — Complete Rewrite Prompt Library
## Architecture · Schema · Roadmap · All Prompts with Full Context

**Document version:** v5.0 · May 2026  
**How to use:** Work through phases in order. Each section is self-contained — the context, architecture notes, and prompts you need are all in one place. Never scroll back. When using an LLM agent, paste the phase intro + the specific prompt block.

---

## QUICK REFERENCE: Model Assignments

| Phase | Task | Model | Reason |
|---|---|---|---|
| 0.1–0.3 | Pre-build human steps | Human | Credentials / binary install |
| 0.4–0.5 | Type definitions | **Gemini** | Large spec → declarative types |
| 0.6 | Env schema | **Claude** | Small, precise constraint extension |
| 1.1 | Light fetcher | **Gemini** | Multi-group + octokit, large context |
| 1.2 | Rate limit service | **Claude** | State machine with hard thresholds |
| 1.3 | External signal service | **Claude** | Multiple API clients, precise error handling |
| 1.4 | Group mapper | **Gemini** | Big data structure mapping |
| 2.1–2.6 | P1–P6 primitives | **Claude** | Rule logic, spec adherence, thresholds |
| 2.7–2.10 | Supporting services bundle | **Claude** | Small, precise, hard rules |
| 3.1 | Brief assembler | **Gemini** | Holds all 7 sections simultaneously |
| 3.2 | Employment verification | **Claude** | Rung logic + mandatory output language |
| 3.3 | Interview probe generator | **Claude** | Template logic with conditional rules |
| 3.4 | Light analysis processor | **Claude** | Pipeline orchestration + error handling |
| 3.5 | API endpoints | **Claude** | NestJS controllers with validation |
| 3.6 | Integration tests (pipeline) | **Codex** | Test boilerplate generation |
| 3.7 | Section G assertion tests | **Codex** | Assertion patterns |
| 4.1–4.3 | Anti-gaming bundle | **Gemini** | Three algorithms, shared data context |
| 4.4 | Repo laundering | **Claude** | External API + precise error handling |
| 4.5–4.8 | Credential + wiring | **Claude** | Conditional hard-stop logic |
| 4.9 | Anti-gaming tests | **Codex** | Edge case test boilerplate |
| 5.1–5.5 | LLM client + prompts | **Claude** | Prompt engineering precision |
| 5.6–5.7 | LLM signal merger | **Claude** | Conditional wiring + fallback |
| 5.8 | LLM integration tests | **Codex** | Mock + assertion patterns |
| 6.1 | Evaluation link module | **Gemini** | GitHub App OAuth flow, large context |
| 6.2–6.3 | Deep fetcher + cloner | **Gemini** | Parallel execution + tool orchestration |
| 6.4–6.7 | Tool wrappers | **Codex** | CLI wrapper bodies, I/O parsing |
| 6.8 | Deep analysis processor | **Gemini** | Full orchestration, parallel tool execution |
| 6.9 | Employment rungs 2+3 | **Claude** | Precise rung upgrade logic |
| 6.10 | Data retention service | **Claude** | In-memory enforcement, purge logic |
| 6.11 | Employer notification | **Claude** | Simple notification service |
| 6.12 | Deep mode integration test | **Codex** | E2E test patterns |
| 7.1 | Job description module | **Claude** | NestJS CRUD + LLM extraction |
| 7.2 | Role stack match | **Claude** | Typed matching logic |
| 7.3 | Gap analysis probes | **Claude** | Conditional interview probe extension |
| 7.4 | JD intent extractor | **Claude** | Prompt engineering for beyond-keyword extraction |
| 7.5 | Section F wiring | **Claude** | Brief assembler extension |
| 8.1 | Hire outcome endpoint | **Codex** | Simple CRUD, mechanical |
| 8.2 | Anti-gaming calibration hook | **Claude** | Schema + correlation queries |
| 8.3 | GDPR deletion | **Claude** | Cascade delete with soft-anonymise |
| 8.4 | Load test suite | **Codex** | k6 script generation |
| 8.5 | LLM batch manager | **Claude** | Token budget optimisation |
| 8.6 | Cache hit verification tests | **Codex** | Cache assertion patterns |
| 8.7 | Sentry wiring | **Claude** | Error tracking integration |
| 8.8 | Full E2E test suite | **Codex** | 5 profiles × 2 modes test generation |

---

## GUIDING PRINCIPLES FOR THIS REWRITE

1. **Schema first** — lock the output contract before writing any scoring logic
2. **Fetcher before scorer** — you can't score what you can't fetch
3. **Light Mode before Deep Mode** — faster validation loop, no binary dependency
4. **Anti-gaming after primitives** — flags reference primitive IDs; primitives must exist first
5. **LLM integration after rule-based baseline** — replace rules with LLM calls incrementally
6. **Deep Mode last** — it depends on everything else

---

## SYSTEM ARCHITECTURE OVERVIEW

### What Stays from the Old System
- NestJS + TypeScript + Prisma + PostgreSQL + Redis + BullMQ stack
- GitHub OAuth + JWT auth layer
- `AnalysisJob` as the source of truth (extended, not replaced)
- `@octokit/rest` + `@octokit/graphql` clients
- Module structure: `auth/`, `analysis/`, `admin/`
- Zod env validation, helmet, throttler, pino logging

### New Module Map

```
src/
├── main.ts / app.module.ts
├── config/env.schema.ts                    # EXTENDED — new env vars
├── prisma/prisma.service.ts
├── redis/redis.service.ts
│
├── modules/
│   ├── auth/                               # UNCHANGED
│   ├── analysis/                           # EXTENDED — new endpoints, new job states
│   ├── evaluation-link/                    # NEW — Deep Mode candidate link gen + OAuth flow
│   ├── profile/                            # EXTENDED — employer org config, archetype
│   └── admin/                             # UNCHANGED
│
├── github/                                 # NEW top-level domain
│   ├── light-fetcher/                      # REST + GraphQL, Groups A–G partial
│   ├── deep-fetcher/                       # Clones top-30, runs local tools
│   ├── graphql-client/                     # Batched GraphQL query builder
│   └── rate-limit/                         # Budget tracker + circuit breaker
│
├── tools/                                  # NEW — local binary wrappers (Deep Mode only)
│   ├── scc.service.ts
│   ├── tokei.service.ts
│   ├── gitinspector.service.ts
│   ├── gitleaks.service.ts
│   ├── semgrep.service.ts
│   └── actionlint.service.ts
│
├── signals/                                # REPLACED — old signal-extractor becomes this
│   ├── data-groups/                        # Raw signal grouping A–G
│   ├── primitives/                         # 7 primitive evaluators
│   ├── seniority/                          # Weight table application
│   └── archetype/                          # Role signal emphasis
│
├── anti-gaming/                            # NEW top-level domain
│   ├── commit-inflation.service.ts
│   ├── fork-dumping.service.ts
│   ├── burst-dormancy.service.ts
│   ├── repo-launcher.service.ts
│   └── ai-generation-detector.service.ts
│
├── employment/
│   └── verification-ladder.service.ts     # 3 rungs
│
├── llm/                                    # All LLM calls isolated here
│   ├── llm-client.service.ts
│   ├── commit-quality.prompt.ts
│   ├── pr-depth.prompt.ts
│   ├── ai-generation.prompt.ts
│   └── readme-scorer.prompt.ts
│
├── brief/                                  # Evidence Brief assembler
│   ├── brief-assembler.service.ts
│   ├── confidence-language.service.ts
│   └── interview-probe-generator.service.ts
│
├── queues/
│   ├── light-analysis.processor.ts        # Replaces analysis.processor
│   ├── deep-analysis.processor.ts
│   └── rescore.processor.ts               # UNCHANGED
│
└── shared/
    ├── guards/ decorators/ interceptors/
    └── crypto.util.ts
```

### Data Flow

```
LIGHT MODE
POST /analysis { githubUsername, mode: 'light', seniorityTarget?, archetypeTarget?, jobDescriptionId? }
  → AnalysisJob created (mode=LIGHT)
  → Cache check (key: username:light:seniority:archetype)
  → BullMQ → light-analysis.processor
      ├─ LightFetcherService.fetch(username)         ~60s
      ├─ ExternalSignalService.fetch()               ~15s
      ├─ AntiGamingService.analyzeLight()            ~30s
      ├─ LLMService.analyzeLight()                   ~30s
      └─ BriefAssemblerService.buildBrief()          ~15s
  → Result stored, cache set, job complete
  < 3 min total

DEEP MODE
POST /evaluation-links { candidateEmail, seniorityTarget, archetypeTarget }
  → EvaluationLink created, email sent with GitHub App install link
  → Candidate installs GitHub App (OAuth), grants repo access
  → Webhook: installation event received → Deep AnalysisJob created
  → BullMQ → deep-analysis.processor
      ├─ DeepFetcherService.crawl()                  ~60s
      ├─ RepoClonerService.cloneTop30()              ~5-8m (4 parallel workers)
      ├─ ToolRunnerService.runAll()                  scc+tokei+gitinspector+gitleaks+semgrep
      ├─ ExternalSignalService.fetch()               ~30s
      ├─ EmploymentLadderService.verify()            ~30s (rungs 1–3)
      ├─ AntiGamingService.analyzeDeep()             ~2m
      ├─ LLMService.analyzeDeep()                    ~60s
      └─ BriefAssemblerService.buildBrief()          ~30s
  → Employer notified
  8–15 min total
```

---

## SCHEMA (Prisma Delta — changes from current schema)

```prisma
// ─── EXTENDED ───────────────────────────────────────────────────────────────
model AnalysisJob {
  id               String          @id @default(cuid())
  status           JobStatus       @default(PENDING)
  mode             AnalysisMode    @default(LIGHT)          // NEW
  githubUsername   String?
  walletAddress    String?
  seniorityTarget  SeniorityTier?                           // NEW
  archetypeTarget  RoleArchetype?                           // NEW
  jobDescriptionId String?                                  // NEW — for section F

  progress         Json            @default("{}")
  result           Json?           // EvidenceBrief JSON
  flags            Json?           // NEW — anti-gaming flags array

  userId           String?
  user             User?           @relation(fields: [userId], references: [id])
  evaluationLinkId String?                                  // NEW
  evaluationLink   EvaluationLink? @relation(fields: [evaluationLinkId], references: [id])

  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt
  expiresAt        DateTime?                                // NEW — Deep Mode brief expiry
}

enum AnalysisMode {
  LIGHT
  DEEP
}

enum SeniorityTier {
  INTERN_JUNIOR
  MID
  SENIOR
  STAFF_LEAD
  PRINCIPAL_PLUS
}

enum RoleArchetype {
  BACKEND
  FRONTEND
  PLATFORM_DEVOPS_SRE
  DATA_ML
  SECURITY
  MOBILE
}

// ─── NEW MODELS ─────────────────────────────────────────────────────────────
model EvaluationLink {
  id               String     @id @default(cuid())
  token            String     @unique @default(cuid())
  candidateEmail   String
  status           LinkStatus @default(PENDING)

  seniorityTarget  SeniorityTier
  archetypeTarget  RoleArchetype
  jobDescriptionId String?

  installationId   String?
  installationToken String?                               // AES-256-GCM encrypted
  grantedRepoIds   Json?

  employerId       String
  employer         Employer    @relation(fields: [employerId], references: [id])
  analysisJobs     AnalysisJob[]

  createdAt        DateTime    @default(now())
  expiresAt        DateTime
  usedAt           DateTime?
}

enum LinkStatus {
  PENDING
  CONSENTED
  ANALYSING
  COMPLETE
  EXPIRED
}

model Employer {
  id              String    @id @default(cuid())
  name            String
  domain          String?
  githubOrgSlug   String?
  evaluationLinks EvaluationLink[]
  jobDescriptions JobDescription[]
  users           User[]
  createdAt       DateTime  @default(now())
}

model JobDescription {
  id                    String    @id @default(cuid())
  title                 String
  rawText               String
  extractedSignals      Json?
  requirementsConfirmedAt DateTime?
  deletedAt             DateTime?                          // soft delete
  employerId            String
  employer              Employer  @relation(fields: [employerId], references: [id])
  analysisJobs          AnalysisJob[]
  createdAt             DateTime  @default(now())
}

model HireOutcome {
  id               String    @id @default(cuid())
  analysisJobId    String    @unique
  analysisJob      AnalysisJob @relation(fields: [analysisJobId], references: [id])
  hired            Boolean
  performanceRating Int?     // 1–5 at 90 days
  flagsWereAccurate Boolean?
  notes            String?
  recordedAt       DateTime  @default(now())
}
```

---

## EVIDENCE BRIEF TYPE CONTRACT
**File: `src/types/evidence-brief.types.ts`** — This is locked before any scoring logic is written.

```typescript
export type ConfidenceLevel =
  | 'strong_evidence'      // 3+ independent signals, 12+ months
  | 'moderate_evidence'    // 1-2 signals or single time window
  | 'low_evidence'         // single weak/isolated signal
  | 'observability_gap'    // expected but absent (likely private work)
  | 'insufficient_data';   // profile-level gate — do not filter

export type AILeverageClass =
  | 'ai_operator'
  | 'ai_architect'
  | 'ai_passenger'
  | 'traditional_engineer'
  | 'disclosure_flag';

export interface PrimitiveAssessment {
  score: number | null;
  confidence: ConfidenceLevel;
  confidenceText: string;           // mandatory language from spec
  keyEvidence: string[];
  observabilityGaps: string[];
  interviewProbes: string[];
}

export interface EmploymentVerification {
  employer: string;
  rungAchieved: 0 | 1 | 2 | 3;
  rungText: string;
  availableIn: 'light' | 'deep';
}

export interface AntiGamingFlag {
  type: 'commit_inflation' | 'fork_dumping' | 'burst_dormancy' | 'repo_laundering' | 'ai_generation_gap' | 'credential_leak';
  severity: 'hard_stop' | 'soft_concern';
  evidence: string;
  confidenceScore: number;           // 0–100
  interviewProbe: string;
  autoReject: false;                 // ALWAYS false per spec
}

export interface EvidenceBrief {
  sectionA: {
    operatingStyleArchetype: string;
    topThreeCapabilities: Array<{ capability: string; evidence: string }>;
    aiLeverageClassification: AILeverageClass;
    employmentVerification: EmploymentVerification[];
    analysisMode: 'light' | 'deep';
    recommendedInterviewDepth: 'light' | 'standard' | 'deep';
  };
  sectionB: {
    languages: Array<{ name: string; claimed: boolean; evidenced: boolean; commitVolumeRank?: number; yearsActive?: number }>;
    frameworks: Array<{ name: string; claimed: boolean; evidenced: boolean; depth?: string }>;
    infrastructure: Array<{ name: string; claimed: boolean; evidenced: boolean }>;
    zeroEvidenceClaims: string[];
  };
  sectionC: {
    shippingVelocity: string;
    qualityDisciplineTrajectory: string;
    collaborationStyle: string;
    aiLeverageEvidence: string;
    communicationQuality: string;
  };
  sectionD: {
    flags: AntiGamingFlag[];
    verificationGaps: string[];
    credentialLeakDetected: boolean;
  };
  sectionE: {
    technicalQuestions: Array<{ question: string; rationale: string }>;
    gapProbes: Array<{ question: string; gap: string }>;
    flagProbes: Array<{ question: string; flagType: string }>;
    suggestedInterviewerPairing: string;
  };
  sectionF?: {
    overlapScore: number;
    matchedSignals: string[];
    gapSignals: string[];
    jdIntentSummary: string;
    gapInterviewProbes: Array<{ gap: string; probe: string }>;
  };
  sectionG: {                        // ALWAYS present, NEVER omitted
    epistemicBoundaries: string[];
    routedProbes: Array<{ boundary: string; probe: string }>;
  };
  primitives: {
    p1ExecutionReliability: PrimitiveAssessment;
    p2SystemsEvolution: PrimitiveAssessment;
    p3CollaborationLeverage: PrimitiveAssessment;
    p4TechnicalDepth: PrimitiveAssessment;
    p5OperationalMaturity: PrimitiveAssessment;
    p6AILeverage: PrimitiveAssessment;
    p7AuthenticityConfidence: PrimitiveAssessment;
  };
  meta: {
    analysisMode: 'light' | 'deep';
    seniorityTarget: string;
    archetypeTarget: string;
    generatedAt: string;             // ISO
    reposAnalysed: number;
    reposCloned?: number;            // Deep Mode only
    profileLevelGate: boolean;
    warnings?: string[];
  };
}
```

---

# PHASE 0 — PRE-BUILD SETUP

**Goal:** Everything in this phase is done by a human before any LLM prompt is run. Fast but requires credentials/access. Complete all items before running Phase 1.

## Pre-Build Checklist

```
[ ] 0.1 — Register GitHub App
    Go to: github.com/settings/apps/new
    Name: Colosseum Analysis (or your preferred name)
    Webhook URL: https://[your-domain]/webhooks/github
    Permissions required:
      Contents (read)
      Metadata (read — mandatory)
      Pull requests (read)
      Issues (read)
      Commit statuses (read)
      Checks (read)
      Code scanning alerts (read)
      Dependabot alerts (read)
      Deployments (read)
      Organization members (read)
      Email addresses (read)
      GPG/SSH signing keys (read)
    Generate + download private key (PEM format)
    Save: App ID, Client ID, Client Secret, Webhook Secret

[ ] 0.2 — Install system binaries on build/server environment
    brew install scc
    # or: go install github.com/boyter/scc/v3@latest
    
    cargo install tokei
    
    pip install gitinspector
    
    brew install gitleaks
    # or: github.com/gitleaks/gitleaks releases
    
    pip install semgrep
    
    brew install actionlint
    # or: go install github.com/rhysd/actionlint/cmd/actionlint@latest

    Verify each is on PATH: scc --version, tokei --version, etc.

[ ] 0.3 — Add to .env:
    GITHUB_ID=
    GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
    GITHUB_WEBHOOK_SECRET=
    ANTHROPIC_API_KEY=
    COPYLEAKS_API_KEY=          # optional, for secondary laundering detection
    DEEP_MODE_WORKER_CONCURRENCY=4
    ENCRYPTION_KEY=             # 32-byte hex string for AES-256-GCM

[ ] 0.4 — Run Prisma migration:
    npx prisma migrate dev --name v5_rewrite
    (Use schema delta from the SCHEMA section above)

[ ] 0.5 — Create test GitHub App installation on a personal account
    (For Deep Mode integration tests — grants access to a few test repos)

[ ] 0.6 — Seed test fixture JSON files
    Create: test/fixtures/torvalds.json
    Create: test/fixtures/sindresorhus.json
    Create: test/fixtures/sparse-profile.json
    Create: test/fixtures/enterprise-dev.json
    Create: test/fixtures/inflated-commits.json
    (Mock API responses — structure mirrors GitHub REST/GraphQL responses)
```

---

## PROMPT 0.4 — Type Definitions
**Model:** Gemini  
**Why Gemini:** Needs to hold the full v5 spec simultaneously to generate all type definitions without missing anything.  
**Target file:** `src/types/evidence-brief.types.ts` and `src/types/raw-data.types.ts`

```
You are building the complete TypeScript type system for a GitHub analysis system (v5 rewrite). Generate TWO files.

CONTEXT: This system fetches GitHub data in named Groups (A–G), maps them to 7 assessment primitives (P1–P7), and produces an Evidence Brief JSON output. Types must be precise — all downstream services depend on them.

FILE 1: src/types/evidence-brief.types.ts
Build this EXACTLY as specified below. Do not add, remove, or rename any field.

[PASTE THE COMPLETE EVIDENCE BRIEF TYPE CONTRACT FROM THE SCHEMA SECTION ABOVE]

FILE 2: src/types/raw-data.types.ts
Build types for the raw data groups fetched from GitHub API.

Group A — Identity & Profile:
RawGroupA {
  login: string
  name: string | null
  company: string | null
  bio: string | null
  email: string | null
  blog: string | null
  location: string | null
  hireable: boolean | null
  accountCreatedAt: string  // ISO
  commitEmailDomains: string[]  // unique domains from commit author emails
  orgMemberships: Array<{ org: string; role: 'member' | 'owner'; isPublic: boolean }>
  avatarUrl: string | null
}

Group B — Repository Inventory:
RawGroupB {
  repos: Array<{
    name: string
    fullName: string
    language: string | null
    topics: string[]
    description: string | null
    stars: number
    forks: number
    isForked: boolean
    isMirror: boolean
    isArchived: boolean
    hasReadme: boolean
    createdAt: string   // ISO
    pushedAt: string    // ISO
    defaultBranch: string
    hasIssues: boolean
    openIssuesCount: number
    licenseKey: string | null
    homepageUrl: string | null
    size: number        // KB
  }>
  totalPublicRepos: number
  primaryLanguages: Array<{ language: string; repoCount: number; percentage: number }>
}

Group C — Commit Intelligence:
RawGroupC {
  commitSample: Array<{
    sha: string
    message: string
    additions: number
    deletions: number
    timestamp: string   // ISO
    isMerge: boolean
    isDocOnly: boolean  // >90% of diff is .md/.txt/.rst
    repoName: string
    authorEmail: string
  }>
  weeklyContributions: Array<{ week: string; total: number }>  // 52 weeks
  totalCommitsLastYear: number
  activeWeeksLastYear: number
  commitSizeP25: number   // 25th percentile of (additions + deletions) for non-merge commits
  commitSizeMedian: number
}

Group D — Collaboration & Review:
RawGroupD {
  prsAuthored: Array<{
    number: number
    repoName: string
    title: string
    body: string | null
    bodyWordCount: number
    isSelfMerge: boolean
    mergedAt: string | null
    createdAt: string
    additions: number
    deletions: number
    isExternal: boolean   // PR to repo not owned by user
  }>
  reviewsGiven: Array<{
    repoName: string
    prNumber: number
    body: string
    wordCount: number
    submittedAt: string
    state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED'
  }>
  issueComments: Array<{
    repoName: string
    issueNumber: number
    body: string
    wordCount: number
    createdAt: string
  }>
  externalPRsMerged: number  // PRs merged into repos not owned by user
  selfMergeRate: number      // 0–1
  reviewParticipationRate: number  // reviews_given / (reviews_given + prs_authored)
}

Group E — Engineering Practices (API-only for Light Mode):
RawGroupE {
  hasTestDirs: boolean          // any repo has test/, __tests__/, spec/ directory
  hasCIConfig: boolean          // .github/workflows/, .circleci/, etc.
  hasDockerfile: boolean
  hasIaC: boolean               // .tf, Pulumi.yaml, cdk.json files
  dependabotEnabled: boolean
  ciPassRateLast30Days: number | null  // 0–1, null if no CI
  semanticVersioningRate: number       // % of releases following semver
  secretSigningEnabled: boolean        // GPG/SSH signing detected in commits
}

Group F — Impact & External Signals:
RawGroupF {
  contributionCalendarTotal: number   // last 12 months
  packageRegistryPresence: Array<{
    registry: 'npm' | 'pypi' | 'crates'
    packageName: string
    weeklyDownloads: number | null
    dependentCount: number | null
    latestVersion: string | null
    isDeprecated: boolean
  }>
  stackOverflowReputation: number | null
  stackOverflowTopTags: string[]
}

Group G — Anti-Gaming Signals (populated by anti-gaming services, not fetcher):
RawGroupG {
  commitInflationRate: number | null   // set by CommitInflationService
  forkDumpRate: number | null          // set by ForkDumpingService
  burstRatio: number | null            // set by BurstDormancyService
  launderingFlags: string[]            // repos flagged by RepoLaunderingService
  aiGenerationLikelihood: number | null  // 0–100, set by LLM analysis
}

Also export:
- PrimitiveInputMap: { p1: P1Input, p2: P2Input, ... p7: P7Input } — placeholder, services will define their own input types
- LLMPromptRequest: { systemPrompt: string; userContent: string; maxTokens: number; taskName: string }
- SccOutput, TokeiOutput, GitinspectorOutput, GitleaksOutput, SemgrepOutput, ActionlintOutput — placeholder interfaces with the fields referenced in tool wrapper services (define them here, fill them in Phase 6)

Export all types. Use TypeScript interfaces (not types) for objects. Use 'export interface' and 'export type'.
```

---

## PROMPT 0.5 — Env Schema Extension
**Model:** Claude  
**Why Claude:** Small, precise Zod constraint extension. Needs hard validation logic.  
**Target file:** `src/config/env.schema.ts`

```
Extend the existing Zod env schema for a NestJS application with the following new environment variables for the v5 GitHub analysis system.

ADD to the existing Zod schema (do not replace existing vars):

GITHUB_ID: z.string().min(1)           // GitHub App numeric ID as string
GITHUB_PRIVATE_KEY: z.string().min(100) // PEM key — will contain \n characters
GITHUB_WEBHOOK_SECRET: z.string().min(10)
ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-')
COPYLEAKS_API_KEY: z.string().optional()    // optional — secondary laundering detection
DEEP_MODE_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(4)
ENCRYPTION_KEY: z.string().length(64)       // 32-byte hex = 64 hex chars

Validation notes:
- GITHUB_PRIVATE_KEY will have literal \n sequences in the env var — add a transform: .transform(v => v.replace(/\\n/g, '\n')) so the key is usable by the JWT library
- ENCRYPTION_KEY must be exactly 64 hex characters (validate with: .regex(/^[0-9a-f]{64}$/i))
- DEEP_MODE_WORKER_CONCURRENCY caps at 8 (above this, disk I/O becomes the bottleneck before CPU)

The schema must throw at startup if any required var is missing. The existing pattern already does this — extend it, don't change it.

Show the full updated schema (include existing vars unchanged, new vars added).
```

---

# PHASE 1 — LIGHT FETCHER + DATA GROUPS

**Goal:** Fetch all public GitHub data correctly, mapped to Groups A–G. No scoring. No LLM. Just reliable data collection.

**Architecture context for Phase 1:**
- All fetching uses the platform GitHub App token (shared, not per-candidate)
- GraphQL-first: batched queries save ~60% of REST budget
- Circuit breaker: pause at <500 remaining requests
- Cache key format: `username:light:v5` with 24h TTL
- Groups A–G are the canonical data containers — all downstream services consume them, never raw API responses

**Files created in this phase:**
- `src/github/light-fetcher/light-fetcher.service.ts`
- `src/github/light-fetcher/light-fetcher.types.ts`
- `src/github/rate-limit/rate-limit.service.ts`
- `src/signals/external-signals/external-signal.service.ts`
- `src/signals/data-groups/group-mapper.service.ts`

---

## PROMPT 1.1 — Light Fetcher Service
**Model:** Gemini  
**Why Gemini:** Large context — needs the full Group A–G type definitions + octokit patterns + rate limit strategy simultaneously.  
**Target file:** `src/github/light-fetcher/light-fetcher.service.ts`

```
Build LightFetcherService for a NestJS GitHub analysis system. This service fetches all public GitHub data for a candidate using only the platform GitHub App token (no per-user credentials required).

TECH STACK: NestJS @Injectable, @octokit/rest + @octokit/graphql, TypeScript strict mode.

METHOD: fetch(username: string): Promise<RawLightData>
RawLightData: { groupA: RawGroupA, groupB: RawGroupB, groupC: RawGroupC, groupD: RawGroupD, groupF: RawGroupF }
(Group E is partially populated from file trees in Group B repos; Group G is populated later by anti-gaming services)

STRATEGY — GraphQL first, batch where possible:

STEP 1 — Single batched GraphQL query (saves ~60% REST budget):
Fetch in ONE query:
  - User profile fields (maps to GroupA)
  - All public repos (first 100, sorted by PUSHED_AT): name, language, topics, description, stars, forks, isFork, isMirror, isArchived, createdAt, pushedAt, openIssues, licenseKey, homepageUrl, diskUsage, hasWikiEnabled
  - Contribution calendar (last 52 weeks) → maps to GroupC.weeklyContributions
  - Last 50 PRs authored (title, body, mergedAt, createdAt, additions, deletions, headRepository)
  - Last 50 PR reviews given (body, submittedAt, state, pullRequest.number, pullRequest.repository.name)
  - Last 30 issue comments (body, createdAt, issue.number, repository.name)
  - Pinned repos (for GroupF impact signals)

STEP 2 — REST endpoints for data GraphQL cannot provide:
  - GET /repos/{owner}/{repo}/commits for top 5 repos (30 commits each) → commit sample for GroupC
  - GET /repos/{owner}/{repo}/releases for all repos → semantic versioning rate for GroupE
  - GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1 for top 10 repos → file tree for GroupE

STEP 3 — Compute derived fields:
  - commitEmailDomains: unique email domains from commit author emails (REST commits)
  - isDocOnly: detect if commit diff is mostly .md/.txt/.rst (heuristic: filename check from message if diff not available)
  - selfMergeRate: prs where merger === author / total merged PRs
  - reviewParticipationRate: reviewsGiven / (reviewsGiven + prsAuthored)

RATE LIMIT: inject RateLimitService. Call rateLimitService.checkBudget() before each REST call. Use rateLimitService.trackGraphQL() for GraphQL queries.

GITHUB APP TOKEN: inject as GITHUB_TOKEN from config (the platform installation token, auto-refreshed separately).

ERROR HANDLING:
  - On 404 (user not found): throw UserNotFoundException
  - On 403 (rate limit): throw RateLimitExhaustedException  
  - On any single REST failure: log warning, continue with partial data (never abort the whole fetch for one failed sub-request)
  - If GraphQL query fails: fall back to individual REST calls for each section

Return RawLightData with all groups populated (partially where data was unavailable).
```

---

## PROMPT 1.2 — Rate Limit Service
**Model:** Claude  
**Why Claude:** State machine with hard thresholds — needs precise conditional logic.  
**Target file:** `src/github/rate-limit/rate-limit.service.ts`

```
Build RateLimitService for a GitHub API rate limit budget tracker in NestJS TypeScript.

CONTEXT: The platform GitHub App token is shared across all concurrent Light Mode analysis jobs. The budget must be managed globally, not per-request.

RATE LIMITS TO TRACK:
  REST API:     5,000 req/hr — check remaining from X-RateLimit-Remaining header
  GraphQL API:  5,000 points/hr — each query costs variable points
  Search API:   30 req/min — separate counter

STATE:
  restRemaining: number (init from first API response header)
  graphqlRemaining: number
  searchRemaining: number
  searchWindowStart: Date   // 1-minute rolling window

METHODS:

checkBudget(apiType: 'rest' | 'graphql' | 'search'): void
  - If rest remaining < 500: throw RateLimitExhaustedException('REST budget critical')
  - If search remaining === 0 and window < 60s old: throw RateLimitExhaustedException('Search API limit')
  - If graphql remaining < 200: log warning (don't throw — GraphQL is harder to predict)

updateFromHeaders(headers: Record<string, string>): void
  - Parse X-RateLimit-Remaining, X-RateLimit-Reset
  - Update restRemaining
  - If restRemaining < 500: log.warn('REST budget critical — circuit breaker active')
  - If restRemaining === 0: log.error('REST rate limit exhausted')

updateGraphQL(pointsUsed: number): void
  - Decrement graphqlRemaining by pointsUsed
  - GraphQL points are approximated: simple queries = 1, nested/paginated = points per node

trackSearch(): void
  - Decrement searchRemaining
  - Reset searchRemaining to 30 if searchWindowStart > 60s ago

getRemainingBudget(): { rest: number; graphql: number; search: number }

CIRCUIT BREAKER:
  isCircuitOpen(): boolean
    Returns true if restRemaining < 500
    When circuit is open, callers must pause and retry after the rate limit window resets
    
  getRetryAfterMs(): number
    Returns milliseconds until the rate limit window resets (from X-RateLimit-Reset header)

Use @Injectable({ scope: Scope.DEFAULT }) — singleton. The shared state is intentional.
Use NestJS Logger. Inject ConfigService for initial token configuration.
```

---

## PROMPT 1.3 — External Signal Service
**Model:** Claude  
**Why Claude:** Multiple external API clients with precise error handling and additive-only semantics.  
**Target file:** `src/signals/external-signals/external-signal.service.ts`

```
Build ExternalSignalService that fetches Tier 2+ signals from external registries.

PURPOSE: Augments GroupF with package registry and Stack Overflow data. These are additive-only signals — absence carries ZERO negative weight. Never throw if an external API is unavailable.

METHOD: fetch(username: string, repos: RawGroupB['repos']): Promise<Partial<RawGroupF>>

SIGNAL 1 — npm Registry:
  For each repo where language is 'JavaScript' or 'TypeScript':
    - Try: GET https://registry.npmjs.org/-/v1/search?text=maintainer:[username]
    - For each matching package: GET https://registry.npmjs.org/[package-name]/latest
    - Extract: weeklyDownloads (from npm downloads API: https://api.npmjs.org/downloads/point/last-week/[package])
    - Extract: dependents count (from https://registry.npmjs.org/-/v1/search?text=dependencies:[package-name])
    - Timeout: 3s per request
    - On any failure: log debug, return empty array for this registry

SIGNAL 2 — PyPI:
  - GET https://pypi.org/pypi/[package-name]/json for packages matching username in author field
  - Find packages by: search PyPI JSON API for author:username
  - Extract: info.requires_python, info.home_page, info.project_urls
  - On failure: log debug, skip

SIGNAL 3 — Crates.io:
  - GET https://crates.io/api/v1/crates?q=[username]&sort=downloads
  - Filter to crates where newest_version.created_by.login matches username
  - Extract: downloads, recent_downloads
  - User-Agent header required: 'Colosseum-Analysis/1.0 (contact@colosseum.dev)'

SIGNAL 4 — Stack Overflow (Tier 3, additive only):
  - GET https://api.stackexchange.com/2.3/users?inname=[username]&site=stackoverflow
  - If found: GET /users/{id}/top-tags — extract top 5 by answer_score
  - This is purely additive — if not found or API fails: return null for this field
  - IMPORTANT: Do not expose API key for Stack Exchange (public endpoint is sufficient for reads)

PARALLEL EXECUTION: Run all 4 signals with Promise.allSettled() — never let one failure block others.

RATE LIMITING: Add 500ms delay between crates.io requests (their ToS). No delay needed for others.

Return Partial<RawGroupF> — only populate fields where data was successfully retrieved.
```

---

## PROMPT 1.4 — Group Mapper Service
**Model:** Gemini  
**Why Gemini:** Mapping a large, complex raw API response to the canonical group structure — needs full context.  
**Target file:** `src/signals/data-groups/group-mapper.service.ts`

```
Build GroupMapperService that transforms raw LightFetcherService output into the canonical data groups for primitive evaluation.

PURPOSE: This is the boundary between "raw GitHub API data" and "analysis-ready signals". Downstream primitive services consume only canonical groups, never raw API shapes.

METHOD: map(rawLightData: RawLightData, toolOutputs?: ToolOutputs): PrimitiveInputMap

MAPPINGS:

GroupE computation (from GroupB + GroupC — not directly fetched):
  hasTestDirs: rawGroupB.repos.some(r => r.topics.includes('testing') OR check file trees for test/, __tests__/, spec/)
  hasCIConfig: rawGroupB.repos.some(r => file tree contains .github/workflows/ OR .circleci/)
  hasDockerfile: rawGroupB.repos.some(r => file tree contains 'Dockerfile')
  hasIaC: rawGroupB.repos.some(r => file tree contains *.tf OR Pulumi.yaml OR cdk.json)
  dependabotEnabled: rawGroupB.repos.some(r => file tree contains .github/dependabot.yml)
  semanticVersioningRate: compute from release tags in rawGroupB (releases following vX.Y.Z pattern / total releases)
  ciPassRateLast30Days: null in Light Mode (only from Actions API in Deep Mode)
  secretSigningEnabled: check groupC.commitSample for any commit with GPG signature metadata

GroupG initialisation:
  Return RawGroupG with all null values — anti-gaming services will populate these later.

PrimitiveInputMap:
  p1: { groupC, groupE }
  p2: { groupB, groupC }  // scc is null in Light Mode
  p3: { groupD, seniorityTarget }  // seniorityTarget passed through from job
  p4: { groupB, groupC, groupD, groupF }
  p5: { groupE, groupB }  // gitleaks, semgrep are null in Light Mode
  p6: { groupC, groupB }
  p7: { groupG, gitleaks: null, employmentRungs: [] }  // populated after anti-gaming runs

Also export: mapDeep(rawDeepData, toolOutputs): PrimitiveInputMap — same logic but with tool outputs included.
In Deep Mode: scc, tokei, gitinspector, gitleaks, semgrep outputs are passed in via toolOutputs and merged into the appropriate primitive inputs.

ToolOutputs type: { scc?: SccOutput, tokei?: TokeiOutput, gitinspector?: GitinspectorOutput, gitleaks?: GitleaksOutput, semgrep?: SemgrepOutput, actionlint?: ActionlintOutput }

Each tool output is optional — Light Mode passes undefined for all.
```

---

# PHASE 2 — SEVEN PRIMITIVES, RULE-BASED BASELINE

**Goal:** All 7 primitives compute from Light Mode data with rule-based logic. No LLM yet. LLM scoring is layered in Phase 5.

**Architecture context for Phase 2:**
- Each primitive service is a pure `@Injectable()` — no HTTP surface, no DB access
- All primitives accept typed input structs and return `PrimitiveAssessment`
- `ConfidenceLanguageService` must be injected and used for all `confidenceText` — never hardcode confidence language
- Primitives must be independently testable and produce meaningful output without LLM calls
- Seniority weighting adjusts narrative emphasis, not the raw confidence level

**Files created in this phase:**
- `src/signals/primitives/p1-execution-reliability.service.ts`
- `src/signals/primitives/p2-systems-evolution.service.ts`
- `src/signals/primitives/p3-collaboration-leverage.service.ts`
- `src/signals/primitives/p4-technical-depth.service.ts`
- `src/signals/primitives/p5-operational-maturity.service.ts`
- `src/signals/primitives/p6-ai-leverage.service.ts`
- `src/signals/primitives/p7-authenticity-confidence.service.ts` (placeholder)
- `src/signals/seniority/seniority-weights.service.ts`
- `src/signals/archetype/archetype-config.service.ts`
- `src/signals/confidence-language/confidence-language.service.ts`

---

## PROMPT 2.1 — P1 Execution Reliability
**Model:** Claude  
**Why Claude:** Rule logic with hard thresholds; needs careful spec adherence.  
**Target file:** `src/signals/primitives/p1-execution-reliability.service.ts`

```
Build the P1 (Execution Reliability) primitive evaluator for a GitHub analysis system.

CORE QUESTION: "Can this engineer ship safely and consistently?"

INPUT TYPE: { groupC: RawGroupC, groupE: RawGroupE, scc?: SccOutput, tokei?: TokeiOutput }
OUTPUT TYPE: PrimitiveAssessment (from src/types/evidence-brief.types.ts)

WHAT TO MEASURE AND HOW:

1. Commit cadence consistency (from groupC)
   - consistency_ratio = groupC.activeWeeksLastYear / 52
   - >0.7 → strong signal, 0.4–0.7 → moderate, <0.4 → sparse

2. CI pass rate trajectory (from groupE)
   - If groupE.ciPassRateLast30Days is null → confidence = observability_gap for this sub-signal
   - Trending up over 6 months → positive signal (in Deep Mode; stub for Light)

3. Test-to-code ratio
   - Deep Mode (tokei): testFileCount / totalFiles
     >0.15 → strong evidence of test discipline
   - Light Mode: use groupE.hasTestDirs as a binary signal
     true → moderate evidence; false → low evidence but NOT a gap (absence is informative)

4. Semantic versioning discipline
   - groupE.semanticVersioningRate
   - >0.80 → strong, 0.40–0.80 → moderate, <0.40 → weak signal

5. Dependency update hygiene
   - groupE.dependabotEnabled → baseline awareness signal
   - Deep Mode: Dependabot alert resolution time (not available in Light — observability_gap)

6. Deployment frequency
   - Light Mode: check if any repo in groupB has homepageUrl or topics containing 'production', 'deployed', 'live'
   - Presence → supporting signal, not primary

CONFIDENCE AGGREGATION:
   - Need 3+ signals to reach strong_evidence
   - Each sub-signal scored independently (present/absent/partial)
   - observability_gap only when a signal is expected for the target seniority but is absent

Return PrimitiveAssessment. keyEvidence must contain specific strings with numbers (e.g. "Active in 38 of last 52 weeks (73% consistency)"). Include 2 interview probes when confidence < strong_evidence.

MANDATORY: Use ConfidenceLanguageService (injected) to generate confidenceText — never hardcode it.

No LLM calls. Rule-based only. LLM will be layered in Phase 5.
```

---

## PROMPT 2.2 — P2 Systems Evolution
**Model:** Claude  
**Why Claude:** Complexity trend analysis requires precise time-window logic.  
**Target file:** `src/signals/primitives/p2-systems-evolution.service.ts`

```
Build the P2 (Systems Evolution) primitive evaluator.

CORE QUESTION: "Do systems improve under this engineer's stewardship over time?"

INPUT TYPE: { groupC: RawGroupC, groupB: RawGroupB, scc?: SccOutput }
OUTPUT TYPE: PrimitiveAssessment

SIGNALS TO MEASURE:

1. Refactor commit detection (from groupC.commitSample)
   - Keywords: 'refactor', 'restructure', 'simplify', 'extract', 'clean up', 'rework', 'improve', 'decouple', 'rename', 'reorganise', 'reorganize'
   - Match against lowercase commit message
   - refactorRate = refactor_commits / total_commits
   - >0.10 → positive signal (10%+ of commits are improvement-oriented)
   - >0.20 → strong signal

2. Project age vs activity (from groupB.repos)
   - Find repos: NOT archived, NOT forked, age > 12 months (createdAt < now - 365 days), pushedAt within 6 months
   - These are "long-lived and maintained" → strong Systems Evolution signal
   - 0 such repos → low_evidence
   - 1 such repo → moderate_evidence
   - 2+ such repos → contributes to strong_evidence

3. Repository complexity trend (scc only — Deep Mode)
   - If scc not available: observability_gap for this sub-signal
   - If available: compare complexity score across repos ordered by createdAt
   - Is complexity per 1000 lines DECREASING over time? → positive (code getting cleaner)
   - If increasing >20%: add note in observabilityGaps: "Complexity trend warrants discussion"

4. Description and README quality (from groupB.repos)
   - non_fork_repos = repos where isForked=false
   - documented_ratio = repos with (description != null AND hasReadme) / non_fork_repos
   - >0.70 → supporting documentation discipline signal (weak signal, weight accordingly)

CONFIDENCE AGGREGATION:
   - Signals 1 AND 2 both present → strong_evidence
   - Signal 1 OR 2 alone → moderate_evidence
   - Neither present → low_evidence
   - If total non-fork repos < 3: confidence = observability_gap regardless of other signals

MANDATORY: Use ConfidenceLanguageService for confidenceText.

Include 2 specific interview probes when confidence < strong_evidence.
Example probe: "Tell me about a time you significantly refactored existing code. What drove that decision and what was the outcome?"
```

---

## PROMPT 2.3 — P3 Collaboration Leverage
**Model:** Claude  
**Why Claude:** Important nuance around the observability gap rule — needs constraint precision.  
**Target file:** `src/signals/primitives/p3-collaboration-leverage.service.ts`

```
Build the P3 (Collaboration Leverage) primitive evaluator.

CORE QUESTION: "Does this engineer amplify the people around them?"

CRITICAL DESIGN RULE: When collaboration data is absent or thin, this carries NO NEGATIVE WEIGHT for candidates in enterprise, security, or embedded contexts. The Evidence Brief must distinguish 'no review activity observed' from 'no review activity exists'. Always default to the former interpretation.

INPUT TYPE: { groupD: RawGroupD, seniorityTarget: SeniorityTier }
OUTPUT TYPE: PrimitiveAssessment

SIGNALS:

1. PR review participation rate
   - groupD.reviewParticipationRate (pre-computed: reviews_given / (reviews_given + prs_authored))
   - >0.5 → strong reviewer, 0.2–0.5 → participates, <0.2 → primarily author

2. Substantive review rate
   - groupD.reviewsGiven: filter to reviews with wordCount > 50
   - substantive_rate = substantive_reviews / total_reviews
   - >0.5 → strong substantive review signal

3. Self-merge rate (seniority-adjusted)
   - groupD.selfMergeRate
   - At SENIOR, STAFF_LEAD, PRINCIPAL_PLUS: selfMergeRate > 0.7 → soft concern (add to observabilityGaps)
   - At INTERN_JUNIOR, MID: no concern regardless of rate
   - IMPORTANT: inject SeniorityWeightsService to check current tier

4. External contribution depth
   - groupD.externalPRsMerged
   - Each external PR = strong evidence of collaboration
   - 5+ external PRs → strong_evidence for this sub-signal

5. PR description quality (stub)
   - groupD.prsAuthored: compute average bodyWordCount
   - >100 words average → positive signal
   - NOTE: Mark this as "LLM scoring pending" — return moderate_evidence with a note, replaced in Phase 5

OBSERVABILITY GAP HANDLING:
If total prsAuthored < 5 AND externalPRsMerged < 3:
  - confidence = 'observability_gap'
  - confidenceText = exact spec language from ConfidenceLanguageService
  - interviewProbes = ["Ask the candidate to describe a time they changed a colleague's design decision through a code review.", "Describe your typical approach to reviewing code written by a more junior engineer."]
  - score = null

MANDATORY: Use ConfidenceLanguageService. Never set score < 0. Null score when observability_gap.
```

---

## PROMPT 2.4 — P4 Technical Depth
**Model:** Claude  
**Why Claude:** Language-to-capability mapping table is a constraint-heavy lookup.  
**Target file:** `src/signals/primitives/p4-technical-depth.service.ts`

```
Build the P4 (Technical Depth) primitive evaluator.

CORE QUESTION: "Can this engineer go deep when the problem genuinely requires it?"

INPUT TYPE: { groupB: RawGroupB, groupC: RawGroupC, groupD: RawGroupD, groupF: RawGroupF }
OUTPUT TYPE: PrimitiveAssessment

SIGNALS:

1. Language depth by commit volume (NOT by repo count)
   - Correlate each commit in groupC.commitSample to its repo's language in groupB.repos
   - Build: languageCommitMap: Record<string, number>
   - Top 2 languages by commit count = candidate's primary languages
   - depth_score per language = commits_in_language / total_commits * 100
   - >60% commits in one language → genuine specialisation → strong depth signal

2. Hardness indicators in repo topics and descriptions
   HARDNESS_KEYWORDS = ['compiler', 'parser', 'distributed', 'consensus', 'concurrency',
     'kernel', 'vm', 'jit', 'crypto', 'protocol', 'realtime', 'embedded', 'zero-copy',
     'lock-free', 'sharding', 'replication', 'byzantine', 'raft', 'paxos', 'merkle']
   - Match against topics[] and description (lowercase) for each non-fork repo
   - 1+ repos → moderate depth indicator; 2+ → strong depth indicator

3. Package registry adoption (groupF.packageRegistryPresence)
   - Any package with weeklyDownloads > 100 → external validation of technical depth
   - Any package with dependentCount > 5 → others depend on their code → strong depth signal
   - Empty packageRegistryPresence → observability_gap for this sub-signal ONLY
     (many deep engineers don't publish packages — never penalise)

4. Review substance (groupD.reviewsGiven)
   - avgReviewWordCount = mean of all review wordCounts
   - >80 words average → reviews are substantive → depth indicator
   - If total reviews < 5 → observability_gap for this sub-signal

5. Stack Overflow (groupF.stackOverflowReputation — Tier 3, additive only)
   - If reputation > 1000 → add as supporting evidence in keyEvidence
   - If null or 0 → completely absent from scoring (no gap, no penalty)

LANGUAGE-TO-DOMAIN MAPPING (for Section B — informational, not scoring):
  const DOMAIN_LANGUAGES = {
    backend: ['Go', 'Rust', 'Java', 'C', 'C++', 'Python', 'Ruby', 'PHP', 'Elixir', 'Scala', 'Kotlin'],
    frontend: ['TypeScript', 'JavaScript', 'CSS', 'HTML', 'Dart'],
    devops: ['HCL', 'Shell', 'Dockerfile', 'YAML'],
    data_ml: ['Python', 'R', 'Julia', 'Jupyter Notebook']
  }
  Export this constant — BriefAssembler uses it for Section B.

CONFIDENCE AGGREGATION:
  - Signal 1 strong (>60% in one language) + Signal 2 (1+ hardness topic) → strong_evidence
  - Signal 1 present + any of signals 2, 3, or 4 → moderate_evidence
  - Only Signal 1 present → moderate_evidence
  - Signal 1 absent (<30% anywhere, breadth generalist) → moderate_evidence with positive note:
    "Profile indicates a breadth-first generalist — valuable in full-stack and startup contexts"

keyEvidence must include specific language + percentage: "68% of commits in Rust across 8 repos"
```

---

## PROMPT 2.5 — P5 Operational Maturity
**Model:** Claude  
**Why Claude:** Hard security flag logic requires strict conditional handling.  
**Target file:** `src/signals/primitives/p5-operational-maturity.service.ts`

```
Build the P5 (Operational Maturity) primitive evaluator.

CORE QUESTION: "Can this engineer handle production reality?"

INPUT TYPE: { groupE: RawGroupE, groupB: RawGroupB, archetypeTarget: RoleArchetype, gitleaks?: GitleaksOutput, semgrep?: SemgrepOutput }
OUTPUT TYPE: PrimitiveAssessment

CRITICAL RULE — CREDENTIAL LEAK HARD STOP:
If gitleaks?.leaksFound === true:
  - Return IMMEDIATELY with:
    confidence: 'low_evidence'
    confidenceText: "Credential leak detected in git history."
    keyEvidence: [`Credential leak detected in git history (${gitleaks.count} finding${gitleaks.count > 1 ? 's' : ''}). Hard stop — requires interview or background check before proceeding.`]
    interviewProbes: ["A credential was detected in your git history. Can you walk us through what happened, when you discovered it, and how it was resolved?"]
    observabilityGaps: []
    score: 0
  - DO NOT evaluate any other signals

SIGNALS (only evaluated if no credential leak):

1. Observability tooling (from groupB — scan topics and descriptions)
   OBSERVABILITY_KEYWORDS = ['prometheus', 'grafana', 'datadog', 'opentelemetry', 'jaeger', 'logging', 'metrics', 'tracing', 'monitoring', 'observability', 'newrelic', 'splunk', 'elastic']
   - 1+ repos with any keyword → observability awareness signal

2. Feature flag usage
   FEATURE_FLAG_KEYWORDS = ['launchdarkly', 'feature-flag', 'feature-toggle', 'unleash', 'flipt', 'flagsmith']
   - Presence → strong operational maturity signal

3. IaC presence
   - groupE.hasIaC
   - Only meaningful for PLATFORM_DEVOPS_SRE and BACKEND archetypes
   - For other archetypes: treat as supporting signal, not primary

4. Containerisation
   - groupE.hasDockerfile → deployment awareness signal

5. Secret management hygiene
   - If gitleaks ran AND found nothing → explicit positive signal: "No credentials detected in git history (gitleaks scan clean)"
   - If gitleaks not available (Light Mode) → observability_gap for this sub-signal only

6. SAST findings (semgrep — Deep Mode only)
   - If semgrep?.errorCount > 5 → moderate concern, add to keyEvidence
   - If semgrep?.errorCount === 0 → positive signal
   - If not available → observability_gap for this sub-signal

7. Dependabot enabled
   - groupE.dependabotEnabled → dependency hygiene awareness

CONFIDENCE:
  4+ signals present → strong_evidence
  2–3 signals → moderate_evidence
  1 signal → low_evidence
  0 signals → observability_gap

MANDATORY NOTE when observability_gap: Add to observabilityGaps:
"Operational maturity signals are predominantly visible in public DevOps/platform repositories. Enterprise engineers may have extensive production experience with no public trace."
```

---

## PROMPT 2.6 — P6 AI Leverage Quality
**Model:** Claude  
**Why Claude:** Complex 5-class classification logic with specific evidence rules.  
**Target file:** `src/signals/primitives/p6-ai-leverage.service.ts`

```
Build the P6 (AI Leverage Quality) primitive evaluator.

CORE QUESTION: "Can this engineer effectively direct AI to produce quality outcomes?"

INPUT TYPE: { groupC: RawGroupC, groupB: RawGroupB }
OUTPUT TYPE: PrimitiveAssessment & { aiLeverageClass: AILeverageClass }

AI LEVERAGE CLASSIFICATION — classify into exactly one class:

ai_operator:
  REQUIRES:
  - High commit velocity periods (week with >2x trailing 4-week average)
  - AND maintained or improving test-to-code ratio during those periods (stub: check if hasTestDirs stays true)
  - AI tool config files detected (see DETECTION below)
  - Iterative refinement commits: small commits (<50 lines) within 48h after a large commit (>200 lines)

ai_architect:
  REQUIRES:
  - AI config files present with evidence of customisation (config file > 500 bytes — check via file tree data if available)
  - Commit messages referencing AI tools: 'with claude', 'via copilot', 'ai-assisted', 'ai-generated', 'copilot', 'cursor'
  - Pattern: large commits + follow-up small refinement commits (same as ai_operator but without velocity burst requirement)

ai_passenger: (soft_concern — will surface flag in Section D)
  REQUIRES:
  - High velocity with NO iterative refinement commits
  - Large single-session commits (>500 lines) with zero follow-up commits in 48h
  - Mark: add soft_concern AntiGamingFlag to observabilityGaps: "AI-assisted pattern detected without evidence of human review — interview to clarify"

traditional_engineer:
  - No AI config files detected
  - Consistent commit size distribution (no significant velocity bursts)
  - Default classification when no AI signals detected
  - NOT penalised — explicitly note as positive in certain contexts

disclosure_flag:
  - Stub for Phase 5 LLM analysis: "LLM analysis pending for style consistency check"
  - Set when: large single-session commits + ai_passenger pattern + no AI config files
  - Sets AntiGamingFlag type='ai_generation_gap'
  - Never automatic rejection

AI CONFIG FILE DETECTION:
  AI_CONFIG_FILES = ['.cursorrules', '.github/copilot-instructions.md', '.aider.conf.yml', 'CLAUDE.md', 'custom_instructions.txt', '.cursor/rules']
  Check groupB.repos file trees (from the file tree data in GroupE scope)
  hasAIConfigFiles = any repo has any of these files in its file tree

COMMIT VELOCITY ANALYSIS (from groupC):
  burstWeeks = weeklyContributions where total > (trailing4WeekAvg * 2)
  hasVelocityBursts = burstWeeks.length > 0

CLASSIFICATION PRIORITY ORDER: disclosure_flag > ai_passenger > ai_architect > ai_operator > traditional_engineer
  (Only classify ai_operator if no negative signals present)

Return PrimitiveAssessment & { aiLeverageClass: AILeverageClass }
The aiLeverageClass is attached as an additional field on the returned object.
```

---

## PROMPT 2.7–2.10 — Supporting Services Bundle
**Model:** Claude  
**Why Claude:** All small, precise services with hard rules. More efficient as one call than four separate.  
**Target files:** `p7-authenticity-confidence.service.ts`, `seniority-weights.service.ts`, `archetype-config.service.ts`, `confidence-language.service.ts`

```
Build 4 supporting services for a GitHub analysis system. Output all 4 as separate TypeScript files.

─── FILE 1: src/signals/primitives/p7-authenticity-confidence.service.ts

P7 is a PLACEHOLDER in Phase 2. Anti-gaming data will be populated in Phase 4.

Build the service shell:
METHOD: evaluate(input: { groupG: RawGroupG, gitleaks?: GitleaksOutput, employmentRungs?: EmploymentRungResult[] }): PrimitiveAssessment

LOGIC:
- If gitleaks?.leaksFound: return hardStopAssessment (see P5 pattern — similar language)
- If employmentRungs provided and highest rung >= 2: add to keyEvidence: "Employment verified at Rung ${highest_rung}"
- If groupG has any non-null values: add to observabilityGaps: "Anti-gaming analysis pending — Phase 4"
- Default return:
    confidence: 'observability_gap'
    confidenceText: from ConfidenceLanguageService
    keyEvidence: ["Authenticity assessment requires anti-gaming analysis — populated in Phase 4"]
    interviewProbes: ["Walk me through your most significant engineering contribution in the last 12 months."]

This service will be fully re-implemented in Phase 4.

─── FILE 2: src/signals/seniority/seniority-weights.service.ts

METHOD: getWeights(tier: SeniorityTier): SeniorityWeightMap

SeniorityWeightMap: Record<'p1'|'p2'|'p3'|'p4'|'p5'|'p6'|'p7', 'primary'|'high'|'moderate'|'emerging'|'minimal'|'not_expected'|'always'>

WEIGHT TABLE (exact values from spec):
INTERN_JUNIOR:  p1=primary,   p2=not_expected, p3=minimal,  p4=high,    p5=minimal,  p6=moderate, p7=always
MID:            p1=primary,   p2=emerging,     p3=moderate, p4=high,    p5=moderate, p6=high,     p7=always
SENIOR:         p1=high,      p2=high,         p3=high,     p4=high,    p5=high,     p6=high,     p7=always
STAFF_LEAD:     p1=moderate,  p2=primary,      p3=primary,  p4=high,    p5=high,     p6=high,     p7=always
PRINCIPAL_PLUS: p1=moderate,  p2=primary,      p3=primary,  p4=high,    p5=primary,  p6=high,     p7=always

METHOD: getNarrativeWeight(tier: SeniorityTier, primitive: string): string
Returns plain-English phrase:
  'primary' → "is the primary signal at this seniority level"
  'high' → "carries significant weight at this seniority level"
  'moderate' → "is a supporting signal"
  'emerging' → "is expected to be developing"
  'minimal' → "is not expected at this stage"
  'not_expected' → "is not applicable at this stage"
  'always' → "is assessed equally at all seniority levels"

─── FILE 3: src/signals/archetype/archetype-config.service.ts

METHOD: getConfig(archetype: RoleArchetype): ArchetypeConfig

ArchetypeConfig: {
  elevatedSignals: string[]
  contextualRedFlags: string[]
  primaryLanguages: string[]
  iacRequired: boolean
  securityAmplified: boolean
}

VALUES (exact from spec):
BACKEND: elevatedSignals=['API design patterns', 'database migration files', 'performance tooling', 'load testing configs'], contextualRedFlags=['No error handling patterns', 'no logging/instrumentation', 'no data layer tests'], primaryLanguages=['Go','Rust','Java','Python','C++','Node.js'], iacRequired=false, securityAmplified=false
FRONTEND: elevatedSignals=['TypeScript weighting', 'component library discipline', 'a11y configs', 'Storybook presence', 'visual regression tests'], contextualRedFlags=['No TypeScript', 'inline styles only', 'no test coverage', 'no accessibility attributes'], primaryLanguages=['TypeScript','JavaScript'], iacRequired=false, securityAmplified=false
PLATFORM_DEVOPS_SRE: elevatedSignals=['IaC presence', 'Kubernetes manifests', 'observability configs', 'GitOps patterns', 'secret management tooling'], contextualRedFlags=['Hardcoded credentials anywhere', 'no idempotency guards', 'bash without error handling'], primaryLanguages=['Go','Python','Shell','HCL'], iacRequired=true, securityAmplified=false
DATA_ML: elevatedSignals=['Notebook-to-pipeline transition', 'data validation tooling', 'model versioning (MLflow/DVC)', 'dbt configs', 'Airflow DAGs'], contextualRedFlags=['Notebooks only', 'no reproducibility tooling', 'no data validation', 'no productionisation'], primaryLanguages=['Python','R','SQL','Julia'], iacRequired=false, securityAmplified=false
SECURITY: elevatedSignals=['CVE history management', 'responsible disclosure evidence (SECURITY.md)', 'signed releases', 'SBOM generation in CI'], contextualRedFlags=['Any secret leak history', 'unpatched high/critical Dependabot alerts'], primaryLanguages=['Python','Go','Rust','C'], iacRequired=false, securityAmplified=true
MOBILE: elevatedSignals=['Xcode project structure quality', 'Gradle discipline', 'Fastlane presence', 'UI test frameworks (XCTest/Espresso)', 'app store release evidence'], contextualRedFlags=['Hardcoded API keys in mobile code (critical)', 'no UI tests', 'no signing configuration'], primaryLanguages=['Swift','Kotlin','Dart','Java'], iacRequired=false, securityAmplified=false

─── FILE 4: src/signals/confidence-language/confidence-language.service.ts

METHOD: getText(level: ConfidenceLevel, context?: { n_repos?: number; n_months?: number; interview_question?: string }): string

MANDATORY LANGUAGE — do not deviate from these exact strings:
strong_evidence: `Demonstrated across ${context?.n_repos ?? 'multiple'} repositories and ${context?.n_months ?? '12+'} months — high confidence.`
moderate_evidence: `Evidenced in limited context — probe in interview to confirm depth.`
low_evidence: `One instance detected — insufficient to score. Treat as unconfirmed in hiring decision.`
observability_gap: `No public evidence — likely private or enterprise context. Do not penalise. Recommend: ${context?.interview_question ?? 'Ask the candidate to describe their experience directly.'}`
insufficient_data: `This profile cannot be assessed from available public signals. Do not use this report as a filter for this candidate. Proceed directly to technical interview using the generated interview questions.`

METHOD: getProfileLevelGateText(): string
Returns: "This profile pattern is consistent with enterprise or regulated-industry engineering contexts where public evidence is structurally absent. This is correlated with — not anticorrelated with — seniority and impact. Proceed to technical interview."
```

---

# PHASE 3 — EVIDENCE BRIEF ASSEMBLER + LIGHT MODE PIPELINE

**Goal:** A complete Light Mode brief runs end-to-end. No LLM, no anti-gaming yet — but a real, structured Evidence Brief comes out the other end.

**Architecture context for Phase 3:**
- `BriefAssemblerService` is a pure function — same inputs always produce same outputs
- Section G is hardcoded — it never changes and must always be present
- The pipeline processor (`LightAnalysisProcessor`) is the first place all services are wired together
- The NO COMPOSITE SCORE principle is enforced in code — assert it in a TypeScript comment
- Cache key: `brief:${username}:light:${seniorityTarget}:${archetypeTarget}` — TTL 24h

**Files created in this phase:**
- `src/brief/brief-assembler.service.ts`
- `src/employment/verification-ladder.service.ts`
- `src/brief/interview-probe-generator.service.ts`
- `src/queues/light-analysis.processor.ts`
- `src/modules/analysis/analysis.controller.ts` (extended)
- `src/modules/analysis/analysis.service.ts` (extended)

---

## PROMPT 3.1 — Brief Assembler Service
**Model:** Gemini  
**Why Gemini:** Needs to hold all 7 sections + all 7 primitive outputs + evidence brief spec simultaneously.  
**Target file:** `src/brief/brief-assembler.service.ts`

```
Build BriefAssemblerService for a GitHub analysis system in NestJS TypeScript.

// NO COMPOSITE SCORE — by design. See v5 spec §8 Critical Design Principle.
// This service assembles an evidence brief. It never produces a single overall score.

PURPOSE: Takes all primitive assessment outputs and assembles the complete EvidenceBrief JSON.

INPUT TYPE:
BriefAssemblerInput {
  primitives: {
    p1: PrimitiveAssessment
    p2: PrimitiveAssessment
    p3: PrimitiveAssessment
    p4: PrimitiveAssessment
    p5: PrimitiveAssessment
    p6: PrimitiveAssessment & { aiLeverageClass: AILeverageClass }
    p7: PrimitiveAssessment
  }
  groupA: RawGroupA
  groupB: RawGroupB
  groupD: RawGroupD
  flags: AntiGamingFlag[]
  employmentRungs: EmploymentRungResult[]
  seniorityTarget: SeniorityTier
  archetypeTarget: RoleArchetype
  mode: 'light' | 'deep'
  reposAnalysed: number
  reposCloned?: number
  sectionF?: SectionF
}

METHOD: buildBrief(input: BriefAssemblerInput): EvidenceBrief

SECTION A — Profile in 90 Seconds:
operatingStyleArchetype:
  - Get seniority weights (inject SeniorityWeightsService)
  - Find which primitives are rated 'primary' for this tier
  - Map to archetype label:
    p1+p4 primary → 'Production Engineer'
    p2+p3 primary → 'Systems Architect'
    p3+p4 primary → 'Specialist'
    p1+p5 primary → 'Ops-Focused Engineer'
    p4 only strong → 'Technical Specialist'
    p3 strong, p2 moderate → 'OSS Contributor'
    fallback → 'Generalist Builder'

topThreeCapabilities:
  - Rank primitives by confidence level: strong > moderate > low > observability_gap
  - Take top 3 by rank (skip insufficient_data)
  - capability: primitive name in human-readable form (e.g. "Execution Reliability")
  - evidence: primitive.keyEvidence[0] if present, else "Evidence available — see primitive detail"

recommendedInterviewDepth:
  - flags.some(f => f.severity === 'hard_stop') OR profileLevelGate → 'deep'
  - all primitives confidence >= 'moderate_evidence' → 'light'
  - default → 'standard'

SECTION B — Tech Reality vs CV Claims:
languages:
  - From groupB.primaryLanguages: map each to { name, evidenced: percentage > 5, claimed: false, commitVolumeRank: rank }
  - claimed is always false in Light Mode (no CV data available)

frameworks:
  KNOWN_FRAMEWORKS = ['React', 'Vue', 'Angular', 'Svelte', 'Next.js', 'NestJS', 'Django', 'FastAPI', 'Flask', 'Rails', 'Spring', 'Laravel', 'Express', 'Gin', 'Echo', 'Actix', 'Rocket', 'Phoenix', 'Nuxt', 'Remix', 'Astro', 'SvelteKit']
  Scan all repos' topics[] and description for case-insensitive match
  evidenced = true if found in 2+ repos (one mention may be incidental)

infrastructure:
  INFRA_SIGNALS = ['Docker', 'Kubernetes', 'Terraform', 'AWS', 'GCP', 'Azure', 'Pulumi', 'Helm', 'Ansible', 'k8s']
  Same detection pattern as frameworks

zeroEvidenceClaims: [] (empty in Light Mode — caller populates when CV is provided)

SECTION C — Work Pattern Intelligence:
shippingVelocity:
  - Derive from p1.keyEvidence: find the string containing "Active in X of last 52 weeks" or generate equivalent
  - Format: "Active in [N] of last 52 weeks. [consistency description]"

qualityDisciplineTrajectory:
  - From p1 + p2 keyEvidence: compose "Quality signals [improving/stable] based on [evidence]"
  - If both p1 and p2 are observability_gap: "Quality trajectory unassessable from public data"

collaborationStyle:
  - From p3: if observability_gap → "Primarily working in private contexts — collaboration style unverified from public data"
  - If present: derive from reviewParticipationRate and externalPRsMerged

aiLeverageEvidence:
  - Map aiLeverageClass to human-readable string:
    'ai_operator' → "Shows evidence of high-velocity AI-assisted development with maintained quality discipline"
    'ai_architect' → "Actively configures and directs AI tooling — suggests deliberate AI workflow"
    'ai_passenger' → "High velocity without quality maintenance signals — AI use pattern warrants discussion"
    'traditional_engineer' → "Consistent hand-crafted commit patterns — no AI tool signals detected"
    'disclosure_flag' → "Style discontinuities detected — AI use pattern requires interview clarification"

communicationQuality:
  - From p3 review quality signals (wordCount, substantive rate)
  - If observability_gap: "Communication quality not assessable from available public data"

SECTION D — Red Flags & Verification Gaps:
flags: input.flags
credentialLeakDetected: input.flags.some(f => f.type === 'credential_leak')
verificationGaps: collect all observabilityGaps from all 7 primitives, deduplicate strings

SECTION E — delegate to InterviewProbeGeneratorService.generate(input.primitives, input.flags, input.archetypeTarget)

SECTION F: pass through input.sectionF if present, else omit

SECTION G — ALWAYS PRESENT, NEVER OMITTED:
epistemicBoundaries (hardcoded — never change these):
  1. "System design thinking and architectural decision-making in ambiguous situations"
  2. "Communication quality, stakeholder management, and technical leadership under pressure"
  3. "Cultural alignment, values, and team dynamics fit"
  4. "Performance under conditions unlike those observed in public repositories"
  5. "Management capability, mentoring effectiveness, and organisational influence"
  6. "Motivation, career trajectory, and long-term growth orientation"

routedProbes (hardcoded — maps 1:1 to boundaries above):
  1. { boundary: above[0], probe: "Present a system design problem relevant to the role. Observe how they handle ambiguity, trade-offs, and requirements clarification." }
  2. { boundary: above[1], probe: "Describe a time you had to communicate a complex technical decision to non-technical stakeholders. What happened?" }
  3. { boundary: above[2], probe: "What does your ideal team look like, and what role do you typically play in it?" }
  4. { boundary: above[3], probe: "Tell me about a production incident you were central to resolving. Walk me through your decision-making." }
  5. { boundary: above[4], probe: "How do you approach mentoring engineers at earlier career stages?" }
  6. { boundary: above[5], probe: "Where do you want to be technically in 3 years, and what's your plan to get there?" }

META:
profileLevelGate = Object.values(input.primitives).filter(p => p.confidence === 'insufficient_data').length > 3
reposAnalysed = input.reposAnalysed
generatedAt = new Date().toISOString()
```

---

## PROMPT 3.2 — Employment Verification Service
**Model:** Claude  
**Why Claude:** Rung logic has precise conditional rules and mandatory output language.  
**Target file:** `src/employment/verification-ladder.service.ts`

```
Build EmploymentVerificationService with the 3-rung employment verification ladder.

TYPE: EmploymentRungResult { employer: string; rungAchieved: 0|1|2|3; rungText: string; availableIn: 'light'|'deep' }

MANDATORY RUNG OUTPUT LANGUAGE (exact strings — do not paraphrase):

Rung 0: "Rung 0 — No verifiable signal available for claimed role. This is a system limitation, not a candidate failure. Proceed to interview with suggested probe."

Rung 1: "Rung 1 only — email domain match. Contribution scope unconfirmed — recommend interview verification."

Rung 2: "Rung 2 — Organisation membership confirmed. Active GitHub seat in claimed organisation verified."

Rung 3: "Rung 3 — Contribution fingerprint confirmed: active engineering activity in claimed organisation during stated period."

METHOD: verify(groupA: RawGroupA, mode: 'light' | 'deep', claimedEmployers: string[]): EmploymentRungResult[]

If claimedEmployers is empty: return []

For each employer:
1. ALWAYS attempt Rung 1 (both modes):
   - Normalise employer: lowercase, strip 'inc', 'ltd', 'llc', 'corp', 'technologies', 'software', special chars
   - Check if any groupA.commitEmailDomains contains normalised employer name OR first word of employer
   - Match: achieve Rung 1; No match: Rung 0

2. Rungs 2+3 are DEEP MODE ONLY — skip in light mode and return highest rung from step 1

EMPLOYER NAME NORMALISATION:
  normalise(name: string): string
  - toLowerCase()
  - Remove: /\b(inc|ltd|llc|corp|technologies|software|solutions|systems|group|international)\b/gi
  - Remove special chars: /[^a-z0-9\s]/g
  - Trim and collapse whitespace

In Light Mode: extract claimedEmployers from groupA.company (parse comma/slash separated values if multiple)
In Deep Mode (Rungs 2+3 added in Phase 6.9): pass org memberships and contribution data

Return EmploymentRungResult[] sorted by rungAchieved descending.
```

---

## PROMPT 3.3 — Interview Probe Generator
**Model:** Claude  
**Why Claude:** Template logic with conditional rules — small and precise.  
**Target file:** `src/brief/interview-probe-generator.service.ts`

```
Build InterviewProbeGeneratorService that generates Section E of the Evidence Brief.

METHOD: generate(
  primitives: Record<string, PrimitiveAssessment & { aiLeverageClass?: AILeverageClass }>,
  flags: AntiGamingFlag[],
  archetypeTarget: RoleArchetype
): SectionE

SectionE type from evidence-brief.types.ts.

RULES:

technicalQuestions (generate 3–5):
  - For each primitive with confidence === 'strong_evidence':
    - Take keyEvidence[0] as the basis
    - Generate a "go deeper" question based on that specific evidence
    - Examples:
      p4.keyEvidence[0] = "68% of commits in Rust across 8 repos" → question: "You appear to work primarily in Rust. Walk me through the most complex ownership/lifetime problem you've solved."
      p1.keyEvidence[0] = "Active in 38 of last 52 weeks" → question: "Your commit history shows consistent shipping cadence. Walk me through a period where that consistency was challenged and how you maintained it."
    - rationale must reference the specific evidence: "Based on observed [evidence]"
  - Cap at 5 questions — prioritise primitives with highest confidence level
  - If fewer than 3 strong_evidence primitives: supplement with moderate_evidence primitives

gapProbes:
  - For each primitive where confidence === 'observability_gap' OR 'insufficient_data':
    - Use primitive.interviewProbes[0] verbatim as the question
    - gap: "No public evidence for [primitive human-readable name]"
  - Return one probe per gap (don't duplicate if same gap appears in multiple primitives)

flagProbes:
  - For each AntiGamingFlag in flags:
    - question: flag.interviewProbe verbatim
    - DO NOT reveal the detection mechanism (the probe is already written to avoid this)
    - flagType: flag.type

suggestedInterviewerPairing (based on archetypeTarget):
  BACKEND → "Pair with a senior backend engineer who can probe system design and data layer decisions"
  FRONTEND → "Pair with a senior frontend engineer who can evaluate component architecture and accessibility awareness"
  PLATFORM_DEVOPS_SRE → "Pair with a staff SRE or platform engineer familiar with the production stack"
  DATA_ML → "Pair with a data engineer or ML engineer who can probe productionisation and pipeline quality"
  SECURITY → "Pair with a security engineer — all flag probes should be led by them"
  MOBILE → "Pair with a mobile engineer from the relevant platform (iOS/Android) based on detected stack"
```

---

## PROMPT 3.4 — Light Analysis BullMQ Processor
**Model:** Claude  
**Why Claude:** Pipeline orchestration with precise error handling and progress tracking.  
**Target file:** `src/queues/light-analysis.processor.ts`

```
Build LightAnalysisProcessor BullMQ processor for a NestJS GitHub analysis system.

QUEUE NAME: 'light-analysis'
JOB DATA: LightAnalysisJobData { analysisJobId: string, githubUsername: string, seniorityTarget: SeniorityTier, archetypeTarget: RoleArchetype }

PIPELINE STEPS (in order, with progress %):

1% — Update AnalysisJob status='processing', progress=5
5% — BriefCacheService.get(cacheKey) — if hit: store result on job, mark complete, return early
  Cache key: `brief:${githubUsername}:light:${seniorityTarget}:${archetypeTarget}`
10% — LightFetcherService.fetch(githubUsername) → rawLightData
35% — ExternalSignalService.fetch(githubUsername, rawLightData.groupB.repos) → merge into rawLightData.groupF
45% — GroupMapperService.map(rawLightData) → primitiveInputMap
50% — Run all 7 primitives in parallel (Promise.all):
  [p1, p2, p3, p4, p5, p6, p7] = await Promise.all([
    p1Service.evaluate(primitiveInputMap.p1),
    p2Service.evaluate(primitiveInputMap.p2),
    p3Service.evaluate({ ...primitiveInputMap.p3, seniorityTarget }),
    p4Service.evaluate(primitiveInputMap.p4),
    p5Service.evaluate({ ...primitiveInputMap.p5, archetypeTarget }),
    p6Service.evaluate(primitiveInputMap.p6),
    p7Service.evaluate(primitiveInputMap.p7)
  ])
65% — Run anti-gaming services in parallel:
  [commitFlag, forkFlag, burstFlag] = await Promise.all([
    commitInflationService.detect(rawLightData.groupC),
    forkDumpingService.detect(rawLightData.groupB),
    burstDormancyService.detect(rawLightData.groupC)
  ])
  launderingFlag = await repoLaunderingService.analyze(rawLightData.groupB) // external API
  flags = [commitFlag, forkFlag, burstFlag, launderingFlag].filter(Boolean) as AntiGamingFlag[]
72% — EmploymentVerificationService.verify(rawLightData.groupA, 'light', extractClaimedEmployers(rawLightData.groupA))
75% — BriefAssemblerService.buildBrief({ primitives: {p1,...,p7}, ...rawLightData, flags, employmentRungs, seniorityTarget, archetypeTarget, mode: 'light', reposAnalysed: rawLightData.groupB.totalPublicRepos })
90% — BriefCacheService.set(cacheKey, brief, 24 * 60 * 60) // 24h TTL
95% — Update AnalysisJob: result=brief, flags=flags, status='completed', progress=100

ERROR HANDLING:
  - Wrap entire pipeline in try/catch
  - On RateLimitExhaustedException: Update job status='failed', error='Rate limit exhausted — retry after [X] minutes', re-queue with delay
  - On UserNotFoundException: Update job status='failed', error='GitHub user not found'
  - On any other error: Update job status='failed', error=err.message
  - Individual service failures (primitives, anti-gaming): log warning, continue with partial result — never let one failure kill the brief
  - Collect per-service failures in meta.warnings[]

INJECT: all services + PrismaService + Logger
Use @nestjs/bullmq @Processor('light-analysis') and @Process() decorators.
Update job.updateProgress(n) throughout for frontend polling.
```

---

## PROMPT 3.5 — API Endpoints
**Model:** Claude  
**Why Claude:** NestJS controller patterns with specific validation and response shapes.  
**Target files:** `src/modules/analysis/analysis.controller.ts` (extended), `src/modules/analysis/analysis.service.ts` (extended)

```
Extend the existing AnalysisController and AnalysisService for v5.
CONTEXT: The existing analysis module has basic CRUD. Extend it — do not replace it.

NEW/UPDATED ENDPOINTS:

1. POST /analysis
Body (nestjs-zod):
{
  githubUsername: z.string().min(1).max(39)
  mode: z.enum(['LIGHT', 'DEEP']).default('LIGHT')
  seniorityTarget: z.nativeEnum(SeniorityTier).optional().default('MID')
  archetypeTarget: z.nativeEnum(RoleArchetype).optional().default('BACKEND')
}
Auth: optional (attach candidateId if authenticated)
Logic:
  - Create AnalysisJob with all fields
  - Queue to 'light-analysis' (LIGHT) or 'deep-analysis' (DEEP)
  - Return: { jobId, status: 'pending', estimatedMinutes: mode === 'LIGHT' ? 3 : 15 }

2. GET /analysis/:jobId/brief
Auth: optional (job with candidateId restricts access)
Logic:
  - Fetch AnalysisJob by id
  - If not found: 404
  - If expiresAt < now: 410 Gone, message: "Brief has expired. Request a new analysis."
  - If status !== 'completed': return { status, progress, estimatedMinutes }
  - If status === 'completed': return { status, brief: job.result, flags: job.flags, generatedAt: job.updatedAt }

3. GET /analysis/:jobId/status (update existing)
Returns: { status, progress, stage: mapProgressToStage(progress) }
Stage mapping:
  0–10 → 'queued'
  10–50 → 'fetching_data'
  50–75 → 'analysing_signals'
  75–90 → 'building_brief'
  90–100 → 'complete'

4. POST /analysis/:jobId/rerun (new)
Auth: HR_ADMIN or ADMIN role
Logic: Create new AnalysisJob with same input params, queue it. Return: { newJobId }

Use nestjs-zod for body validation. Add @ApiOperation and @ApiResponse Swagger decorators.
```

---

## PROMPT 3.6 — Integration Tests: Full Light Mode Pipeline
**Model:** Codex  
**Why Codex:** Test boilerplate and fixture setup is exactly where Codex is efficient.  
**Target file:** `test/integration/light-pipeline.integration.spec.ts`

```
Write an integration test suite for the Light Mode analysis pipeline in NestJS + Jest + Supertest.

SETUP:
- Use @nestjs/testing createTestingModule
- Mock GitHub API calls using nock — intercept @octokit REST and GraphQL calls
- Mock fixtures stored in test/fixtures/[username].json
- Spin up real BullMQ workers (use in-memory Redis via ioredis-mock or bullmq-mock pattern)
- Mock LLM calls (return canned responses) — LLM is not integrated in Phase 3

TEST PROFILES (mock these GitHub usernames):
1. 'prolific-dev' — senior, 80+ repos, high activity, many PRs, several external contributions
2. 'sparse-profile' — account < 6 months, 3 repos, minimal activity
3. 'enterprise-dev' — minimal public repos (2), all private activity inferred, empty contribution calendar

FOR EACH PROFILE:
  Test A — Job creation:
    POST /analysis { githubUsername, mode: 'LIGHT', seniorityTarget: 'SENIOR', archetypeTarget: 'BACKEND' }
    → expect 201
    → expect response body has: { jobId, status: 'pending', estimatedMinutes: 3 }

  Test B — Status polling:
    GET /analysis/:jobId/status
    → poll up to 10s with 500ms interval
    → expect eventually: { status: 'completed' }

  Test C — Brief structure validation:
    GET /analysis/:jobId/brief
    → expect status === 'completed'
    → expect brief has all 7 sections: sectionA, sectionB, sectionC, sectionD, sectionE, sectionG (sectionF is optional)
    → expect brief.primitives has all 7 keys: p1ExecutionReliability through p7AuthenticityConfidence
    → expect each primitive has: score (number|null), confidence (valid ConfidenceLevel enum value), confidenceText (non-empty string), keyEvidence (array), observabilityGaps (array), interviewProbes (array)

  Test D — Critical assertions:
    → expect brief.sectionG is present and epistemicBoundaries.length === 6
    → expect NO field named 'overallScore' or 'totalScore' anywhere in the response (assert no composite score)
    → expect every confidenceText matches one of the 5 mandatory language patterns
    → expect every antiGamingFlag has autoReject === false

FOR 'sparse-profile':
    → expect several primitives have confidence === 'observability_gap' or 'insufficient_data'
    → expect sectionA.recommendedInterviewDepth === 'standard' or 'deep' (not 'light')

FOR 'enterprise-dev':
    → expect meta.profileLevelGate === true OR multiple observability_gap primitives
    → expect sectionG is present with all 6 boundaries

FIXTURES: Create test/fixtures/prolific-dev.json, sparse-profile.json, enterprise-dev.json with realistic mock GitHub API response shapes (not real data).
```

---

## PROMPT 3.7 — Section G Invariant Tests
**Model:** Codex  
**Why Codex:** Assertion pattern generation for invariant validation.  
**Target file:** `test/unit/section-g.invariant.spec.ts`

```
Write unit tests verifying that Section G of the Evidence Brief is always present and structurally correct, regardless of input.

TEST TARGET: BriefAssemblerService.buildBrief()

INVARIANT TESTS — these must NEVER fail regardless of input:

1. Section G always present
   - Input: BriefAssemblerInput with all primitives at 'insufficient_data'
   - Expect: brief.sectionG is defined, not null, not empty

2. Section G always has exactly 6 epistemicBoundaries
   - Input: any valid BriefAssemblerInput (use multiple variants)
   - Expect: brief.sectionG.epistemicBoundaries.length === 6

3. Section G epistemicBoundaries never change
   - Input: BriefAssemblerInput with different seniority/archetype combinations
   - Expect: the boundary strings are identical across all inputs
   - Hardcode expected strings and assert equality

4. Section G routedProbes length === epistemicBoundaries length
   - Expect: brief.sectionG.routedProbes.length === 6

5. Section G present even when all primitives are insufficient_data
   - Edge case: zero repos, zero commits, zero PRs, all primitives return insufficient_data
   - Expect: sectionG still populated, profileLevelGate === true

6. No composite score in ANY output
   - Use JSON.stringify(brief) and assert the string does NOT contain 'overallScore', 'totalScore', 'compositeScore'

Use jest describe/it/expect patterns. Mock all injected services with simple stubs returning minimal valid data.
```

---