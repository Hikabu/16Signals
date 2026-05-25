# Colosseum → v5 Rewrite Plan
## Architecture, Schema, Roadmap & LLM Prompt Library

---

## Part 1 — Gap Analysis: Old System vs. v5 Targets

### What the old system (v3/v4) is
- Lightweight GitHub fetcher (no repo cloning)
- 8 GitHub signals → 3 capability scores (Backend/Frontend/DevOps) + Ownership counts + Impact descriptors
- Single composite output with confidence modifier
- Optional Solana wallet layer (Stage 3)
- Rule-based summary generator
- No anti-gaming, no employment verification, no LLM analysis

### What v5 requires that is fundamentally different
| Dimension | Old System | v5 Target |
|---|---|---|
| Analysis modes | Single mode | Light (public API only) + Deep (GitHub App, repo clone) |
| Output | 3 capability scores | 7 primitive Evidence Brief — no composite score |
| LLM use | Rule-based summaries | LLM for commit quality, PR analysis, AI-generation detection |
| Anti-gaming | None | Commit inflation, fork dumping, burst/dormancy, laundering, gitleaks |
| Employment verification | None | 3-rung ladder (email → org → contribution fingerprint) |
| Local tooling | None | scc, tokei, gitinspector, gitleaks, semgrep, actionlint (Deep Mode only) |
| Repo cloning | Never | Top 30 repos cloned in Deep Mode |
| Confidence language | low/medium/high | 5-tier mandatory language system |
| Output format | Flat score card | 7-section Evidence Brief (A–G) |
| Role archetypes | None | 6 archetypes with signal emphasis config |
| Seniority adjustment | None | Primitive weight table by seniority tier |

### Verdict: rewrite from scratch
Adapting the old system would require gutting every layer except the NestJS/Prisma/BullMQ scaffolding and the GitHub OAuth flow. Those are worth keeping. Everything from the fetcher inward is replaced.

---

## Part 2 — New Architecture

### 2.1 What Stays (Preserved from v3/v4)
- NestJS + TypeScript + Prisma + PostgreSQL + Redis + BullMQ stack
- GitHub OAuth + JWT auth layer
- `AnalysisJob` as the source of truth (extended, not replaced)
- `@octokit/rest` + `@octokit/graphql` clients
- Module structure: `auth/`, `analysis/`, `admin/`
- Zod env validation, helmet, throttler, pino logging

### 2.2 New Module Map

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
│   └── admin/                              # UNCHANGED
│
├── github/                                 # NEW top-level domain
│   ├── light-fetcher/                      # NEW — public API only, Groups A–G partial
│   │   ├── light-fetcher.service.ts
│   │   └── light-fetcher.types.ts
│   ├── deep-fetcher/                       # NEW — clones top-30, runs local tools
│   │   ├── deep-fetcher.service.ts
│   │   ├── repo-cloner.service.ts
│   │   └── deep-fetcher.types.ts
│   ├── graphql-client/                     # NEW — batched GraphQL query builder
│   │   └── graphql-client.service.ts
│   └── rate-limit/                         # NEW — budget tracker + circuit breaker
│       └── rate-limit.service.ts
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
│   ├── data-groups/                        # NEW — raw signal grouping A–G
│   │   └── group-mapper.service.ts
│   ├── primitives/                         # NEW — 7 primitive evaluators
│   │   ├── p1-execution-reliability.service.ts
│   │   ├── p2-systems-evolution.service.ts
│   │   ├── p3-collaboration-leverage.service.ts
│   │   ├── p4-technical-depth.service.ts
│   │   ├── p5-operational-maturity.service.ts
│   │   ├── p6-ai-leverage.service.ts
│   │   └── p7-authenticity-confidence.service.ts
│   ├── seniority/                          # NEW — weight table application
│   │   └── seniority-weights.service.ts
│   └── archetype/                          # NEW — role signal emphasis
│       └── archetype-config.service.ts
│
├── anti-gaming/                            # NEW top-level domain
│   ├── commit-inflation.service.ts
│   ├── fork-dumping.service.ts
│   ├── burst-dormancy.service.ts
│   ├── repo-launcher.service.ts            # GitHub Code Search + Copyleaks
│   └── ai-generation-detector.service.ts
│
├── employment/                             # NEW
│   └── verification-ladder.service.ts     # 3 rungs
│
├── llm/                                    # NEW — all LLM calls isolated here
│   ├── llm-client.service.ts              # Wraps Anthropic API
│   ├── commit-quality.prompt.ts
│   ├── pr-depth.prompt.ts
│   ├── ai-generation.prompt.ts
│   └── readme-scorer.prompt.ts
│
├── brief/                                  # NEW — Evidence Brief assembler
│   ├── brief-assembler.service.ts
│   ├── confidence-language.service.ts     # Mandatory 5-tier language
│   └── interview-probe-generator.service.ts
│
├── queues/
│   ├── light-analysis.processor.ts        # NEW — replaces analysis.processor
│   ├── deep-analysis.processor.ts         # NEW
│   └── rescore.processor.ts               # UNCHANGED
│
└── shared/
    ├── guards/ decorators/ interceptors/
    └── crypto.util.ts
```

### 2.3 Data Flow

```
LIGHT MODE
POST /analysis { githubUsername, mode: 'light', seniorityTarget?, archetypeTarget?, jobDescriptionId? }
  → AnalysisJob created (mode=LIGHT)
  → Cache check (key: username:light:seniority:archetype)
  → BullMQ → light-analysis.processor
      ├─ LightFetcherService.fetch(username)       ~60s  [Groups A,B(public),C(api),D(public),F]
      ├─ ExternalSignalService.fetch()             ~15s  [npm/PyPI/Cargo/StackOverflow]
      ├─ AntiGamingService.analyzeLight()          ~30s  [API patterns + GH Code Search]
      ├─ LLMService.analyzeLight()                 ~30s  [commit msg quality, PR depth, AI-gen]
      └─ BriefAssemblerService.buildBrief()        ~15s  [7 primitives + confidence + sections A–G]
  → Result stored, cache set, job complete
  < 3 min total

DEEP MODE
POST /evaluation-links { candidateEmail, seniorityTarget, archetypeTarget }
  → EvaluationLink created, email sent with GitHub App install link
  → Candidate installs GitHub App (OAuth), grants repo access
  → Webhook: installation event received → Deep AnalysisJob created
  → BullMQ → deep-analysis.processor
      ├─ DeepFetcherService.crawl()                ~60s  [all repos, full GraphQL batch]
      ├─ RepoClonerService.cloneTop30()            ~5-8m [parallel 4 workers]
      ├─ ToolRunnerService.runAll()                        [scc+tokei+gitinspector+gitleaks+semgrep]
      ├─ ExternalSignalService.fetch()             ~30s
      ├─ EmploymentLadderService.verify()          ~30s  [rungs 1–3]
      ├─ AntiGamingService.analyzeDeep()           ~2m   [full clone + Copyleaks]
      ├─ LLMService.analyzeDeep()                  ~60s  [full corpus]
      └─ BriefAssemblerService.buildBrief()        ~30s
  → Employer notified
  8–15 min total
```

---

## Part 3 — Schema Changes

### 3.1 Prisma Schema Delta (changes from current schema)

```prisma
// ─── EXTENDED ───────────────────────────────────────────────────────────────
model AnalysisJob {
  id              String          @id @default(cuid())
  status          JobStatus       @default(PENDING)
  mode            AnalysisMode    @default(LIGHT)          // NEW
  githubUsername  String?
  walletAddress   String?
  seniorityTarget SeniorityTier?                           // NEW
  archetypeTarget RoleArchetype?                           // NEW
  jobDescriptionId String?                                  // NEW — for section F
  
  progress        Json            @default("{}")
  result          Json?           // EvidenceBrief JSON
  flags           Json?           // NEW — anti-gaming flags array
  
  userId          String?
  user            User?           @relation(fields: [userId], references: [id])
  evaluationLinkId String?                                  // NEW
  evaluationLink  EvaluationLink? @relation(fields: [evaluationLinkId], references: [id])
  
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  expiresAt       DateTime?                                // NEW — Deep Mode brief expiry
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
  id              String    @id @default(cuid())
  token           String    @unique @default(cuid())
  candidateEmail  String
  status          LinkStatus @default(PENDING)
  
  seniorityTarget SeniorityTier
  archetypeTarget RoleArchetype
  jobDescriptionId String?
  
  // GitHub App installation data (populated on candidate consent)
  installationId  String?
  installationToken String?                                // AES-256-GCM encrypted
  grantedRepoIds  Json?                                   // array of repo IDs consented
  
  employerId      String
  employer        Employer    @relation(fields: [employerId], references: [id])
  analysisJobs    AnalysisJob[]
  
  createdAt       DateTime    @default(now())
  expiresAt       DateTime
  usedAt          DateTime?
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
  githubOrgSlug   String?                                 // for employment verification
  evaluationLinks EvaluationLink[]
  jobDescriptions JobDescription[]
  users           User[]
  createdAt       DateTime  @default(now())
}

model JobDescription {
  id              String    @id @default(cuid())
  title           String
  rawText         String
  extractedSignals Json?                                  // LLM-extracted requirements
  employerId      String
  employer        Employer  @relation(fields: [employerId], references: [id])
  analysisJobs    AnalysisJob[]
  createdAt       DateTime  @default(now())
}

// ─── NEW: Outcome tracking (for anti-gaming calibration loop) ───────────────
model HireOutcome {
  id              String    @id @default(cuid())
  analysisJobId   String    @unique
  analysisJob     AnalysisJob @relation(fields: [analysisJobId], references: [id])
  hired           Boolean
  performanceRating Int?    // 1–5 at 90 days
  notes           String?
  recordedAt      DateTime  @default(now())
}
```

### 3.2 Evidence Brief JSON Contract (replaces old result schema)

```typescript
// types/evidence-brief.types.ts — the locked output contract

export type ConfidenceLevel =
  | 'strong_evidence'      // 3+ independent signals, 12+ months
  | 'moderate_evidence'    // 1-2 signals or single time window
  | 'low_evidence'         // single weak/isolated signal
  | 'observability_gap'    // expected but absent (likely private work)
  | 'insufficient_data';   // profile-level gate — do not filter

export type AILeverageClass =
  | 'ai_operator'          // high velocity, maintained quality
  | 'ai_architect'         // guiding AI, not accepting output
  | 'ai_passenger'         // volume without judgment — risk flag
  | 'traditional_engineer' // consistent hand-crafted patterns
  | 'disclosure_flag';     // AST entropy anomaly — interview required

export interface PrimitiveAssessment {
  score: number | null;                  // null when insufficient_data
  confidence: ConfidenceLevel;
  confidenceText: string;                // mandatory language from spec
  keyEvidence: string[];                 // specific, cited, traceable
  observabilityGaps: string[];
  interviewProbes: string[];
}

export interface EmploymentVerification {
  employer: string;                      // as claimed on CV/profile
  rungAchieved: 0 | 1 | 2 | 3;
  rungText: string;                      // mandatory language from spec
  availableIn: 'light' | 'deep';
}

export interface AntiGamingFlag {
  type: 'commit_inflation' | 'fork_dumping' | 'burst_dormancy' | 'repo_laundering' | 'ai_generation_gap' | 'credential_leak';
  severity: 'hard_stop' | 'soft_concern';
  evidence: string;
  confidenceScore: number;               // 0–100
  interviewProbe: string;
  autoReject: false;                     // always false per spec
}

export interface EvidenceBrief {
  // Section A — Profile in 90 Seconds
  sectionA: {
    operatingStyleArchetype: string;
    topThreeCapabilities: Array<{ capability: string; evidence: string }>;
    aiLeverageClassification: AILeverageClass;
    employmentVerification: EmploymentVerification[];
    analysisMode: 'light' | 'deep';
    recommendedInterviewDepth: 'light' | 'standard' | 'deep';
  };

  // Section B — Tech Reality vs CV Claims
  sectionB: {
    languages: Array<{
      name: string;
      claimed: boolean;
      evidenced: boolean;
      commitVolumeRank?: number;
      yearsActive?: number;
    }>;
    frameworks: Array<{ name: string; claimed: boolean; evidenced: boolean; depth?: string }>;
    infrastructure: Array<{ name: string; claimed: boolean; evidenced: boolean }>;
    zeroEvidenceClaims: string[];
  };

  // Section C — Work Pattern Intelligence
  sectionC: {
    shippingVelocity: string;
    qualityDisciplineTrajectory: string;
    collaborationStyle: string;
    aiLeverageEvidence: string;
    communicationQuality: string;
  };

  // Section D — Red Flags & Verification Gaps
  sectionD: {
    flags: AntiGamingFlag[];
    verificationGaps: string[];
    credentialLeakDetected: boolean;
  };

  // Section E — Interview Intelligence
  sectionE: {
    technicalQuestions: Array<{ question: string; rationale: string }>;
    gapProbes: Array<{ question: string; gap: string }>;
    flagProbes: Array<{ question: string; flagType: string }>;
    suggestedInterviewerPairing: string;
  };

  // Section F — Role & Stack Match (Deep Mode + JD only)
  sectionF?: {
    overlapScore: number;               // 0–100
    matchedSignals: string[];
    gapSignals: string[];
    jdIntentSummary: string;
  };

  // Section G — What This Cannot Tell You (always present)
  sectionG: {
    epistemicBoundaries: string[];
    routedProbes: Array<{ boundary: string; probe: string }>;
  };

  // Seven Primitive Assessments
  primitives: {
    p1ExecutionReliability: PrimitiveAssessment;
    p2SystemsEvolution: PrimitiveAssessment;
    p3CollaborationLeverage: PrimitiveAssessment;
    p4TechnicalDepth: PrimitiveAssessment;
    p5OperationalMaturity: PrimitiveAssessment;
    p6AILeverage: PrimitiveAssessment;
    p7AuthenticityConfidence: PrimitiveAssessment;
  };

  // Metadata
  meta: {
    analysisMode: 'light' | 'deep';
    seniorityTarget: string;
    archetypeTarget: string;
    generatedAt: string;                 // ISO
    reposAnalysed: number;
    reposCloned?: number;                // Deep Mode only
    profileLevelGate: boolean;           // true = insufficient data for senior candidate
  };
}
```

---
