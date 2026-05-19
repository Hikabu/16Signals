
# in short to check on swagger auth.login 
```bash
http://localhost:3000/api/docs - API documentation  
for auth/login use for locker - debugtoken
for the user in aithorisation privyId will be did:privy:test-user-123
for body 
{
  "walletAddress": "0x123456789abcdef0123456789abcdef012345678",
  "smartAccountAddress": "0x123456789abcdef0123456789abcdef012345678"
}
```
# 1️⃣ SYSTEM OVERVIEW

**What this backend is**  
The **a16zero Employer API** (NestJS + Prisma + PostgreSQL) is an MVP backend for employer features: companies tied to **Privy** identity, **JWT** sessions for API calls, **job posts** (create, list, publish, close), **mock candidate shortlist** endpoints, and **analytics** counts from the database.

**How the frontend talks to it**  
The client sends **HTTP** requests to the API origin (for local dev, typically `http://localhost:3000`). There is **no global URL prefix** (paths are like `/auth/login`, not `/api/v1/auth/login`).  
Responses from most business endpoints use a **wrapper** `{ success, message?, data?, meta? }` (see `BaseController`). The root health-style route `GET /` returns **plain text**, not that wrapper.

**Authentication flow**  
1. The user signs in with **Privy** on the frontend; Privy gives an **access token**.  
2. The client calls **`POST /auth/login`** with header `Authorization: Bearer <privy_access_token>` and a JSON body with at least `walletAddress` (and optionally `smartAccountAddress`).  
3. The server verifies the token via Privy’s **JWKS** (`PrivyService`), finds or creates a **Company** in PostgreSQL, and returns an **application JWT** (`accessToken`).  
4. For all protected routes, the client sends **`Authorization: Bearer <application_jwt>`**.  
5. `JwtStrategy` loads the company by `payload.sub` (company id). If the company was deleted, requests fail with **401**.

**Base URL**  
- **Development:** `http://localhost:3000` (or whatever `PORT` is).  
- **Deployed:** the team’s real host + HTTPS; paths stay the same unless you add a reverse-proxy prefix later.

**Swagger for testing**  
Swagger UI is served at **`/api/docs`** (see `main.ts`). It lists operations, lets you **Authorize** with Bearer JWT, and execute requests without a frontend.

---

# 2️⃣ HOW TO USE SWAGGER TO TEST THE API

### How to run the backend

1. **PostgreSQL** reachable and `DATABASE_URL` set.  
2. **Env vars** (from `app.module` validation): `DATABASE_URL`, `JWT_SECRET` (≥32 chars), `PRIVY_APP_ID`, optional `PRIVY_JWKS_URL`, optional `PORT` (default `3000`), `NODE_ENV`.  
3. From the backend folder:

```bash
cd backend
npx prisma migrate deploy   # or migrate dev for local DB
npm run start:dev
```

4. Confirm logs: app URL and **`Swagger documentation: http://localhost:3000/api/docs`** (port may differ).

### How to open Swagger

In a browser: **`http://localhost:<PORT>/api/docs`**.

### How to authorize (JWT)

1. Obtain a **Privy** user access token from your app (or test harness).  
2. Call **`POST /auth/login`**: set **Authorization** to `Bearer <privy_token>`, body JSON per `LoginDto`.  
3. Copy **`data.accessToken`** from the response.  
4. In Swagger, click **Authorize**, enter: `Bearer <application_jwt>` (or only the token, depending on Swagger UI version—use the same style as other Bearer fields; the API expects the **`Authorization: Bearer ...`** header on requests).  
5. **Execute** protected endpoints (`GET /companies/me`, jobs, etc.).

### How to send requests

1. Expand a tag (e.g. **Authentication**).  
2. Open an operation, click **Try it out**.  
3. Fill **parameters**, **request body**, and **headers** as documented.  
4. **Execute** and inspect status code and body.

### How to read responses

- **Success (wrapped):** `success: true`, optional `message`, `data` with the payload.  
- **Created:** `POST` routes such as login/job creation often return **HTTP 201** with the same wrapper (`handleCreated` / default Nest behavior for POST).  
- **Errors:** See §3; **401** if JWT missing/invalid; **400** for validation; **404** for some domain errors (`AppException`).

### How to debug failing endpoints

| Symptom | What to check |
|--------|----------------|
| **401** on `/auth/login` | Privy token present? Valid? `PRIVY_APP_ID` matches app? Network to JWKS URL? |
| **401** on protected routes | Using **application** JWT from login, not Privy token? Token expired? Company deleted? |
| **400** with validation messages | Body fields: required DTO fields, types (`bonusAmount` must be a **number**). Unknown properties may fail if `forbidNonWhitelisted` triggers. |
| **404** on job actions | Job `id` exists and belongs to your company? |
| **CORS** from browser | Server has `enableCors()`; adjust origin if you lock CORS down later. |
| **DB errors** | `DATABASE_URL`, migrations, Prisma client in sync. |

---

# 3️⃣ GLOBAL API CONVENTIONS

| Topic | Behavior in this codebase |
|--------|----------------------------|
| **Base URL** | No path prefix; resources at `/auth/...`, `/jobs/...`, etc. |
| **Content-Type** | JSON bodies: `application/json`. |
| **Auth header** | `Authorization: Bearer <token>`, **Privy** token for `POST /auth/login`; **app JWT** for everything else. |
| **Success envelope** | Most controllers: `{ success: true, message?, data?, meta? }`. **Exception:** `GET /` returns raw string. |
| **Error envelope** | `AppException`: `{ success: false, message: string }` + HTTP status. Passport/validation may use Nest defaults (`statusCode`, `message`, `error`). |
| **Status codes** | **200** OK; **201** Created (typical for `POST`); **400** validation; **401** auth; **404** not found / access denied (jobs). |
| **Pagination** | Not implemented on list endpoints (e.g. `GET /jobs/my` returns full list). |
| **Dates / IDs** | Prisma: `DateTime` → JSON **ISO 8601 strings**. IDs are **UUIDs** (`string`) for `Company`, `JobPost`, etc. |
| **Decimals** | Prisma `Decimal` fields (e.g. job `bonusAmount`) often serialize as **strings** in JSON—treat as decimal-safe in the frontend. |
| **Validation** | Global `ValidationPipe`: `whitelist`, `transform`, `forbidNonWhitelisted`. |
| **Rate limiting** | `ThrottlerModule` is registered (100 req / 60s in config) but **no `ThrottlerGuard` is registered** in the repo—assume throttling may be inactive until a guard is added. |

---

# 4️⃣ FULL FRONTEND API DOCUMENTATION

Base URL examples use `http://localhost:3000`. Replace with your deployment origin.

---

## Endpoint: GET /

### Purpose  
Simple liveness response; confirms the server is up.

### When frontend should call it  
Health checks, quick connectivity test (optional).

### Authentication  
**Public**

### Request

#### Headers  
None required.

#### Body / Params / Query  
None.

### Response

#### Success response example

Plain text (not JSON):

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8

Hello World!
```

#### Error responses  
Unlikely; if the server is down, you get a network error, not an application JSON body.

### Frontend usage example

```js
const { data } = await axios.get("http://localhost:3000/");
// data === "Hello World!"
```

---

## Endpoint: POST /auth/login

### Purpose  
Verifies a **Privy** access token, creates or updates the employer **Company**, returns an **application JWT** for subsequent API calls.

### When frontend should call it  
Right after Privy login (or when you need a fresh app token), before calling any protected employer API.

### Authentication  
**Public** (but requires **Privy** Bearer token in the header—not the app JWT).

### Request

#### Headers  

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | `Bearer <privy_access_token>` |
| `Content-Type` | Yes (JSON body) | `application/json` | (send without Bearer prefix if using Swagger, otherwise with prefix)

#### Body  

| field | type | required | description | example |
|--------|------|----------|-------------|---------|
| `walletAddress` | string | yes | EVM-style wallet address stored on the company | `"0x123..."` |
| `smartAccountAddress` | string | no | Optional AA / smart account address | `"0xabc..."` |

### Response

#### Success response example

Typical **HTTP 201** with wrapper:

```json
{
  "success": true,
  "message": "Logged in successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

- **`accessToken`:** App JWT (signed with `JWT_SECRET`, **7d** expiry per `AuthModule`). Send as `Authorization: Bearer <accessToken>` on protected routes.  
- Payload includes `sub` = company id, plus `walletAddress`, `privyId` for server use.

#### Error responses  

| Code | Meaning |
|------|---------|
| 401 | Invalid/expired Privy token (`AppException` from `PrivyService`). |
| 400 | Body validation failed (e.g. missing `walletAddress`). |

### Frontend usage example

```js
const { data } = await axios.post(
  "http://localhost:3000/auth/login",
  {
    walletAddress: "0xYourWallet",
    smartAccountAddress: "0xYourSmartAccount", // optional
  },
  {
    headers: {
      Authorization: `Bearer ${privyAccessToken}`,
      "Content-Type": "application/json",
    },
  }
);

const appJwt = data.data.accessToken;
```

---

## Endpoint: GET /companies/me

### Purpose  
Returns the **current company** profile (from DB), including a count of job posts.

### When frontend should call it  
Dashboard header, settings, onboarding—anywhere you show employer identity.

### Authentication  
**Requires app JWT**

### Request

#### Headers  

| Header | Required |
|--------|----------|
| `Authorization` | `Bearer <application_jwt>` |

#### Params / Query / Body  
None.

### Response

#### Success response example

```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "name": "New Company",
    "legalName": null,
    "registrationNumber": null,
    "country": "Unknown",
    "isVerified": true,
    "verifiedAt": null,
    "createdAt": "2026-04-19T12:00:00.000Z",
    "walletAddress": "0x123...",
    "smartAccountAddress": "0xabc...",
    "privyId": "did:privy:...",
    "_count": {
      "jobPosts": 3
    }
  }
}
```

#### Error responses  

| Code | Meaning |
|------|---------|
| 401 | Missing/invalid JWT, or company no longer exists (`JwtStrategy`). |

### Frontend usage example

```js
const { data } = await axios.get("http://localhost:3000/companies/me", {
  headers: { Authorization: `Bearer ${appJwt}` },
});
const company = data.data;
```

---

## Endpoint: GET /candidates

### Purpose  
**Mock** list of candidates (hardcoded in the controller).

### When frontend should call it  
Prototyping UI only; not backed by Prisma `Candidate` table in this handler.

### Authentication  
**Requires app JWT**

### Request

#### Headers  
`Authorization: Bearer <application_jwt>`

#### Body / Params / Query  
None.

### Response

#### Success response example

```json
{
  "success": true,
  "data": [
    {
      "id": "1",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "skills": ["NestJS", "TypeScript"]
    },
    {
      "id": "2",
      "firstName": "Jane",
      "lastName": "Smith",
      "email": "jane@example.com",
      "skills": ["React", "Solidity"]
    }
  ]
}
```

#### Error responses  
401 if not authenticated.

### Frontend usage example

```js
const { data } = await axios.get("http://localhost:3000/candidates", {
  headers: { Authorization: `Bearer ${appJwt}` },
});
```

---

## Endpoint: POST /candidates/shortlist/:jobId/:candidateId

### Purpose  
**Mock** “shortlist” action; returns a fixed-shape object (does not write to `Shortlist` in DB in this controller).

### When frontend should call it  
UI flow experiments only.

### Authentication  
**Requires app JWT**

### Request

#### Path params  

| field | type | required | description |
|--------|------|----------|---------------|
| `jobId` | string | yes | Job UUID (or any string for mock) |
| `candidateId` | string | yes | Candidate id (mock accepts any string) |

### Response

#### Success example

```json
{
  "success": true,
  "message": "Candidate shortlisted successfully",
  "data": {
    "id": "s1",
    "jobPostId": "<jobId from path>",
    "candidateId": "<candidateId from path>",
    "status": "PENDING",
    "matchTier": "TOP_MATCH"
  }
}
```

#### Error responses  
401 if unauthorized.

### Frontend usage example

```js
const jobId = "job-uuid";
const candidateId = "candidate-uuid";
await axios.post(
  `http://localhost:3000/candidates/shortlist/${jobId}/${candidateId}`,
  {},
  { headers: { Authorization: `Bearer ${appJwt}` } }
);
```

---

## Endpoint: PATCH /candidates/shortlist/:id/status

### Purpose  
**Mock** status update; echoes `id` and `status` from body.

### When frontend should call it  
Mock UI only.

### Authentication  
**Requires app JWT**

### Request

#### Path  

| field | type | required |
|--------|------|----------|
| `id` | string | yes |

#### Body  

| field | type | required | example |
|--------|------|----------|---------|
| `status` | string | de-facto required for meaningful behavior | `"REVIEWED"` |

*(No class-validator DTO here—still send valid JSON.)*

### Response

#### Success example

```json
{
  "success": true,
  "message": "Status updated successfully",
  "data": {
    "id": "<id from path>",
    "status": "REVIEWED"
  }
}
```

### Frontend usage example

```js
await axios.patch(
  "http://localhost:3000/candidates/shortlist/s1/status",
  { status: "REVIEWED" },
  { headers: { Authorization: `Bearer ${appJwt}` } }
);
```

---

## Endpoint: POST /jobs

### Purpose  
Creates a **JobPost** in **DRAFT** status for the authenticated company.

### When frontend should call it  
Employer creates a new job (before publish/payment simulation).

### Authentication  
**Requires app JWT**

### Request

#### Body (`CreateJobDto`)

| field | type | required | description | example |
|--------|------|----------|-------------|---------|
| `title` | string | yes | Job title | `"Senior NestJS Engineer"` |
| `description` | string | yes | Full description | `"We are looking for..."` |
| `location` | string | no | Location | `"Remote"` |
| `employmentType` | string | no | e.g. Full-time | `"Full-time"` |
| `bonusAmount` | number | yes | Bonus amount (stored as decimal) | `1000` |
| `currency` | string | no | Defaults in DB to `"USD"` if omitted | `"USD"` |

### Response

#### Success example (HTTP 201)

```json
{
  "success": true,
  "message": "Job created successfully",
  "data": {
    "id": "uuid",
    "companyId": "uuid",
    "title": "Senior NestJS Engineer",
    "description": "...",
    "location": "Remote",
    "employmentType": "Full-time",
    "bonusAmount": "1000.00",
    "currency": "USD",
    "status": "DRAFT",
    "publishedAt": null,
    "closedAt": null,
    "createdAt": "2026-04-19T12:00:00.000Z"
  }
}
```

#### Error responses  
400 validation; 401 unauthorized.

### Frontend usage example

```js
const { data } = await axios.post(
  "http://localhost:3000/jobs",
  {
    title: "Software Engineer",
    description: "Testing",
    bonusAmount: 100,
    location: "Remote",
    employmentType: "Full-time",
    currency: "USD",
  },
  { headers: { Authorization: `Bearer ${appJwt}` } }
);
```

---

## Endpoint: GET /jobs/my

### Purpose  
Lists all **job posts** for the logged-in company, newest first.

### When frontend should call it  
Employer job management page.

### Authentication  
**Requires app JWT**

### Response

#### Success example

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "companyId": "uuid",
      "title": "...",
      "description": "...",
      "status": "DRAFT",
      "bonusAmount": "100.00",
      "currency": "USD",
      "createdAt": "2026-04-19T12:00:00.000Z",
      "publishedAt": null,
      "closedAt": null
    }
  ]
}
```

### Frontend usage example

```js
const { data } = await axios.get("http://localhost:3000/jobs/my", {
  headers: { Authorization: `Bearer ${appJwt}` },
});
```

---

## Endpoint: POST /jobs/:id/publish

### Purpose  
Sets job status to **ACTIVE** and sets **`publishedAt`** (simulates payment completed).

### When frontend should call it  
After “payment” or when employer confirms go-live.

### Authentication  
**Requires app JWT**

#### Path  

| field | type | required |
|--------|------|----------|
| `id` | string (UUID) | yes |

### Response

#### Success example

Job object with `status: "ACTIVE"`, `publishedAt` set.

#### Error responses  

| Code | Meaning |
|------|---------|
| 404 | Job not found or not owned by this company (`AppException`). |
| 401 | Unauthorized |

### Frontend usage example

```js
await axios.post(
  `http://localhost:3000/jobs/${jobId}/publish`,
  {},
  { headers: { Authorization: `Bearer ${appJwt}` } }
);
```

---

## Endpoint: POST /jobs/:id/close

### Purpose  
Sets job status to **CLOSED** and sets **`closedAt`**.

### When frontend should call it  
Employer stops accepting applications.

### Authentication  
**Requires app JWT**

### Response  
Same pattern as publish; success returns updated job with `status: "CLOSED"`.  
404 if job missing or wrong company.

### Frontend usage example

```js
await axios.post(
  `http://localhost:3000/jobs/${jobId}/close`,
  {},
  { headers: { Authorization: `Bearer ${appJwt}` } }
);
```

---

## Endpoint: GET /analytics/dashboard

### Purpose  
Returns dashboard **counts**: total jobs, active jobs, and shortlist rows tied to the company’s jobs (shortlist count uses real DB `Shortlist`).

### When frontend should call it  
Employer analytics/dashboard widgets.

### Authentication  
**Requires app JWT**

### Response

#### Success example

```json
{
  "success": true,
  "data": {
    "totalJobs": 5,
    "activeJobs": 2,
    "totalCandidatesShortlisted": 0
  }
}
```

### Frontend usage example

```js
const { data } = await axios.get("http://localhost:3000/analytics/dashboard", {
  headers: { Authorization: `Bearer ${appJwt}` },
});
```

---

### Implementation note (not in Swagger today)

There is a second controller file `GET /company/me` under the tag **`company`**, but **`CompanyModule` is not imported in `App.module.ts`**, so it will **not** appear in Swagger or listen until registered. Prefer **`GET /companies/me`** for the current app.

---

# 5️⃣ END-TO-END USER FLOWS

### Flow A, First-time employer login (Privy → app JWT)

1. User completes **Privy** authentication; frontend holds **Privy access token**.  
2. **`POST /auth/login`** with `Authorization: Bearer <privy>` + `{ walletAddress, smartAccountAddress? }`.  
3. Store **`data.accessToken`** (app JWT) in memory/secure storage.  
4. **`GET /companies/me`** with app JWT → show company name, wallet, job count.  
5. Optional: **`GET /analytics/dashboard`** for dashboard numbers.

### Flow B, Create and publish a job

1. **`POST /auth/login`** (if no valid app JWT).  
2. **`POST /jobs`** with title, description, `bonusAmount`, etc. → receive job `id`, `status: DRAFT`.  
3. **`POST /jobs/:id/publish`** → `status: ACTIVE`, `publishedAt` set.  
4. **`GET /jobs/my`** to refresh list.  
5. **`GET /analytics/dashboard`** → `activeJobs` / `totalJobs` update.

### Flow C, Close a job

1. App JWT ready.  
2. **`POST /jobs/:id/close`** → `status: CLOSED`, `closedAt` set.  
3. **`GET /jobs/my`** or **`GET /analytics/dashboard`** to reflect changes.

### Flow D, Mock candidate UI (non-persistent shortlist in controller)

1. App JWT ready.  
2. **`GET /candidates`** → show mock list.  
3. **`POST /candidates/shortlist/:jobId/:candidateId`** → mock shortlist response.  
4. **`PATCH /candidates/shortlist/:id/status`** → mock status update.  
*(Real shortlist persistence would use DB models; this controller does not insert rows.)*

---

# 6️⃣ SWAGGER MANUAL TESTING SCENARIOS (QA)

For each endpoint, executable in Swagger UI.

### GET /

| Test case | Input | Expected result |
|-----------|--------|-----------------|
| Happy path | Execute with no params | **200**, body text `Hello World!` |

---

### POST /auth/login

| Test case | Input | Expected result |
|-----------|--------|-----------------|
| Happy path | Header `Authorization: Bearer <valid_privy_token>`, body `{ "walletAddress": "0x123" }` | **201**, `success: true`, `data.accessToken` present |
| Missing Privy token | No Authorization header | **401** or client error before success |
| Invalid Privy token | Invalid Bearer token | **401**, message about invalid/expired Privy token |
| Missing `walletAddress` | `{}` | **400**, validation error |
| Optional smart account | Include `smartAccountAddress` | **201**, company stores/updates addresses as per service logic |

---

### GET /companies/me

| Test case | Input | Expected result |
|-----------|--------|-----------------|
| Happy path | Valid app JWT | **200**, `success: true`, company + `_count.jobPosts` |
| No token | No Authorization | **401** |
| Invalid app JWT | Random Bearer string | **401** |

---

### GET /candidates

| Test case | Input | Expected result |
|-----------|--------|-----------------|
| Happy path | Valid app JWT | **200**, array of 2 mock candidates |
| No token |, | **401** |

---

### POST /candidates/shortlist/:jobId/:candidateId

| Test case | Input | Expected result |
|-----------|--------|-----------------|
| Happy path | Valid JWT, any two path segments | **200/201** (Nest default), mock `data` with `PENDING`, `TOP_MATCH` |
| No token |, | **401** |

---

### PATCH /candidates/shortlist/:id/status

| Test case | Input | Expected result |
|-----------|--------|-----------------|
| Happy path | Body `{ "status": "REVIEWED" }` | **200**, echoed `status` |
| Empty body | `{}` | **200** with `status: undefined` in data (mock) |

---

### POST /jobs

| Test case | Input | Expected result |
|-----------|--------|-----------------|
| Happy path | `title`, `description`, `bonusAmount: 100` | **201**, `status: DRAFT` |
| Missing `bonusAmount` | Omit number | **400** |
| Invalid type | `bonusAmount: "100"` string | **400** (expects number) |
| No JWT |, | **401** |

---

### GET /jobs/my

| Test case | Input | Expected result |
|-----------|--------|-----------------|
| Happy path | Valid JWT | **200**, array of company’s jobs |
| No JWT |, | **401** |

---

### POST /jobs/:id/publish

| Test case | Input | Expected result |
|-----------|--------|-----------------|
| Happy path | Valid `id` for own job | **200**, `status: ACTIVE`, `publishedAt` set |
| Wrong company / unknown id | Random UUID | **404**, `success: false` (AppException shape) |
| No JWT |, | **401** |

---

### POST /jobs/:id/close

| Test case | Input | Expected result |
|-----------|--------|-----------------|
| Happy path | Valid own job id | **200**, `status: CLOSED`, `closedAt` set |
| Not found | Random id | **404** |
| No JWT |, | **401** |

---

### GET /analytics/dashboard

| Test case | Input | Expected result |
|-----------|--------|-----------------|
| Happy path | Valid JWT | **200**, numeric `totalJobs`, `activeJobs`, `totalCandidatesShortlisted` |
| No JWT |, | **401** |

---

# 7️⃣ BACKEND VERIFICATION CHECKLIST

- [ ] `GET /` returns `Hello World!`  
- [ ] `POST /auth/login` with valid Privy token returns **201** and `accessToken`  
- [ ] `POST /auth/login` with bad token returns **401**  
- [ ] `GET /companies/me` works with app JWT and fails without token  
- [ ] `POST /jobs` creates **DRAFT** job; `bonusAmount` validation enforced  
- [ ] `GET /jobs/my` lists created jobs  
- [ ] `POST .../publish` sets **ACTIVE**; wrong id → **404**  
- [ ] `POST .../close` sets **CLOSED**; wrong id → **404**  
- [ ] `GET /analytics/dashboard` returns consistent counts  
- [ ] Mock candidate endpoints respond when authenticated  
- [ ] Database: company row after login; job rows after create/publish/close  

---

# 8️⃣ OPTIONAL: JEST TEST PLAN

### App (`AppController`)

- **Unit:** `AppService.getHello()` returns expected string.  
- **E2E:** `GET /` returns 200 and body `Hello World!`.

### Auth (`AuthModule`)

- **Unit:** `AuthService.login` creates company when missing; updates wallet when appropriate; `PrivyService.verifyToken` error maps to 401.  
- **Integration:** Login with mocked Privy → company persisted, JWT decodable with `JWT_SECRET`.  
- **E2E:** (already partially in `auth.e2e-spec.ts`) login, token shape, protected route 401 without token.

### Companies

- **Integration:** `CompaniesService.findOne` returns company with `_count`.  
- **E2E:** `GET /companies/me` with token from login.

### Jobs (`JobsService` / `JobsController`)

- **Unit:** `publish` / `close` throw **404** when job missing or `companyId` mismatch; success paths update status and timestamps.  
- **Integration:** Prisma create/find/update with real test DB.  
- **E2E:** Create job → publish → close; assert statuses and 404 for other company’s job (if you add a second company fixture).

### Candidates (mock)

- **E2E:** Authenticated GET returns mock array; shortlist POST/PATCH return expected mock shapes.

### Analytics

- **Unit:** Counts match DB state for seeded jobs/shortlists.  
- **E2E:** After creating jobs, dashboard totals match expectations.

### Cross-cutting

- **E2E:** Validation pipe rejects bad bodies globally.  
- **E2E:** JWT expiry / wrong secret (optional negative cases).  
- **Security:** Ensure `GET /` and `POST /auth/login` stay `@Public()`; all others require JWT.

---

This document matches the **current** NestJS + Prisma implementation and the **Swagger UI** entry point at `/api/docs`. If you later import `CompanyModule` or add a global prefix, update the base URL and duplicate `/company` vs `/companies` sections accordingly.