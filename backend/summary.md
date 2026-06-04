# GitIntel Refactored Analysis Architecture — Complete Summary

---

## 📐 Three-Layer Pipeline (Data Flow)

```
                    ┌──────────────────────────┐
                    │      GitHub APIs          │
                    │  (REST + GraphQL + tools) │
                    └─────────────┬────────────┘
                                  │  Raw data fetched,
                                  │  normalized into 7 groups
                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                    LAYER 1: DATA COLLECTOR                       │
│                                                                  │
│  Fetches everything observable about a developer.                │
│  Normalizes raw API responses into 7 GROUPED SIGNAL CATEGORIES.  │
│                                                                  │
│  Output: SIGNAL CORPUS (7 Groups A–G)                            │
│  Storage: Redis — keyed `corpus:{username}:{mode}`, 7-day TTL   │
│  Purpose: Cache. Fetched once, reused for re-scoring.            │
│                                                                  │
│  ⚠️  The corpus is RAW DATA — no judgments, no scores.          │
│     It's a snapshot of what GitHub can observe.                  │
└───────────────────────────┬──────────────────────────────────────┘
                            │  14 modules READ from the corpus.
                            │  Modules are PURE FUNCTIONS:
                            │    run(corpus, config) → ModuleResult
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                    LAYER 2: 14 ANALYSIS MODULES                  │
│                                                                  │
│  Each module answers ONE specific question about the engineer.   │
│  Modules do NOT call APIs — they only consume corpus data.       │
│                                                                  │
│  Executed in 5 WAVES (see below).                                │
│                                                                  │
│  Output: 14 ModuleResult objects                                 │
│  Each contains: confidence, evidence[], flags[], interview_probe │
│  Stored: In-memory during pipeline (then persisted to Prisma)    │
└───────────────────────────┬──────────────────────────────────────┘
                            │  14 ModuleResults consumed
                            │  by the Brief Assembler
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                    LAYER 3: BRIEF ASSEMBLER                      │
│                                                                  │
│  Takes all ModuleResults + LLM-generated narratives.             │
│  Applies seniority weighting. Renders the final document.        │
│                                                                  │
│  Output: EVIDENCE BRIEF (7 Sections A–G)                         │
│  Formats: Markdown + JSON                                        │
│  Storage: Prisma AnalysisJob.result (JSONB)                      │
│                                                                  │
│  ⚠️  The brief has 7 sections (A–G) which are COMPLETELY        │
│     DIFFERENT from the 7 corpus groups (A–G).                    │
│     It's a naming coincidence — they're independent taxonomies.  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Data Transformation Journey

### Step 1: GitHub → Corpus

The Data Collector calls GitHub APIs and local tools, extracting raw facts into 7 signal groups:

| Group | Name | Source | Example Raw Data |
|-------|------|--------|-----------------|
| **A** | Identity & Profile | GraphQL user query | Account age: 4872 days, bio: "Creator of Linux", orgs: ["Linux Foundation"] |
| **B** | Repository Inventory | GraphQL repos query (top 100) | 47 repos, primary languages: C(68%), Shell(12%), Python(8%) |
| **C** | Commit Intelligence | REST commits API (top 10 repos, 100 commits each) | 35,000+ lifetime commits, median size: 47 lines, active 12/12 months |
| **D** | Collaboration & Review | GraphQL PRs query (paginated) | 12 PRs authored, 89 reviews, substantive review ratio: 0.62 |
| **E** | Engineering Practices | REST contents API (file tree) | CI: GitHub Actions in 8 repos, tests in 12 repos, Docker: 3 repos |
| **F** | Impact & External | npm/PyPI/Cargo APIs, StackExchange | 0 npm packages, 5 PyPI packages, StackOverflow: not present |
| **G** | Anti-Gaming Raw Inputs | Deterministic computation from corpus | Burst ratio: 1.2 (normal), fork-dump ratio: 0.03 (normal) |

**Corpus is INPUT to modules. It is NEVER modified by modules.**

### Step 2: Corpus → Modules

Each module reads from specific corpus groups and produces a structured judgment:

```
Corpus Group A (Identity) ──────→ EV (employment verification rungs 1-3)
                                  P7 (authenticity aggregation)

Corpus Group B (Repositories) ──→ P4 (language depth by commit volume)
                                  AG2 (fork dump detection)

Corpus Group C (Commits) ───────→ P1 (cadence, size discipline)
                                  P2 (refactor evidence, code survival)
                                  P4 (depth by commit volume)
                                  AG1 (commit inflation)
                                  AG3 (burst/dormancy)

Corpus Group D (Collaboration) ─→ P3 (review quality, self-merge rate)
                                  P4 (PR description quality)

Corpus Group E (Engineering) ───→ P1 (CI pass rate, semver, dependabot)
                                  P5 (observability, IaC, secret leaks)
                                  P6 (AI config files present)
                                  AG6 (credential leak detection)

Corpus Group F (Impact) ────────→ P4 (package adoption, StackOverflow)

Corpus Group G (Anti-Gaming) ───→ AG1-AG4 (threshold inputs)
                                  AG5 (AI pattern confidence)
                                  P7 (authenticity aggregation)
```

**Every module returns a `ModuleResult`:**
```json
{
  "module_id": "p1_execution_reliability",
  "primitive_id": "p1",
  "confidence": "strong",
  "score_label": "Demonstrated across multiple repositories — high confidence in shipping reliability.",
  "evidence": [
    {
      "signal": "Commit cadence consistency",
      "corpus_field": "commit_signals.commit_frequency_by_month",
      "value": { "activeMonths": 12 },
      "interpretation": "Active in 12 of trailing 12 months. No gap > 8 consecutive weeks."
    }
  ],
  "flags": [],
  "interview_probe": null,
  "raw_signals_used": ["commit_signals.commit_frequency_by_month", "commit_signals.median_commit_size_lines", ...]
}
```

### Step 3: Modules → Evidence Brief

The Brief Assembler takes all 14 `ModuleResult` objects + LLM narrative text and renders 7 sections for human consumption:

```
ModuleResults from P1-P7 ────────→ Brief Section A (Profile summary)
                                    Brief Section C (Work patterns)
                                    Brief Section F (Technical assessment)

ModuleResults from AG1-AG6 ──────→ Brief Section D (Red flags)
                                    Brief Section A (authenticity note)

ModuleResult from EV ────────────→ Brief Section B (CV cross-reference)

LLM-generated narratives ────────→ Brief Sections A, B, C (paragraph text)

LLM-generated interview questions → Brief Section E

Fixed compliance template ───────→ Brief Section G (limitations)
```

---

## ⚠️ 7 ≠ 7 — The Naming Coincidence

The **Signal Corpus** has 7 groups (A–G) and the **Evidence Brief** has 7 sections (A–G). They are **completely independent taxonomies** that happen to share letter names:

| Corpus Group | Purpose | Brief Section | Purpose |
|-------------|---------|---------------|---------|
| A: Identity | Raw profile data | A: Profile in 90 Seconds | Executive summary |
| B: Repositories | Raw repo inventory | B: Tech Reality vs CV | Claim verification |
| C: Commits | Raw commit data | C: Work Patterns | Behavioral analysis |
| D: Collaboration | Raw PR/review data | D: Red Flags | Security concerns |
| E: Engineering | Raw CI/IaC/test data | E: Interview Probes | Targeted questions |
| F: Impact | Raw package/SO data | F: Role & Stack Match | JD alignment |
| G: Anti-Gaming | Raw detection inputs | G: Limitations | What we can't see |

**Data goes: Corpus groups → Modules → Brief sections. The numbers are a coincidence.**

---

## 📊 The 14 Modules — Complete Reference

### Wave Execution Order

```
Wave 1 (parallel, ~2s):         AG1, AG2, AG3 — Anti-gaming pre-check
  ↓
Wave 2a (conditional, ~20s):    AG4 — Repository Laundering (only if AG1 or AG3 fired)
  ↓
Waves 2b/2c/2d (parallel, ~1s): P1,P2,P5 ║ P3 ║ P4 — Deterministic scoring
  ↓
Wave 3 (LLM batch, ~25s):       P6, AG5, EV — AI leverage + generation detection + employment verification
  ↓
Wave 4 (LLM narrative, ~20s):   Brief assembler + interview questions
```

### Primitives (P1–P7)

| Module | Question It Answers | Corpus Read From | Seniority Adjustment | Contributes To |
|--------|--------------------|------------------|---------------------|----------------|
| **P1** Execution Reliability | Can they ship safely and consistently? | C (commits), E (CI/semver/dependabot) | Intern/Junior: CI and test ratio NOT expected — scored from cadence + size only | Sections A, C, F |
| **P2** Systems Evolution | Do systems improve under their stewardship? | C (complexity, messages, author stats) | Intern/Junior: Marked "Not expected" | Sections A, C |
| **P3** Collaboration Leverage | Do they amplify the people around them? | D (reviews, PRs, cross-repo) | Below 5 PRs reviewed → observability_gap (not low confidence — enterprise-context allowance) | Sections A, C |
| **P4** Technical Depth | Can they go deep when the problem requires it? | B (repos, languages), D (PRs), F (packages) | Package adoption is the strongest single signal | Sections A, F |
| **P5** Operational Maturity | Can they handle production reality? | E (observability, IaC, secrets, SAST) | Secret leaks cap confidence at LOW (regardless of other signals) | Sections A, C, D |
| **P6** AI Leverage Quality | Do they direct AI effectively? | E (AI configs), C (velocity), G (style events) + LLM Wave 3 | Classification: ai_architect / ai_operator / ai_passenger / traditional / disclosure_flag | Sections A, C |
| **P7** Authenticity Confidence | Is the evidence trustworthy? | G (anti-gaming inputs), A (identity) + AG1-AG6 results | Aggregator only — does NOT score independently. ≥4 primitives at observability_gap → insufficient_data with profile-level gate banner | Sections A, D |

### Anti-Gaming (AG1–AG6)

| Module | What It Detects | Flag Type | Contributes To |
|--------|----------------|-----------|----------------|
| **AG1** Commit Inflation | sub_5_line_ratio > 30% AND p25 < 3 lines | SOFT | Section D |
| **AG2** Fork Dump | Unmodified forks / total repos > 50% | Inventory adjustment (not a flag) | Section D |
| **AG3** Burst/Dormancy | Activity spike > 5× baseline within 14 days of evaluation | SOFT | Section D |
| **AG4** Repository Laundering | Code Search API similarity > 40% → Copyleaks confirmation | HARD (if Copyleaks confirmed) | Section D |
| **AG5** AI Generation Gap | P6 classification = "disclosure_flag" — reads from P6 output | SOFT | Section D |
| **AG6** Credential Leak | gitleaks full history scan (Deep Mode only) | HARD (CRITICAL) | Section D |

### Employment Verification (EV)

| Rung | What It Checks | Available In | Contributes To |
|------|---------------|-------------|----------------|
| **Rung 0** | No verifiable signal | Light + Deep | Section B |
| **Rung 1** | Commit email domain matches employer domain | Light + Deep | Section B |
| **Rung 2** | GitHub org membership confirmed | Deep only | Section B |
| **Rung 3** | Active commits in org repos during stated employment period | Deep only | Section B |

---

## 📖 The Evidence Brief — How to Read It

### Section A: Profile in 90 Seconds

**What it shows:** 2-3 paragraph executive summary. Profile archetype assigned by rule engine (Specialist, Production Engineer, OSS Contributor, Ops-Focused, Generalist Builder). Top 3 capabilities. Employment verification rung. AI leverage classification. Analysis mode (Light/Deep).

**Who reads it:** CTO, VP Engineering, Hiring Manager — making a quick "do we proceed?" decision.

**How to interpret:**
- `confidence: strong` across multiple primitives → proceed with confidence
- `confidence: observability_gap` in most primitives → NOT a rejection — read the profile-level gate banner: "This profile pattern is consistent with enterprise or regulated-industry contexts where public evidence is structurally absent. This is correlated with — not anti-correlated with — seniority and impact. Proceed to technical interview."
- `ai_leverage_classification: ai_architect` → strong positive
- `ai_leverage_classification: disclosure_flag` → interview required to clarify, NOT automatic rejection

### Section B: Tech Reality vs CV Claims

**What it shows:** Cross-reference table mapping CV claims to GitHub evidence. Each claim gets a status: confirmed, partially_confirmed, unconfirmed, contradicted. "Unconfirmed" DOES NOT mean false — absence of public evidence is not proof of absence of skill.

**Who reads it:** Recruiter, HR, Hiring Manager — evaluating whether the candidate's self-reported experience matches observable signals.

**How to interpret:**
- `confirmed`: CV claim matches GitHub evidence — move on
- `partially_confirmed`: Some evidence exists but not complete — probe in interview
- `unconfirmed`: No evidence found — probe in interview, do NOT treat as contradiction
- `contradicted`: ONLY when positive evidence of falsehood exists (e.g., claimed employment at Company X but all commits from Company Y during that period). The brief always notes: "Contradiction does not assume fraud."

### Section C: Work Pattern Intelligence

**What it shows:** Behavioral analysis derived from P1–P5 combined: commit cadence, collaboration style, engineering rigor, AI usage patterns. Shipping velocity (median time from PR open to merge). CI pass rate trajectory. All in paragraph form.

**Who reads it:** Technical Lead, Engineering Manager — understanding how this person works day-to-day.

**How to interpret:**
- Active 12/12 months → consistent contributor
- Active 6/12 months → may have private work or other responsibilities — not a negative
- High review ratio + low self-merge → strong collaborator
- Declining CI pass rate → concern for Senior+ (for Junior: not expected)

### Section D: Red Flags

**What it shows:** Every flag from AG1–AG6 modules. Each flag has a severity badge (INFO/WARNING/CRITICAL), specific evidence, recommended interview question, and resolution path (system-clearable or interview-only). **Zero flags = "No authenticity flags detected in this analysis"** — this section is never empty.

**Who reads it:** CTO, Security, Hiring Manager — identifying potential deal-breakers.

**How to interpret:**
- `SOFT / INFO`: Noted for context — do NOT reject based on this alone. Interview probe provided.
- `SOFT / WARNING`: Requires interview clarification. System-clearable: honest explanation resolves it.
- `HARD / CRITICAL`: Require escalation. Credential leaks → hiring manager review. Copyleaks-confirmed laundering → direct interview. NEVER automatic rejection — the system cannot auto-reject.

**Flag types by severity:**
| Flag | Type | Severity | Resolution |
|------|------|----------|------------|
| COMMIT_INFLATION_SOFT | SOFT | WARNING | Candidate can explain commit workflow in interview |
| FORK_DUMP | Inventory adjustment | INFO | No action needed; excluded repos noted in brief |
| BURST_DORMANCY_SOFT | SOFT | WARNING | Candidate can explain recent activity spike |
| REPO_LAUNDERING_HARD | HARD | CRITICAL | Requires interview + Copyleaks confirmation |
| AI_DISCLOSURE_GAP | SOFT | WARNING | Interview probe: "Can you walk me through your AI tool usage?" |
| SECRET_LEAK_HARD | HARD | CRITICAL | Escalate to hiring manager. Cannot be system-cleared. |

### Section E: Interview Intelligence

**What it shows:** 4-6 targeted questions generated from actual gaps and evidence in the candidate's profile. Ordered: DESIGN_DECISION → DEPTH_PROBE → GAP_PROBE → FLAG_CLARIFICATION. Each question cites specific corpus evidence, what a strong answer includes, and red-flag indicators.

**Who reads it:** Tech Interviewer, Engineering Manager — preparing for a targeted, evidence-based interview.

**How to interpret:** These are NOT generic questions — they reference specific observable signals. Use them verbatim or adapt. Each question is designed to:
1. Allow the candidate to CONFIRM or CLARIFY (never accusatory)
2. Probe depth beyond surface level
3. Be answerable by a strong engineer in 5–10 minutes

### Section F: Role & Stack Match

**What it shows:** Only present when `jd_text` is provided. Maps job description technologies to candidate's evidenced stack. Technologies categorized as: matched (≥50 commits in last 3 years), partial (1–49 commits), gap (0 commits). Gap items become interview probe topics.

**Who reads it:** Recruiter, Hiring Manager — quick stack alignment check.

**How to interpret:** "Gap" does NOT mean the candidate doesn't know the technology — it means there's no public evidence of it. Many experienced engineers work primarily in private repos. Treat gaps as interview probes, not rejections.

### Section G: What This Evaluation Cannot Tell You

**What it shows:** Fixed legal/ethical compliance footer. Lists what the analysis CANNOT assess: problem-solving under novel ambiguity, verbal communication clarity, cultural fit, motivation and growth trajectory, performance under pressure. Every primitive with `observability_gap` adds its recommended interview probe here.

**Who reads it:** Everyone — this section CANNOT be omitted by any configuration.

**How to interpret:** This is the system's honesty clause. It tells you exactly what the brief does NOT cover. A candidate with many `observability_gap` results is NOT a bad candidate — it means their public GitHub presence doesn't reveal enough. The brief explicitly says: "Do not use this report as a filter for this candidate. Proceed directly to technical interview using the generated interview questions."

---

## 🏷️ Confidence Levels — What They Mean to Different Audiences

| Confidence | To a CTO/VP | To a Tech Lead | To an Interviewer | To HR |
|-----------|-------------|---------------|-------------------|------|
| **strong** | Green-light. Proceed with confidence. | This area is well-evidenced. Focus interview time elsewhere. | Skip probing this area — they've demonstrated it. | Strong signal for this dimension. |
| **moderate** | Proceed — probe in interview. | Evidenced but limited context. Good interview topic. | Ask about depth and breadth in this area. | Moderate confidence — verify in interview. |
| **low** | Not a rejection. Treat as unconfirmed. | One instance detected — insufficient to score. | Critical interview topic — dig into this area. | Low evidence. Do NOT use as a filter. Interview probe provided. |
| **observability_gap** | NOT a negative. Enterprise-context explanation. | No public evidence likely due to private/enterprise work. Do not penalize. | Use the provided probe to explore this area conversationally. | No public data. Do not reject based on this. Private work is common. |
| **insufficient_data** | Profile-level gate: "Proceed directly to technical interview." | Cannot assess from available signals. Use standard interview format. | No evidence to inform questions — use your standard approach. | No data available. Proceed to interview without analysis bias. |

---

## 🔄 User Flow Triggers

### Light Mode — `POST /api/v2/analysis/light`

**Request:**
```json
{
  "githubUsername": "torvalds",
  "config": {
    "seniority": "senior",
    "role_archetype": "backend",
    "jd_text": "Optional JD for Section F matching"
  }
}
```

**Response:** `201 Created` with `{ jobId: "light_xxx", status: "queued" }`

**Production path:** Controller creates Prisma `AnalysisJob` → enqueues to BullMQ `analysis` queue → `AnalysisProcessor.processLight()` → runs full `JobDispatcherService.dispatchLightMode()` pipeline → brief stored in Prisma.

**Dev path (`USE_SYNC_PIPELINE=true`):** Controller runs synchronously in the HTTP request.

**Polling:** `GET /api/v2/analysis/:jobId` returns status transitions: `queued → wave_1 → wave_2a(cond) → wave_2b/2c/2d → wave_3 → wave_4 → completed`

### Deep Mode — `POST /api/v2/analysis/deep`

**Request:**
```json
{
  "githubUsername": "torvalds",
  "installationId": 12345678,
  "config": { "seniority": "senior", "role_archetype": "backend" }
}
```

**Flow:** Light corpus checked first → if exists and < 7d old, reused → private repos fetched via GitHub App → cloned to tmpfs → tools run (scc, tokei, gitinspector, gitleaks, semgrep) → delta merged into corpus → same 14 modules run on enriched corpus → brief assembled with `cloneStats`.

### CV Verify — `POST /api/v2/analysis/cv-verify`

**Request:**
```json
{
  "githubUsername": "torvalds",
  "cvText": "Senior Backend Engineer at Acme Corp (2020-2025)...",
  "config": { "seniority": "senior", "role_archetype": "backend" }
}
```

**Flow:** CV text → `CvClaimExtractorService.extractFromText()` → structured claims → passed as `config.cv_claims` → Light Mode runs → EV module enriches with claims → Brief Section B renders cross-reference table.

---

## 💾 Where Everything Is Stored

| Data | Storage | Key | TTL |
|------|---------|-----|-----|
| Signal Corpus | Redis | `corpus:{username}:{mode}` | 7 days |
| Analysis Result | Prisma `AnalysisJob.result` (JSONB) | `AnalysisJob.id` | Permanent |
| Evidence Brief (Markdown) | Inside `AnalysisJob.result.briefMarkdown` | — | Permanent |
| Brief JSON (Sections A–G) | Inside `AnalysisJob.result.briefJson` | — | Permanent |
| Module Results (all 14) | Inside `AnalysisJob.result.moduleResults[]` | — | Permanent |
| Flags | Inside `AnalysisJob.result.flags[]` | — | Permanent |
| Clone Stats (Deep only) | Inside `AnalysisJob.result.cloneStats` | — | Permanent |
| CV Claims (CV verify only) | Inside `AnalysisJob.result.claimsExtracted` | — | Permanent |

**Prisma `AnalysisJob.result` schema:**
```json
{
  "briefMarkdown": "# Evidence Brief: @torvalds\n\n## A. Profile in 90 Seconds...",
  "briefJson": {
    "sectionA": "...", "sectionB": "...", "sectionC": "...",
    "sectionD": "...", "sectionE": "...", "sectionF": "...", "sectionG": "..."
  },
  "moduleResults": [
    {
      "module_id": "p1_execution_reliability",
      "primitive_id": "p1",
      "confidence": "strong",
      "score_label": "Demonstrated across multiple repositories — high confidence in shipping reliability.",
      "evidence": [{ "signal": "Commit cadence consistency", "corpus_field": "commit_signals.commit_frequency_by_month", "value": { "activeMonths": 12 }, "interpretation": "Active in 12 of trailing 12 months." }],
      "flags": [],
      "interview_probe": null,
      "raw_signals_used": ["commit_signals.commit_frequency_by_month", "commit_signals.median_commit_size_lines", "commit_signals.sub_5_line_commit_ratio", "engineering_practice_signals.ci_pass_rate_trajectory", "engineering_practice_signals.semantic_versioning_discipline", "engineering_practice_signals.avg_dependabot_resolution_days"]
    }
    // ... 13 more modules
  ],
  "flags": [{ "flag_id": "COMMIT_INFLATION_SOFT", "flag_type": "SOFT", "severity": "WARNING", "module_id": "ag1_commit_inflation", "description": "High proportion of very small commits...", "escalate_to_hiring_manager": false, "clear_without_interview": true, "interview_probe": "Can you walk me through your typical commit workflow?" }],
  "moduleCount": 14,
  "flagCount": 1,
  "totalDurationMs": 45230,
  "cloneStats": { "reposCloned": 3, "reposSucceeded": 3, "reposFailed": 0, "totalCloneTimeMs": 245000, "secretLeaksFound": 0 },
  "claimsExtracted": 7
}
```

**Redis **Signal Corpus** key structure:** `corpus:{username}:{mode}`
- `corpus:torvalds:light` — Light Mode corpus (public APIs only)
- `corpus:torvalds:deep` — Deep Mode corpus (includes private repos + tools)
- Deep corpus supersedes Light corpus for the same username

---

## 🚀 Complete Module → Brief Mapping Summary

```
 ┌─────────────────────┐     ┌──────────────────────┐     ┌──────────────────────────────┐
 │   SIGNAL CORPUS      │     │   14 ANALYSIS MODULES │     │     EVIDENCE BRIEF             │
 │   (7 Groups A-G)     │ ──→ │   (14 ModuleResults)  │ ──→ │     (7 Sections A-G)           │
 │   INPUT (raw data)   │     │   PROCESS (scoring)   │     │     OUTPUT (human-readable)     │
 └─────────────────────┘     └──────────────────────┘     └──────────────────────────────┘

 Corpus A ──────────────→ EV, P7 ───────────────────────→ Brief Section B (CV cross-ref)
                                                            Brief Section A (identity note)

 Corpus B ──────────────→ P4, AG2 ──────────────────────→ Brief Section A (depth)
                                                            Brief Section D (fork flags)

 Corpus C ──────────────→ P1, P2, P4, AG1, AG3 ────────→ Brief Section A (profile)
                                                            Brief Section C (work patterns)
                                                            Brief Section D (commit flags)

 Corpus D ──────────────→ P3, P4 ───────────────────────→ Brief Section A (profile)
                                                            Brief Section C (collaboration)

 Corpus E ──────────────→ P1, P5, P6, AG6 ─────────────→ Brief Section A (profile)
                                                            Brief Section C (engineering)
                                                            Brief Section D (secret flags)

 Corpus F ──────────────→ P4 ───────────────────────────→ Brief Section A (impact note)

 Corpus G ──────────────→ AG1-AG4, AG5, P7 ────────────→ Brief Section D (all flags)
                                                            Brief Section A (authenticity)

 LLM Wave 3 Output ─────→ P6, AG5 ──────────────────────→ Brief Section C (AI patterns)

 LLM Wave 4 Narrative ──→ (Brief Assembler) ────────────→ Brief Sections A, B, C (paragraph text)

 LLM Wave 4 Questions ──→ (Brief Assembler) ────────────→ Brief Section E (interview probes)

 Fixed Template ────────→ (Brief Assembler) ────────────→ Brief Section G (limitations)

 JD Text (optional) ────→ (Brief Assembler) ────────────→ Brief Section F (role match)

```

## FLOW
[modules/analysis/analysis/analysis-v2.controller.ts] 
    * createLightAnalysis() // L88

[queues/analysis.processor.ts]
    * process()         //L39
    * processLight()    //L64
        >> console.log(`1.[AnalysisProcessor] ..`)
        >> Database becomes:
                status=collecting
                progress=10

[modules/analysis/orchestration/job-dispatcher.service.ts]
    * dispatchLightMode()   //L96
        >>console.log(`2.[JobDispatcher]...`,);
        >>console.log(`3.[JobDispatcher]...`,);

    * acquireCorpus()       //L210
        >> If cache : 
            console.log(`3.1[JobDispatcher]...`,);
        >> If no cache : 
            console.log(`3.2[JobDispatcher]...`,);

[modules/analysis/data-collector/data-collector.service.ts]
    * collectLightMode()    //L233
        console.log(`3.3[DataCollector]...`,);

    


## FETCHING DATA > CORPUS SIGNALS
Group A -> IdentitySignals
Group B -> RepositorySignals
Group C -> CommitSignals
Group D -> CollaborationSignals
Group E -> EngineeringPractices
Group F -> ImapctSignals
Group G -> AntiGamingInputs
