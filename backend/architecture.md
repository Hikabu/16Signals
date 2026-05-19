# 16Signals: Backend Architecture & Scorecard Pipeline Overview

This document provides a comprehensive, high-level overview of the 16Signals backend system, focusing specifically on the **Scorecard System**, how metrics are extracted, and how the final candidate score is formed. 

It maps the exact evolution of the data pipeline—from raw external responses to the normalized types consumed by the frontend UI. It is designed to serve as a definitive reference for both clients (to understand what the app does) and developers (to understand the pipeline architecture for maintenance, updating, or adding new verticals).

---

## 1. The Scorecard Analysis Pipeline

The Scorecard System is an asynchronous, multi-stage pipeline designed to evaluate a developer's true capabilities based on verifiable public artifacts (GitHub code, On-chain data, Community Vouches) rather than self-reported resumes.

The pipeline is orchestrated by the `SignalComputeProcessor` (a BullMQ background worker), ensuring that long-running API fetches and calculations do not block the main application.

Below is the step-by-step lifecycle mapping how raw data evolves into the final UI.

---

### Stage 1: Data Ingestion & The Raw Type (`GitHubRawData`)
The pipeline begins by fetching raw data from external sources. The system supports different modes (`github-only`, `wallet-only`, `github+wallet`).

*   **GitHub Adapter**: Fetches a developer's public repositories, contribution graph, profile age, pull requests to external orgs, and `package.json` manifests via Octokit.
*   **Solana Adapter**: Fetches on-chain data, such as programs deployed by the linked wallet address.

**Data Type Evolution at this stage:**
The output of Stage 1 is the `GitHubRawData` interface (and an array of `DeployedProgram` objects for Web3). This is a massive, unstructured JSON dump:
```typescript
export interface GitHubRawData {
  profile: GitHubUserProfile;         // account age, followers
  repos: GitHubRepo[];                // array of repos (isFork, stars, language, topics)
  contributions: GitHubContributionData; // weekly activity over 52 weeks
  externalPRs: ExternalPRSummary[];   // PRs merged to outside orgs
  manifests?: ManifestResult[];       // extracted dependencies (npm, cargo)
  fetchedAt: Date;
}
```

---

### Stage 2: Signal Extraction (`ExtractedSignals`)
Raw data is messy. The `SignalExtractorService` distills `GitHubRawData` into **8 normalized, deterministic signals (S1 - S8)**. 

**Data Type Evolution at this stage:**
The system generates an `ExtractedSignals` object containing strict numerical and categorical heuristics:
```typescript
export interface ExtractedSignals {
  ownershipDepth: number;         // S1: Non-fork repos active in last 3 months
  projectLongevity: number;       // S2: Avg age (months) of maintained repos
  activityConsistency: number;    // S3: Ratio of active weeks in last year (0.0 - 1.0)
  techStackBreadth: number;       // S4: Unique languages count
  externalContributions: number;  // S5: Merged external PRs count
  projectMeaningfulness: number;  // S6: Composite of stars, forks, topics (0.0 - 1.0)
  stackIdentity: string[];        // S7: Top 2 primary programming languages
  dataCompleteness: number;       // S8: Confidence metric. Detects "Private Work".
}
```

---

### Stage 3: Scoring & Categorization (`AnalysisResult`)
The `ScoringService` translates the 8 isolated signals into human-readable business metrics, representing the final "Scorecard" that is saved directly into the PostgreSQL Database under `Candidate.scorecard` and `AnalysisJob.result`.

This is where numerical heuristics are mapped to specific developer archetypes. For example, the developer's primary languages (from S7) are mapped via `LANGUAGE_CAPABILITY_WEIGHTS`. A Rust/Go developer scores high in `Backend`, while a TypeScript/React developer scores high in `Frontend`.

**Data Type Evolution at this stage:**
The `ExtractedSignals` are transformed into the `AnalysisResult` interface:
```typescript
export interface AnalysisResult {
  summary: string; // LLM-generated executive summary
  capabilities: {
    backend: { score: number; confidence: ConfidenceLevel };
    frontend: { score: number; confidence: ConfidenceLevel };
    devops: { score: number; confidence: ConfidenceLevel };
  };
  ownership: {
    ownedProjects: number;
    activelyMaintained: number;
    confidence: ConfidenceLevel;
  };
  impact: {
    activityLevel: ActivityLevel; // 'high' | 'medium' | 'low'
    consistency: ConsistencyLevel; // 'strong' | 'moderate' | 'sparse'
    externalContributions: number;
    confidence: ConfidenceLevel;
  };
  reputation: ReputationBlock | null; // Added in Stage 4
  organizations: OrgAnalysisResult[];
  stack: { languages: string[]; tools: string[] };
  web3: { ... } | null;               // Added in Stage 4
}
```

---

### Stage 4: Web3 & Community Merge
Before the `AnalysisResult` is finalized, the `Web3MergeService` layers on Web3 proof-of-work:
*   **Wallet Upgrades**: Successfully deploying mainnet Solana programs boosts the overall confidence and backend capability scores.
*   **Community Vouches (S15)**: Active "Vouches" (endorsements) are queried from the DB. High-quality vouches directly populate the `reputation` block inside the `AnalysisResult`.

---

### Stage 5: The Frontend UI (`ScorecardData`)
When a user views a profile (e.g., at `/u/:username`), the Next.js frontend calls the API to retrieve the stored `AnalysisResult`.

However, the UI component (`ScorecardView.tsx`) uses a slightly flattened and normalized interface called `ScorecardData`. The frontend runs a mapping function `normalizeScorecard.ts` before passing the data to the view.

**Data Type Evolution at this stage:**
`AnalysisResult` is mapped into the `ScorecardData` interface:
```typescript
export interface ScorecardData {
  profile?: { username?: string, avatarUrl?: string, summary?: string }
  score?: { value?: number, percentile?: number, isWithheld?: { value: boolean, reason: string } }
  trust?: { level?: string, risk?: string, label?: string, guidance?: string }
  insights?: {
    capabilities?: Array<{ label: string, score: number }> // Flattened to array for easy iteration
    highlights?: string[]
    gaps?: string[]
    caveats?: string[]
    ownership?: { ownedProjects?: number, activelyMaintained?: number, confidence?: number } // Strings mapped to numbers
    impact?: { activityLevel?: string, consistency?: number, externalContributions?: number, confidence?: number }
    stack?: { languages?: string[], tools?: string[] }
    web3?: { achievements?: Array<{ label: string, description?: string }> }
  }
}
```

**Normalization details:**
*   **Confidence Strings to Numbers**: `normalizeScorecard.ts` maps strings like `'high'`, `'medium'`, `'low'` from the backend `AnalysisResult` into numerical percentages (`0.9`, `0.66`, `0.33`) so the UI can render confidence progress bars.
*   **Capabilities to Arrays**: The nested backend capability objects are flattened into an `Array<{label, score}>` to feed directly into the `CapabilityBar` UI components.

*Note: For Employer/HR views, the backend uses `ScorecardRendererService.ts` to transform the `AnalysisResult` directly into an HTML template containing a "Decision Card" (fit tier, gaps, strengths), bypassing the Next.js UI.*

---

## 2. Guide for Developers: Extending the Pipeline

The architecture is highly modular. Because of the strict mapping layers, adding new features is predictable.

### How to add a new Vertical (e.g., EVM / Ethereum)
1.  **Stage 1 (Adapters)**: Create an `EvmAdapterService` in `modules/scoring/web3-adapter/` to fetch smart contracts.
2.  **Stage 2 (Signals)**: (Optional) If EVM requires new heuristics, extract them in `SignalExtractorService`.
3.  **Stage 4 (Merge)**: Update `Web3MergeService` to apply capability upgrades if EVM contracts are found.
4.  **Stage 5 (UI Mapping)**: Update `ScorecardData` and `ScorecardView.tsx` on the frontend to render the new EVM achievements array.

### How to tweak the Scoring Logic
*   **Language Weights**: Modify the `LANGUAGE_CAPABILITY_WEIGHTS` dictionary in the `ScoringService`.
*   **New Signals**: To add a new metric (e.g., "S9 - Code Review Quality"), calculate it in the `SignalExtractorService`, map it to a business outcome in `AnalysisResult`, and ensure `normalizeScorecard.ts` parses it for the frontend.
