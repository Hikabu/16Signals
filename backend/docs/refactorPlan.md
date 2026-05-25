
## Part 4 — Development Roadmap

### Guiding principles for this rewrite
1. **Schema first** — lock the output contract before writing any scoring logic
2. **Fetcher before scorer** — you can't score what you can't fetch
3. **Light Mode before Deep Mode** — faster validation loop, no binary dependency
4. **Anti-gaming after primitives** — flags reference primitive IDs; primitives must exist first
5. **LLM integration after rule-based baseline** — replace rules with LLM calls incrementally
6. **Deep Mode last** — it depends on everything else

---


### Phase 1 — Light Fetcher + Data Groups (Week 1)
**Goal:** Fetching all public data correctly, mapped to Groups A–G.

| Step | Task |
|---|---|
| 1.1 | `LightFetcherService` — REST + GraphQL batch for Groups A, B, C, D, F |
| 1.2 | `RateLimitService` — budget tracker, GraphQL-first strategy, circuit breaker |
| 1.3 | `ExternalSignalService` — npm/PyPI/Cargo/StackOverflow APIs |
| 1.4 | `GroupMapperService` — maps raw fetch output to typed Groups A–G |
| 1.5 | Unit tests: fetch all groups for a known public profile |
| 1.6 | Cache layer: key = `username:light:v5`, TTL 24h |

---

### Phase 2 — Seven Primitives, Rule-Based Baseline (Week 2)
**Goal:** All 7 primitives compute from Light Mode data, rule-based (no LLM yet).

| Step | Task |
|---|---|
| 2.1 | `P1ExecutionReliabilityService` — CI rates, test ratios, versioning, dep hygiene |
| 2.2 | `P2SystemsEvolutionService` — refactor patterns, complexity trends |
| 2.3 | `P3CollaborationLeverageService` — PR review rate, self-merge, external PRs |
| 2.4 | `P4TechnicalDepthService` — commit volume by language, package registry |
| 2.5 | `P5OperationalMaturityService` — observability markers, IaC, secret hygiene |
| 2.6 | `P6AILeverageService` — AI config file detection, velocity/quality ratio |
| 2.7 | `P7AuthenticityConfidenceService` — placeholder (anti-gaming not built yet) |
| 2.8 | `SeniorityWeightsService` — weight table from spec applied to narrative |
| 2.9 | `ArchetypeConfigService` — 6 archetype signal emphasis configs |
| 2.10 | `ConfidenceLanguageService` — 5-tier mandatory language generator |

---


### PROMPT 2.1 — P1 Execution Reliability
**Model:** Claude  
**Why Claude:** Rule logic with hard thresholds; needs careful spec adherence.  
**Target file:** `src/signals/primitives/p1-execution-reliability.service.ts`

```
Build the P1 (Execution Reliability) primitive evaluator for a GitHub analysis system.

CORE QUESTION: "Can this engineer ship safely and consistently?"

INPUT TYPE: RawGroupC (commit data) + RawGroupE (engineering practices, available in Deep Mode) + optional ToolOutputs (tokei, scc — Deep Mode only)
OUTPUT TYPE: PrimitiveAssessment (from types/evidence-brief.types.ts)

WHAT TO MEASURE AND HOW:

1. Commit cadence consistency (from Group C)
   - active_weeks / 52 weeks in trailing year → consistency_ratio
   - >0.7 → strong, 0.4–0.7 → moderate, <0.4 → sparse
   
2. CI pass rate trajectory (from Group E — only if CI data available)
   - If no CI data: confidence = observability_gap
   - Trending up over 6 months → positive signal
   
3. Test-to-code ratio (tokei output in Deep Mode)
   - test_files / total_files
   - >0.15 → strong evidence of test discipline
   - Light Mode: check for test directory presence in repo file tree (Group E API)
   
4. Semantic versioning discipline
   - % of releases following semver pattern in public repos
   - >80% → strong, 40-80% → moderate
   
5. Dependency update hygiene
   - Time to resolve Dependabot alerts (only available in Deep Mode)
   - Light Mode: Dependabot enabled flag (Group E)

6. Deployment frequency (Deep Mode: from Actions logs)
   - Light Mode: any Deployment object present in top 5 repos

CONFIDENCE RULES:
- Need 3+ signals to reach strong_evidence
- Each signal independently scored then aggregated
- observability_gap when a signal is expected for the role but data absent

Return PrimitiveAssessment. Include keyEvidence as specific strings with numbers.
Include 2 interview probes when confidence < strong_evidence.

Use the EXACT confidence language from ConfidenceLanguageService:
- strong_evidence → "Demonstrated across [N] repositories and [N] months — high confidence."
- moderate_evidence → "Evidenced in limited context — probe in interview to confirm depth."
etc.

No LLM calls — rule-based only. LLM will be layered in Phase 5.
```

---

### PROMPT 2.2 — P2 Systems Evolution
Model: Claude
Why Claude: Complexity trend analysis requires precise time-window logic.
Target file: src/signals/primitives/p2-systems-evolution.service.ts
Build the P2 (Systems Evolution) primitive evaluator.

CORE QUESTION: "Do systems improve under this engineer's stewardship over time?"

INPUT: P2SystemsEvolutionInput { groupC: RawGroupC, groupB: RawGroupB, scc?: SccOutput }
OUTPUT: PrimitiveAssessment

SIGNALS TO MEASURE:

1. Refactor commit detection (from groupC.commitSample)
   - Keywords in commit messages: 'refactor', 'restructure', 'simplify', 'extract', 'clean up', 'rework', 'improve', 'decouple'
   - refactorRate = refactor_commits / total_commits
   - >0.10 = positive signal (10%+ of commits are improvement-oriented)
   - >0.20 = strong signal

2. Project age vs activity (from groupB.repos)
   - Find repos that are: not archived, not fork, age > 12 months, lastPushedAt within 6 months
   - These are "long-lived and maintained" — strong Systems Evolution signal
   - longLivedMaintainedCount = count of such repos
   - 0 → low_evidence
   - 1 → moderate_evidence
   - 2+ → contributes to strong_evidence

3. Repository complexity trend (scc only — Deep Mode)
   - If scc data available: compare complexity score across repos ordered by createdAt
   - Trend: is complexity per 1000 lines DECREASING over time? (positive — code getting cleaner)
   - If increasing significantly (>20%): note in observabilityGaps as "complexity trend warrants discussion"
   - If unavailable: observability_gap for this sub-signal only

4. Description and README quality trajectory (from groupB.repos)
   - % of non-fork repos with non-null description AND hasReadme = true
   - >0.7 → positive documentation discipline signal
   - This is a weak signal — weight it as supporting evidence only, not primary

CONFIDENCE AGGREGATION:
- Need signals 1 AND 2 both present for strong_evidence
- Signal 1 OR 2 alone → moderate_evidence
- Neither present → low_evidence
- If total non-fork repos < 3: set confidence to observability_gap regardless

MANDATORY LANGUAGE: Use ConfidenceLanguageService — inject it and call getText(level) for confidenceText.

Include 2 specific interview probes when confidence < strong_evidence. Example:
"Tell me about a time you significantly refactored existing code. What drove that decision and what was the outcome?"

---

### PROMPT 2.3 — P3 Collaboration Leverage
**Model:** Claude  
**Why Claude:** Important nuance around the observability gap rule — needs constraint precision.  
**Target file:** `src/signals/primitives/p3-collaboration-leverage.service.ts`

```
Build the P3 (Collaboration Leverage) primitive evaluator.

CORE QUESTION: "Does this engineer amplify the people around them?"

CRITICAL DESIGN RULE: When collaboration data is absent or thin, this carries NO NEGATIVE WEIGHT for candidates in enterprise, security, or embedded contexts. The Evidence Brief must distinguish 'no review activity observed' from 'no review activity exists'. Always default to the former.

INPUT: RawGroupD (collaboration data)
OUTPUT: PrimitiveAssessment

SIGNALS:
1. PR review participation rate: reviews_given / (reviews_given + PRs_authored)
   - >0.5 = strong reviewer, 0.2–0.5 = participates, <0.2 = primarily author
   
2. Substantive review rate: reviews with > 50 words / total reviews
   - Data: from sample of review comments in Group D
   
3. Self-merge rate: self_merged / total_merged_PRs (own repos excluded from this calc)
   - At Senior+: self_merge_rate > 0.7 → soft concern flag
   - At Junior/Mid: no concern
   
4. External contribution depth: count of PRs merged into repos not owned by the user
   - Each external PR = strong evidence of collaboration
   
5. PR description quality: avg word count of PR body text
   - >100 words average → positive signal (will be replaced by LLM in Phase 5)
   - Stub this as a placeholder: return moderate_evidence with note "LLM scoring pending"

IMPORTANT: inject SeniorityWeightsService to get current seniority target. Apply rules like self-merge concern only at appropriate seniority levels.

OBSERVABILITY GAP HANDLING:
If total PRs authored < 5 AND external contributions < 3:
- confidence = 'observability_gap'
- confidenceText = "No public evidence — likely private or enterprise context. Do not penalise. Recommend: Ask the candidate to describe a time they changed a colleague's design decision through a code review."

Never set score < 0. Null score when observability_gap.
```

---

### PROMPT 2.4 — P4 Technical Depth
Model: Claude
Why Claude: Language-to-capability mapping table is a constraint-heavy lookup that needs spec precision.
Target file: src/signals/primitives/p4-technical-depth.service.ts
Build the P4 (Technical Depth) primitive evaluator.

CORE QUESTION: "Can this engineer go deep when the problem genuinely requires it?"

INPUT: P4TechnicalDepthInput { groupB: RawGroupB, groupC: RawGroupC, groupD: RawGroupD, groupF: RawGroupF }
OUTPUT: PrimitiveAssessment

SIGNALS:

1. Language depth by commit volume (NOT by repo count)
   - From groupC.commitSample: count commits per language by correlating commit's repo to repo's primary language in groupB
   - Top 2 languages by commit volume = candidate's primary languages
   - Depth score per language: commits_in_language / total_commits × 100
   - A candidate with >60% commits in one language has genuine specialisation → strong depth signal for that domain

2. Hardness indicators in repo topics and descriptions (groupB)
   - Keywords that signal genuine depth: 'compiler', 'parser', 'distributed', 'consensus', 'concurrency', 'kernel', 'vm', 'jit', 'crypto', 'protocol', 'realtime', 'embedded', 'zero-copy', 'lock-free', 'sharding', 'replication'
   - Count repos with any of these keywords in topics or description
   - 1+ = moderate depth indicator; 2+ = strong depth indicator

3. Package registry adoption (groupF.packageRegistryPresence)
   - Any package with weeklyDownloads > 100 = external validation of technical depth
   - Any package with dependentCount > 5 = others depend on their code = strong depth signal
   - No packages: observability_gap for this sub-signal (many deep engineers don't publish packages)

4. Review substance (groupD.reviewsGiven)
   - Average wordCount of reviews
   - >80 words average → reviews are substantive → depth indicator
   - If <5 reviews total → observability_gap for this sub-signal

5. Stack Overflow (groupF.stackOverflowReputation — Tier 3, additive only)
   - If reputation > 1000: add as supporting evidence
   - If null: never negative, never gap — just absent

LANGUAGE TO DOMAIN MAPPING (used for Section B output, not scoring):
Backend indicators: ['Go', 'Rust', 'Java', 'C', 'C++', 'Python', 'Ruby', 'PHP', 'Elixir', 'Scala', 'Kotlin']
Frontend indicators: ['TypeScript', 'JavaScript', 'CSS', 'HTML', 'Dart']
DevOps indicators: ['HCL', 'Shell', 'Dockerfile', 'YAML']
Data/ML indicators: ['Python', 'R', 'Julia', 'Jupyter Notebook']
Note: languages can appear in multiple domains — this is informational, not exclusive classification

CONFIDENCE AGGREGATION:
- Signal 1 strong (>60% in one language) + Signal 2 (1+ hardness topic) → strong_evidence
- Signal 1 present + either 2, 3, or 4 → moderate_evidence
- Only Signal 1 → moderate_evidence
- Signal 1 absent (<30% concentration anywhere) → low_evidence (candidate may be a breadth generalist — note this positively)

Add to keyEvidence: specific language name + commit percentage e.g. "68% of commits in Rust across 8 repos"


---

### PROMPT 2.5 — P5 Operational Maturity
Model: Claude
Why Claude: Hard security flag logic (credential leaks) needs strict conditional handling.
Target file: src/signals/primitives/p5-operational-maturity.service.ts
Build the P5 (Operational Maturity) primitive evaluator.

CORE QUESTION: "Can this engineer handle production reality?"

INPUT: P5OperationalMaturityInput { groupE: RawGroupE, groupB: RawGroupB, gitleaks?: GitleaksOutput, semgrep?: SemgrepOutput }
OUTPUT: PrimitiveAssessment

CRITICAL RULE: If gitleaks.leaksFound === true, this is a HARD STOP regardless of all other signals.
- Set confidence to 'low_evidence'
- Add to keyEvidence: "Credential leak detected in git history. Hard stop — requires interview or background check before proceeding."
- Set interviewProbes: ["A credential was detected in your git history. Can you walk us through what happened and how it was resolved?"]
- Return immediately — do not compute other signals

SIGNALS (only evaluated if no credential leak):

1. Observability tooling (from groupB.repos — scan topics and descriptions)
   - Positive keywords: 'prometheus', 'grafana', 'datadog', 'opentelemetry', 'jaeger', 'logging', 'metrics', 'tracing', 'monitoring', 'observability'
   - 1+ repos with any of these → observability awareness signal

2. Feature flag usage (topics/descriptions)
   - Keywords: 'launchdarkly', 'feature-flag', 'feature-toggle', 'unleash', 'flipt'
   - Presence → strong operational maturity signal (feature flags require production thinking)

3. IaC presence (groupE.iacPresent)
   - True → infrastructure-as-code discipline confirmed
   - Only meaningful for Platform/SRE/Backend archetypes — check archetype context (pass archetypeTarget as arg)

4. Dockerfile / containerisation (groupE.dockerfilePresent)
   - True → deployment awareness

5. Secret management hygiene (groupE — indirect, gitleaks clean)
   - If gitleaks ran and found nothing → explicit positive signal: "No credentials detected in git history"
   - If gitleaks not available (Light Mode) → observability_gap for this specific sub-signal

6. SAST findings (semgrep — Deep Mode only)
   - If semgrep.errorCount > 5: moderate concern, add to keyEvidence
   - If semgrep.errorCount === 0: positive signal
   - If not available: observability_gap

7. Dependabot enabled (groupE.dependabotEnabled)
   - True → dependency hygiene awareness

CONFIDENCE:
- 4+ signals present → strong_evidence
- 2–3 signals → moderate_evidence
- 1 signal → low_evidence
- 0 signals → observability_gap (common for enterprise engineers — note explicitly)

Note: operational maturity is the primitive most likely to produce observability_gap for senior enterprise engineers. Always add this to the output: "Operational maturity signals are predominantly visible in public DevOps/platform repositories. Enterprise engineers may have extensive production experience with no public trace."


### PROMPT 2.6 — P6 AI Leverage Quality
**Model:** Claude  
**Why Claude:** Complex classification logic with 5 output classes.  
**Target file:** `src/signals/primitives/p6-ai-leverage.service.ts`

```
Build the P6 (AI Leverage Quality) primitive evaluator.

CORE QUESTION: "Can this engineer effectively direct AI to produce quality outcomes?"

INPUT: RawGroupC (commit data) + RawGroupB (repo inventory for AI config file detection)
OUTPUT: PrimitiveAssessment + AILeverageClass (from types/evidence-brief.types.ts)

CLASSIFICATION RULES (classify into one of 5 classes):

ai_operator: 
  - High commit velocity periods (>2x normal weekly rate) WITH maintained or improving test-to-code ratio
  - AI tool config files detected (Cursor rules, .github/copilot-instructions.md, custom prompt files)
  - Iterative refinement commits following large single-session bursts (small follow-up commits after >200-line commits)

ai_architect:
  - AI config files present with evidence of customisation (file size > 500 bytes suggests non-default config)
  - LLM-default boilerplate code modified with custom architectural patterns (stub — mark as "LLM scoring pending" for Phase 5)
  - Commit message patterns referencing AI tools: "with claude", "via copilot", "ai-assisted"

ai_passenger:
  - High velocity with declining or zero test coverage trajectory
  - Large single-session commits with no follow-up refinement commits
  - Abrupt style discontinuities correlated with large commits (stub — "LLM scoring pending")
  - Flag as: soft_concern in Section D

traditional_engineer:
  - No AI config files detected
  - Consistent commit size distribution (no high-velocity bursts)
  - Normal style consistency
  - NOT penalised — explicitly positive in certain contexts

disclosure_flag:
  - AST entropy anomalies detected (stub for Phase 5 LLM analysis)
  - Abrupt style discontinuities with high confidence
  - Requires interview to clarify — never automatic rejection
  - Sets AntiGamingFlag with type='ai_generation_gap'

DETECTION LOGIC:
- AI config file scan: check for .cursorrules, .github/copilot-instructions.md, .aider.conf.yml, CLAUDE.md, custom_instructions.txt in repo root (use Group B file tree data)
- Commit velocity burst: week with >3x trailing 4-week average
- Refinement window: commits within 48h after a burst commit, each < 50 lines

The AILeverageClass should be attached to the PrimitiveAssessment output as an additional field. Extend the interface locally for this service.

Return: PrimitiveAssessment & { aiLeverageClass: AILeverageClass }
```

---

### PROMPT 2.7+2.8+2.9+2.10 — Supporting Services Bundle
Model: Claude
Why Claude: These are all small, precise services with hard rules. Better as one Claude call than four.
Target files: p7-authenticity-confidence.service.ts, seniority-weights.service.ts, archetype-config.service.ts, confidence-language.service.ts
Build 4 supporting services for a GitHub analysis system. Output all 4 as separate files.

─── FILE 1: src/signals/primitives/p7-authenticity-confidence.service.ts

P7 is a PLACEHOLDER in Phase 2. Anti-gaming data is not yet populated.

Build the service shell with:
- evaluate(input: P7AuthenticityConfidenceInput): PrimitiveAssessment
- If gitleaks?.leaksFound: return hard stop assessment (confidence: 'low_evidence', specific evidence text, interviewProbe about the leak)
- If employmentRungs provided: incorporate highest rung achieved into keyEvidence
- For all gaming signals in groupG: if any are non-null, add to observabilityGaps as "Anti-gaming analysis pending — Phase 4"
- Default return: confidence 'observability_gap', confidenceText from ConfidenceLanguageService, interviewProbes: ["Walk me through your most significant engineering contribution in the last 12 months."]

This service will be fully implemented in Phase 4 after anti-gaming services exist.

─── FILE 2: src/signals/seniority/seniority-weights.service.ts

Implement SeniorityWeightsService.getWeights(tier: SeniorityTier): SeniorityWeightMap

SeniorityWeightMap: Record<'p1'|'p2'|'p3'|'p4'|'p5'|'p6'|'p7', 'primary'|'high'|'moderate'|'emerging'|'minimal'|'always'>

Values from spec table:
INTERN_JUNIOR:  p1=primary, p2=not_expected, p3=minimal,  p4=high,     p5=minimal,  p6=moderate, p7=always
MID:            p1=primary, p2=emerging,     p3=moderate, p4=high,     p5=moderate, p6=high,     p7=always
SENIOR:         p1=high,    p2=high,         p3=high,     p4=high,     p5=high,     p6=high,     p7=always
STAFF_LEAD:     p1=moderate,p2=primary,      p3=primary,  p4=high,     p5=high,     p6=high,     p7=always
PRINCIPAL_PLUS: p1=moderate,p2=primary,      p3=primary,  p4=high,     p5=primary,  p6=high,     p7=always

Add method: getNarrativeWeight(tier: SeniorityTier, primitive: string): string
Returns a plain-English phrase for use in brief narrative:
- 'primary' → "is the primary signal at this seniority level"
- 'high' → "carries significant weight at this seniority level"
- 'moderate' → "is a supporting signal"
- 'emerging' → "is expected to be developing"
- 'minimal' → "is not expected at this stage"
- 'not_expected' → "is not applicable at this stage"
- 'always' → "is assessed equally at all seniority levels"

─── FILE 3: src/signals/archetype/archetype-config.service.ts

Implement ArchetypeConfigService.getConfig(archetype: RoleArchetype): ArchetypeConfig

ArchetypeConfig: {
  elevatedSignals: string[]     // what to amplify in the brief
  contextualRedFlags: string[]  // what to flag as a concern
  primaryLanguages: string[]    // expected languages for this role
  iacRequired: boolean          // is IaC absence a red flag
  securityAmplified: boolean    // amplify all security signals
}

Values from spec:
BACKEND: elevated=['API design patterns', 'database migration files', 'performance tooling', 'load testing configs'], redFlags=['No error handling patterns', 'no logging/instrumentation', 'no data layer tests'], primaryLanguages=['Go','Rust','Java','Python','C++','Node.js'], iacRequired=false, securityAmplified=false
FRONTEND: elevated=['TypeScript weighting', 'component library discipline', 'a11y configs', 'Storybook presence'], redFlags=['No TypeScript', 'inline styles only', 'no test coverage', 'no accessibility attributes'], primaryLanguages=['TypeScript','JavaScript'], iacRequired=false, securityAmplified=false
PLATFORM_DEVOPS_SRE: elevated=['IaC presence', 'Kubernetes manifests', 'observability configs', 'GitOps patterns'], redFlags=['Hardcoded credentials', 'no idempotency guards', 'bash without error handling'], primaryLanguages=['Go','Python','Shell','HCL'], iacRequired=true, securityAmplified=false
DATA_ML: elevated=['Notebook-to-pipeline transition', 'data validation tooling', 'model versioning', 'dbt configs'], redFlags=['Notebooks only', 'no reproducibility tooling', 'no data validation'], primaryLanguages=['Python','R','SQL'], iacRequired=false, securityAmplified=false
SECURITY: elevated=['CVE history management', 'responsible disclosure evidence', 'signed releases', 'SBOM generation'], redFlags=['Any secret leak history', 'unpatched Dependabot alerts'], primaryLanguages=['Python','Go','Rust','C'], iacRequired=false, securityAmplified=true
MOBILE: elevated=['Xcode project structure', 'Gradle discipline', 'Fastlane presence', 'UI test frameworks'], redFlags=['Hardcoded API keys in mobile code', 'no UI tests', 'no signing configuration'], primaryLanguages=['Swift','Kotlin','Dart','Java'], iacRequired=false, securityAmplified=false

─── FILE 4: src/signals/confidence-language/confidence-language.service.ts

Implement ConfidenceLanguageService.getText(level: ConfidenceLevel, context?: { n_repos?: number, n_months?: number, interview_question?: string }): string

MANDATORY language per level — do not deviate:
strong_evidence: "Demonstrated across ${n_repos} repositories and ${n_months} months — high confidence."  (use context values or defaults "multiple" and "12+")
moderate_evidence: "Evidenced in limited context — probe in interview to confirm depth."
low_evidence: "One instance detected — insufficient to score. Treat as unconfirmed in hiring decision."
observability_gap: "No public evidence — likely private or enterprise context. Do not penalise. Recommend: ${interview_question ?? 'Ask the candidate to describe their experience directly.'}"
insufficient_data: "This profile cannot be assessed from available public signals. Do not use this report as a filter for this candidate. Proceed directly to technical interview using the generated interview questions."

Also implement: getProfileLevelGateText(): string
Returns: "This profile pattern is consistent with enterprise or regulated-industry engineering contexts where public evidence is structurally absent. This is correlated with — not anticorrelated with — seniority and impact. Proceed to technical interview."

---



### Phase 3 — Evidence Brief Assembler + Light Mode Pipeline (Week 3)
**Goal:** A complete Light Mode brief runs end-to-end (no LLM, no anti-gaming yet).

| Step | Task |
|---|---|
| 3.1 | `BriefAssemblerService` — sections A–G from primitive outputs |
| 3.2 | `EmploymentVerificationService` — Rung 1 (email domain) only for now |
| 3.3 | `InterviewProbeGenerator` — rule-based probes from primitive gaps |
| 3.4 | `LightAnalysisProcessor` — BullMQ pipeline wiring all services |
| 3.5 | New API endpoints: `POST /analysis` (v5 schema), `GET /analysis/:id/brief` |
| 3.6 | Integration test: full pipeline on 3 known profiles |
| 3.7 | Brief section G always present and accurate |

---
### PROMPT 3.1 — Brief Assembler Service
Model: Gemini
Why Gemini: Needs to hold all 7 sections + all 7 primitive outputs + evidence brief spec simultaneously.
Target file: src/brief/brief-assembler.service.ts
Build BriefAssemblerService for a GitHub analysis system in NestJS TypeScript.

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
  sectionF?: SectionF    // optional — only when JD matching ran
}

METHOD: buildBrief(input: BriefAssemblerInput): EvidenceBrief

SECTION ASSEMBLY RULES:

Section A — Profile in 90 Seconds:
- operatingStyleArchetype: derive from top 2 primitives by confidence + seniority weights
  Logic: get seniority weights, find which 2 primitives are 'primary' for this tier, map to archetype label
  Archetype label mapping: p1+p4 dominant → 'Production Engineer'; p2+p3 dominant → 'Systems Architect'; p3+p4 dominant → 'Specialist'; p1+p5 dominant → 'Ops-Focused'; p4 only strong → 'Technical Specialist'; p3 strong → 'OSS Contributor'; fallback → 'Generalist Builder'
- topThreeCapabilities: pick top 3 primitives by confidence level (strong > moderate > low), extract first keyEvidence item from each
- aiLeverageClassification: p6.aiLeverageClass
- employmentVerification: employmentRungs mapped to EmploymentVerification[]
- recommendedInterviewDepth: 
  if any hard_stop flag OR profileLevelGate → 'deep'
  elif primitives all ≥ moderate_evidence → 'light'
  else → 'standard'

Section B — Tech Reality vs CV Claims:
- languages: from groupB.repos, aggregate by language, mark evidenced=true for languages with >5% of total repos; claimed=false for all (no CV in Light Mode — caller sets claimed flags if CV provided)
- frameworks: scan groupB topics and descriptions for known frameworks, evidenced=true if found
  Known frameworks to detect: React, Vue, Angular, Svelte, Next.js, NestJS, Django, FastAPI, Flask, Rails, Spring, Laravel, Express, Gin, Echo, Actix, Rocket, Phoenix, Nuxt
- infrastructure: scan topics/descriptions for: Docker, Kubernetes, Terraform, AWS, GCP, Azure, Pulumi, Helm, Ansible
- zeroEvidenceClaims: [] (empty in Light Mode without CV — caller populates)

Section C — Work Pattern Intelligence:
- shippingVelocity: derive from p1.keyEvidence narrative — extract the velocity description or generate: "Active in ${activeWeeks} of last 52 weeks. Typical PR cycle: [probe-to-merge data if available]"
- qualityDisciplineTrajectory: from p1 + p2 keyEvidence — "Quality signals [improving/stable/declining] based on [evidence]"
- collaborationStyle: from p3 — if observability_gap: "Primarily working in private contexts — collaboration style unverified from public data"
- aiLeverageEvidence: from p6.keyEvidence[0] + aiLeverageClass mapped to human-readable string
- communicationQuality: from p3 review quality signals or "Not assessable from available public data"

Section D — Red Flags & Verification Gaps:
- flags: input.flags (the AntiGamingFlag[] passed in)
- credentialLeakDetected: flags.some(f => f.type === 'credential_leak')
- verificationGaps: collect all observabilityGaps from all 7 primitives, deduplicate

Section E — Interview Intelligence:
- Delegate to InterviewProbeGeneratorService.generate(primitives, flags)
- This service is injected, call it here

Section F: pass through input.sectionF if present

Section G — always present, never omitted:
epistemicBoundaries (hardcoded — these never change):
1. "System design thinking and architectural decision-making in ambiguous situations"
2. "Communication quality, stakeholder management, and technical leadership under pressure"  
3. "Cultural alignment, values, and team dynamics fit"
4. "Performance under conditions unlike those observed in public repositories"
5. "Management capability, mentoring effectiveness, and organisational influence"
6. "Motivation, career trajectory, and long-term growth orientation"

routedProbes: map each boundary to a specific interview probe
1. "Present a system design problem relevant to the role. Observe how they handle ambiguity, trade-offs, and requirements clarification."
2. "Describe a time you had to communicate a complex technical decision to non-technical stakeholders. What happened?"
3. "What does your ideal team look like, and what role do you typically play in it?"
4. "Tell me about a production incident you were central to resolving. Walk me through your decision-making."
5. "How do you approach mentoring engineers at earlier career stages?"
6. "Where do you want to be technically in 3 years, and what's your plan to get there?"

Meta: populate from input fields + check if >50% of primitives are insufficient_data → profileLevelGate = true

IMPORTANT: Never return a composite score. Assert this in a TypeScript comment: // NO COMPOSITE SCORE — by design. See v5 spec §8 Critical Design Principle.

---
###  PROMPT 3.2 — Employment Verification Service
Model: Claude
Why Claude: Rung logic has precise conditional rules and mandatory output language.
Target file: src/employment/verification-ladder.service.ts
Build EmploymentVerificationService with the 3-rung employment verification ladder.

RUNG DEFINITIONS AND MANDATORY OUTPUT LANGUAGE:

Rung 0 — No signal:
rungText = "Rung 0 — No verifiable signal available for claimed role. This is a system limitation, not a candidate failure. Proceed to interview with suggested probe."

Rung 1 — Email domain match:
Detection: any commitEmailDomain from groupA matches @[employer].com or @[employer].* domain
rungText = "Rung 1 only — email domain match. Contribution scope unconfirmed — recommend interview verification."

Rung 2 — Org membership (Deep Mode only):
Detection: groupA.orgMemberships contains org matching employer name
rungText = "Rung 2 — Organisation membership confirmed. Active GitHub seat in claimed organisation verified."

Rung 3 — Contribution fingerprint (Deep Mode only):
Detection: contributions in org repos are temporally consistent with stated tenure
rungText = "Rung 3 — Contribution fingerprint confirmed: active engineering activity in claimed organisation during stated period."

METHOD:
verify(groupA: RawGroupA, mode: 'light' | 'deep', claimedEmployers: string[]): EmploymentRungResult[]

If claimedEmployers is empty: return []

For each employer in claimedEmployers:
1. Always attempt Rung 1 (both modes)
2. Only attempt Rungs 2+3 in Deep Mode
3. Return the highest rung achieved for each employer

EMPLOYER NAME MATCHING (fuzzy):
- normalise: lowercase, strip 'inc', 'ltd', 'llc', 'corp', 'technologies', 'software', special chars
- compare normalised strings
- also try: employer.split(' ')[0] (first word match)

In Light Mode: claimedEmployers comes from groupA.company field (parse comma-separated if multiple).
In Deep Mode: additionally check org memberships list.

Where does claimedEmployers come from in the caller? The analysis input may include a parsedCV field with employer list. If absent, extract from groupA.company. Document this in a JSDoc comment.

Return EmploymentRungResult[] sorted by rung descending (highest verification first).

---
### PROMPT 3.3 — Interview Probe Generator
Model: Claude
Why Claude: Template logic with conditional rules — small and precise.
Target file: src/brief/interview-probe-generator.service.ts
Build InterviewProbeGeneratorService that generates Section E of the Evidence Brief.

METHOD: generate(primitives: Record<string, PrimitiveAssessment & { aiLeverageClass?: AILeverageClass }>, flags: AntiGamingFlag[], archetypeTarget: RoleArchetype): SectionE

SectionE: {
  technicalQuestions: Array<{ question: string; rationale: string }>
  gapProbes: Array<{ question: string; gap: string }>
  flagProbes: Array<{ question: string; flagType: string }>
  suggestedInterviewerPairing: string
}

RULES:

technicalQuestions (3–5 questions):
- These come from actual evidence in the brief — specific to what was observed
- For each primitive with strong_evidence: generate a "go deeper" question based on keyEvidence[0]
  e.g. if p4.keyEvidence[0] = "68% of commits in Rust across 8 repos" → "You appear to work primarily in Rust. Walk me through the most complex ownership/lifetime problem you've solved."
- Cap at 5 questions — prioritise primitives with highest confidence
- Rationale must reference the specific evidence that generated the question

gapProbes (1 per observability_gap primitive):
- For each primitive where confidence === 'observability_gap' OR 'insufficient_data':
  extract the recommended interview question from the primitive's interviewProbes[0]
  wrap it as: { question: probe, gap: "No public evidence for [primitive name]" }

flagProbes (1 per flag):
- For each AntiGamingFlag in flags:
  use flag.interviewProbe verbatim
  DO NOT reveal the detection mechanism in the question (the probe is already written to avoid this)
  wrap as: { question: flag.interviewProbe, flagType: flag.type }

suggestedInterviewerPairing:
- Based on archetypeTarget:
  BACKEND → "Pair with a senior backend engineer who can probe system design and data layer decisions"
  FRONTEND → "Pair with a senior frontend engineer who can evaluate component architecture and accessibility awareness"
  PLATFORM_DEVOPS_SRE → "Pair with a staff SRE or platform engineer familiar with the production stack"
  DATA_ML → "Pair with a data engineer or ML engineer who can probe productionisation and pipeline quality"
  SECURITY → "Pair with a security engineer — all flag probes should be led by them"
  MOBILE → "Pair with a mobile engineer from the relevant platform (iOS/Android) based on detected stack"

---
### PROMPT 3.4 — Light Analysis BullMQ Processor
Model: Claude
Why Claude: Pipeline orchestration with precise error handling and progress tracking.
Target file: src/queues/light-analysis.processor.ts
Build the LightAnalysisProcessor BullMQ processor for a NestJS GitHub analysis system.

This is the main orchestrator for Light Mode analysis. It runs all services in the correct order and writes progress updates to the AnalysisJob record.

QUEUE NAME: 'light-analysis'
JOB DATA TYPE: LightAnalysisJobData { analysisJobId: string, githubUsername: string, seniorityTarget: SeniorityTier, archetypeTarget: RoleArchetype, mode: 'LIGHT' }

PIPELINE STEPS (in order):

1. Update AnalysisJob status='processing', progress=5
2. Check cache: BriefCacheService.get(key) — if hit, store result and mark complete, return early
3. progress=10 — LightFetcherService.fetch(username) → rawLightData
4. progress=35 — ExternalSignalService.fetch(username, rawLightData.groupB.repos) → merge into groupF
5. progress=45 — GroupMapperService.map(rawLightData) → primitiveInputMap
6. progress=50 — Run all 7 primitive services in parallel (Promise.all):
     p1 = P1Service.evaluate(primitiveInputMap.p1)
     p2 = P2Service.evaluate(primitiveInputMap.p2)
     ... etc
7. progress=65 — Run anti-gaming services in parallel:
     [commitFlag, forkFlag, burstFlag] = await Promise.all([...])
     launderingFlag = await RepoLaunderingService.analyze(...) (async — external API)
     flags = [commitFlag, forkFlag, burstFlag, launderingFlag].filter(Boolean)
8. progress=75 — EmploymentVerificationService.verify(...)
9. progress=80 — BriefAssemblerService.buildBrief(...) → brief
10. progress=90 — BriefCacheService.set(key, brief, ttl)
11. progress=95 — Update AnalysisJob: result=brief, flags=flags, status='completed', progress=100
12. If Candidate linked to job: update Candidate.scorecard = brief, Candidate.activeBriefJobId = jobId

ERROR HANDLING:
- Wrap entire pipeline in try/catch
- On any unhandled error: Update AnalysisJob status='failed', error=err.message, progress=0
- If LightFetcherService throws RateLimitExhaustedException: set error='Rate limit exhausted — retry after [X] minutes', re-queue with delay
- Individual service failures (primitives, anti-gaming): log warning, continue with partial result, add to brief.meta.warnings[]
- Never let a single primitive failure kill the entire brief

INJECT: all services listed above + PrismaService + Logger

Use @nestjs/bullmq @Processor and @Process() decorators. Update job.progress() via the BullMQ Job object throughout.

---

### PROMPT 3.5 — API Endpoints
Model: Claude
Why Claude: NestJS controller patterns with specific validation and response shapes.
Target files: src/modules/analysis/analysis.controller.ts (extended), src/modules/analysis/analysis.service.ts (extended)
Extend the existing AnalysisController and AnalysisService for v5.

CONTEXT: The existing analysis module has basic CRUD. Extend it — do not replace it.

NEW/UPDATED ENDPOINTS:

1. POST /analysis (replace existing)
Body (Zod validated):
{
  githubUsername: string (min 1, max 39)
  mode: 'LIGHT' | 'DEEP' (default: 'LIGHT')
  seniorityTarget: SeniorityTier (optional, default: 'MID')
  archetypeTarget: RoleArchetype (optional, default: 'BACKEND')
}
Auth: optional (candidateId attached if authenticated, null otherwise)
Logic:
  - Create AnalysisJob record with all fields
  - Add to BullMQ 'light-analysis' queue (for LIGHT mode) or 'deep-analysis' (for DEEP)
  - Return: { jobId, status: 'pending', estimatedMinutes: mode === 'LIGHT' ? 3 : 15 }

2. GET /analysis/:jobId/brief
Auth: optional (but if job has candidateId, only that candidate or HR roles can access)
Logic:
  - Fetch AnalysisJob by id
  - If status !== 'completed': return { status, progress, estimatedMinutes }
  - If status === 'completed': return { status, brief: job.result, flags: job.flags, generatedAt: job.updatedAt }
  - If job.expiresAt < now: return 410 Gone with message "Brief has expired. Request a new analysis."

3. GET /analysis/:jobId/status (keep existing, update response)
Returns: { status, progress, stage: map progress% to stage name }
Stage mapping:
  0-10 → 'queued'
  10-50 → 'fetching_data'
  50-75 → 'analysing_signals'
  75-90 → 'building_brief'
  90-100 → 'complete'

4. POST /analysis/:jobId/rerun (new)
Auth: HR_ADMIN or ADMIN role only
Logic: Creates a new AnalysisJob with same input, queues it. Returns new jobId.

Use nestjs-zod for body validation. Use existing guards for auth. Add swagger decorators (@ApiOperation, @ApiResponse) for each endpoint.

---
### Phase 4 — Anti-Gaming Detection (Week 4)
**Goal:** All 6 detection algorithms live, feeding Section D and P7.

| Step | Task |
|---|---|
| 4.1 | `CommitInflationService` — size histogram, 30% threshold |
| 4.2 | `ForkDumpingService` — gitinspector-free for Light Mode (API patterns) |
| 4.3 | `BurstDormancyService` — contribution heatmap, 5× burst detection |
| 4.4 | `RepoLaunderingService` — GitHub Code Search API, Copyleaks integration |
| 4.5 | `CredentialLeakService` (Light Mode stub — gitleaks not available yet) |
| 4.6 | Wire all flags into `P7AuthenticityConfidenceService` |
| 4.7 | Populate Section D of Evidence Brief |
| 4.8 | Hard stop logic for credential leaks |
| 4.9 | Tests: each detection algorithm against crafted edge cases |

---


### PROMPT 4.1-4.3 — Anti-Gaming Bundle (Commit Inflation + Fork Dumping + Burst/Dormancy)
**Model:** Gemini  
**Why Gemini:** All three are algorithmic with shared data structures; Gemini handles the combined context better than three separate Claude calls.  
**Target files:** `src/anti-gaming/commit-inflation.service.ts`, `fork-dumping.service.ts`, `burst-dormancy.service.ts`

```
Build three anti-gaming detection services for a GitHub analysis system in NestJS + TypeScript.

CONTEXT: These services are called from AntiGamingService.analyzeLight(). They each return AntiGamingFlag | null (flag if detected, null if clean). autoReject is always false. No detection produces automatic rejection.

INPUT DATA AVAILABLE (from RawGroupC + RawGroupB + contribution graph):
- commits: Array<{ sha, additions, deletions, message, timestamp, is_merge, is_doc_only }>
- repos: Array<{ name, is_fork, pushed_at, created_at, contributor_emails, stars, topics }>
- weeklyContributions: Array<{ week: string, total: number }> — 52 weeks trailing

---
SERVICE 1: CommitInflationService

ALGORITHM:
1. Filter commits: exclude merge commits (is_merge=true) and doc-only commits (is_doc_only — detect: >90% of diff is .md/.txt/.rst files)
2. Build histogram of commit sizes (additions + deletions)
3. Calculate: inflation_rate = commits_below_5_lines / total_filtered_commits
4. Also check: p25 of commit sizes (25th percentile)
5. FLAG if: inflation_rate > 0.30 OR p25 < 3

Output when flagged:
{
  type: 'commit_inflation',
  severity: 'soft_concern',
  evidence: `${Math.round(inflationRate * 100)}% of commits are under 5 lines (threshold: 30%). Median commit size: ${median} lines.`,
  confidenceScore: Math.min(100, Math.round(inflationRate * 200)),
  interviewProbe: "Walk me through your typical commit workflow. How do you decide when to commit?",
  autoReject: false
}

---
SERVICE 2: ForkDumpingService

ALGORITHM:
1. Filter repos to only forks (is_fork = true)
2. For each fork: check if pushed_at > created_at by more than 7 days (candidate added commits) OR stars > 0 OR topics.length > 0
3. unmodified_fork = NOT (any of above conditions)
4. fork_dump_rate = unmodified_forks / total_public_repos
5. FLAG if: fork_dump_rate > 0.50

Output when flagged:
{
  type: 'fork_dumping',
  severity: 'soft_concern',
  evidence: `${unmodifiedForks} of ${totalRepos} public repos are unmodified forks (${Math.round(forkDumpRate * 100)}%). These are excluded from language and topic analysis.`,
  confidenceScore: Math.min(100, Math.round(forkDumpRate * 150)),
  interviewProbe: "Several of your public repositories appear to be unmodified forks. Can you describe which projects you've contributed code to directly?",
  autoReject: false
}

Side effect: this service also returns adjustedRepos (unmodified forks excluded) for use by other services.

---
SERVICE 3: BurstDormancyService

ALGORITHM:
1. Get trailing 52-week contribution data
2. Compute: trailing_12_month_weekly_avg = sum(all 52 weeks) / 52
3. Get last_30_days_avg = sum(last 4 weeks) / 4
4. burst_ratio = last_30_days_avg / trailing_12_month_weekly_avg
5. FLAG if: burst_ratio > 5.0

Output when flagged:
{
  type: 'burst_dormancy',
  severity: 'soft_concern',
  evidence: `Recent 30-day activity is ${burst_ratio.toFixed(1)}x the 12-month weekly average. Pattern consistent with profile optimisation ahead of evaluation.`,
  confidenceScore: Math.min(100, Math.round((burst_ratio - 5) * 10) + 60),
  interviewProbe: "Your GitHub activity has increased significantly in the last month. What projects have you been working on recently?",
  autoReject: false
}

---
All three services should be @Injectable(). Export each from its own file. No shared state between services. Each takes the raw data directly as method arguments (no class-level state for the analysis data).
```

---

### PROMPT 4.4 — Repo Laundering Detection
**Model:** Claude  
**Why Claude:** External API integration with precise error handling and rate-limit logic.  
**Target file:** `src/anti-gaming/repo-launcher.service.ts`

```
Build RepoLaunderingService for GitHub analysis anti-gaming detection.

PURPOSE: Detect repos that are copies/forks of existing public code presented as original work.

TWO-STAGE APPROACH:

STAGE 1 — GitHub Code Search API:
- For each owned non-fork repo, extract 3 "representative file signatures":
  - Pick files that are: not in /vendor, not auto-generated, not config files (*.json, *.yaml, *.lock)
  - Use the most unique-looking file (heuristic: longest file with least common extension)
  - Take a 5-line snippet from the middle of the file (avoid license headers)
- Query GitHub Code Search: `"[snippet content]" language:[repo_language]`
- If results > 2 repos matching the snippet: flag as suspicious
- Threshold: flag repo if >40% of signature files have matches in other repos

Rate limit: Search API is 30 req/min. Max 3 searches per repo. Skip repos if budget < 10.

STAGE 2 — Copyleaks (optional, only if COPYLEAKS_API_KEY set):
- Only run on repos flagged by Stage 1
- Submit via Copyleaks Code API
- If Copyleaks unavailable: continue without it, note in output

OUTPUT:
If any repos flagged:
{
  type: 'repo_laundering',
  severity: 'soft_concern',
  evidence: `[N] repositories show >40% file similarity to existing public code. Repos: [names]. GitHub Search flagged [X] files.`,
  confidenceScore: ...,
  interviewProbe: "Can you walk me through [repo name] — what did you build from scratch vs. what did you base on existing code?",
  autoReject: false
}

IMPORTANT: 
- Inject the RateLimitService and check Search API budget before each call
- If budget exhausted: return null (clean) with a log warning, never a false positive
- Copyleaks calls are fire-and-forget with a 10s timeout — don't block the pipeline
- The Copyleaks API base URL and endpoints should come from env config
```
---

### PROMPT 4.5 — Credential Leak Stub (Light Mode)
Model: Codex
Why Codex: Stub service with precise conditional logic — mechanical function body.
Target file: src/anti-gaming/credential-leak.service.ts
Build CredentialLeakService stub for Light Mode.

In Light Mode, gitleaks cannot run (no repo cloning). This stub provides a best-effort signal from API data only.

METHOD: analyze(groupB: RawGroupB, groupE: RawGroupE): AntiGamingFlag | null

LIGHT MODE DETECTION (API-only, imprecise):
1. Check groupB.repos for any repo named like: '.env-backup', 'secrets', 'credentials', 'api-keys' (case-insensitive, exact name matches only — do not flag partial matches)
2. Check groupE — there is no direct credential signal in API-level GroupE. Return null.

In practice this service will almost always return null in Light Mode. That is correct behaviour.

When a flag IS returned (only for the repo-name pattern):
{
  type: 'credential_leak',
  severity: 'hard_stop',
  evidence: "Repository named '${repoName}' may contain credentials. Verify manually.",
  confidenceScore: 20,  // low confidence — this is a heuristic
  interviewProbe: "I noticed a repository in your account named [name]. Can you tell me about it?",
  autoReject: false
}

Add a JSDoc comment: "In Deep Mode, GitleaksService replaces this stub with full git history scanning."

---

### PROMPT 4.6+4.7+4.8 — P7 Full Implementation + Section D Wiring
Model: Claude
Why Claude: Wiring all flags into P7 and Section D requires careful conditional logic.
Target file: src/signals/primitives/p7-authenticity-confidence.service.ts (replace stub from Phase 2)
Replace the P7 stub with full implementation. Anti-gaming services now exist.

P7 AuthenticityConfidenceService — full implementation.

CORE QUESTION: "Is the evidence trustworthy and the identity coherent?"

INPUT: P7AuthenticityConfidenceInput {
  groupA: RawGroupA
  groupG: RawGroupG  // populated by anti-gaming services before P7 runs
  gitleaks?: GitleaksOutput
  employmentRungs: EmploymentRungResult[]
}

Also accept directly: flags: AntiGamingFlag[]  — add this to the input type

HARD STOP RULE (check first, return immediately):
If gitleaks?.leaksFound OR flags.some(f => f.type === 'credential_leak'):
  return {
    score: null,
    confidence: 'low_evidence',
    confidenceText: "Credential leak detected in git history. Hard stop — escalated to hiring manager. Cannot be cleared by the system. Requires interview or background check.",
    keyEvidence: ["Credential detected: " + (gitleaks?.findings[0]?.ruleId ?? 'unknown rule')],
    observabilityGaps: [],
    interviewProbes: ["A credential was found in your git history. Can you walk us through what happened and how you resolved it?"]
  }

SCORING LOGIC (no hard stop):

1. Employment verification score:
   - Max rung across all employers:
     Rung 3 → +40 points
     Rung 2 → +25 points
     Rung 1 → +15 points
     Rung 0 → +0 points

2. Gaming flag deductions:
   For each flag in flags:
     commit_inflation → -15
     fork_dumping → -10
     burst_dormancy → -20 (strongest signal of profile gaming)
     repo_laundering → -30
     ai_generation_gap → -10

3. Base score: 70 (neutral starting point)
4. Final score = Math.max(0, Math.min(100, base + employment - deductions))

CONFIDENCE FROM SCORE:
score >= 70 AND no flags → strong_evidence
score >= 50 AND flags.length <= 1 → moderate_evidence
score >= 30 → low_evidence
score < 30 OR flags.length >= 3 → low_evidence with hard escalation note

IMPORTANT: Never use confidence='observability_gap' for P7. If data is absent, use 'low_evidence' with note "Authenticity cannot be assessed without public activity data."

keyEvidence should list:
- Employment rung achieved (if > 0)
- Any flags that fired (without revealing the exact detection algorithm)
  e.g. "Commit pattern anomaly detected — interview probe included"

Build a separate method:
buildSectionD(flags: AntiGamingFlag[], primitives: Record<string, PrimitiveAssessment>): SectionD
  Returns {
    flags: flags,
    credentialLeakDetected: flags.some(f => f.type === 'credential_leak'),
    verificationGaps: deduplicate all observabilityGaps across all primitives
  }

---

### Phase 5 — LLM Integration (Week 5)
**Goal:** Replace rule-based stubs with LLM calls for commit quality, PR depth, AI-gen detection.

| Step | Task |
|---|---|
| 5.1 | `LLMClientService` — Anthropic API wrapper, rate handling, retry |
| 5.2 | `CommitQualityPrompt` — evaluates informativeness, intent, message patterns |
| 5.3 | `PRDepthPrompt` — review comment substance, root cause vs symptom |
| 5.4 | `AIGenerationPrompt` — style discontinuity, entropy anomaly detection |
| 5.5 | `READMEScorerPrompt` — quality, clarity, documentation discipline |
| 5.6 | Wire LLM outputs into P1 (commit quality), P3 (PR depth), P6 (AI-gen), P7 (style) |
| 5.7 | Fallback: if LLM call fails, primitive reverts to rule-based with `low_evidence` |
| 5.8 | Token budget management — batch LLM calls in single request per analysis job |

---

### PROMPT 5.1-5.4 — LLM Client + Prompts
**Model:** Claude  
**Why Claude:** LLM prompt engineering for specific structured outputs requires precision.  
**Target files:** `src/llm/llm-client.service.ts`, `commit-quality.prompt.ts`, `pr-depth.prompt.ts`, `ai-generation.prompt.ts`

```
Build the LLM integration layer for a GitHub analysis system using Anthropic's API (claude-sonnet model).

FILE 1: llm-client.service.ts
- NestJS @Injectable, injects ConfigService
- Method: analyze(prompt: LLMPromptRequest): Promise<LLMAnalysisResult>
- LLMPromptRequest: { systemPrompt: string, userContent: string, maxTokens: number, expectJSON: boolean }
- LLMAnalysisResult: { content: string, parsedJSON?: unknown, tokensUsed: number }
- Retry: 3 attempts with exponential backoff on 429/500 errors
- Timeout: 30s per call
- If expectJSON: strip markdown fences before JSON.parse; throw LLMParseException on failure
- Log token usage per call via pino

FILE 2: commit-quality.prompt.ts
Export a function: buildCommitQualityPrompt(commits: string[]) → LLMPromptRequest

System prompt:
"You are evaluating GitHub commit messages for engineering quality. Respond with a JSON object only, no preamble."

Evaluate these 50 commit messages on:
1. informativeness (0-10): does the message explain WHY, not just WHAT?
2. intent_communication (0-10): is the scope of change clear?
3. consistency (0-10): is the style consistent across messages?
4. ai_generation_likelihood (0-100): do the messages show suspiciously uniform structure or unnaturally formal language?

Return: { informativeness: number, intent_communication: number, consistency: number, ai_generation_likelihood: number, examples: { good: string, bad: string } }

FILE 3: pr-depth.prompt.ts
Export: buildPRDepthPrompt(reviewComments: string[]) → LLMPromptRequest

Evaluate a sample of PR review comments:
1. root_cause_identification (0-10): do comments identify root causes, not just symptoms?
2. architectural_thinking (0-10): do comments address design concerns beyond style/formatting?
3. substantive_rate (0-100): % of comments that go beyond "LGTM" or nitpick
4. communication_quality (0-10): are comments constructive and clear?

Return JSON: { root_cause_identification, architectural_thinking, substantive_rate, communication_quality, standout_example?: string }

FILE 4: ai-generation.prompt.ts
Export: buildAIGenerationPrompt(codeSnippets: Array<{file: string, content: string}>) → LLMPromptRequest

You are an expert at detecting AI-generated code patterns. Given 5 code snippets from a candidate's repositories, evaluate:
1. style_consistency (0-100): 100 = perfectly consistent (human), 0 = abrupt discontinuities (AI risk)
2. structural_entropy (0-100): 100 = exhaustively structured (AI risk), 0 = appropriately selective
3. idiomatic_naturalness (0-100): 100 = natural developer idioms, 0 = textbook perfect (AI risk)
4. overall_ai_likelihood (0-100): holistic assessment

Return JSON with scores + classification: 'likely_human' | 'mixed' | 'likely_ai' | 'inconclusive'
Note: inconclusive is preferred over false positives. Err toward 'likely_human'.
```

---

### PROMPT 5.5 — README Scorer Prompt
Model: Claude
Why Claude: Prompt engineering for a structured scoring output — needs precise JSON schema spec.
Target file: src/llm/readme-scorer.prompt.ts
Build the README scorer LLM prompt builder.

Export: buildREADMEScorerPrompt(readmeContents: Array<{ repoName: string; content: string }>): LLMPromptRequest

This prompt evaluates README quality across a candidate's top repos.

System prompt:
"You are evaluating GitHub README files for engineering documentation quality. You will receive up to 5 README files. Respond ONLY with a valid JSON object — no preamble, no explanation, no markdown fences."

User content format:
For each README: "=== README: [repoName] ===\n[first 2000 chars of content]\n\n"

Evaluate:
1. clarity (0-10): is the purpose of the project immediately clear?
2. technical_depth (0-10): does it explain architecture, design decisions, or non-obvious choices?
3. setup_quality (0-10): does it have working setup/installation instructions?
4. maintenance_signals (0-10): does it show active upkeep (badges, changelogs, contribution guides)?
5. overall_documentation_tier: 'exemplary' | 'solid' | 'minimal' | 'absent'

Return JSON:
{
  "per_repo": [{ "repo": string, "clarity": number, "technical_depth": number, "setup_quality": number, "maintenance_signals": number }],
  "average_scores": { "clarity": number, "technical_depth": number, "setup_quality": number, "maintenance_signals": number },
  "overall_documentation_tier": string,
  "standout_example": string | null  // repo name with best documentation, if any
}

maxTokens: 800

Note: README content must be truncated to 2000 chars per file before sending. Add this truncation in the builder function itself.

---

### PROMPT 5.6+5.7 — LLM Output Wiring + Fallback
Model: Claude
Why Claude: Conditional wiring with fallback paths is constraint-heavy.
Target file: src/signals/llm-signal-merger.service.ts
Build LLMSignalMergerService — wires LLM analysis outputs back into primitive assessments.

PURPOSE: After LLM calls complete, their outputs need to upgrade or refine the rule-based primitive assessments. This service takes the rule-based primitives + LLM outputs and returns upgraded primitives.

METHOD:
merge(
  primitives: PrimitiveInputMap results (the rule-based outputs),
  llmOutputs: {
    commitQuality?: CommitQualityResult
    prDepth?: PRDepthResult
    aiGeneration?: AIGenerationResult
    readmeScore?: READMEScorerResult
  }
): Record<string, PrimitiveAssessment>

WIRING RULES:

commitQuality → P1 (Execution Reliability):
  If commitQuality.informativeness >= 7: upgrade P1 confidence by one tier (low→moderate, moderate→strong)
  Add to P1.keyEvidence: "Commit messages score ${commitQuality.informativeness}/10 for informativeness"
  If commitQuality.ai_generation_likelihood > 70: add to P1.observabilityGaps: "High AI generation likelihood in commit messages — may not reflect genuine work patterns"

prDepth → P3 (Collaboration Leverage):
  If prDepth.substantive_rate >= 60: upgrade P3 confidence by one tier
  Add to P3.keyEvidence: "Review comments are ${prDepth.substantive_rate}% substantive (non-trivial)"
  If prDepth.architectural_thinking >= 7: add "Reviews show architectural thinking, not just style concerns"

aiGeneration → P6 (AI Leverage) and P7 (Authenticity):
  P6: use aiGeneration.classification to refine aiLeverageClass
    'likely_human' + existing class is 'traditional_engineer' → keep
    'likely_ai' + no refinement commits → downgrade to 'ai_passenger' if not already
    'likely_ai' + refinement commits detected → keep 'ai_operator'
  P7: if aiGeneration.overall_ai_likelihood > 80: add AntiGamingFlag of type 'ai_generation_gap'

readmeScore → P2 (Systems Evolution) and P4 (Technical Depth):
  P2: if readmeScore.overall_documentation_tier === 'exemplary': add supporting evidence
  P4: if readmeScore.average_scores.technical_depth >= 7: add "READMEs demonstrate technical depth in documentation"

FALLBACK RULE (Phase 5.7):
If any llmOutput is undefined/null (LLM call failed):
  That primitive remains at its rule-based confidence level
  Add to the primitive's observabilityGaps: "LLM analysis unavailable — rule-based assessment only"
  Never change confidence to insufficient_data just because LLM failed

This service must be stateless and pure — same inputs always produce same outputs.

---

### Phase 6 — Deep Mode Infrastructure (Week 6)
**Goal:** GitHub App installed, tokens managed, repos cloned, local tools run.

| Step | Task |
|---|---|
| 6.1 | `EvaluationLinkModule` — link generation, email send, GitHub App OAuth flow |
| 6.2 | `DeepFetcherService` — installation token management, full repo crawl |
| 6.3 | `RepoClonerService` — HTTPS clone of top 30 repos, parallel 4 workers |
| 6.4 | Tool wrapper services: `SccService`, `TokeiService`, `GitinspectorService` |
| 6.5 | `GitleaksService` — full history scan, credential detection |
| 6.6 | `SemgrepService` — lightweight SAST on candidate code samples |
| 6.7 | `ActionlintService` — GitHub Actions workflow validation |
| 6.8 | `DeepAnalysisProcessor` — full pipeline wiring |
| 6.9 | Employment verification Rungs 2 + 3 (org membership + contribution fingerprint) |
| 6.10 | Data retention enforcement — in-memory only for source code, purge on completion |
| 6.11 | Employer notification on Deep Mode completion |
| 6.12 | Integration test: full Deep Mode on test GitHub App installation |


---

### PROMPT 6.1 — Evaluation Link Module (Deep Mode Entry Point)
**Model:** Gemini  
**Why Gemini:** Large context — needs to hold GitHub App OAuth flow spec + NestJS module pattern simultaneously.  
**Target files:** `src/modules/evaluation-link/` (controller + service + module)

```
Build the EvaluationLink NestJS module for GitHub App-based Deep Mode analysis.

PURPOSE: Employers generate a link. Candidate clicks it, installs GitHub App, grants access. System receives webhook, creates Deep Mode AnalysisJob.

MODELS (from Prisma schema):
- EvaluationLink: { id, token, candidateEmail, status: PENDING|CONSENTED|ANALYSING|COMPLETE|EXPIRED, seniorityTarget, archetypeTarget, jobDescriptionId?, installationId?, installationToken?, grantedRepoIds?, employerId, expiresAt, usedAt }

ENDPOINTS:

POST /evaluation-links
Body: { candidateEmail, seniorityTarget, archetypeTarget, jobDescriptionId? }
Auth: RequireEmployer guard
Response: { linkId, evaluationUrl: "https://app.colosseum.dev/eval/[token]", expiresAt }
Creates EvaluationLink with status=PENDING, expiresAt = now + 7 days

GET /evaluation-links/consent/:token
Public endpoint. Redirects to GitHub App install URL with state = token.
GitHub App install URL format: https://github.com/apps/[APP_NAME]/installations/new?state=[token]
Marks link as CONSENTED.

POST /webhooks/github (webhook receiver)
Validates GITHUB_APP_WEBHOOK_SECRET via HMAC-SHA256
On event type = 'installation' and action = 'created':
  - Extract installationId, repositories[] from payload
  - Find EvaluationLink by state param (stored in DB as pendingState field)
  - Generate installation token (JWT RS256 using GITHUB_APP_PRIVATE_KEY + GITHUB_APP_ID)
  - Encrypt token: AES-256-GCM using ENCRYPTION_KEY env var
  - Update link: installationId, installationToken (encrypted), grantedRepoIds, status=CONSENTED
  - Queue Deep Mode AnalysisJob via BullMQ

SECURITY:
- Webhook signature validation must happen before any DB operations
- Installation tokens have 1hr lifetime — store encrypted, refresh on expiry
- Never log installation tokens

Include EvaluationLinkService, EvaluationLinkController, EvaluationLinkModule.
Wire into AppModule. Use Prisma for DB access.
```

---

### PROMPT 6.2-6.3 — Deep Fetcher + Repo Cloner
**Model:** Gemini  
**Why Gemini:** Long parallel execution logic + tool orchestration; large context across multiple services.  
**Target files:** `src/github/deep-fetcher/deep-fetcher.service.ts`, `src/github/deep-fetcher/repo-cloner.service.ts`

```
Build the Deep Mode data fetcher for a GitHub analysis system.

CONTEXT: Deep Mode has a per-candidate GitHub App installation token (decrypted from DB). It clones repos and runs local analysis tools.

FILE 1: DeepFetcherService

PURPOSE: Extends LightFetcher. Uses installation token instead of platform token. Fetches all repos (public + private). Runs full GraphQL batch.

Method: fetchAll(installationToken: string, grantedRepoIds: string[]): Promise<RawDeepData>

GRAPHQL BATCH QUERY (single call):
- Contribution calendar (all time)
- All PRs authored (last 100)
- All PR reviews given (last 100) 
- All issue comments (last 50)
- Org memberships with role
- External contributions (PRs to repos not owned by user)
- Private repo list (filtered to grantedRepoIds)

Merges with public data from LightFetcherService. Returns RawDeepData extends RawLightData.

REPO PRIORITISATION:
Top 30 repos selected by: (stars + forks + commitCount) × recencyWeight
recencyWeight = Math.exp(-daysSinceLastPush / 365)
Log which 30 repos were selected.

FILE 2: RepoClonerService

Method: cloneTop30(repos: RepoToClone[], installationToken: string): Promise<CloneResult[]>

- Clone via HTTPS with token auth: https://x-access-token:[TOKEN]@github.com/[owner]/[repo].git
- Concurrency: 4 workers via Promise pool (p-limit or manual semaphore)
- Clone depth: --depth=500 (full history needed for gitinspector, gitleaks)
- Clone to: /tmp/colosseum-analysis/[jobId]/[repoName] 
- On clone failure: log, continue, mark repo as clone_failed in result
- Timeout: 60s per repo

After all clones complete: emit clones_ready event so tool runners can start

Method: cleanup(jobId: string): Promise<void>
- Recursively delete /tmp/colosseum-analysis/[jobId]
- Called by processor after all tool outputs captured
- Log if cleanup fails (don't throw — job is already complete)

CloneResult: { repoName, path, success, error?, linesEstimate? }
```

---

### PROMPT 6.4-6.7 — Tool Wrapper Services
**Model:** Codex/GPT-4o  
**Why Codex:** These are function bodies wrapping CLI tools — exactly what Codex excels at. Precise I/O parsing, no design decisions.  
**Target files:** `src/tools/*.service.ts`

```
Build NestJS @Injectable wrapper services for 4 CLI analysis tools. Each service:
- Runs a shell command via Node.js child_process.execFile (not exec — no shell injection)
- Parses stdout to structured TypeScript types
- Times out at 120s per repo
- Logs stderr via pino
- Returns null on error (never throws — lets the pipeline continue)

SERVICE 1: SccService
Binary: scc (installed globally)
Command: scc --format json [repoPath]
Parse: JSON output array of {Name: string, Lines: number, Code: number, Comments: number, Blanks: number, Complexity: number}
Output type: SccResult { languages: Array<{name, lines, code, comments, complexity}>, totalComplexity: number, autoGeneratedDetected: boolean }
autoGeneratedDetected: true if any language entry has name containing 'generated' or if Code/Lines ratio < 0.3

SERVICE 2: TokeiService
Binary: tokei (installed globally)
Command: tokei [repoPath] --output json
Parse: JSON object keyed by language name, each with { code, comments, blanks, files: number }
Output type: TokeiResult { byLanguage: Record<string, {code, comments, blanks, files}>, testFileCount: number, totalCodeLines: number }
testFileCount: sum of files in languages where repoPath contains /test/ or /spec/ or /__tests__/ directories

SERVICE 3: GitinspectorService
Binary: gitinspector (installed globally)
Command: gitinspector --format=json --grading=false [repoPath]
Parse: JSON output, extract per-author stats
Filter to: candidate emails only (pass candidateEmails: string[] as argument)
Output type: GitinspectorResult { linesAdded: number, linesDeleted: number, commits: number, activeDays: number, firstCommit?: string, lastCommit?: string }

SERVICE 4: GitleaksService
Binary: gitleaks (installed globally)
Command: gitleaks detect --source [repoPath] --report-format json --report-path /tmp/gitleaks-[repoName].json --no-git=false
Parse: JSON report file after execution
Output type: GitleaksResult { leaksFound: boolean, count: number, findings: Array<{ruleId, file, commit, secret_preview: string (first 4 chars + "****")}> }
IMPORTANT: If leaksFound=true, this is a HARD STOP — log at ERROR level with repoName and count. The processor must surface this to the brief immediately regardless of other results.
```
---
### PROMPT 6.6 — Semgrep Service
Model: Codex
Why Codex: CLI wrapper with JSON output parsing — mechanical function body.
Target file: src/tools/semgrep.service.ts
Build SemgrepService NestJS @Injectable wrapper.

Binary: semgrep (installed globally)
Command: semgrep --config=p/owasp-top-ten --config=p/secrets --json --timeout 60 [repoPath]

Note: use only these two rulesets — fast enough for screening, covers the most important vulnerability classes.

Method: run(repoPath: string): Promise<SemgrepOutput | null>

- execFile with timeout 120s
- Parse stdout as JSON: { results: Array<{ check_id, path, start: {line}, message, extra: { severity } }> }
- Map to SemgrepOutput:
  findings: results.map(r => ({ ruleId: r.check_id, file: r.path, severity: r.extra.severity.toUpperCase(), message: r.message }))
  totalFindings: results.length
  errorCount: results.filter(r => r.extra.severity === 'ERROR').length
- On parse error or timeout: log warning, return null
- On semgrep exit code 1 (findings exist, not an error): parse normally — exit code 1 means findings, not failure
- On exit code 2+ (actual error): return null

IMPORTANT: semgrep can be slow on large repos. Add a pre-check: if repoPath directory size > 100MB (use du -sh), skip and return null with a log warning.

---

### PROMPT 6.7 — Actionlint Service
Model: Codex
Why Codex: CLI wrapper — mechanical.
Target file: src/tools/actionlint.service.ts
Build ActionlintService NestJS @Injectable wrapper.

Binary: actionlint (installed globally)
Command: actionlint -format '{{json .}}' [repoPath]/.github/workflows/*.yml

Method: run(repoPath: string): Promise<ActionlintOutput | null>

Pre-check: if .github/workflows directory does not exist in repoPath → return { issues: [], totalIssues: 0 } (not null — absence of CI is a valid signal, already captured in GroupE)

Parse JSON array output: Array<{ message, filepath, line, column, kind }>
Map to ActionlintOutput:
  issues: results.map(r => ({ file: r.filepath, line: r.line, message: r.message, severity: r.kind }))
  totalIssues: results.length

On parse error: return null.

Note: actionlint exits 0 with empty array when no issues. Non-zero exit with JSON output means issues found — parse normally.

---

### PROMPT 6.8 — Deep Analysis Processor
Model: Gemini
Why Gemini: Full orchestration across many services with parallel tool execution — needs large context.
Target file: src/queues/deep-analysis.processor.ts
Build DeepAnalysisProcessor BullMQ processor for Deep Mode GitHub analysis.

QUEUE NAME: 'deep-analysis'
JOB DATA TYPE: DeepAnalysisJobData { analysisJobId: string, evaluationLinkId: string, seniorityTarget: SeniorityTier, archetypeTarget: RoleArchetype }

PIPELINE (ordered steps with progress %):

5%: Load EvaluationLink by evaluationLinkId. Decrypt installationToken using CryptoUtil.decrypt(). If token expired (>1hr): refresh via GitHub App JWT. Update AnalysisJob status='processing'.

10%: DeepFetcherService.crawl(installationToken, grantedRepoIds) → rawDeepData (~60s)

25%: RepoClonerService.cloneTop30(repos, installationToken, jobId) → cloneResults (~5-8min)
     Log which repos cloned, which failed.

50%: Run tool suite in parallel across all cloned repos (Promise.all):
     For each successfully cloned repo:
       scc = SccService.run(clonePath)
       tokei = TokeiService.run(clonePath)
       gitinspector = GitinspectorService.run(clonePath, candidateEmails)
       gitleaks = GitleaksService.run(clonePath)
       semgrep = SemgrepService.run(clonePath)
       actionlint = ActionlintService.run(clonePath)
     Aggregate across repos: merge SccOutput (sum complexity), merge TokeiOutput (sum lines), concat GitleaksOutput findings, concat SemgrepOutput findings.
     
     HARD STOP CHECK: if any GitleaksOutput.leaksFound === true:
       Update AnalysisJob immediately with hard stop flag.
       Continue pipeline (do not abort) — brief is still generated, but credential flag will be in Section D.

60%: ExternalSignalService.fetch() + EmploymentVerificationService.verify() in parallel (rungs 2+3 available in Deep Mode)

70%: GroupMapperService.map(rawDeepData) → primitiveInputMap (with tool outputs merged in)

75%: All 7 primitive services in parallel (same as Light Mode processor)

80%: Anti-gaming full suite (includes gitleaks results now available)

85%: LLMBatchManagerService.batchAnalyze(tasks) — full corpus analysis

87%: LLMSignalMergerService.merge(primitives, llmOutputs)

90%: BriefAssemblerService.buildBrief(...) — full Deep Mode brief

93%: RepoClonerService.cleanup(jobId) — DELETE all cloned repos from disk
     Log cleanup success/failure. Continue even if cleanup fails.

95%: BriefCacheService.set() + AnalysisJob update (completed)

98%: Notify employer (send email or webhook — use NotificationService, inject it, stub the call)

100%: Mark complete.

ERROR HANDLING:
- Same fallback pattern as Light Mode processor
- On clone failure for a specific repo: log, exclude from tool analysis, continue
- On ALL repos failing to clone: abort with status='failed', error='Repository access failed'
- Cleanup (step 93%) must run even if prior steps fail — use try/finally

INJECT: all services + PrismaService + CryptoUtil + Logger

---

### PROMPT 6.9 — Employment Verification Rungs 2+3
Model: Claude
Why Claude: Precise rung logic upgrade — small targeted extension.
Target file: src/employment/verification-ladder.service.ts (extend existing)
Extend the existing EmploymentVerificationService with Rung 2 and Rung 3 logic.

CONTEXT: The existing service has Rung 0 and Rung 1. Add Rungs 2 and 3 as Deep Mode enhancements.

Rung 2 — GitHub Org Membership:
INPUT: groupA.orgMemberships (now populated in Deep Mode with private org data)
DETECTION: any orgMembership.org matches (fuzzy) employer name
UPGRADE: if Rung 1 already achieved for this employer → upgrade to Rung 2
If Rung 1 not achieved but org found → set to Rung 2 directly

Rung 3 — Contribution Fingerprint:
INPUT: RawDeepData includes orgContributions: Array<{ org: string, firstContributionAt: string, lastContributionAt: string, totalCommits: number }>
DETECTION:
  - Find orgContributions entry matching the employer
  - Check temporal consistency: does the contribution window overlap with claimed employment dates?
  - If claimedStartDate and claimedEndDate provided: verify overlap
  - If only org name known (no dates): Rung 3 requires at least 10 commits in org repos
UPGRADE: Rung 2 → Rung 3 only if temporal consistency confirmed OR commit count >= 10

Add claimedEmployers to the method signature with optional date ranges:
claimedEmployers: Array<{ name: string; startDate?: string; endDate?: string }>

This is additive — do not change existing Rung 0/1 logic. Just extend the method to attempt Rungs 2+3 when mode === 'deep'.


---

### Phase 7 — Role/JD Matching + Section F (Week 7)
**Goal:** Section F live; JD parsing active.

| Step | Task |
|---|---|
| 7.1 | `JobDescriptionModule` — CRUD, LLM extraction of required signals |
| 7.2 | `RoleStackMatchService` — evidenced stack vs JD requirements |
| 7.3 | Gap analysis → specific interview probes (Section E extension) |
| 7.4 | `JDIntentExtractor` — LLM prompt to extract actual requirements beyond keywords |
| 7.5 | Wire Section F into Brief Assembler (only when JD provided + Deep Mode) |


---

### PROMPT 7.1 — Job Description Module
Model: Claude
Why Claude: NestJS CRUD module with LLM extraction — small, precise.
Target files: src/modules/job-description/ (controller + service + module)
Build the JobDescription NestJS module.

PURPOSE: Employers create and manage job descriptions. LLM extracts structured requirements from raw text.

MODEL (already in Prisma schema):
JobDescription { id, title, rawText, extractedSignals: Json?, companyId, createdAt }
extractedSignals shape: {
  requiredLanguages: string[]
  requiredTools: string[]
  requiredFrameworks: string[]
  niceToHave: string[]
  senioritySignals: string[]
  inferredArchetype: RoleArchetype
  inferredSeniority: SeniorityTier
}

ENDPOINTS:

POST /job-descriptions
Body: { title: string, rawText: string }
Auth: RequireCompany guard
Logic:
  1. Create JobDescription record with extractedSignals: null
  2. Queue LLM extraction as a background task (add to a 'jd-extraction' BullMQ queue)
  3. Return: { id, title, status: 'processing' }

GET /job-descriptions/:id
Returns full record including extractedSignals (null if still processing)

PUT /job-descriptions/:id/confirm
Body: { extractedSignals: ExtractedSignals } — HR can edit the LLM extraction before confirming
Updates extractedSignals, sets requirementsConfirmedAt (add this field to JobDescription in Prisma)

DELETE /job-descriptions/:id
Soft delete (add deletedAt field) — do not hard delete, referenced by AnalysisJobs

JD EXTRACTION PROCESSOR:
Queue: 'jd-extraction'
Calls LLMClientService with buildJDExtractionPrompt(rawText)
Stores extractedSignals back on the record

BUILD the JD extraction prompt inline:
System: "Extract structured technical requirements from a job description. Respond only with valid JSON."
User: "[raw JD text, truncated to 3000 chars]"
Response schema: the ExtractedSignals shape above
inferredArchetype: map the role to the closest RoleArchetype enum value
inferredSeniority: map seniority language to SeniorityTier

---

### PROMPT 7.2 — Role Stack Match Service (Section F)
**Model:** Claude  
**Why Claude:** Specific matching logic against typed enum values; needs spec precision.  
**Target file:** `src/signals/role-stack-match.service.ts`

```
Build RoleStackMatchService for Deep Mode + Job Description matching (Evidence Brief Section F).

INPUTS:
- evidencedStack: { languages: string[], tools: string[], frameworks: string[] } (from primitive outputs)
- jobDescription: { extractedSignals: { requiredLanguages: string[], requiredTools: string[], requiredFrameworks: string[], niceToHave: string[], senioritySignals: string[] } }

MATCHING LOGIC:
1. For each required item in JD: check if present in evidenced stack (case-insensitive, fuzzy: "Node" matches "Node.js")
2. overlapScore = (matched / total_required) × 100
3. matchedSignals = required items found in evidence
4. gapSignals = required items NOT found in evidence
5. For each gap: generate a specific interview probe

INTERVIEW PROBE GENERATION (rule-based, not LLM):
- Language gap: "The role requires [lang]. Walk me through your experience with it, if any, even in personal projects."
- Tool gap: "The stack includes [tool]. Have you worked with it or similar tools in its category?"
- Framework gap: "We use [framework] extensively. What's your approach to learning new frameworks when starting a role?"

OUTPUT: SectionF {
  overlapScore: number,
  matchedSignals: string[],
  gapSignals: string[],
  jdIntentSummary: string,               // passed in from JD extractor
  gapInterviewProbes: Array<{ gap: string, probe: string }>
}

IMPORTANT: This service only runs when both conditions are true:
1. mode === 'deep'
2. jobDescriptionId is set on the AnalysisJob
If either condition is false, return null. BriefAssembler handles the null → sectionF absent.
```

---
### PROMPT 7.4 — JD Intent Extractor Prompt
Model: Claude
Why Claude: Prompt that needs to go beyond keyword matching requires careful instruction.
Target file: src/llm/jd-intent.prompt.ts
Build the JD intent extraction LLM prompt builder.

Export: buildJDIntentPrompt(rawJD: string): LLMPromptRequest

PURPOSE: Extract what the role ACTUALLY needs, beyond keyword matching. Many JDs list desired skills that are not actually critical to day-to-day work, or omit skills that are.

System prompt:
"You are a senior engineering hiring consultant. Analyse this job description and identify what this role genuinely requires vs. what is aspirational boilerplate. Respond ONLY with valid JSON."

User: first 3000 chars of rawJD

Return JSON:
{
  "core_technical_requirements": string[],   // non-negotiable technical skills
  "nice_to_have": string[],                  // explicitly or implicitly optional
  "likely_day_to_day": string[],             // what they will actually do most of the time
  "boilerplate_detected": string[],          // standard JD filler that's not specific to this role
  "hidden_requirements": string[],           // skills implied but not stated (e.g. "distributed systems" when "designs data pipelines" is mentioned)
  "seniority_signals": string[],             // phrases that indicate the real seniority expectation
  "intent_summary": string                   // 2-sentence plain English: what this role is really about
}

maxTokens: 600

The intent_summary becomes EvidenceBrief.sectionF.jdIntentSummary.
---

### Phase 8 — Hardening & Outcomes (Week 8)
**Goal:** Production-ready, GDPR compliant, outcome data schema live.

| Step | Task |
|---|---|
| 8.1 | `HireOutcome` model + POST /outcomes endpoint |
| 8.2 | Anti-gaming calibration hook — flag → outcome correlation schema |
| 8.3 | GDPR deletion — hard delete + Redis flush |
| 8.4 | Load test: 50 concurrent Light Mode jobs, p95 < 3 min |
| 8.5 | Load test: 10 concurrent Deep Mode jobs |
| 8.6 | Cache hit verification |
| 8.7 | Sentry error tracking wired to all processors |
| 8.8 | Full E2E test suite: 5 seed profiles × 2 modes |

---

### PROMPT 8.1 — Hire Outcome Endpoint
Model: Codex
Why Codex: Simple CRUD endpoint — mechanical.
Target files: src/modules/outcomes/outcomes.controller.ts, outcomes.service.ts, outcomes.module.ts
Build the HireOutcome NestJS module.

MODEL (already in Prisma): HireOutcome { id, analysisJobId, hired, performanceRating, flagsWereAccurate, notes, recordedAt }

ENDPOINTS:

POST /outcomes
Auth: HR_ADMIN or ADMIN role only
Body (Zod):
{
  analysisJobId: string (uuid)
  hired: boolean
  performanceRating?: number (int, 1-5, only valid if hired=true)
  flagsWereAccurate?: boolean  (were the anti-gaming flags correct?)
  notes?: string (max 500 chars)
}
Logic: upsert HireOutcome (one per analysisJob, update if exists)
Return: { id, recordedAt }

GET /outcomes/summary
Auth: ADMIN only
Returns aggregate stats:
{
  totalRecorded: number
  hireRate: number (0-1)
  avgPerformanceRating: number | null
  flagAccuracyRate: number | null  // % of flagged profiles where flag was correct
  byArchetype: Record<RoleArchetype, { hired: number, total: number }>
}
Use Prisma groupBy and aggregate queries.

GET /outcomes/calibration
Auth: ADMIN only
Returns the data needed for anti-gaming calibration:
For each AntiGamingFlag type: how often was it present in hired candidates who performed well vs poorly
Format: Array<{ flagType, totalFlagged, hiredWithFlag, avgPerformanceWhenFlagged }>
Use raw Prisma query to join AnalysisJob.flags JSONB with HireOutcome.

---
### PROMPT 8.3 — GDPR Deletion
Model: Claude
Why Claude: Cascade deletion with soft-anonymise logic needs precise ordering.
Target file: src/modules/profile/gdpr.service.ts
Build GDPRService for hard delete + data anonymisation.

METHOD: deleteCandidate(candidateId: string): Promise<void>

DELETION ORDER (respect FK constraints):

1. Flush Redis: delete all cache keys matching 'brief:*' for this candidate's GitHub username
   Get username from GithubProfile first, then flush.

2. Anonymise Shortlist records (do NOT delete — preserve for employer audit):
   Update all Shortlists where candidateId: set frozenScorecard=null, gapReport=null, decisionCard=null, interviewQuestions=null, candidateNote=null
   Keep: jobPostId, status, pipelineStage, pipelineStageHistory (these are employer records)
   Update candidateId to point to an anonymous candidate record (create one per deletion batch)

3. Delete AnalysisJob records (hard delete)
4. Delete HireOutcome records (hard delete — no audit value without the job)
5. Delete GithubProfile (hard delete — contains encrypted token)
6. Delete Web3Profile (hard delete)
7. Delete DeveloperProfile (hard delete)
8. Delete Vouch records (hard delete — vouches reference the candidate)
9. Delete AuthAccount records (hard delete)
10. Update User: set email=null, username=`deleted_${userId}`, name=null, firstName=null, lastName=null, accountStatus=SUSPENDED
11. Update Candidate: set bio=null, avatarUrl=null, location=null, website=null, scorecard=null

Run all steps in a Prisma transaction where possible. Log each step. On failure: log error + step that failed, throw GDPRDeletionException with step name.

METHOD: anonymiseCandidate(candidateId: string): Promise<void>
Softer version: nulls PII but keeps the account active. Used for account pause, not deletion.
Same as above but skip steps 3-9, and don't delete the User record.

---

### PROMPT 8.5 — LLM Batch Strategy
**Model:** Claude  
**Why Claude:** Token budget optimization logic needs precision.  
**Target file:** `src/llm/llm-batch-manager.service.ts`

```
Build LLMBatchManagerService that optimises Anthropic API token usage for GitHub analysis.

PROBLEM: Each analysis job needs up to 5 LLM calls (commit quality, PR depth, AI generation, README scorer, JD intent). These should be batched where possible to reduce latency and cost.

STRATEGY:
1. Collect all LLM requests for a job into a BatchRequest queue
2. For Light Mode: commit quality + PR depth + AI generation can be combined into ONE API call using a multi-task system prompt
3. For Deep Mode: same 3 combined + README scorer as 4th call + JD intent as 5th call (if JD present)
4. Use claude-sonnet, max_tokens: 2000 per combined call, 1000 per single-task call

COMBINED PROMPT STRATEGY:
System: "You are analysing a GitHub profile. Complete all tasks below and return a single JSON object with keys matching each task name."
User: [task1_label]: [task1_content]\n\n[task2_label]: [task2_content]...

Response parsing: JSON object with keys commit_quality, pr_depth, ai_generation, readme_score, jd_intent

FALLBACK: If combined parse fails → retry each task individually.

TOKEN BUDGET:
- Track total tokens used per job
- Log warning if job exceeds 4000 tokens
- Hard stop at 8000 tokens (return partial results, flag remaining as observability_gap)

Export: batchAnalyze(tasks: LLMTask[]): Promise<Record<string, unknown>>
LLMTask: { name: string, systemPrompt: string, content: string, maxTokens: number }
```

---

### PROMPT — Full Integration Test Suite
**Model:** Codex  
**Why Codex:** Test boilerplate generation is exactly where Codex is efficient.  
**Target file:** `test/integration/pipeline.integration.spec.ts`

```
Write an integration test suite for the Light Mode analysis pipeline in a NestJS + Jest + Supertest setup.

TEST PROFILES (use these exact GitHub usernames as test seeds — mock the GitHub API responses):
1. torvalds — senior principal, high activity, many repos
2. sindresorhus — prolific OSS contributor, high external contributions  
3. new-account-test — sparse profile, account < 6 months, few repos
4. enterprise-dev-test — minimal public repos, private work signals
5. inflated-commits-test — high commit count, tiny commit sizes

FOR EACH PROFILE, test:
1. POST /analysis returns { jobId, status: 'pending' }
2. GET /analysis/:jobId/brief eventually returns status: 'completed' (poll with 5s timeout)
3. Brief has all 7 sections (A–G)
4. Brief has all 7 primitives
5. Every primitive has a valid confidence level from the enum
6. Section G is never empty
7. No composite score in the output (assert no field named 'overallScore' or 'totalScore' exists)
8. confidenceText matches mandatory language patterns

Mock GitHub API: use nock to intercept @octokit calls. Store mock response fixtures in test/fixtures/[username].json.

Also test anti-gaming detection:
- inflated-commits profile triggers commit_inflation flag in Section D
- flag.autoReject === false always
- flag has non-empty interviewProbe

Use @nestjs/testing createTestingModule. Spin up real BullMQ workers in test (use bullmq-test-worker pattern).
```

---

## Part 6 — Pre-Build Human Steps Checklist

These must be done by a human before LLM prompts are run. They are fast but require credentials/access.

```
[ ] 1. Register GitHub App
    - Go to github.com/settings/apps/new
    - Name: Colosseum Analysis
    - Webhook URL: https://[your-domain]/webhooks/github
    - Permissions: Contents(read), Metadata(read), Pull requests(read), Issues(read),
      Commit statuses(read), Checks(read), Code scanning alerts(read),
      Dependabot alerts(read), Deployments(read), Organization members(read), Emails(read)
    - Generate + download private key (PEM)
    - Note: App ID, Client ID, Client Secret, Webhook Secret

[ ] 2. Install system binaries on your build/server environment
    brew install scc            # or: go install github.com/boyter/scc/v3@latest
    cargo install tokei
    pip install gitinspector
    brew install gitleaks        # or: github.com/gitleaks/gitleaks releases
    pip install semgrep
    brew install actionlint      # or: go install github.com/rhysd/actionlint/cmd/actionlint@latest

[ ] 3. Create .env additions:
    GITHUB_APP_ID=
    GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
    GITHUB_APP_WEBHOOK_SECRET=
    ANTHROPIC_API_KEY=
    COPYLEAKS_API_KEY=          # optional
    DEEP_MODE_WORKER_CONCURRENCY=4

[ ] 4. Run Prisma migration:
    npx prisma migrate dev --name v5_rewrite
    (use schema delta from Part 3 of this document)

[ ] 5. Create test GitHub App installation on a personal account
    (for Deep Mode integration tests)

[ ] 6. Seed test fixture JSON files for integration tests
    (mock API responses for the 5 test profiles)
```

---

## Part 7 — Model Assignment Summary

| Phase | Task | Model | Reason |
|---|---|---|---|
| 0.4–0.5 | Type definitions | Gemini | Large spec → declarative types, big context needed |
| 0.6 | Env schema | Claude | Small, precise constraint extension |
| 1.1 | Light fetcher | Gemini | Multi-group data structure + octokit patterns |
| 1.2 | Rate limit service | Claude | State machine with hard thresholds |
| 2.1–2.2 | P1, P2 primitives | Claude | Rule logic, spec adherence |
| 2.3 | P3 Collaboration | Claude | Critical observability gap nuance |
| 2.4–2.5 | P4, P5 primitives | Claude | Threshold logic |
| 2.6 | P6 AI Leverage | Claude | 5-class classification logic |
| 2.7 | P7 Authenticity | Claude | After anti-gaming built (Phase 4) |
| 3.1–3.3 | Brief assembler | Claude | Section assembly, mandatory language |
| 4.1–4.3 | Anti-gaming bundle | Gemini | Three algorithms, shared data context |
| 4.4 | Repo laundering | Claude | External API + precise error handling |
| 5.1–5.4 | LLM client + prompts | Claude | Prompt engineering precision |
| 6.1 | Evaluation link module | Gemini | GitHub App OAuth flow, large context |
| 6.2–6.3 | Deep fetcher + cloner | Gemini | Parallel execution architecture |
| 6.4–6.7 | Tool wrappers | Codex | CLI wrapper bodies, exact I/O parsing |
| 7.2 | Stack match | Claude | Typed matching logic |
| 8.5 | LLM batch manager | Claude | Token budget optimization |
| Integration tests | Full suite | Codex | Test boilerplate generation |

---

*v5 Rewrite Plan · Generated May 2026 · Based on GitHub Engineering Intelligence System v5.0 spec*