# GitHub Authentication Systems — Architecture & User Flows

> Last updated: 2026-06-05

---

## Overview: Two GitHub Apps

16Signals uses **two separate GitHub applications** for different purposes:

| # | App Type | Purpose | Env Vars (Schema Names) |
|---|----------|---------|-------------------------|
| 1 | **GitHub OAuth App** | Candidate identity (login) + public data collection | `GITHUB_AUTH_CLIENT_ID`, `GITHUB_AUTH_CLIENT_SECRET`, `GITHUB_AUTH_ENCRYPTION_KEY` |
| 2 | **GitHub App** | Candidate-granted analysis permissions (private repos, etc.) | `GITHUB_ANALYSIS_APP_ID`, `GITHUB_ANALYSIS_PRIVATE_KEY`, `GITHUB_ANALYSIS_WEBHOOK_SECRET`, `GITHUB_ANALYSIS_NAME` |

### Why Two Apps?

- The **OAuth App** handles authentication: "Who is this GitHub user?" It's the standard OAuth login flow. Candidates connect their GitHub account, and we store their Personal Access Token (PAT) for public API calls with better rate limits.

- The **GitHub App** handles authorization: "What data can 16Signals access?" Candidates install the App to grant specific permissions. When installed, GitHub fires a webhook that links an `installationId` to the candidate's profile. Deep Mode uses this installation to access private repositories.

---

## GitHub Apps to Create

### 1. GitHub OAuth App (Login & Public Data)

**Purpose:** Candidate identity linking. Candidates click "Connect GitHub" to log in.

**Where to create:** GitHub → Settings → Developer settings → OAuth Apps → New OAuth App

| Setting | Value |
|---------|-------|
| Application name | 16Signals |
| Homepage URL | `https://your-frontend.com` |
| Authorization callback URL | `https://your-backend.com/sync/github/connect/callback` |

**Scopes:** `read:user`, `repo`

**Env vars (.env):**
```
GITHUB_AUTH_CLIENT_ID=Iv23liV6gd6BKohhGfuW
GITHUB_AUTH_CLIENT_SECRET=9d8f926a270213d85963337f1ec81f7b9c5fa266
GITHUB_AUTH_ENCRYPTION_KEY=...
```

---

### 2. GitHub App (Analysis Permissions & Private Repos)

**Purpose:** Candidate grants 16Signals permission to access private repos, commit history, PRs, etc. for Deep Mode analysis.

**Where to create:** GitHub → Settings → Developer settings → GitHub Apps → New GitHub App

| Setting | Value |
|---------|-------|
| GitHub App name | 16Signals Analysis |
| Homepage URL | `https://your-frontend.com` |
| Webhook URL | `https://your-backend.com/sync/github/app/webhook` |
| Webhook secret | (generate a random string, set as `GITHUB_ANALYSIS_WEBHOOK_SECRET`) |
| Setup URL | `https://your-frontend.com/sync/github/installed` |

**Permissions:**

| Permission | Access | Reason |
|-----------|--------|--------|
| Repository metadata | Read-only | List repos in installation |
| Repository contents | Read-only | Clone repos for analysis |
| Pull requests | Read-only | PR history analysis |
| Commit statuses | Read-only | Commit analysis |

**Events:** Subscribe to **Installation** events.

**Where can this App be installed?** Any account.

**After creating the App:**
1. Note the **App ID** (top of settings page) → `GITHUB_ANALYSIS_APP_ID`
2. Generate a **private key** → download `.pem` → `cat key.pem | base64 -w0` → `GITHUB_ANALYSIS_PRIVATE_KEY`
3. Set the **webhook secret** → `GITHUB_ANALYSIS_WEBHOOK_SECRET`
4. The App slug from the URL (e.g. `github.com/apps/16signals-analysis`) → `GITHUB_ANALYSIS_NAME`

**Env vars (.env):**
```
GITHUB_ANALYSIS_NAME=16signals-analysis
GITHUB_ANALYSIS_APP_ID=3522141
GITHUB_ANALYSIS_PRIVATE_KEY=<base64-encoded PEM key — NOT the placeholder hash>
GITHUB_ANALYSIS_WEBHOOK_SECRET=<random-string-matching-github-app-webhook-secret>
```

---

### 3. System PAT (Fallback)

**Purpose:** Fallback token for public API calls when no user or installation credential exists.

**Where to create:** GitHub → Settings → Developer settings → Personal access tokens

**Scope:** `public_repo` (read-only)

**Env var:** `GITHUB_SYSTEM_TOKEN=github_pat_...`

---

## Environment Variables — Complete Reference

| Variable (Schema Name) | Required | Used By | Purpose |
|------------------------|----------|---------|---------|
| `GITHUB_AUTH_ENABLED` | No | OAuth App | Enable/disable connect flow |
| `GITHUB_AUTH_CLIENT_ID` | Yes | OAuth App | Candidate login/connect |
| `GITHUB_AUTH_CLIENT_SECRET` | Yes | OAuth App | Candidate login/connect |
| `GITHUB_AUTH_ENCRYPTION_KEY` | Yes | OAuth App | Encrypt user PATs in DB |
| `GITHUB_ANALYSIS_NAME` | Yes | GitHub App | App slug for install links |
| `GITHUB_ANALYSIS_APP_ID` | For Deep Mode | GitHub App | App ID from App settings |
| `GITHUB_ANALYSIS_PRIVATE_KEY` | For Deep Mode | GitHub App | Base64-encoded RSA PEM key |
| `GITHUB_ANALYSIS_WEBHOOK_SECRET` | For webhook | GitHub App | Verify webhook signatures |
| `GITHUB_SYSTEM_TOKEN` | Yes | Fallback | System PAT for public API |

---

## API Endpoints — GitHub App

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/sync/github/app/install` | JWT | **Backend redirect** to GitHub App installation page |
| `GET` | `/sync/github/app/status` | JWT | Check if candidate has installed the App |
| `POST` | `/sync/github/app/verify` | JWT | Re-check installation via App JWT (webhook recovery) |
| `POST` | `/sync/github/app/webhook` | None (HMAC) | Receive installation events from GitHub |
| `DELETE` | `/sync/github/app/uninstall` | JWT | Manually clear installation from profile |

---

## User Flows

### Flow 1: Candidate Connects GitHub (Identity)

```
Candidate clicks "Connect GitHub" (frontend)
→ Backend redirects to GitHub OAuth: read:user, repo
→ Candidate authorizes
→ Callback: /sync/github/connect/callback
→ PAT stored encrypted in GithubProfile.encryptedToken
→ Background sync collects public data
→ Candidate identity linked ✅
```

### Flow 2: Candidate Installs the GitHub App (Permissions)

```
1. Candidate visits: GET /sync/github/app/install
   → Backend 302 redirects to https://github.com/apps/16signals-analysis/installations/new
   (This matches the Google OAuth redirect pattern)
2. Candidate selects account → clicks "Install"
3. GitHub installs the App → fires webhook:
   POST /sync/github/app/webhook
   {
     action: "installation.created",
     installation: { id: 12345678, account: { login: "candidate-username" } }
   }
4. Webhook handler:
   - Verifies X-Hub-Signature-256 (HMAC-SHA256)
   - Upserts GithubProfile (creates if doesn't exist — handles App-install-before-OAuth case)
   - Stores installationId = "12345678"
5. Candidate checks status:
   GET /sync/github/app/status → { installed: true, installationId: "12345678" }
```

### Flow 3: Webhook Missed — Recovery

```
GET /sync/github/app/status → { installed: false }
POST /sync/github/app/verify
  → Uses App JWT to list all installations
  → Finds installation where account.login matches candidate's githubUsername
  → Stores installationId on GithubProfile
  → Returns { linked: true, installationId: "12345678" }
GET /sync/github/app/status → { installed: true, installationId: "12345678" }
```

### Flow 4: Deep Mode

```
POST /api/v2/analysis/deep { githubUsername: "candidate", config: {...} }
← No installationId in the request!

Controller:
  a. Looks up GithubProfile.installationId by githubUsername
  b. If null → 400 "Candidate hasn't installed the GitHub App"
  c. credentialsService.resolve({ mode: 'deep', installationId })
  d. AppInstallationProvider generates installation token
  e. Validates installation access → else 401

DeepCollector:
  a. fetchPrivateRepos(installationOctokit) → private repos
  b. cloneAllRepos(repos, jobId, rawToken)
  c. CloneWorker: https://x-access-token:{token}@github.com/owner/repo.git
  d. Tools run → corpus enriched → scoring pipeline → result
```

### Flow 5: Light Mode / CV Verify

```
POST /api/v2/analysis/light { githubUsername, config }
POST /api/v2/analysis/cv-verify { githubUsername, cvText, config }

→ System PAT used for public API calls
→ No installation needed
→ No private repo access
```

---

## Edge Cases Handled

| Scenario | How It's Handled |
|----------|-----------------|
| App installed BEFORE OAuth connect | Webhook handler uses `upsert` — creates GithubProfile if missing |
| OAuth connected BEFORE App install | Webhook handler finds existing GithubProfile by username → updates installationId |
| Webhook delivery failed | `POST /sync/github/app/verify` re-checks via App JWT |
| Candidate uninstalls App | `installation.deleted` webhook clears installationId |
| Candidate checks status | `GET /sync/github/app/status` reads from DB |

---

## Credential Provider Architecture

All credential resolution is handled by **`GitHubCredentialsModule`** (`backend/src/modules/github-credentials/`).

```
GitHubCredentialsService.resolve(context) → { primary, installation, rawToken }

 Primary Octokit (public API):
   → System PAT (always, currently)
   → (Future: Employer PAT for quota)

 Installation Octokit (private repos):
   → AppInstallationProvider (if installationId present)
   → Uses createAppAuth → JWT → installation token
```

### Key Files

| File | Role |
|------|------|
| `github-credentials/providers/provider.interface.ts` | `IGitHubCredentialProvider` interface |
| `github-credentials/providers/app-installation.provider.ts` | Generates installation tokens via `createAppAuth` |
| `github-credentials/github-credentials.service.ts` | Orchestrator |
| `github-credentials/github-credentials.module.ts` | Module wiring |
| `github-sync/github-app.webhook.controller.ts` | Webhook receiver + install/status/verify endpoints |
| `github-sync/github-app.service.ts` | Signature verification + DB updates + verify logic |

---

## Database

`GithubProfile.installationId` (String?, nullable) — populated by webhook when candidate installs the App. Read by Deep Mode controller to derive installation context internally.

---

## Legacy / Deprecated Systems

### `github-sync` Module

**Path:** `backend/src/modules/github-sync/`  
**Endpoints:** `GET /sync/github/connect`, `GET /sync/github/connect/callback`, `POST /sync/github`, `GET /sync/github/status`

**Status:** ⚠️ Legacy for Deep Mode, but **active** for candidate identity and public data collection.

### `OctokitFactory.forJob()`

**Path:** `backend/src/modules/scoring/github-adapter/octokit.factory.ts`

**Status:** ⚠️ Still used by Light/CV mode. Deep Mode now goes through `GitHubCredentialsService.resolve()`.

---

## Future Extensibility

### Employer API Quota
Add `EmployerCredentialProvider` implementing `IGitHubCredentialProvider`. Employers store a PAT. Priority: Employer PAT → System PAT.

### Organization Installations
Webhook already handles any account type. `AppInstallationProvider` generates tokens from any installationId. Just map installation to the right entity.

### Different Permission-Scoped Apps
Add a new provider with a different App ID/key pair. Register alongside `AppInstallationProvider`.

---

## Checklist: What to Set Up

| # | Action |
|---|--------|
| 1 | Create GitHub OAuth App (already done) |
| 2 | Create GitHub App (16Signals Analysis) |
| 3 | Configure webhook URL: `https://your-backend.com/sync/github/app/webhook` |
| 4 | Set webhook secret in GitHub App → copy to `GITHUB_ANALYSIS_WEBHOOK_SECRET` |
| 5 | Generate private key → `cat key.pem | base64 -w0` → `GITHUB_ANALYSIS_PRIVATE_KEY` |
| 6 | Set `GITHUB_ANALYSIS_APP_ID` and `GITHUB_ANALYSIS_NAME` |
| 7 | Candidate visits `GET /sync/github/app/install` → installs App (backend redirects to GitHub) |
| 8 | Webhook fires → `installationId` stored on `GithubProfile` |
| 9 | `POST /api/v2/analysis/deep { githubUsername }` → backend derives installationId internally |