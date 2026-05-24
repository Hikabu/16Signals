# GEIS v5 — Output Schema (LOCKED)
## File: `src/scoring/evidence-brief/evidence-brief.schema.ts`

> **This schema is locked.** All scoring logic, all primitive services, and all LLM analysis build toward this contract. Do not modify the shape of this schema during implementation. If a field seems wrong, raise it before writing scoring logic — not after.

---

## Confidence Level Enum
### File: `src/shared/confidence.types.ts`

```typescript
export enum ConfidenceLevel {
  STRONG_EVIDENCE = 'STRONG_EVIDENCE',       // 3+ independent signals, 12+ months
  MODERATE_EVIDENCE = 'MODERATE_EVIDENCE',   // 1–2 signals or single time window
  LOW_EVIDENCE = 'LOW_EVIDENCE',             // Single weak signal or isolated instance
  OBSERVABILITY_GAP = 'OBSERVABILITY_GAP',  // Signal expected but absent/unverifiable
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',  // Profile-level: majority of primitives are gaps
}

// Mandatory output language — never substitute different wording
export const CONFIDENCE_LANGUAGE: Record<ConfidenceLevel, string> = {
  [ConfidenceLevel.STRONG_EVIDENCE]:
    'Demonstrated across {N} repositories and {N} months — high confidence.',
  [ConfidenceLevel.MODERATE_EVIDENCE]:
    'Evidenced in limited context — probe in interview to confirm depth.',
  [ConfidenceLevel.LOW_EVIDENCE]:
    'One instance detected — insufficient to score. Treat as unconfirmed in hiring decision.',
  [ConfidenceLevel.OBSERVABILITY_GAP]:
    'No public evidence — likely private or enterprise context. Do not penalise. Recommend: {interviewQuestion}',
  [ConfidenceLevel.INSUFFICIENT_DATA]:
    'This profile cannot be assessed from available public signals. Do not use this report as a filter for this candidate. Proceed directly to technical interview using the generated interview questions.',
};

export enum AnalysisMode {
  LIGHT = 'light',
  DEEP = 'deep',
}

export enum TargetSeniority {
  INTERN_JUNIOR = 'intern_junior',
  MID = 'mid',
  SENIOR = 'senior',
  STAFF_LEAD = 'staff_lead',
  PRINCIPAL_PLUS = 'principal_plus',
}

export enum RoleArchetype {
  BACKEND = 'backend',
  FRONTEND = 'frontend',
  PLATFORM_DEVOPS_SRE = 'platform_devops_sre',
  DATA_ML = 'data_ml',
  SECURITY = 'security',
  MOBILE = 'mobile',
}

export enum AiLeverageClassification {
  AI_OPERATOR = 'AI_OPERATOR',         // High velocity, maintained quality
  AI_ARCHITECT = 'AI_ARCHITECT',       // Guiding AI rather than accepting output
  AI_PASSENGER = 'AI_PASSENGER',       // Volume without judgment — risk flag
  TRADITIONAL_ENGINEER = 'TRADITIONAL_ENGINEER', // Consistent hand-crafted patterns
  DISCLOSURE_FLAG = 'DISCLOSURE_FLAG', // AST entropy anomalies — interview required
}

export enum EmploymentRung {
  RUNG_0 = 0, // No verifiable signal
  RUNG_1 = 1, // Email domain match
  RUNG_2 = 2, // GitHub org membership
  RUNG_3 = 3, // Contribution fingerprint confirmed
}

export enum GamingFlagSeverity {
  HARD_STOP = 'HARD_STOP',   // Credential leak — escalate regardless of other scores
  SOFT_CONCERN = 'SOFT_CONCERN', // Requires interview follow-up to clear
}
```

---

## Full Evidence Brief Schema
### File: `src/scoring/evidence-brief/evidence-brief.schema.ts`

```typescript
import {
  ConfidenceLevel,
  AnalysisMode,
  TargetSeniority,
  RoleArchetype,
  AiLeverageClassification,
  EmploymentRung,
  GamingFlagSeverity,
} from '../../shared/confidence.types';

// ─── Supporting types ────────────────────────────────────────────────────────

export interface PrimitiveEvidence {
  signal: string;           // Human-readable description of what was observed
  source: string;           // Which data group / tool produced this (e.g. "Group C", "scc", "gitleaks")
  repoOrContext?: string;   // Specific repo or context where signal was found
  observedAt?: string;      // ISO timestamp or date range (e.g. "2022–2024")
}

export interface PrimitiveAssessment {
  primitiveId: 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7';
  primitiveName: string;
  confidenceLevel: ConfidenceLevel;
  confidenceStatement: string;        // Mandatory language from CONFIDENCE_LANGUAGE map, filled in
  evidence: PrimitiveEvidence[];      // Min 0 (gap), no max
  gaps: string[];                     // What could not be observed and why
  interviewProbe?: string;            // Generated when confidence < STRONG_EVIDENCE
}

export interface GamingFlag {
  patternType:
    | 'COMMIT_INFLATION'
    | 'FORK_DUMPING'
    | 'BURST_DORMANCY'
    | 'REPOSITORY_LAUNDERING'
    | 'AI_GENERATION_DISCLOSURE_GAP'
    | 'CREDENTIAL_LEAK'
    | 'AUTHORSHIP_DISCONTINUITY';
  evidenceSummary: string;            // What triggered the flag
  confidenceScore: number;            // 0–100 — how certain is this a real flag vs false positive
  severity: GamingFlagSeverity;
  interviewProbe: string;             // Question to surface or clear the flag
  // INVARIANT: no flag sets autoReject = true. Flags are surfaced, never determinative.
}

export interface EmploymentClaim {
  claimedOrg: string;
  claimedRole?: string;
  claimedPeriod?: string;
  rungAchieved: EmploymentRung;
  rungStatement: string;   // Mandatory rung language (see employment-verifier.service.ts)
}

export interface TechClaimComparison {
  dimension: 'language' | 'framework' | 'infrastructure';
  claimed: string;
  evidenced: boolean;
  evidenceNote?: string;  // e.g. "Top language by commit volume 2022–2024"
  flagged: boolean;       // true if claimed but zero corroborating evidence
}

export interface InterviewQuestion {
  topic: string;
  question: string;
  rationale: string;      // Why this question (ties back to observed evidence or gap)
  isFromRedFlag: boolean;
}

export interface RoleMatchItem {
  requirement: string;   // From JD
  evidenced: boolean;
  evidenceNote?: string;
  probeTopic?: string;   // Only populated when evidenced = false
}

// ─── Main Evidence Brief ─────────────────────────────────────────────────────

export interface EvidenceBrief {

  // ── Metadata ──────────────────────────────────────────────────────────────
  jobId: string;
  githubUsername: string;
  analysisMode: AnalysisMode;
  targetSeniority: TargetSeniority;
  roleArchetype?: RoleArchetype;
  generatedAt: string;             // ISO timestamp
  profileLevelInsufficient: boolean; // true triggers the profile-level gate language

  // ── Section A: Profile in 90 Seconds ──────────────────────────────────────
  sectionA: {
    operatingStyleArchetype:
      | 'PRODUCTION_ENGINEER'
      | 'OSS_CONTRIBUTOR'
      | 'GENERALIST_BUILDER'
      | 'SPECIALIST'
      | 'OPS_FOCUSED'
      | 'RESEARCH_ORIENTED';
    topThreeCapabilities: Array<{
      capability: string;
      citation: string;          // Specific evidence reference
    }>;
    aiLeverageClassification: AiLeverageClassification;
    employmentVerificationSummary: EmploymentClaim[];
    recommendedInterviewDepth: 'LIGHT' | 'STANDARD' | 'DEEP';
  };

  // ── Section B: Tech Reality vs CV Claims ──────────────────────────────────
  sectionB: {
    comparisons: TechClaimComparison[];
    // Note: comparisons are populated from Group A (profile bio/company claim)
    // vs Group B (repo inventory) + Group C (commit data). In Light Mode,
    // comparisons are limited to what is visible in public profile and repo metadata.
  };

  // ── Section C: Work Pattern Intelligence ──────────────────────────────────
  sectionC: {
    shippingVelocityNote: string;         // Narrative from LLM or rule-based fallback
    qualityDisciplineTrajectory: string;  // Narrative — improving / stable / declining
    collaborationStyle: string;           // Seeks review vs avoids — from PR data
    aiLeverageEvidence: string;           // Supporting evidence for classification
    communicationQuality: string;         // LLM-assessed PR description + commit quality
  };

  // ── Section D: Red Flags & Verification Gaps ──────────────────────────────
  sectionD: {
    gamingFlags: GamingFlag[];
    verificationGaps: Array<{
      dimension: string;
      reason: string;
      interviewProbe: string;
    }>;
  };

  // ── Section E: Interview Intelligence ─────────────────────────────────────
  sectionE: {
    questions: InterviewQuestion[];   // 3–5 questions generated from actual code decisions
    // INVARIANT: questions that probe red flags do NOT reveal the detection mechanism
    interviewerPairingRecommendation?: string;
  };

  // ── Section F: Role & Stack Match ─────────────────────────────────────────
  // Populated only when jobDescription is provided. Null otherwise.
  sectionF: {
    roleMatchItems: RoleMatchItem[];
    stackOverlap: string[];
    stackGaps: string[];
    jdIntentSummary: string;  // LLM extraction of what the role actually needs
  } | null;

  // ── Section G: Epistemic Boundaries ───────────────────────────────────────
  // INVARIANT: this section is NEVER omitted, regardless of mode or data richness
  sectionG: {
    cannotAssess: Array<{
      dimension: string;
      reason: string;
      interviewRouting: string;
    }>;
  };

  // ── Seven Primitive Assessments ───────────────────────────────────────────
  primitives: {
    P1: PrimitiveAssessment;
    P2: PrimitiveAssessment;
    P3: PrimitiveAssessment;
    P4: PrimitiveAssessment;
    P5: PrimitiveAssessment;
    P6: PrimitiveAssessment;
    P7: PrimitiveAssessment;
  };

  // ── Legacy Compatibility Block ────────────────────────────────────────────
  // DEPRECATED: Populated for backward compat with current recruiter card.
  // Remove in next major version once consumers have migrated.
  legacyScorecard?: {
    capabilities: {
      backend:  { score: number; confidence: 'low' | 'medium' | 'high' };
      frontend: { score: number; confidence: 'low' | 'medium' | 'high' };
      devops:   { score: number; confidence: 'low' | 'medium' | 'high' };
    };
    ownership: {
      ownedProjects: number;
      activelyMaintained: number;
      deployedPrograms: number;
      confidence: 'low' | 'medium' | 'high';
    };
    impact: {
      activityLevel: 'high' | 'medium' | 'low';
      consistency: 'strong' | 'moderate' | 'sparse';
      externalContributions: number;
      confidence: 'low' | 'medium' | 'high';
    };
    stack: {
      languages: string[];
      tools: string[];
    };
    web3: {
      ecosystem: 'solana' | null;
      ecosystemPRs: number;
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
    } | null;
    summary: string;
  };
}
```

---

## AnalysisJob Entity Extension
### File: `prisma/schema.prisma` — extend existing `AnalysisJob` model

```prisma
model AnalysisJob {
  id              String   @id @default(cuid())
  status          JobStatus @default(PENDING)

  // Input
  githubUsername  String?
  walletAddress   String?
  mode            AnalysisMode @default(LIGHT)       // NEW
  targetSeniority TargetSeniority?                   // NEW
  roleArchetype   RoleArchetype?                     // NEW
  installationId  String?                            // NEW — Deep Mode GitHub App installation
  jobDescriptionText String?                         // NEW — optional JD for Section F

  // Progress
  stage           ProgressStage @default(QUEUED)
  percentage      Int @default(0)

  // Output
  result          Json?
  evidenceBrief   Json?           // NEW — stores EvidenceBrief

  // Relations
  userId          String?
  user            User? @relation(fields: [userId], references: [id])

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

enum AnalysisMode {
  LIGHT
  DEEP
}

enum TargetSeniority {
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

// Extend existing ProgressStage enum:
enum ProgressStage {
  QUEUED
  FETCHING_DATA
  CLONING_REPOS          // NEW — Deep Mode only
  RUNNING_TOOLS          // NEW — Deep Mode only
  ANALYZING_SIGNALS
  LLM_ANALYSIS           // NEW
  BUILDING_PROFILE
  GENERATING_BRIEF       // NEW
  COMPLETE
  FAILED
}
```

---

## API Contract Extension
### Existing: `POST /analysis`

```typescript
// Request body schema extension
// File: src/modules/analysis/dto/create-analysis.dto.ts

export const CreateAnalysisSchema = z.object({
  githubUsername: z.string().optional(),
  walletAddress:  z.string().optional(),
  mode:           z.nativeEnum(AnalysisMode).default(AnalysisMode.LIGHT),
  targetSeniority: z.nativeEnum(TargetSeniority).optional(),
  roleArchetype:  z.nativeEnum(RoleArchetype).optional(),
  installationId: z.string().optional(),      // Required when mode = DEEP
  jobDescriptionText: z.string().max(10000).optional(),
}).refine(
  (data) => data.githubUsername || data.walletAddress,
  { message: 'At least one of githubUsername or walletAddress is required' }
).refine(
  (data) => data.mode !== AnalysisMode.DEEP || data.installationId,
  { message: 'installationId is required for Deep Mode analysis' }
);
```

### New: `GET /analysis/:jobId/result`

Response shape: `{ job: AnalysisJob, evidenceBrief: EvidenceBrief, legacyScorecard?: LegacyScorecard }`

---

## Invariant Checklist

Before marking any primitive service or evidence brief service as complete, verify:

- [ ] `EvidenceBrief.primitives` has all 7 keys (P1–P7) — never fewer
- [ ] No primitive has `confidenceLevel` without a `confidenceStatement` populated from `CONFIDENCE_LANGUAGE`
- [ ] `sectionG` is present and non-empty
- [ ] `sectionD.gamingFlags` — each flag has `interviewProbe` and `confidenceScore` (0–100)
- [ ] No file contains the string `totalScore`, `overallScore`, `compositeScore`, or `finalScore`
- [ ] No `GamingFlag` has `autoReject: true` — this field must not exist
- [ ] `sectionF` is `null` when no `jobDescriptionText` was provided
- [ ] `profileLevelInsufficient` = true triggers the mandatory profile-level gate statement in Section A
