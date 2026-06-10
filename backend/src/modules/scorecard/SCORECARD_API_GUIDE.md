# Scorecard API Guide

## Overview

The scorecard is a **display layer** on top of the 16Signals analysis pipeline. It lets you view a candidate's analysis results **without knowing a job ID** — just by GitHub username.

Every time an analysis completes (Light Mode or Deep Mode), the result is cached to `GithubProfile.scorecard`. The scorecard API reads from this cache and renders persona-specific views.

---

## Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/scorecard/github/:githubUsername` | Public | Scorecard by GitHub username |
| `GET` | `/api/scorecard/github/:githubUsername/raw` | None | Full debug dump |
| `GET` | `/api/scorecard/user/:appUsername` | None | Scorecard by platform username |
| `GET` | `/api/scorecard/me` | JWT | Authenticated user's own scorecard |
| `GET` | `/api/scorecard/me/raw` | JWT | Authenticated user's raw debug dump |

---

## Query Parameters

Every UI endpoint accepts two optional query parameters:

### `?mode=` — Which analysis mode to show

| Value | Behavior |
|-------|----------|
| *(omitted)* | Shows the **latest** analysis (whatever was run most recently) |
| `light` | Shows Light Mode results. Falls back to Deep Mode if Light not available. |
| `deep` | Shows Deep Mode results. Falls back to Light Mode if Deep not available. |

### `?view=` — Which persona view to render

| Value | Audience | What it shows |
|-------|----------|---------------|
| *(omitted)* | General | Defaults to **snapshot** |
| `snapshot` | CTO, public listing | Username, tech stack, 1-line archetype summary, analysis mode badge. **No scores, no flags.** |
| `recruiter` | TA/HR screening | Snapshot + all 7 primitives with confidence bars, flags split soft/hard, interview questions, recommended action |
| `deep` | Hiring Manager | Full narrative sections A-G, primitive details with scores, all flags, interview questions |
| `public` | Candidate, anonymous | Username + tech stack + archetype summary only. **Safe for unauthenticated views.** |
| `raw` | Admin, dev debugging | Complete module results, flag inventory, primitive score map, metadata. Use dedicated `/raw` endpoints instead. |

---

## View Comparison

```
                  snapshot   recruiter   deep   public   raw
Username             ✅         ✅        ✅      ✅      ✅
Tech Stack           ✅         ✅        ✅      ✅      ✅
Archetype Summary    ✅         ✅        ✅      ✅      ✅
7 Primitives (bars)   ❌         ✅        ✅      ❌      ✅
Confidence Values     ❌         ✅        ✅      ❌      ✅
Flags                 ❌         ✅        ✅      ❌      ✅
Interview Questions   ❌         ✅        ✅      ❌      ✅
Section Narratives    ❌         ❌        ✅      ❌      ✅
Module Results        ❌         ❌        ❌      ❌      ✅
Evidence Chains       ❌         ❌        ❌      ❌      ✅
```

---

## Examples

```bash
# Quick look at any GitHub user
GET /api/scorecard/github/torvalds
# → snapshot view (username, stack, summary)

# Recruiter screening view with Light Mode data
GET /api/scorecard/github/torvalds?view=recruiter&mode=light
# → primitives, flags, interview questions

# Full deep dive for a hiring manager
GET /api/scorecard/github/torvalds?view=deep&mode=deep
# → all narrative sections, evidence

# Candidate-safe public profile
GET /api/scorecard/github/torvalds?view=public
# → only username, stack, archetype

# Raw debug dump
GET /api/scorecard/github/torvalds/raw
# → full CachedScorecard JSON

# Your own scorecard (with JWT auth)
GET /api/scorecard/me?view=deep
Authorization: Bearer <token>
```

---

## What Happens When There's No Scorecard?

If a GitHub user hasn't been analyzed yet, the endpoint returns **404**:

```json
{
  "statusCode": 404,
  "message": "No scorecard found for GitHub user \"some-user\"."
}
```

Run a Light Mode analysis first via `POST /api/v2/analysis/light`.

---

## How Scorecards Get Saved

```
POST /api/v2/analysis/light { githubUsername: "octocat", config: {...} }
  → Analysis completes
  → AnalysisProcessor stores full result in AnalysisJob.result
  → AnalysisProcessor.syncScorecardToProfile() writes CachedScorecard
    to GithubProfile.scorecard JSONB
  → Scorecard available at GET /api/scorecard/github/octocat
```

---

## CachedScorecard Structure (stored in `GithubProfile.scorecard`)

```typescript
{
  lastAnalysisJobId: "light_abc123",
  lastAnalysisMode: "light",         // 'light' | 'deep'
  lastAnalyzedAt: "2026-06-10...",
  snapshot: {                        // Always available, safe for public
    username: "octocat",
    techStack: { languages: [...], tools: [...] },
    archetypeSummary: "Backend-focused engineer...",
    evRung: 1
  },
  light: { ... },    // Latest Light Mode ViewData (or null)
  deep: { ... }      // Latest Deep Mode ViewData (or null)
}
```

If a user has had both Light and Deep analyses, both `light` and `deep` are populated. Use `?mode=` to switch between them.