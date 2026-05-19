# Frontend Integration Guide

This document explains how to integrate with the API from a frontend perspective. It focuses on **user flows**, required endpoints, and how they should be used.

---

# 1. Authentication (Candidates)

Users can authenticate using:

* Email
* GitHub
* Google

---

## 1.1 Register

### Email Registration

```
POST /auth/candidate/register
```

* Create a new account

```
POST /auth/candidate/verify-email
```

* Verify email using code

---

### GitHub / Google Registration

```
GET /auth/candidate/github
GET /auth/candidate/google
```

* Starts OAuth flow
* Redirects to onboarding page

```
POST /auth/candidate/onboarding
```

* Complete account setup after OAuth

---

## 1.2 Login

### Email

```
POST /auth/candidate/login
```

### GitHub / Google

```
GET /auth/candidate/github
GET /auth/candidate/google
```

---

## 1.3 Logout

```
POST /auth/candidate/logout
```

---

## 1.4 Link Additional Accounts

```
GET /auth/candidate/github/link
GET /auth/candidate/google/link
```

---

## 1.5 Refresh Token

```
POST /auth/candidate/refresh
```

---

## 1.6 MFA (Optional)

```
GET  /auth/candidate/mfa/setup
POST /auth/candidate/mfa/activate
POST /auth/candidate/mfa/verify
POST /auth/candidate/mfa/verify-recovery
```

---

# 2. Profile

## User Profile

```
GET    /me/user
PATCH  /me/user
DELETE /me/user
```

## Candidate Profile

```
GET   /me/user/candidate
PATCH /me/user/candidate
```

## Connected Accounts

```
GET /me/user/github
GET /me/user/wallet
```

---

# 3. Technical Scorecard (Proof of Talent)

Users must **sync accounts first**, then generate a scorecard.

---

## 3.1 Sync Accounts

### GitHub Sync (Required for GitHub-based scorecards)

```
GET /sync/github/connect
```

* Redirect user to GitHub connection flow

```
POST /sync/github
```

* Fetch and store GitHub data

```
GET /sync/github/status
```

* Check sync progress (optional)

---

### Wallet Sync (Required for wallet-based scorecards)

```
GET /sync/wallet/challenge
```

* Returns a message to sign

**Frontend flow:**

1. Request challenge
2. Ask user to sign message with wallet
3. Send signature

```
POST /sync/wallet
```

* Verifies signature and links wallet

---

## 3.2 Generate Scorecard

```
POST /api/analysis
```

* Starts analysis
* For logged-in users → no body required
* Can also be used without account (preview mode)

---

### Track Progress

```
GET /api/analysis/{jobId}/status
GET /api/analysis/{jobId}/result
```

**Frontend should poll** until result is ready.

---

## 3.3 Get Scorecard

```
GET /api/scorecard/me
GET /api/scorecard/me/raw
```

---

# 4. Candidate Reputation System

This system measures **soft skills and credibility** through **peer reviews ("vouches")**.

## Concept

* Other users can **vouch for a candidate**
* A vouch includes:

  * Wallet identity of the reviewer
  * A short message (e.g. “We built X together”)
* Vouches are:

  * Stored on-chain (source of truth)
  * Indexed in backend for fast access

---

## Two Ways to Submit a Vouch

### 1. From Social (Twitter / external link)

* User clicks a shared link
* Wallet interaction happens automatically
* No login required

---

### 2. From Web App

**Frontend flow:**

1. User opens candidate profile
2. Connect wallet
3. Enter message
4. Submit vouch


```
POST /api/actions/vouch/{username}?message=...
```

* Returns unsigned transaction

**Frontend must:**

* Ask wallet to sign transaction
* Broadcast transaction
* Get transaction signature

---

## Final Step (Required)

```
POST /api/vouch/confirm
```

**Body:**

```
{
  "txSignature": "...",
  "candidateUsername": "..."
}
```

* Confirms and stores the vouch

---

## Displaying Reputation

Frontend can:

* Show list of vouches on profile
* Include reputation in scorecard UI

---

## Key Notes

* No login required to vouch (wallet-based)
* Wallet = identity
* Always call `/api/vouch/confirm` after transaction
* Reputation is additive (multiple vouches per user)

---

# 5. Employer: Create Job

```
POST /jobs/draft
```

```
POST /jobs/{id}/parse-jd
```

* Auto-extract requirements from job description

```
POST /jobs/{id}/confirm-requirements
```

```
POST /jobs/{id}/publish
```

---

## View Jobs

```
GET /jobs/me
```

---

# 6. Candidate: Job Search & Apply

## Browse Jobs

```
GET /jobs
GET /jobs/{id}
```

---

## Check Fit (Gap Analysis)

```
GET /applications/me/gap-preview
```

* Requires scorecard
* Shows how well candidate matches job

---

## Apply

```
POST /applications/me/{jobId}
```

* Requires scorecard

---

## My Applications

```
GET /applications/me
```

---

# 7. Employer: Review Candidates

## List Applications

```
GET /applications/hr/jobs/{jobId}
```

---

## Application Details

```
GET /applications/hr/{appId}
```

---

## Decision

```
PATCH /applications/hr/{appId}/decision
```

---

## Move Pipeline Stage

```
PATCH /applications/hr/{appId}/stage
```

---

## Candidate Scorecard

```
GET /applications/hr/{appId}/scorecard
```

---

## Interview Questions

```
GET /applications/hr/{appId}/interview-questions
```

---

# 8. Escrow

Payment escrow management for job compensation.

## Set Candidate Wallet

```
POST /escrow/set-candidate
```

* Store candidate wallet address for payment

---

## Confirm Funded

```
POST /escrow/confirm-funded
```

* Confirm escrow has been funded on-chain

---

## Confirm Released

```
POST /escrow/confirm-released
```

* Confirm payment has been released to candidate

---

## Confirm Refunded

```
POST /escrow/confirm-refunded
```

* Confirm escrow has been refunded (if job cancelled)

---

## Check Escrow Status

```
GET /escrow/status/{jobPostId}
```

* Get current escrow status for a job posting

---

# 9. Close Job

```
POST /jobs/{id}/close
```

---

# Summary

### Core Frontend Responsibilities

* Handle authentication flows (email + OAuth)
* Manage account syncing (GitHub, wallet)
* Trigger and display scorecards
* Poll analysis status/results
* Enable vouching (wallet interaction + confirm step)
* Support job browsing and applications
* Render candidate reputation and job fit

---