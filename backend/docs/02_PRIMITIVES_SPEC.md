# GEIS v5 — Seven Canonical Primitives
## Implementation Specification

> **Target files:** `src/scoring/primitives/p{N}-*.service.ts`  
> **Aggregator:** `src/scoring/primitives/primitive-aggregator.service.ts`

Each primitive service receives a `DataBundle` (described below) and returns a `PrimitiveAssessment` (defined in `01_OUTPUT_SCHEMA.md`). No primitive service makes network calls — all data arrives pre-fetched by the fetcher layer.

---

## DataBundle Interface
### File: `src/scoring/primitives/data-bundle.types.ts`

```typescript
// This is the input contract for ALL primitive services.
// Populated by light-fetcher.service.ts or deep-fetcher.service.ts.
// Fields marked [DEEP ONLY] are null/undefined in Light Mode.

export interface DataBundle {
  mode: AnalysisMode;
  githubUsername: string;

  // Group A — Identity
  profile: {
    bio: string | null;
    company: string | null;
    blog: string | null;
    accountCreatedAt: string;
    publicRepoCount: number;
    hireableFlag: boolean | null;
    commitEmailDomains: string[];         // distinct domains from commit history
    orgMemberships: string[];             // org login names
  };

  // Group B — Repository Inventory
  repos: Array<{
    name: string;
    isForked: boolean;
    language: string | null;
    topics: string[];
    stars: number;
    forks: number;
    createdAt: string;
    pushedAt: string;
    isArchived: boolean;
    hasReadme: boolean;
    homepageUrl: string | null;
    // [DEEP ONLY]
    testDirectoryPresent?: boolean;
    ciConfigPresent?: boolean;
    dockerfilePresent?: boolean;
    iacFilesPresent?: boolean;
    sccComplexityScore?: number;
    sccCommentDensity?: number;
    tokeiTestToCodeRatio?: number;
    gitinspectorAuthorStats?: {
      linesAdded: number;
      linesDeleted: number;
      commits: number;
      daysActive: number;
    };
    gitleaksFindingCount?: number;
    semgrepFindingCount?: number;
    actionlintIssues?: string[];
  }>;

  // Group C — Commit Intelligence
  commits: {
    frequencyDistribution: Record<string, number>; // week → count, 52 weeks
    messageSample: string[];                        // up to 50 commit messages for LLM analysis
    commitSizeHistogram: number[];                  // additions+deletions per commit, excluding merges
    mergeCommitRatio: number;
    signingRate: number;                            // 0–1
    workHourDistribution: number[];                 // 24 buckets (hour of day)
    // [DEEP ONLY]
    authoredLinesPerRepo?: Record<string, { added: number; deleted: number }>;
  };

  // Group D — Collaboration & Review
  collaboration: {
    prAuthorCount: number;
    prReviewerCount: number;
    prDescriptionSample: string[];                  // up to 20 PR descriptions for LLM
    reviewCommentDepthSample: string[];             // up to 20 review comments for LLM
    selfMergeRate: number;                          // 0–1
    prSizeHistogram: number[];                      // diff sizes
    timeToMergeMedian: number | null;               // hours
    issueTriageCount: number;
    crossRepoCommentCount: number;
  };

  // Group E — Engineering Practices (mostly [DEEP ONLY])
  practices: {
    // Available in Light Mode from file tree API
    ciConfigDetected: boolean;
    dockerfileDetected: boolean;
    iacFilesDetected: boolean;
    hasReleases: boolean;
    releaseCount: number;
    semanticVersioningDetected: boolean;
    // [DEEP ONLY]
    ciPassRateTrend?: 'improving' | 'stable' | 'degrading' | null;
    testCoverageTrend?: 'improving' | 'stable' | 'degrading' | null;
    dependabotAlertResponseTimeMedian?: number | null; // hours
    cveResponseTimeMedian?: number | null;
    secretLeakHistoryDetected?: boolean;
    secretLeakDetails?: string[];
    observabilityToolingDetected?: boolean;
    featureFlagUsageDetected?: boolean;
    sbomPresent?: boolean;
  };

  // Group F — External Signals
  external: {
    ecosystemPRs: number;
    packageRegistryPresence: Array<{
      registry: 'npm' | 'pypi' | 'crates';
      packageName: string;
      weeklyDownloads: number;
      dependentCount: number;
    }>;
    stackOverflowReputation: number | null;
    contributionCalendarActiveWeeks: number;        // out of 52
    contributionCalendarBurstScore: number;         // trailing 30d vs 12m average
  };

  // Group G — Anti-Gaming (pre-computed by anti-gaming.service.ts)
  antiGaming: {
    commitInflationRate: number;                    // 0–1 (fraction of commits below 5-line threshold)
    forkDumpingRate: number;                        // 0–1 (fraction of repos that are unmodified forks)
    burstDormancyScore: number;                     // last 30d/12m average — flag if >5x
    codeSearchSimilarityFlags: Array<{
      repoName: string;
      similarityScore: number;                      // 0–1
      matchedRepo: string;
    }>;
    aiGenerationPatternScore: number;               // 0–100 (LLM-assessed)
    credentialLeakDetected: boolean;
    credentialLeakDetails?: string[];
    authorshipDiscontinuityDetected: boolean;
  };

  // LLM Analysis Results (pre-computed by llm-analysis layer)
  llmAnalysis: {
    commitQualityScore: number;                     // 0–100
    commitQualitySummary: string;
    prDescriptionQualityScore: number;              // 0–100
    prDescriptionQualitySummary: string;
    aiGenerationClassification: AiLeverageClassification;
    aiGenerationEvidence: string;
  };

  // Solana signals from web3-adapter (nullable)
  solana: {
    deployedPrograms: Array<{
      programId: string;
      deployedAt: string;
      isActive: boolean;
      uniqueCallers: number;
    }>;
    achievements: Array<{
      type: 'hackathon_win' | 'bounty_completion';
      source: 'colosseum' | 'superteam';
      label: string;
      year: number;
    }>;
    ecosystemPRs: number;
  } | null;
}
```

---

## P1 — Execution Reliability
### File: `src/scoring/primitives/p1-execution-reliability.service.ts`

**Core question:** Can this engineer ship safely and consistently?

**Inputs from DataBundle:**
- `commits.frequencyDistribution` → cadence consistency
- `commits.commitSizeHistogram` → size discipline (from anti-gaming layer)
- `practices.ciPassRateTrend` [DEEP ONLY]
- `repos[*].tokeiTestToCodeRatio` [DEEP ONLY]
- `practices.semanticVersioningDetected`
- `practices.dependabotAlertResponseTimeMedian` [DEEP ONLY]
- `practices.hasReleases`, `releaseCount`

**Scoring logic:**
```
Evidence array:
  + Each active week in contribution calendar (≥30/52 → "strong cadence" signal)
  + Commit size discipline: antiGaming.commitInflationRate < 0.15 → positive signal
  + CI pass rate trend (DEEP: if improving or stable → strong evidence)
  + Test-to-code ratio (DEEP: tokei ratio ≥ 0.2 → positive signal)
  + Semantic versioning present → positive signal
  + Dependabot response time (DEEP: <72h median → strong signal)

Confidence assessment:
  STRONG_EVIDENCE:   3+ signals, 12+ months of activity
  MODERATE_EVIDENCE: 1–2 signals or <12 months
  LOW_EVIDENCE:      Only contribution calendar, no practice signals
  OBSERVABILITY_GAP: Repo count < 3 or all private (DEEP Mode failed to confirm)
```

**Cannot measure (always include in `gaps`):**
- Whether reliability is due to talent or team scaffolding
- Performance under novel or high-pressure conditions
- Reliability across domains not evidenced in public repos

---

## P2 — Systems Evolution
### File: `src/scoring/primitives/p2-systems-evolution.service.ts`

**Core question:** Do systems improve under this engineer's stewardship over time?

**Inputs from DataBundle:**
- `commits.messageSample` → refactor commit detection (LLM or keyword fallback)
- `repos[*].sccComplexityScore` trends over time [DEEP ONLY]
- `repos[*].pushedAt` vs `createdAt` → long-lived code survival
- `llmAnalysis.commitQualitySummary` for refactor evidence

**Scoring logic:**
```
Evidence array:
  + Repos with >2yr lifespan and active pushes → "long-lived code" signal
  + LLM-identified refactor commits → complexity reduction evidence
  + SCC complexity trend over 2+ years (DEEP: declining complexity → strong signal)
  + API surface area analysis (DEEP: from commit history patterns)

OBSERVABILITY_GAP in Light Mode is expected and normal for this primitive.
```

**Cannot measure:**
- Whether improvement is driven by candidate or team culture
- Architecture quality in systems they did not originate
- Evolution in private/classified repositories

---

## P3 — Collaboration Leverage
### File: `src/scoring/primitives/p3-collaboration-leverage.service.ts`

**Core question:** Does this engineer amplify the people around them?

**Inputs from DataBundle:**
- `collaboration.prAuthorCount` vs `prReviewerCount` → reviewer participation rate
- `collaboration.reviewCommentDepthSample` → LLM scoring of review depth
- `collaboration.selfMergeRate` → inverted signal at senior levels
- `collaboration.crossRepoCommentCount`
- `collaboration.prDescriptionSample` → LLM quality scoring
- `llmAnalysis.prDescriptionQualityScore`

**IMPORTANT qualification to always include:**
> "No public review activity observed does not mean no review activity exists. Engineers in enterprise, security, or embedded contexts conduct all review privately. This primitive carries no negative weight when absent for these contexts."

**Scoring logic:**
```
Evidence array:
  + Review participation rate (prReviewerCount / totalPRsObserved)
  + LLM review comment depth score ≥ 70 → substantive review evidence
  + prDescriptionQuality ≥ 70 → communication quality evidence
  + Self-merge rate < 0.15 at senior level → positive signal
  + crossRepoCommentCount > 10 → cross-team engagement signal

OBSERVABILITY_GAP: collaboration data < 10 PRs reviewed. Always use gap, never low score.
```

**Cannot measure:**
- Informal mentoring, verbal sessions, design docs
- Collaboration quality in private Slack/Notion/Confluence
- RFC authorship

---

## P4 — Technical Depth
### File: `src/scoring/primitives/p4-technical-depth.service.ts`

**Core question:** Can this engineer go deep when the problem genuinely requires it?

**Inputs from DataBundle:**
- `repos[*].language`, `topics` → depth by commit volume (not repo count)
- `collaboration.reviewCommentDepthSample` → architectural risk identification
- `external.packageRegistryPresence` → real-world adoption
- `solana?.deployedPrograms` → technical depth in Solana programs
- `external.stackOverflowReputation` (Tier 3, additive only)
- `llmAnalysis` for pattern identification

**Scoring logic:**
```
Primary depth signals:
  + Top 2 languages by actual commit volume (not repo count) — use gitinspector [DEEP]
    or pushed_at + language metadata [Light]
  + Evidence of fault tolerance, concurrency, data consistency patterns (LLM analysis)
  + Observability tooling detected (practices.observabilityToolingDetected)
  + Package registry downloads (external.packageRegistryPresence[].weeklyDownloads)
  + Solana deployed programs with uniqueCallers > 50 → strong depth signal

Tier 3 additive:
  + Stack Overflow reputation in relevant tech tag → additive note only
  + NEVER use absence of Stack Overflow as any signal
```

**Cannot measure:**
- Depth across domains not in public repos
- Intelligence or reasoning ability
- Depth in proprietary systems, DSLs, or classified infrastructure

---

## P5 — Operational Maturity
### File: `src/scoring/primitives/p5-operational-maturity.service.ts`

**Core question:** Can this engineer handle production reality?

**Inputs from DataBundle:**
- `practices.observabilityToolingDetected`
- `practices.featureFlagUsageDetected`
- `practices.secretLeakHistoryDetected` → HARD FLAG if true
- `practices.iacFilesDetected`
- `repos[*].iacFilesPresent` [DEEP ONLY]
- `antiGaming.credentialLeakDetected` → hardest signal in system

**CRITICAL — Credential Leak Hard Flag:**
```
IF antiGaming.credentialLeakDetected OR practices.secretLeakHistoryDetected:
  → Add HARD_STOP GamingFlag to sectionD
  → Cap P5 at OBSERVABILITY_GAP (not assessable until cleared)
  → Escalate to hiring manager regardless of other primitive scores
  → Add mandatory note: "Hard security flag. Cannot be cleared by system. Requires interview or background check."
  → Do NOT produce a score or evidence statement for P5
```

**Cannot measure:**
- Incident response behaviour under pressure
- On-call discipline and operational decision-making
- Systems reliability in live production environments

---

## P6 — AI Leverage Quality
### File: `src/scoring/primitives/p6-ai-leverage.service.ts`

**Core question:** Can this engineer effectively direct AI to produce quality outcomes?

**Inputs from DataBundle:**
- `llmAnalysis.aiGenerationClassification`
- `llmAnalysis.aiGenerationEvidence`
- `antiGaming.aiGenerationPatternScore`
- `repos[*].topics` → AI tool config files detected (cursor-rules, copilot-instructions)
- `commits.commitSizeHistogram` + `practices.ciPassRateTrend` → velocity-to-quality ratio

**Classification logic:**
```typescript
// The classification comes from llm-analysis layer.
// P6 service assembles evidence and determines confidence.
// Classifications:
//   AI_OPERATOR:           high velocity periods, maintained/improving quality
//   AI_ARCHITECT:          LLM-identified patterns of guiding vs accepting AI output
//   AI_PASSENGER:          high volume, declining quality, no iterative refinement — risk flag
//   TRADITIONAL_ENGINEER:  consistent hand-crafted patterns — NOT penalised
//   DISCLOSURE_FLAG:       entropy anomalies, style discontinuities — interview required
```

**IMPORTANT:**
- `TRADITIONAL_ENGINEER` is never presented negatively. It is a neutral finding.
- `DISCLOSURE_FLAG` is NOT an automatic rejection. It generates an interview probe only.
- The system detects patterns, not intent.

**Cannot measure:**
- Whether AI use is disclosed
- Which specific tool (Copilot vs Cursor vs raw API)
- AI leverage in domains not in public repos

---

## P7 — Authenticity Confidence
### File: `src/scoring/primitives/p7-authenticity-confidence.service.ts`

**Core question:** Is the evidence trustworthy and the identity coherent?

**Inputs from DataBundle:**
- All `antiGaming.*` fields
- `employment verification result` (passed in from employment-verifier.service)
- `antiGaming.credentialLeakDetected` → hardest signal
- `antiGaming.codeSearchSimilarityFlags`
- `antiGaming.authorshipDiscontinuityDetected`

**Logic:**
```
P7 aggregates all anti-gaming flags and employment verification into a single confidence assessment.
It does NOT score 0–100. It produces:
  - An evidence array of authenticity-supporting observations
  - A list of gaming flags (which are also surfaced in sectionD)
  - A confidence level that reflects overall trustworthiness of the evidence

Positive signals:
  + commitInflationRate < 0.10 → consistent commit sizes
  + forkDumpingRate < 0.20 → genuine project portfolio
  + burstDormancyScore < 2x → no suspicious burst before evaluation
  + codeSearchSimilarityFlags.length === 0 → no laundering detected
  + employmentRung ≥ 2 → organisation membership confirmed

Negative signals (all produce interview probes, never auto-reject):
  + commitInflationRate > 0.30 → flag
  + forkDumpingRate > 0.50 → flag (adjust repo inventory accordingly)
  + burstDormancyScore > 5x → flag
  + Any codeSearchSimilarityFlags with score > 0.40 → flag
  + aiGenerationPatternScore > 70 → DISCLOSURE_FLAG
  + credentialLeakDetected → HARD_STOP (only hard stop in system)
  + authorshipDiscontinuityDetected → flag
```

---

## Primitive Aggregator
### File: `src/scoring/primitives/primitive-aggregator.service.ts`

**Purpose:** Apply seniority-adjusted weighting to determine evidence narrative emphasis. Does NOT produce a composite score.

**Input:** All 7 `PrimitiveAssessment` objects + `targetSeniority` + `roleArchetype`

**Weighting table:**
```typescript
// Relative emphasis — not numeric weights for scoring.
// This affects: narrative ordering, which observability gaps get interview probes,
// and whether an OBSERVABILITY_GAP is flagged as "expected" vs "concerning".

const SENIORITY_WEIGHTS: Record<TargetSeniority, Record<string, 'PRIMARY' | 'HIGH' | 'MODERATE' | 'EMERGING' | 'NOT_EXPECTED'>> = {
  INTERN_JUNIOR: {
    P1: 'PRIMARY',       // Execution Reliability
    P2: 'NOT_EXPECTED',  // Systems Evolution
    P3: 'NOT_EXPECTED',  // Collaboration Leverage
    P4: 'HIGH',          // Technical Depth
    P5: 'NOT_EXPECTED',  // Operational Maturity
    P6: 'MODERATE',      // AI Leverage
    P7: 'PRIMARY',       // Authenticity (always assessed equally)
  },
  MID: {
    P1: 'PRIMARY', P2: 'EMERGING', P3: 'MODERATE',
    P4: 'HIGH', P5: 'MODERATE', P6: 'HIGH', P7: 'PRIMARY',
  },
  SENIOR: {
    P1: 'HIGH', P2: 'HIGH', P3: 'HIGH',
    P4: 'HIGH', P5: 'HIGH', P6: 'HIGH', P7: 'PRIMARY',
  },
  STAFF_LEAD: {
    P1: 'MODERATE', P2: 'PRIMARY', P3: 'PRIMARY',
    P4: 'HIGH', P5: 'HIGH', P6: 'HIGH', P7: 'PRIMARY',
  },
  PRINCIPAL_PLUS: {
    P1: 'MODERATE', P2: 'PRIMARY', P3: 'PRIMARY',
    P4: 'HIGH', P5: 'PRIMARY', P6: 'HIGH', P7: 'PRIMARY',
  },
};

// CRITICAL: A 'NOT_EXPECTED' primitive that returns OBSERVABILITY_GAP
// does NOT generate a gap warning in the Evidence Brief.
// A 'PRIMARY' primitive that returns OBSERVABILITY_GAP
// generates an explicit gap warning + interview probe.
```

**Role archetype signal elevation:**
```typescript
// Additive to seniority weights. Elevates specific signals within primitives.
const ARCHETYPE_ELEVATED_SIGNALS: Record<RoleArchetype, string[]> = {
  BACKEND: ['API design patterns', 'database migration files', 'performance tooling', 'load testing configs'],
  FRONTEND: ['TypeScript weighting', 'component library discipline', 'a11y configs', 'Storybook presence'],
  PLATFORM_DEVOPS_SRE: ['IaC presence', 'Kubernetes manifests', 'observability configs', 'GitOps patterns'],
  DATA_ML: ['notebook-to-pipeline transition', 'data validation tooling', 'model versioning', 'dbt configs'],
  SECURITY: ['CVE history management', 'responsible disclosure', 'signed releases', 'SBOM generation'],
  MOBILE: ['Xcode project quality', 'Gradle discipline', 'Fastlane presence', 'UI test frameworks'],
};

const ARCHETYPE_RED_FLAGS: Record<RoleArchetype, string[]> = {
  BACKEND: ['No error handling patterns', 'no logging/instrumentation', 'no data layer tests'],
  FRONTEND: ['No TypeScript', 'inline styles only', 'no test coverage', 'no accessibility attributes'],
  PLATFORM_DEVOPS_SRE: ['Hardcoded credentials', 'no idempotency guards', 'bash without error handling'],
  DATA_ML: ['Notebooks only', 'no reproducibility tooling', 'no data validation', 'no productionisation'],
  SECURITY: ['Any secret leak history', 'unpatched high/critical Dependabot alerts'],
  MOBILE: ['Hardcoded API keys in mobile code (critical)', 'no UI tests', 'no signing configuration'],
};
```

**Profile-level sufficiency gate:**
```typescript
// If the majority of PRIMARY primitives (for the given seniority) return OBSERVABILITY_GAP:
//   → Set evidenceBrief.profileLevelInsufficient = true
//   → Include mandatory language:
//     "This profile pattern is consistent with enterprise or regulated-industry engineering
//      contexts where public evidence is structurally absent. This is correlated with —
//      not anticorrelated with — seniority and impact. Proceed to technical interview."
```
