# GitHub Setup Guide — Manual Wiring Instructions

This guide tells you exactly what to create in GitHub, how to map it to `.env`, and how to verify everything works.

---

## Step 1: What You Already Have

| Thing | Where to find it |
|-------|-----------------|
| GitHub OAuth App | GitHub → Settings → Developer settings → OAuth Apps → 16Signals |
| `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` | Already in `.env` (lines 22-23) |
| `GITHUB_SYSTEM_TOKEN` | Already in `.env` (line 29) — a Personal Access Token with `public_repo` scope |

You do NOT need to change any of these. They already work.

---

## Step 2: The GitHub App (CREATE THIS)

This is the app that candidates install to grant analysis permissions. It needs to exist in GitHub and be wired to your backend.

### 2a. Create the App

1. Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**
2. Fill in:

| Field | Value | Note |
|-------|-------|------|
| GitHub App name | `16Signals Analysis` | Can be anything |
| Homepage URL | `http://localhost:3001` | Your frontend URL |
| Webhook URL | `http://localhost:3000/sync/github/app/webhook` | Your backend URL + the webhook path |
| Webhook secret | **Generate a random string** (e.g. `openssl rand -hex 32`) | Copy this — you'll need it twice |
| Setup URL | `http://localhost:3001/sync/github/installed` | Where GitHub redirects after install (frontend) |

3. **Permissions** — set these to "Read-only":

| Permission | Why |
|-----------|-----|
| Repository metadata | List repos in the installation |
| Repository contents | Clone repos for analysis |
| Pull requests | Read PR history |
| Commit statuses | Read commit data |

4. **Subscribe to events:** Check **Installation** (this is what fires the webhook)

5. **Where can this App be installed?** Select **Any account**

6. Click **Create GitHub App**

### 2b. Get the App ID

After creation, look at the top of the App's settings page. You'll see:

> App ID: **1234567**

Copy this number → it goes in `.env` as `GITHUB_APP_ID`.

### 2c. Generate the Private Key

1. Scroll down to **Private keys**
2. Click **Generate a private key**
3. A `.pem` file downloads automatically
4. Encode it for `.env`:

```bash
cat ~/Downloads/your-app.2026-06-04.private-key.pem | base64 -w0
```

5. Copy the output → it goes in `.env` as `GITHUB_PRIVATE_KEY`

---

## Step 3: Wire Everything to `.env`

Open `backend/.env`. Find these lines or add them:

```env
# ── GitHub App (analysis permissions) ──
GITHUB_APP_ID=<App ID from step 2b>
GITHUB_PRIVATE_KEY=<base64 output from step 2c>
GITHUB_WEBHOOK_SECRET=<random string from step 2a>
GITHUB_APP_NAME=16signals-analysis        # ← the SLUG from your App's URL
```

### How to find `GITHUB_APP_NAME`

Go to your GitHub App's public page: `https://github.com/apps/16signals-analysis`

The last part of the URL is the slug. In this example it's `16signals-analysis`.

If your app is named "16Signals Analysis", the slug is usually `16signals-analysis`.

---

## Step 4: Verify the Webhook Works

### 4a. Check the endpoint is live

```bash
# Start your backend
npm run start:dev

# In another terminal, test the webhook endpoint
curl -X POST http://localhost:3000/sync/github/app/webhook \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: ping" \
  -d '{}'
```

Expected response: `{ "handled": true, "event": "ping", "message": "Webhook configured successfully" }`

### 4b. Test with a real installation

1. Visit `GET http://localhost:3000/sync/github/app/install`
2. Click the returned URL → install the App on your GitHub account
3. Check your backend logs — you should see:
   ```
   [GitHubAppWebhookController] Webhook received: event=installation action=created installationId=12345678
   [GitHubAppService] Installation 12345678 created for GitHub user 'your-username'. Profiles updated: 1
   ```
4. Verify the DB:
   ```sql
   SELECT "githubUsername", "installationId" FROM github_profiles WHERE "githubUsername" = 'your-username';
   ```
   The `installationId` column should now have `12345678` (not null).

---

## Step 5: Test Deep Mode

```bash
# Deep Mode — no installationId in the body!
curl -X POST http://localhost:3000/api/v2/analysis/deep \
  -H "Content-Type: application/json" \
  -d '{
    "githubUsername": "your-username",
    "config": {
      "seniority": "senior",
      "role_archetype": "backend"
    }
  }'
```

Expected: `{ "jobId": "deep_...", "status": "queued" }`

If the candidate hasn't installed the App yet:
```json
{
  "statusCode": 400,
  "message": "Candidate 'your-username' has not installed the 16Signals GitHub App..."
}
```

---

## Summary: Env Vars → GitHub Mapping

| `.env` variable | What it IS in GitHub | Where to get it |
|-----------------|---------------------|-----------------|
| `GITHUB_CLIENT_ID` | OAuth App client ID | OAuth App settings page |
| `GITHUB_CLIENT_SECRET` | OAuth App client secret | OAuth App settings page |
| `GITHUB_APP_ID` | GitHub App ID (number) | Top of GitHub App settings page |
| `GITHUB_PRIVATE_KEY` | RSA private key (PEM, base64-encoded) | Generated in GitHub App → Private keys |
| `GITHUB_WEBHOOK_SECRET` | Random string (HMAC secret) | You create this, set in both GitHub App webhook config AND `.env` |
| `GITHUB_APP_NAME` | GitHub App URL slug | From `github.com/apps/YOUR-SLUG` |
| `GITHUB_SYSTEM_TOKEN` | Personal Access Token (classic or fine-grained) | GitHub → Settings → Developer settings → PAT |

---

## One-Line Summary

> **Candidates install the GitHub App (webhook stores `installationId` on their profile). Deep Mode looks it up internally. No caller ever passes `installationId`.**