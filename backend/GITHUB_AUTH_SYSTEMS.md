# GitHub Authentication Systems — Architecture & User Flows

> Last updated: 2026-06-04

---

## Overview: Two GitHub Apps

16Signals uses **two separate GitHub applications** for different purposes:

| # | App Type | Purpose | Env Vars |
|---|----------|---------|----------|
| 1 | **GitHub OAuth App** | Candidate identity (login) + public data collection | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |
| 2 | **GitHub App** | Candidate-granted analysis permissions (private repos, etc.) | `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_NAME` |

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

**Env vars:**
```
GITHUB_CLIENT_ID=Iv23liV6gd6BKohhGfuW
GITHUB_CLIENT_SECRET=9d8f926a270213d85963337f1ec81f7b9c5fa266
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
| Webhook secret | (generate a random string, set as `GITHUB_WEBHOOK_SECRET`) |
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
1. Note the **App ID** (top of settings page) → `GITHUB_APP_ID`
2. Generate a **private key** → download `.pem` → `cat key.pem | base64 -w0` → `GITHUB_PRIVATE_KEY`
3. Set the **webhook secret** → `GITHUB_WEBHOOK_SECRET`
4. The App slug from the URL (e.g. `github.com/apps/16signals-analysis`) → `GITHUB_APP_NAME`

**Env vars:**
```
GITHUB_APP_ID=3522141
GITHUB_PRIVATE_KEY=<base64-encoded PEM key — NOT the placeholder hash>
GITHUB_WEBHOOK_SECRET=<random-string-matching-github-app-webhook-secret>
GITHUB_APP_NAME=16signals-analysis
```

---

### 3. System PAT (Fallback)

**Purpose:** Fallback token for public API calls when no user or installation credential exists.

**Where to create:** GitHub → Settings → Developer settings → Personal access tokens

**Scope:** `public_repo` (read-only)

**Env var:** `GITHUB_SYSTEM_TOKEN=github_pat_...`

---

## Environment Variables — Complete Reference

| Variable | Required | Used By | Purpose |
|----------|----------|---------|---------|
| `GITHUB_CLIENT_ID` | Yes | OAuth App | Candidate login/connect |
| `GITHUB_CLIENT_SECRET` | Yes | OAuth App | Candidate login/connect |
| `GITHUB_AUTH_ENABLED` | No | OAuth App | Enable/disable connect flow |
| `AUTH_ENCRYPTION_KEY` | Yes | OAuth App | Encrypt user PATs in DB |
| `GITHUB_APP_ID` | For Deep Mode | GitHub App | App ID from App settings |
| `GITHUB_PRIVATE_KEY` | For Deep Mode | GitHub App | Base64-encoded RSA PEM key |
| `GITHUB_WEBHOOK_SECRET` | For webhook | GitHub App | Verify webhook signatures |
| `GITHUB_APP_NAME` | Yes | Installation URL | App slug for install links |
| `GITHUB_SYSTEM_TOKEN` | Yes | Fallback | System PAT for public API |

---

## User Flows

### Flow 1: Candidate Connects GitHub (Identity)

```
Candidate clicks "Connect GitHub"
→ Redirect to GitHub OAuth: read:user, repo
→ Candidate authorizes
→ Callback: /sync/github/connect/callback
→ PAT stored encrypted in GithubProfile.encryptedToken
→ Background sync collects public data
→ Candidate identity linked ✅
```

### Flow 2: Candidate Installs the GitHub App (Permissions)

```
1. Candidate visits: GET /sync/github/app/install
2. Backend returns URL: https://github.com/apps/16signals-analysis/installations/new
3. Candidate clicks → selects account → clicks "Install"
4. GitHub installs the App → fires webhook:
   POST /sync/github/app/webhook
   {
     action: "installation.created",
     installation: { id: 12345678, account: { login: "candidate-username" } }
   }
5. Webhook handler:
   - Verifies X-Hub-Signature-256 (HMAC-SHA256)
   - Finds GithubProfile where githubUsername = "candidate-username"
   - Updates: installationId = "12345678"
6. Candidate now has installationId linked ✅
```

### Flow 3: Deep Mode (After Migration)

```
1. Employer calls:
   POST /api/v2/analysis/deep
   {
     "githubUsername": "candidate",
     "config": { "seniority": "senior", "role_archetype": "backend" }
   }
   ← No installationId in the request!

2. Controller:
   a. Looks up GithubProfile by githubUsername
   b. Reads installationId from profile
   c. If null → 400 "Candidate hasn't installed the GitHub App"
   d. credentialsService.resolve({ mode: 'deep', installationId: <from DB> })
   e. AppInstallationProvider generates installation token
   f. Validates installation access → else 401

3. DeepCollector:
   a. acquireLightCorpus(systemOctokit) → public data
   b. fetchPrivateRepos(installationOctokit) → private repos
   c. cloneAllRepos(repos, jobId, rawToken)
   d. CloneWorker: https://x-access-token:{token}@github.com/owner/repo.git
   e. Tools run: scc, tokei, gitinspector, gitleaks, semgrep

4. dispatchLightMode() → scoring pipeline → result
```

### Flow 4: Light Mode / CV Verify

```
POST /api/v2/analysis/light { githubUsername, config }
POST /api/v2/analysis/cv-verify { githubUsername, cvText, config }

→ System PAT used for public API calls
→ No installation needed
→ No private repo access
```

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

---

## Webhook Architecture

| File | Role |
|------|------|
| `github-sync/github-app.webhook.controller.ts` | `POST /sync/github/app/webhook` receiver |
| `github-sync/github-app.service.ts` | Signature verification + DB updates |

**Webhook events handled:**

| Event | Action |
|-------|--------|
| `installation.created` | Stores `installationId` on `GithubProfile` |
| `installation.deleted` | Clears `installationId` from `GithubProfile` |
| `ping` | Confirms webhook is configured |

---

## Database

`GithubProfile.installationId` (String?, nullable) — populated by webhook when candidate installs the App. Read by Deep Mode controller to derive installation context internally.

---

## Legacy / Deprecated Systems

### `github-sync` Module

**Path:** `backend/src/modules/github-sync/`  
**Endpoints:** `GET /sync/github/connect`, `GET /sync/github/connect/callback`, `POST /sync/github`, `GET /sync/github/status`

**Status:** ⚠️ Legacy for Deep Mode, but **active** for candidate identity and public data collection. The OAuth PAT it stores is used by Light/CV mode for better rate limits.

### `OctokitFactory.forJob()`

**Path:** `backend/src/modules/scoring/github-adapter/octokit.factory.ts`

**Status:** ⚠️ Still used by Light/CV mode. Deep Mode now goes through `GitHubCredentialsService.resolve()` instead.

---

## Future Extensibility

### Employer API Quota

Add an `EmployerCredentialProvider` implementing `IGitHubCredentialProvider`. Employers store a PAT with `public_repo` scope. The orchestrator tries it before the system PAT:

```
Primary Octokit priority: Employer PAT → System PAT
```

No changes to Deep Mode or the webhook flow needed.

### Organization Installations

If/when enterprise customers need org-wide analysis:
1. The webhook already handles `installation.created` for any account type.
2. `AppInstallationProvider` already generates tokens from any installationId.
3. Just map the installation to the right entity (candidate, org, tenant).

### Different Permission-Scoped Apps

Add a new provider (e.g., `ReadOnlyAppProvider`) with a different App ID/key pair. Register it alongside `AppInstallationProvider`. The context decides which to activate.

---

## Checklist: What to Set Up

| # | Action |
|---|--------|
| 1 | Create GitHub OAuth App (already done) |
| 2 | Create GitHub App (16Signals Analysis) |
| 3 | Configure webhook URL: `https://your-backend.com/sync/github/app/webhook` |
| 4 | Set webhook secret in GitHub App → copy to `GITHUB_WEBHOOK_SECRET` |
| 5 | Generate private key → `cat key.pem | base64 -w0` → `GITHUB_PRIVATE_KEY` |
| 6 | Set `GITHUB_APP_ID` and `GITHUB_APP_NAME` |
| 7 | Candidate visits `GET /sync/github/app/install` → installs App |
| 8 | Webhook fires → `installationId` stored on `GithubProfile` |
| 9 | `POST /api/v2/analysis/deep { githubUsername }` → backend derives installationId internally |