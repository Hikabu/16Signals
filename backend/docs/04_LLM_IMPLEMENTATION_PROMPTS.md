# GEIS v5 — LLM Implementation Prompts
## Use these when generating code with AI assistants

> These prompts are designed to be pasted directly into Claude or another coding LLM. Each is self-contained. They reference specific files from the architecture docs. Read the reference files before running each prompt.

---

## PROMPT 01 — Confidence Types & Shared Enums

**Reference files before running:** `01_OUTPUT_SCHEMA.md`

```
You are implementing the GitHub Engineering Intelligence System v5 (GEIS v5).

Create the file: src/shared/confidence.types.ts

This file defines all enums and confidence language constants used across the entire system. It has no imports from the project (only TypeScript).

Requirements:
1. Export `ConfidenceLevel` enum with exactly these values:
   STRONG_EVIDENCE, MODERATE_EVIDENCE, LOW_EVIDENCE, OBSERVABILITY_GAP, INSUFFICIENT_DATA

2. Export `CONFIDENCE_LANGUAGE` as a Record<ConfidenceLevel, string> with the EXACT mandatory language strings (see schema doc). Use {N} and {interviewQuestion} as placeholders.

3. Export `AnalysisMode` enum: LIGHT, DEEP
4. Export `TargetSeniority` enum: INTERN_JUNIOR, MID, SENIOR, STAFF_LEAD, PRINCIPAL_PLUS
5. Export `RoleArchetype` enum: BACKEND, FRONTEND, PLATFORM_DEVOPS_SRE, DATA_ML, SECURITY, MOBILE
6. Export `AiLeverageClassification` enum: AI_OPERATOR, AI_ARCHITECT, AI_PASSENGER, TRADITIONAL_ENGINEER, DISCLOSURE_FLAG
7. Export `EmploymentRung` enum with numeric values: 0, 1, 2, 3
8. Export `GamingFlagSeverity` enum: HARD_STOP, SOFT_CONCERN

INVARIANT: No composite score types exist in this file. There is no totalScore, overallScore, or compositeScore type anywhere in this file.

Output ONLY the TypeScript file. No explanation.
```

---

## PROMPT 02 — Output Schema Types

**Reference files before running:** `01_OUTPUT_SCHEMA.md`

```
You are implementing the GitHub Engineering Intelligence System v5 (GEIS v5).

Create the file: src/scoring/evidence-brief/evidence-brief.schema.ts

This file defines the locked output schema. It imports from src/shared/confidence.types.ts.

Implement ALL interfaces exactly as specified in 01_OUTPUT_SCHEMA.md:
- PrimitiveEvidence
- PrimitiveAssessment
- GamingFlag
- EmploymentClaim
- TechClaimComparison
- InterviewQuestion
- RoleMatchItem
- EvidenceBrief (the main interface)

INVARIANTS — verify each before outputting:
- EvidenceBrief has no totalScore, overallScore, compositeScore, or finalScore field
- GamingFlag has no autoReject field
- sectionG exists in EvidenceBrief and is never optional
- sectionF is typed as the full object | null (null when no job description)
- primitives is typed as { P1, P2, P3, P4, P5, P6, P7 } — all 7 required, no optional
- legacyScorecard is optional (marked with ?)

Output ONLY the TypeScript file. No explanation.
```

---

## PROMPT 03 — DataBundle Types

**Reference files before running:** `02_PRIMITIVES_SPEC.md`

```
You are implementing the GitHub Engineering Intelligence System v5 (GEIS v5).

Create the file: src/scoring/primitives/data-bundle.types.ts

This file defines the DataBundle interface — the input contract for ALL primitive services.

Implement the DataBundle interface exactly as specified in 02_PRIMITIVES_SPEC.md.

Fields marked [DEEP ONLY] should be typed as optional (with ?) and documented with a comment: // DEEP MODE ONLY.

INVARIANT: DataBundle has NO scoring methods, NO score fields, NO computed properties. It is a pure data container.

After the interface, export a helper:
export function isDeepMode(bundle: DataBundle): boolean {
  return bundle.mode === AnalysisMode.DEEP;
}

Output ONLY the TypeScript file. No explanation.
```

---

## PROMPT 04 — P1 Execution Reliability Service

**Reference files before running:** `02_PRIMITIVES_SPEC.md`, `01_OUTPUT_SCHEMA.md`

```
You are implementing the GitHub Engineering Intelligence System v5 (GEIS v5).

Create the file: src/scoring/primitives/p1-execution-reliability.service.ts

This is a NestJS @Injectable() service. Import from:
- src/shared/confidence.types.ts
- src/scoring/primitives/data-bundle.types.ts
- src/scoring/evidence-brief/evidence-brief.schema.ts

Implement one public method:
  assess(bundle: DataBundle): PrimitiveAssessment

The method must:
1. Set primitiveId: 'P1', primitiveName: 'Execution Reliability'
2. Build an evidence array from DataBundle signals as specified in 02_PRIMITIVES_SPEC.md (P1 section)
3. Compute a ConfidenceLevel using the rules in 02_PRIMITIVES_SPEC.md
4. Build the confidenceStatement by substituting values into the CONFIDENCE_LANGUAGE template
5. Always include the gaps array (things that cannot be measured) as specified
6. Generate an interviewProbe when confidenceLevel is not STRONG_EVIDENCE

INVARIANTS:
- Method returns PrimitiveAssessment — no score field, no number output
- OBSERVABILITY_GAP is set when repo count < 3 OR (Light Mode AND no practice signals available)
- The gaps array always contains the 3 items listed in the spec: team scaffolding, pressure performance, cross-domain reliability
- No network calls — all data comes from bundle

Write full NestJS service with constructor (no injected dependencies needed — pure logic service).
Output ONLY the TypeScript file. No explanation.
```

---

## PROMPT 05 — P7 Authenticity Confidence Service

**Reference files before running:** `02_PRIMITIVES_SPEC.md`, `01_OUTPUT_SCHEMA.md`, `03_LLM_PROMPTS_AND_ANTIGAMING.md`

```
You are implementing the GitHub Engineering Intelligence System v5 (GEIS v5).

Create the file: src/scoring/primitives/p7-authenticity-confidence.service.ts

This NestJS service aggregates ALL anti-gaming signals and employment verification into the P7 primitive assessment.

Implement one public method:
  assess(bundle: DataBundle, employmentClaims: EmploymentClaim[]): PrimitiveAssessment

The method must:
1. Set primitiveId: 'P7', primitiveName: 'Authenticity Confidence'
2. Process each anti-gaming detection result from bundle.antiGaming
3. For each detected issue, produce a GamingFlag with:
   - patternType (enum value)
   - evidenceSummary (human-readable description of what triggered it)
   - confidenceScore (0–100)
   - severity (HARD_STOP for credential leaks only, SOFT_CONCERN for everything else)
   - interviewProbe (question to surface or clear the flag WITHOUT revealing the detection mechanism)

4. Handle credential leak (HARD_STOP) specially:
   - severity: HARD_STOP
   - Add a note: "Hard security flag. Cannot be cleared by this system. Requires interview or background check."
   - confidenceLevel for P7: OBSERVABILITY_GAP (not assessable until cleared)

5. Compute overall ConfidenceLevel:
   - All clean signals → STRONG or MODERATE based on completeness
   - Any SOFT_CONCERN flags → MODERATE at best
   - Any HARD_STOP → OBSERVABILITY_GAP

INVARIANTS:
- No flag has an autoReject property — this field must not exist
- No flag sets confidenceLevel to a failure state alone — flags inform, they do not decide
- GamingFlag.interviewProbe must not mention "detection system", "algorithm", "anti-gaming", "we checked", or any system internals
- Credential leak = HARD_STOP severity + OBSERVABILITY_GAP primitive confidence — nothing stronger

Output ONLY the TypeScript file. No explanation.
```

---

## PROMPT 06 — Anti-Gaming Service

**Reference files before running:** `03_LLM_PROMPTS_AND_ANTIGAMING.md`

```
You are implementing the GitHub Engineering Intelligence System v5 (GEIS v5).

Create the file: src/scoring/signal-extractor/anti-gaming.service.ts

This NestJS @Injectable() service runs BEFORE primitives are computed. It populates DataBundle.antiGaming from raw fetched data.

Implement these public methods, each returning the relevant DataBundle.antiGaming sub-field:

1. detectCommitInflation(histogram: number[]): { rate: number; flagged: boolean }
   - See algorithm spec in 03_LLM_PROMPTS_AND_ANTIGAMING.md
   - Threshold: 30% rate → flagged

2. detectForkDumping(repos: Array<{ isForked: boolean; stars: number; topics: string[]; pushedAt: string; createdAt: string; gitinspectorAuthorStats?: any }>): { rate: number; flagged: boolean; unmodifiedForkNames: string[] }
   - Light Mode heuristic: fork + zero stars + zero topics + pushedAt ≈ createdAt (within 1 day) → unmodified
   - Deep Mode: use gitinspectorAuthorStats.commits === 0 for candidate email
   - Threshold: 50% rate → flagged

3. detectBurstDormancy(burstScore: number, evaluationTriggeredRecently: boolean): { score: number; flagged: boolean; evaluationCorrelated: boolean }
   - Threshold: burstScore > 5 → flagged
   - evaluationCorrelated: true when flagged AND evaluationTriggeredRecently

4. async detectRepositoryLaundering(repos, codeSearchResults): Promise<Array<{ repoName: string; similarityScore: number; matchedRepo: string }>>
   - Input codeSearchResults: pre-fetched GitHub Code Search API results
   - Flag repos where matched file count / total file count > 0.40
   - Return only flagged repos

5. processGitleaksOutput(findings: any[]): { detected: boolean; details: string[] }
   - ANY finding = detected = true
   - details: array of human-readable finding summaries (never include raw secret values)

6. detectAuthorshipDiscontinuity(repos: any[], gitinspectorResults: any[]): boolean
   - Deep Mode: use gitinspector per-author stats to check if candidate email authored expected commits
   - Light Mode: heuristic — star count > 100 on repo with < 10 commits by consistent author pattern

INVARIANTS:
- No method makes network calls (data is passed in)
- No method returns a score that maps to automatic rejection
- All threshold values are constants exported at top of file (for easy tuning)

Output ONLY the TypeScript file. No explanation.
```

---

## PROMPT 07 — LLM Client Service

**Reference files before running:** `03_LLM_PROMPTS_AND_ANTIGAMING.md`

```
You are implementing the GitHub Engineering Intelligence System v5 (GEIS v5).

Create the file: src/scoring/llm-analysis/llm-client.service.ts

This NestJS @Injectable() service calls the Anthropic Claude API for all NLP analysis.
Uses model: claude-sonnet-4-20250514
Max tokens: 1000 per call
API key: from ConfigService ('ANTHROPIC_API_KEY')

Implement one public method:
  async analyseProfile(request: LlmAnalysisRequest): Promise<LlmAnalysisResult>

The method must:
1. Build three prompts using the builder functions from:
   - src/scoring/llm-analysis/prompts/commit-quality.prompt.ts
   - src/scoring/llm-analysis/prompts/pr-depth.prompt.ts
   - src/scoring/llm-analysis/prompts/ai-generation.prompt.ts

2. Make THREE parallel API calls (Promise.all) — one per prompt

3. Parse each response as JSON. If JSON parsing fails:
   - Log the error with pino logger
   - Return safe defaults (score: 50, summary: "Analysis unavailable — LLM response parse error")
   - Never throw — always return a valid LlmAnalysisResult

4. Combine results into LlmAnalysisResult

Error handling:
- Network timeout (>30s): return safe defaults, log warning
- API error (non-200): return safe defaults, log error with status code
- Invalid JSON response: return safe defaults, log raw response (truncated to 200 chars)

INVARIANT: This service NEVER fails the analysis job. It degrades gracefully. All primitives can run with safe-default LLM results.

Also implement the LlmAnalysisRequest and LlmAnalysisResult interfaces in this file (or import from a types file if you prefer).

Output ONLY the TypeScript file. No explanation.
```

---

## PROMPT 08 — Primitive Aggregator Service

**Reference files before running:** `02_PRIMITIVES_SPEC.md`

```
You are implementing the GitHub Engineering Intelligence System v5 (GEIS v5).

Create the file: src/scoring/primitives/primitive-aggregator.service.ts

This NestJS @Injectable() service:
1. Takes 7 PrimitiveAssessment objects + TargetSeniority + optional RoleArchetype
2. Determines the evidence narrative ordering (which primitives lead the brief)
3. Applies the profile-level sufficiency gate
4. Returns { orderedPrimitives, profileLevelInsufficient, insufficientDataStatement? }

Implement the SENIORITY_WEIGHTS and ARCHETYPE_ELEVATED_SIGNALS constants exactly as specified in 02_PRIMITIVES_SPEC.md.

Implement the profile-level sufficiency gate:
- Identify which primitives are 'PRIMARY' for the given seniority
- If MAJORITY of PRIMARY primitives have confidenceLevel === OBSERVABILITY_GAP:
  → profileLevelInsufficient = true
  → insufficientDataStatement = the mandatory language from spec

CRITICAL INVARIANT:
- This service produces NO numeric score, NO composite value, NO ranking number
- Output is ordered narrative, not a number
- A 'NOT_EXPECTED' primitive with OBSERVABILITY_GAP does NOT contribute to insufficiency count
- P7 (Authenticity) weight is ALWAYS 'PRIMARY' regardless of seniority — never weighted lower

Also implement the archetype red flag detector:
  detectArchetypeRedFlags(bundle: DataBundle, archetype: RoleArchetype): string[]
  Returns array of human-readable red flag strings from ARCHETYPE_RED_FLAGS map

Output ONLY the TypeScript file. No explanation.
```

---

## PROMPT 09 — Evidence Brief Service

**Reference files before running:** `01_OUTPUT_SCHEMA.md`, `02_PRIMITIVES_SPEC.md`

```
You are implementing the GitHub Engineering Intelligence System v5 (GEIS v5).

Create the file: src/scoring/evidence-brief/evidence-brief.service.ts

This NestJS @Injectable() service is the final assembly layer. It takes all computed data and produces the EvidenceBrief.

Inject:
- PrimitiveAggregatorService
- EmploymentVerifierService
- All 7 primitive services (P1–P7)

Implement one public method:
  async build(bundle: DataBundle, jobId: string, jobDescription?: string): Promise<EvidenceBrief>

The method must populate ALL sections (A–G) as defined in 01_OUTPUT_SCHEMA.md.

Section A:
- operatingStyleArchetype: infer from dominant primitive patterns (P1 heavy → PRODUCTION_ENGINEER, P3 heavy → OSS_CONTRIBUTOR, etc.)
- topThreeCapabilities: pull top 3 evidence items from highest-confidence primitives
- aiLeverageClassification: from P6
- employmentVerificationSummary: from EmploymentVerifierService
- recommendedInterviewDepth: DEEP if profileLevelInsufficient, STANDARD normally, LIGHT if 5+ STRONG_EVIDENCE primitives

Section G:
INVARIANT: Section G is NEVER omitted. Populate with the 8 epistemic boundary items from 00_MASTER_ARCHITECTURE.md:
[Creativity, Systems intuition, Leadership under ambiguity, Product judgment, Learning velocity, Adaptability, Founder energy, Cultural fit]
Each with the interview routing suggestion from the spec.

INVARIANT checklist (implement as a private method validateBrief(brief: EvidenceBrief)):
1. All 7 primitive keys present in brief.primitives
2. Every primitive has confidenceLevel and confidenceStatement
3. sectionG is present and has exactly 8 items
4. No field named totalScore, overallScore, compositeScore, finalScore exists anywhere in brief
5. sectionF is null when jobDescription is not provided

Throw an Error if validateBrief fails — this is a hard invariant violation, not a soft warning.

Output ONLY the TypeScript file. No explanation.
```

---

## PROMPT 10 — Integration Test Suite

**Reference files before running:** All previous docs

```
You are implementing tests for the GitHub Engineering Intelligence System v5 (GEIS v5).

Create the file: src/scoring/evidence-brief/__tests__/evidence-brief.invariants.spec.ts

This test suite verifies that ALL system invariants hold across a set of fixture profiles.

Create 5 fixture DataBundles representing:
1. MINIMAL_PROFILE: account age 3 months, 2 public repos, no stars, no PRs — should produce INSUFFICIENT_DATA for most primitives
2. SENIOR_ENTERPRISE: 8yr account, all private (empty public repos) — should produce OBSERVABILITY_GAP + profileLevelInsufficient = true + mandatory enterprise language
3. ACTIVE_OSS_CONTRIBUTOR: 200+ public repos, many starred, frequent PRs, review activity — should produce STRONG_EVIDENCE for P1, P3, P4
4. GAMING_SUSPECT: commit inflation (80% sub-5-line commits) + burst score 8x + 1 code similarity flag — should produce soft concern flags in sectionD, NOT rejection
5. CREDENTIAL_LEAK: gitleaks detected = true — should produce HARD_STOP in sectionD, P5 at OBSERVABILITY_GAP

For EACH fixture, verify these invariants:
- [ ] evidenceBrief.primitives has keys P1, P2, P3, P4, P5, P6, P7
- [ ] Every primitive.confidenceLevel is a valid ConfidenceLevel enum value
- [ ] Every primitive.confidenceStatement is non-empty string
- [ ] evidenceBrief.sectionG exists and has length > 0
- [ ] No JSON.stringify(evidenceBrief).includes('totalScore')
- [ ] No JSON.stringify(evidenceBrief).includes('autoReject')
- [ ] sectionD.gamingFlags — each has interviewProbe (non-empty string)
- [ ] CREDENTIAL_LEAK fixture: sectionD.gamingFlags has at least one with severity === HARD_STOP

Additional tests:
- Profile-level gate: SENIOR_ENTERPRISE profile triggers profileLevelInsufficient = true
- Seniority weighting: INTERN_JUNIOR profile — P2 OBSERVABILITY_GAP does NOT generate gap warning
- P3 null collision: ACTIVE_OSS_CONTRIBUTOR with zero review data → OBSERVABILITY_GAP not LOW_EVIDENCE
- Section F null: when no jobDescription provided, evidenceBrief.sectionF === null

Use jest. Mock the LLM client service to return stable test fixtures.
Output ONLY the TypeScript test file. No explanation.
```

---

## PROMPT 11 — Deep Mode Processor

**Reference files before running:** `00_MASTER_ARCHITECTURE.md`, `03_LLM_PROMPTS_AND_ANTIGAMING.md`

```
You are implementing the GitHub Engineering Intelligence System v5 (GEIS v5).

Create the file: src/queues/deep-analysis.processor.ts

This is a BullMQ processor (@Processor('deep-analysis')) for the Deep Mode analysis pipeline.

The processor orchestrates:
1. Stage: CLONING_REPOS — clone top 30 repos in parallel (4 workers) to /tmp/geis-<jobId>/
2. Stage: RUNNING_TOOLS — run scc, tokei, gitinspector, gitleaks, semgrep per repo in parallel
3. Stage: ANALYZING_SIGNALS — populate DataBundle from all fetched data
4. Stage: LLM_ANALYSIS — call LlmClientService.analyseProfile
5. Stage: BUILDING_PROFILE — run all 7 primitive services
6. Stage: GENERATING_BRIEF — call EvidenceBriefService.build
7. Stage: COMPLETE — store result, set cache, mark job complete

CRITICAL requirements:
1. Cleanup: ALWAYS delete /tmp/geis-<jobId>/ on completion (success OR failure) — use try/finally
2. Source code NEVER persists beyond the analysis session
3. Stage updates: update job progress (stage + percentage) at each stage transition
4. Graceful degradation: if a tool fails to run (binary not found, timeout), log warning and continue with null for that tool's output — do NOT fail the job
5. Clone via HTTPS with installation token: git clone https://x-access-token:<token>@github.com/<owner>/<repo>.git

Error handling:
- Clone failure for a single repo: skip it, log, continue with remaining repos
- All clones fail: fall back to Light Mode data, note in Evidence Brief that Deep Mode tools were unavailable
- gitleaks timeout: log warning, set credentialLeakDetected = false, add note to sectionD

Inject all required services. Use ConfigService for GITHUB_APP_PRIVATE_KEY, GITHUB_APP_ID.

Output ONLY the TypeScript file. No explanation.
```

---

## PROMPT 12 — Migration: Legacy Scorecard Compatibility

**Reference files before running:** `01_OUTPUT_SCHEMA.md`, original `PLAN__1_.md`

```
You are implementing the GitHub Engineering Intelligence System v5 (GEIS v5).

Create the file: src/scoring/evidence-brief/legacy-scorecard-mapper.service.ts

This NestJS service computes the legacyScorecard block from the v5 EvidenceBrief primitives for backward compatibility.

The legacyScorecard replicates the current schema:
- capabilities: { backend, frontend, devops } each with { score: number, confidence: 'low'|'medium'|'high' }
- ownership: { ownedProjects, activelyMaintained, deployedPrograms, confidence }
- impact: { activityLevel, consistency, externalContributions, confidence }
- stack: { languages, tools }
- web3: (from solana adapter)
- summary: (rule-based 1-2 sentence summary)

Mapping rules:
- P1 (Execution Reliability) → primary driver of all capability confidence levels
- P4 (Technical Depth) → backend/frontend/devops scores (infer from language signals in DataBundle)
- P3 (Collaboration Leverage) → externalContributions count
- DataBundle.repos (owned, maintained) → ownedProjects, activelyMaintained counts
- DataBundle.external.contributionCalendarActiveWeeks → activityLevel (≥40 weeks = high, ≥20 = medium, else low)
- DataBundle.solana → web3 block (pass through unchanged)

ConfidenceLevel to legacy confidence mapping:
  STRONG_EVIDENCE → 'high'
  MODERATE_EVIDENCE → 'medium'
  LOW_EVIDENCE | OBSERVABILITY_GAP | INSUFFICIENT_DATA → 'low'

This service is explicitly marked @deprecated in JSDoc.

INVARIANT: This service is a READ-ONLY mapper. It never influences primitive scores. 
Primitives are computed first, legacy scorecard is derived from them — never the reverse.

Output ONLY the TypeScript file. No explanation.
```
