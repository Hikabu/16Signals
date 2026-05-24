# GEIS v5 — Implementation Roadmap & Drift Guards
## Phased Delivery + LLM Drift Detection

---

## Phase Sequence

### Phase 0 — Foundations (Week 1)
**Goal:** Lock the contract. Nothing is built until the schema is locked and the tests exist.

| Priority | Deliverable | Target file | Test |
|---|---|---|---|
| P0 | Confidence types enum | `src/shared/confidence.types.ts` | Enum values match CONFIDENCE_LANGUAGE keys |
| P0 | EvidenceBrief schema | `src/scoring/evidence-brief/evidence-brief.schema.ts` | TypeScript compile-only |
| P0 | DataBundle types | `src/scoring/primitives/data-bundle.types.ts` | TypeScript compile-only |
| P0 | Invariant test suite (stubs) | `__tests__/evidence-brief.invariants.spec.ts` | All tests FAIL (expected — no implementation yet) |
| P0 | Prisma schema extension | `prisma/schema.prisma` | `npx prisma validate` passes |
| P0 | AnalysisJob DTO extension | `src/modules/analysis/dto/create-analysis.dto.ts` | Zod parse tests |

**Exit criteria:** All invariant tests exist and fail predictably. Schema TypeScript compiles. No implementation code yet.

---

### Phase 1 — Light Mode Analyser (Weeks 2–3)
**Goal:** Light Mode produces a valid EvidenceBrief for any public GitHub profile. Legacy scorecard computed for backward compat.

| Priority | Deliverable | Target file | Depends on |
|---|---|---|---|
| P0 | Anti-gaming service | `src/scoring/signal-extractor/anti-gaming.service.ts` | DataBundle types |
| P0 | LLM prompt files | `src/scoring/llm-analysis/prompts/*.prompt.ts` | Nothing |
| P0 | LLM client service | `src/scoring/llm-analysis/llm-client.service.ts` | Prompt files, ConfigService |
| P0 | Light fetcher upgrade | `src/scoring/github-adapter/light-fetcher.service.ts` | DataBundle types |
| P0 | Employment verifier (Rung 1 only) | `src/scoring/employment-verification/employment-verifier.service.ts` | DataBundle |
| P1 | All 7 primitive services (P1–P7) | `src/scoring/primitives/p{N}-*.service.ts` | DataBundle, LLM results |
| P1 | Primitive aggregator | `src/scoring/primitives/primitive-aggregator.service.ts` | All 7 primitives |
| P1 | Evidence brief service | `src/scoring/evidence-brief/evidence-brief.service.ts` | Aggregator, primitives |
| P1 | Legacy scorecard mapper | `src/scoring/evidence-brief/legacy-scorecard-mapper.service.ts` | EvidenceBrief |
| P1 | Light mode processor (upgrade) | `src/queues/analysis.processor.ts` | All services |
| P2 | Rate limit manager | `src/scoring/github-adapter/rate-limit-manager.service.ts` | GitHub adapter |

**Exit criteria:** `POST /analysis { githubUsername: "torvalds", mode: "light" }` returns a valid EvidenceBrief with all 7 sections. Invariant tests pass.

---

### Phase 2 — Deep Mode (Weeks 4–5)
**Goal:** Deep Mode pipeline with local tool execution.

| Priority | Deliverable | Target file | Notes |
|---|---|---|---|
| P0 | Tool wrapper services | `src/scoring/external-tools/*.service.ts` | 6 tool wrappers |
| P0 | Deep fetcher | `src/scoring/github-adapter/deep-fetcher.service.ts` | Clone + tool orchestration |
| P0 | Deep mode processor | `src/queues/deep-analysis.processor.ts` | Separate BullMQ queue |
| P0 | GitHub App installation token flow | `src/modules/auth/` | Extend existing auth module |
| P1 | Employment verifier Rungs 2–3 | `src/scoring/employment-verification/employment-verifier.service.ts` | Extend Phase 1 impl |
| P1 | Similarity detection | `src/scoring/similarity-detection/*.service.ts` | GitHub Code Search + Copyleaks |
| P2 | Package registry APIs | `src/scoring/github-adapter/registry-fetcher.service.ts` | npm, PyPI, crates.io |

**Exit criteria:** Deep Mode completes for a profile with private repos. gitleaks runs against clone. Cleanup verified (no /tmp residue after job).

---

### Phase 3 — Signal Quality & Calibration (Weeks 6–7)
**Goal:** Signal fidelity improvements + outcome schema.

| Priority | Deliverable | Target file | Notes |
|---|---|---|---|
| P1 | Hire/No-hire outcome schema | `prisma/schema.prisma` → `HireOutcome` model | Must start on day 1 of production |
| P1 | ATS webhook receiver | `src/modules/analysis/webhooks/` | hire/no-hire event capture |
| P1 | Seniority weighting calibration | `src/scoring/primitives/primitive-aggregator.service.ts` | Tune against real profiles |
| P2 | Stack Overflow API (Tier 3) | `src/scoring/github-adapter/stackoverflow-fetcher.service.ts` | Additive only, post-2022 filter |
| P2 | JD signal extraction prompt | `src/scoring/llm-analysis/prompts/jd-extraction.prompt.ts` | For Section F |

---

## Environment Variables
### File: `src/config/env.schema.ts` — extend with:

```typescript
// New variables required for v5
ANTHROPIC_API_KEY: z.string().min(1),                    // For LLM analysis
GITHUB_APP_ID: z.string().min(1),                        // For Deep Mode GitHub App
GITHUB_APP_PRIVATE_KEY: z.string().min(1),               // JWT RS256 signing
GITHUB_APP_INSTALLATION_ID: z.string().min(1),           // Platform installation (Light Mode)
COPYLEAKS_API_KEY: z.string().optional(),                 // Optional — secondary laundering detection
ANALYSIS_MAX_REPOS_LIGHT: z.coerce.number().default(50), // Repo limit for Light Mode
ANALYSIS_MAX_REPOS_DEEP: z.coerce.number().default(30),  // Repo limit for Deep Mode
CLONE_TMP_DIR: z.string().default('/tmp'),               // Base dir for clones
LIGHT_MODE_CACHE_TTL_SECONDS: z.coerce.number().default(86400),   // 24h
DEEP_MODE_CACHE_TTL_SECONDS: z.coerce.number().default(43200),    // 12h
RATE_LIMIT_CIRCUIT_BREAKER_THRESHOLD: z.coerce.number().default(500),
```

---

## LLM Drift Detection Checklist

Run this checklist after generating EACH file with an LLM prompt. If any item fails, the generated code has drifted from the architecture.

### After generating any primitive service (P1–P7):
- [ ] Method signature is `assess(bundle: DataBundle): PrimitiveAssessment` (no network calls)
- [ ] Return type has NO `score: number` field — only `evidence[]`, `confidenceLevel`, `confidenceStatement`, `gaps[]`
- [ ] `gaps` array is never empty — always contains the "cannot measure" items from spec
- [ ] `confidenceStatement` is populated from `CONFIDENCE_LANGUAGE` map, not hardcoded string
- [ ] No call to any HTTP client, repository, or external service inside the service

### After generating the evidence-brief.service.ts:
- [ ] `sectionG` is populated unconditionally — no `if (hasData)` guard around it
- [ ] `sectionF` is `null` when `jobDescription` is falsy — never an empty object
- [ ] `primitives` object has all 7 keys — search for `P1:`, `P2:`, `P3:`, `P4:`, `P5:`, `P6:`, `P7:`
- [ ] `validateBrief` is called before returning — and throws on invariant violation
- [ ] Search file for: `totalScore`, `overallScore`, `compositeScore`, `finalScore` — all must be absent

### After generating anti-gaming.service.ts:
- [ ] No method returns `autoReject: true` or any rejection decision
- [ ] Threshold constants are defined at top of file (not hardcoded in functions)
- [ ] `processGitleaksOutput` does NOT include raw secret values in `details` array
- [ ] `detectBurstDormancy` accounts for `evaluationTriggeredRecently` parameter

### After generating llm-client.service.ts:
- [ ] `analyseProfile` never throws — always returns `LlmAnalysisResult`
- [ ] Uses `Promise.all` for the three parallel API calls
- [ ] Has a timeout mechanism (30s)
- [ ] Safe defaults are defined as constants, not inline fallback strings
- [ ] Model string is exactly: `claude-sonnet-4-20250514`

### After generating deep-analysis.processor.ts:
- [ ] `try/finally` wraps the entire clone+analyse flow — cleanup always runs
- [ ] Clone target is `/tmp/geis-<jobId>/` (not a persistent directory)
- [ ] Individual repo clone failure does NOT fail the job — skip and continue
- [ ] All tool failures degrade gracefully (null results, not throws)

### After generating ANY file:
- [ ] Run `npx tsc --noEmit` — no TypeScript errors
- [ ] Run invariant test suite — all previously passing tests still pass
- [ ] Search generated file for: `autoReject`, `totalScore`, `compositeScore` — all must be absent

---

## File Reference Map

| What you're building | Architecture doc to read first | Implementation prompt |
|---|---|---|
| Confidence types | `01_OUTPUT_SCHEMA.md` | PROMPT 01 |
| EvidenceBrief schema | `01_OUTPUT_SCHEMA.md` | PROMPT 02 |
| DataBundle types | `02_PRIMITIVES_SPEC.md` | PROMPT 03 |
| P1 Execution Reliability | `02_PRIMITIVES_SPEC.md` | PROMPT 04 |
| P2 Systems Evolution | `02_PRIMITIVES_SPEC.md` | Adapt PROMPT 04 for P2 |
| P3 Collaboration Leverage | `02_PRIMITIVES_SPEC.md` | Adapt PROMPT 04 for P3 |
| P4 Technical Depth | `02_PRIMITIVES_SPEC.md` | Adapt PROMPT 04 for P4 |
| P5 Operational Maturity | `02_PRIMITIVES_SPEC.md` | Adapt PROMPT 04 for P5 |
| P6 AI Leverage Quality | `02_PRIMITIVES_SPEC.md` | Adapt PROMPT 04 for P6 |
| P7 Authenticity Confidence | `02_PRIMITIVES_SPEC.md` + `03_LLM_PROMPTS_AND_ANTIGAMING.md` | PROMPT 05 |
| Anti-gaming service | `03_LLM_PROMPTS_AND_ANTIGAMING.md` | PROMPT 06 |
| LLM client | `03_LLM_PROMPTS_AND_ANTIGAMING.md` | PROMPT 07 |
| Primitive aggregator | `02_PRIMITIVES_SPEC.md` | PROMPT 08 |
| Evidence brief service | `01_OUTPUT_SCHEMA.md` + `02_PRIMITIVES_SPEC.md` | PROMPT 09 |
| Integration tests | All docs | PROMPT 10 |
| Deep mode processor | `00_MASTER_ARCHITECTURE.md` + `03_LLM_PROMPTS_AND_ANTIGAMING.md` | PROMPT 11 |
| Legacy scorecard mapper | `01_OUTPUT_SCHEMA.md` + `PLAN__1_.md` | PROMPT 12 |

---

## Dependency Installation

New packages required (add to package.json):

```bash
npm install @anthropic-ai/sdk          # LLM API client
```

New system binaries required (install on server/CI):
```bash
# Ubuntu/Debian
curl -L https://github.com/boyter/scc/releases/latest/download/scc_Linux_x86_64.tar.gz | tar xz -C /usr/local/bin/
curl -L https://github.com/XAMPPRocky/tokei/releases/latest/download/tokei-x86_64-unknown-linux-musl.tar.gz | tar xz -C /usr/local/bin/
pip install gitinspector --break-system-packages
brew install gitleaks            # or: curl from gitleaks releases
pip install semgrep --break-system-packages
curl -L https://github.com/rhysd/actionlint/releases/latest/download/actionlint_linux_amd64.tar.gz | tar xz -C /usr/local/bin/
```

Add binary availability check at startup (`src/scoring/external-tools/tools-health-check.service.ts`):
```typescript
// On app startup, verify each binary exists. Log WARNING (not error) if missing.
// Missing binaries degrade Deep Mode gracefully — they don't fail the app.
const REQUIRED_DEEP_MODE_BINARIES = ['scc', 'tokei', 'gitinspector', 'gitleaks', 'semgrep', 'actionlint'];
```
