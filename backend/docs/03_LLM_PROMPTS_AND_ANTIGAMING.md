# GEIS v5 — LLM Analysis Prompts & Anti-Gaming Detection
## Implementation Specification

---

## LLM Client Service
### File: `src/scoring/llm-analysis/llm-client.service.ts`

```typescript
// Uses Anthropic Claude API (claude-sonnet-4-20250514)
// All LLM analysis is batched into a single call per analysis job where possible.
// Never use LLM for decisions — only for NLP analysis and pattern detection.
// All LLM outputs are structured JSON. Parse strictly. Never trust free-text output.

interface LlmAnalysisRequest {
  commitMessages: string[];       // up to 50, sampled from recent history
  prDescriptions: string[];       // up to 20
  reviewComments: string[];       // up to 20
  commitSizePattern: number[];    // histogram
  velocityBurstScore: number;     // from antiGaming layer
  repoDescriptions: string[];     // top 10 repo descriptions/READMEs (first 500 chars each)
}

interface LlmAnalysisResult {
  commitQualityScore: number;           // 0–100
  commitQualitySummary: string;         // 1–2 sentences
  prDescriptionQualityScore: number;    // 0–100
  prDescriptionQualitySummary: string;  // 1–2 sentences
  aiGenerationClassification: AiLeverageClassification;
  aiGenerationEvidence: string;         // 1–2 sentences explaining the classification
  aiGenerationPatternScore: number;     // 0–100 (100 = very likely AI-generated without guidance)
}
```

---

## Commit Quality Analysis Prompt
### File: `src/scoring/llm-analysis/prompts/commit-quality.prompt.ts`

```typescript
export const COMMIT_QUALITY_PROMPT = `You are analysing a sample of Git commit messages from a software engineer's GitHub history.

Your task: assess the quality of these commit messages as engineering communication signals.

Return ONLY valid JSON matching this exact schema. No other text.

Schema:
{
  "score": <integer 0-100>,
  "summary": "<1-2 sentences describing what you observed>",
  "signals": {
    "informative": <boolean — do messages explain WHY, not just WHAT>,
    "atomic": <boolean — do messages suggest appropriately scoped changes>,
    "consistent": <boolean — is there a consistent style and convention>,
    "aiGenerated": <boolean — do messages show signs of AI generation: unnaturally formal, exhaustive, or template-like>
  }
}

Scoring guide:
- 80–100: Clear intent communication, explains trade-offs, consistent conventions, clearly human-authored
- 60–79: Mostly informative but some vague entries, minor inconsistency
- 40–59: Mix of informative and placeholder ("fix bug", "update", "WIP")
- 20–39: Predominantly placeholder messages — no useful information
- 0–19: No meaningful communication in commit messages

Commit messages to analyse:
<COMMIT_MESSAGES>`;

export function buildCommitQualityPrompt(messages: string[]): string {
  const formatted = messages.map((m, i) => `${i + 1}. ${m}`).join('\n');
  return COMMIT_QUALITY_PROMPT.replace('<COMMIT_MESSAGES>', formatted);
}
```

---

## PR Description Quality Analysis Prompt
### File: `src/scoring/llm-analysis/prompts/pr-depth.prompt.ts`

```typescript
export const PR_DEPTH_PROMPT = `You are analysing a sample of Pull Request descriptions from a software engineer's GitHub history.

Your task: assess the quality of these PR descriptions as signals of engineering communication and collaboration maturity.

Return ONLY valid JSON matching this exact schema. No other text.

Schema:
{
  "score": <integer 0-100>,
  "summary": "<1-2 sentences describing what you observed>",
  "signals": {
    "narrativeQuality": <boolean — do PRs tell a story: what changed, why, trade-offs considered>,
    "contextProvided": <boolean — do PRs link issues, explain motivation, reference prior work>,
    "testingEvidence": <boolean — do PRs mention tests, QA steps, or validation approach>,
    "reviewerRespect": <boolean — do descriptions make review easy for others>
  }
}

Scoring guide:
- 80–100: PRs read like engineering documents — clear motivation, trade-offs, testing approach
- 60–79: Mostly useful but inconsistent — some PRs lack context
- 40–59: Mix of useful and placeholder ("fix", "update", "as discussed")
- 20–39: Predominantly empty or placeholder descriptions
- 0–19: No PR descriptions or all single-word

PR descriptions to analyse:
<PR_DESCRIPTIONS>`;

export function buildPrDepthPrompt(descriptions: string[]): string {
  const formatted = descriptions.map((d, i) => `PR ${i + 1}:\n${d}`).join('\n\n---\n\n');
  return PR_DEPTH_PROMPT.replace('<PR_DESCRIPTIONS>', formatted);
}
```

---

## AI Generation Detection Prompt
### File: `src/scoring/llm-analysis/prompts/ai-generation.prompt.ts`

```typescript
export const AI_GENERATION_PROMPT = `You are analysing software engineering artefacts to classify how an engineer uses AI coding tools.

You will receive:
1. A sample of commit messages
2. A sample of PR descriptions  
3. Statistical signals about commit patterns (velocity bursts, size distribution)

Your task: classify the engineer's AI tool usage pattern. This is NOT about whether they use AI — AI use is a skill. It is about HOW they use it.

IMPORTANT: A "Traditional Engineer" classification is neutral, not negative.
IMPORTANT: "Disclosure Flag" means interview is needed — not rejection.
IMPORTANT: You are detecting patterns, not intent.

Return ONLY valid JSON matching this exact schema. No other text.

Schema:
{
  "classification": "<one of: AI_OPERATOR | AI_ARCHITECT | AI_PASSENGER | TRADITIONAL_ENGINEER | DISCLOSURE_FLAG>",
  "patternScore": <integer 0-100, where 100 = strong AI generation signal without human guidance>,
  "evidence": "<1-2 sentences describing the specific patterns you observed>",
  "signals": {
    "velocityQualityConsistent": <boolean — high velocity periods maintain quality>,
    "iterativeRefinementPresent": <boolean — evidence of review/refinement after AI-assisted commits>,
    "styleConsistency": <boolean — consistent style vs abrupt discontinuities>,
    "exhaustiveCoverageAnomaly": <boolean — unnaturally comprehensive coverage patterns suggesting AI generation>
  }
}

Classification guide:
- AI_OPERATOR: High velocity, quality maintained or improved, iterative refinement present
- AI_ARCHITECT: Evidence of guiding/modifying AI output rather than accepting it wholesale
- AI_PASSENGER: High volume commits, quality declining, no iterative refinement after large sessions
- TRADITIONAL_ENGINEER: Consistent patterns consistent with hand-crafted code, no AI signatures
- DISCLOSURE_FLAG: Abrupt style discontinuities, unnaturally exhaustive patterns, large single-session commits with no follow-up

Commit messages:
<COMMIT_MESSAGES>

PR descriptions:
<PR_DESCRIPTIONS>

Statistical signals:
Velocity burst score (1.0 = normal, 5.0+ = significant burst): <BURST_SCORE>
Commit size distribution (additions+deletions): <SIZE_DISTRIBUTION>`;

export function buildAiGenerationPrompt(
  commitMessages: string[],
  prDescriptions: string[],
  burstScore: number,
  sizeDistribution: number[],
): string {
  return AI_GENERATION_PROMPT
    .replace('<COMMIT_MESSAGES>', commitMessages.slice(0, 30).join('\n'))
    .replace('<PR_DESCRIPTIONS>', prDescriptions.slice(0, 10).join('\n---\n'))
    .replace('<BURST_SCORE>', burstScore.toFixed(2))
    .replace('<SIZE_DISTRIBUTION>', JSON.stringify(sizeDistribution.slice(0, 20)));
}
```

---

## Anti-Gaming Detection Service
### File: `src/scoring/signal-extractor/anti-gaming.service.ts`

This service runs on raw fetched data BEFORE primitives are computed. It populates `DataBundle.antiGaming`.

### Detection Algorithms

```typescript
// 1. COMMIT INFLATION
// Input: commits.commitSizeHistogram (array of additions+deletions per commit)
// Excludes: merge commits, doc-only commits (detected by file extension sampling)
// Flag: > 30% of commits below 5-line threshold OR p25 of histogram < 3
function detectCommitInflation(histogram: number[]): {
  rate: number;         // 0–1
  flagged: boolean;     // true if rate > 0.30
} {
  const nonTrivial = histogram.filter(n => n > 0);
  const below5 = nonTrivial.filter(n => n < 5).length;
  const rate = nonTrivial.length > 0 ? below5 / nonTrivial.length : 0;
  return { rate, flagged: rate > 0.30 };
}

// 2. FORK DUMPING
// Input: repos[] — isForked flag + gitinspector author stats (DEEP) or heuristic (Light)
// Light Mode heuristic: fork with zero stars, zero topics, pushed_at === created_at → likely unmodified
// Flag: > 50% of public repos are unmodified forks
// Side effect: adjust repo inventory to exclude unmodified forks from language/topic analysis
function detectForkDumping(repos: RepoData[]): {
  rate: number;
  flagged: boolean;
  unmodifiedForkNames: string[];
}

// 3. BURST / DORMANCY PATTERN
// Input: external.contributionCalendarBurstScore
// Flag: last 30 days > 5× trailing 12-month weekly average
// Note: correlate with analysisJob.createdAt — burst triggered by evaluation = stronger flag
function detectBurstDormancy(burstScore: number, evaluationTriggeredRecently: boolean): {
  score: number;
  flagged: boolean;
  evaluationCorrelated: boolean;
}

// 4. REPOSITORY LAUNDERING
// Input: GitHub Code Search API results (pre-fetched)
// Method: query with representative file signatures from candidate's top repos
// Flag: repos where > 40% of files match existing public repos
// Secondary: Copyleaks API for confirmed flagged repos (if COPYLEAKS_API_KEY configured)
// Output: array of { repoName, similarityScore, matchedRepo }
// Rate limit: 30 req/min authenticated — budget carefully, spot-check only
function detectRepositoryLaundering(
  repos: RepoData[],
  githubSearchResults: CodeSearchResult[],
): Promise<Array<{ repoName: string; similarityScore: number; matchedRepo: string }>>

// 5. AI-GENERATION DISCLOSURE GAP
// Delegated entirely to LLM analysis layer.
// Anti-gaming service reads the result and stores it in DataBundle.antiGaming.aiGenerationPatternScore
// Flag if patternScore > 70 AND classification === DISCLOSURE_FLAG

// 6. CREDENTIAL LEAK
// DEEP MODE ONLY: gitleaks run against all cloned repos including full git history
// Light Mode: not executed (no clone available)
// ANY finding at ANY severity level = credentialLeakDetected = true
// This is the only HARD_STOP in the system
function processGitleaksOutput(gitleaksJsonOutput: GitleaksResult[]): {
  detected: boolean;
  details: string[];
}

// 7. AUTHORSHIP DISCONTINUITY
// Input: repos sorted by date — does sophistication jump abruptly?
// LLM analysis of code style consistency across time windows
// Light Mode: limited heuristic (star count vs commit quality mismatch)
// Deep Mode: gitinspector per-author stats across repos to confirm single authorship
function detectAuthorshipDiscontinuity(
  repos: RepoData[],
  gitinspectorResults: GitinspectorResult[],
): boolean
```

---

## Employment Verification Service
### File: `src/scoring/employment-verification/employment-verifier.service.ts`

```typescript
// Three-Rung Verification Ladder
// Rung 0: No verifiable signal
// Rung 1: Commit author email matches @employer.com domain (both modes)
// Rung 2: GitHub org membership API confirms presence (Deep Mode only)
// Rung 3: Contribution activity in org repos temporally consistent with claimed tenure (Deep Mode only)

// MANDATORY output language — never substitute:
const RUNG_LANGUAGE = {
  3: (org: string, period: string) =>
    `Rung 3 — Contribution fingerprint confirmed: active engineering activity in ${org} during ${period}.`,
  2: (org: string) =>
    `Rung 2 — Organisation membership confirmed: GitHub seat in ${org} verified. Contribution scope unconfirmed — recommend interview verification.`,
  1: (domain: string) =>
    `Rung 1 only — email domain match (@${domain}). Organisation membership unconfirmed — recommend interview verification.`,
  0: (claim: string) =>
    `Rung 0 — No verifiable signal available for claimed role at ${claim}. This is a system limitation, not a candidate failure. Proceed to interview with suggested probe.`,
};

// IMPORTANT: The 'Unverified' label is NEVER used as standalone output.
// Always use the rung language above.
```

---

## External Tools Wrapper Services
### Target files: `src/scoring/external-tools/*.service.ts`

Each service wraps a CLI tool. All are Deep Mode only (require cloned repos).

```typescript
// scc.service.ts — Sloc Cloc Code
// Binary: scc (Rust binary, must be installed)
// Invocation: scc --format json <repoPath>
// Parses: SLOC, comment density, complexity estimate per language
// Returns: SccResult per repo

// tokei.service.ts — Code counting
// Binary: tokei (faster than cloc)
// Invocation: tokei --output json <repoPath>
// Parses: per-language counts including test file detection
// Returns: TokeiResult, compute testToCodeRatio = testLines / (codeLines + testLines)

// gitinspector.service.ts — Per-author contribution stats
// Binary: gitinspector (Python, pip install gitinspector)
// Invocation: gitinspector --format json --grading <repoPath>
// Filters: output for candidateEmail matches only
// Returns: GitinspectorAuthorStats { linesAdded, linesDeleted, commits, daysActive }

// gitleaks.service.ts — Secret scanning
// Binary: gitleaks (Go binary)
// Invocation: gitleaks detect --source <repoPath> --report-format json --report-path /tmp/gitleaks-<jobId>.json --no-git=false
// IMPORTANT: runs against FULL git history, not just HEAD
// Returns: GitleaksResult[] (any result = credentialLeakDetected = true)

// semgrep.service.ts — SAST pattern matching
// Binary: semgrep (pip install semgrep)
// Invocation: semgrep --config=p/default --json <repoPath>
// Uses OSS ruleset only — no network dependency during run
// Returns: SemgrepFinding[] per repo

// actionlint.service.ts — GitHub Actions workflow validation
// Binary: actionlint
// Invocation: actionlint -format '{{json .}}' <repoPath>/.github/workflows/*.yml
// Returns: ActionlintIssue[] — maps to CI/CD sophistication scoring

// Clone orchestration: deep-fetcher.service.ts
// Clone: git clone --depth=0 https://x-access-token:<installationToken>@github.com/<owner>/<repo>.git /tmp/geis-<jobId>/<repo>
// Parallel: 4 workers via Promise.all with concurrency limit
// Top 30 repos by: (stars + forks + commitCount) × recencyWeight
// Cleanup: rm -rf /tmp/geis-<jobId> on job completion (success OR failure)
// Source code NEVER written to persistent storage — /tmp only
```

---

## Rate Limit Management
### File: `src/scoring/github-adapter/rate-limit-manager.service.ts`

```typescript
// GraphQL-first strategy: ~60% REST savings
// All nested/relational data: single batched GraphQL queries
// REST: flat endpoints, file contents, paginated data
// Search API: sparingly — code similarity spot-checks only (30 req/min)

// Circuit breaker:
// IF remaining_budget < 500:
//   → pause collection
//   → cache partial results
//   → resume after rate limit window reset
//   → NEVER present partial brief as complete

// Repo prioritisation for >100 repos:
// score = (stars + forks + commitCount) × recencyWeight
// recencyWeight = 1.0 if pushed in last 12 months, 0.5 if 12–36 months, 0.1 if older
// Evaluate top 50 only
// Disclose this heuristic in the Evidence Brief

// Deep Mode isolation:
// Light Mode uses platform token (shared pool)
// Deep Mode uses per-candidate installation token (isolated pool)
// No interaction between pools
```
