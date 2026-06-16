# Workflow 1: Interview Decision — Implementation Task Guide
## Junior Developer Handoff Document

> **Blueprint Reference:** `w1-architecture.md` — this document supplements it. Read the blueprint first, then use this document as your step-by-step execution guide.
>
> **Golden Rule:** If this document and the blueprint ever seem to conflict, the **blueprint wins**. Come to a senior dev immediately.
>
> **Do not skip milestones.** Each milestone ends with a mandatory checkpoint. Do not begin the next milestone until all checkpoint items pass. This is not bureaucracy — it prevents you from building several stories on top of a broken foundation.

---

## Table of Contents

1. [How to Use This Document](#1-how-to-use-this-document)
2. [Milestone 0 — Environment Setup & Project Scaffolding](#milestone-0--environment-setup--project-scaffolding)
3. [Milestone 1 — Module Foundation: Folder Structure, Interfaces, DTOs & Registration](#milestone-1--module-foundation-folder-structure-interfaces-dtos--registration)
4. [Milestone 2 — Cache Service (Stage 0: Cache Check)](#milestone-2--cache-service-stage-0-cache-check)
5. [Milestone 3 — Macro Fetch Service (Stage 1A: ClickHouse)](#milestone-3--macro-fetch-service-stage-1a-clickhouse)
6. [Milestone 4 — Micro Fetch Service (Stage 1B: GitHub GraphQL)](#milestone-4--micro-fetch-service-stage-1b-github-graphql)
7. [Milestone 5 — LLM Evaluation Service (Stage 2)](#milestone-5--llm-evaluation-service-stage-2)
8. [Milestone 6 — WebSocket Gateway, Controller & Pipeline Orchestrator (Stage 3)](#milestone-6--websocket-gateway-controller--pipeline-orchestrator-stage-3)
9. [Milestone 7 — End-to-End Integration Testing](#milestone-7--end-to-end-integration-testing)
10. [Milestone 8 — Security Audit, Rate Limiting & Production Readiness](#milestone-8--security-audit-rate-limiting--production-readiness)
11. [Reference: Error Scenarios Cheat Sheet](#reference-error-scenarios-cheat-sheet)
12. [Reference: SLA Budget Cheat Sheet](#reference-sla-budget-cheat-sheet)

---

## 1. How to Use This Document

Each milestone is structured as follows:

- **Goal** — what you are building and why it matters in the overall pipeline
- **Prerequisites** — what must already exist before you start
- **Tasks** — numbered, explicit steps you execute in order
- **Checkpoint** — a list of verifications you run before declaring the milestone done

**When a task says "refer to blueprint Section X"**, open `w1-architecture.md` and read that section in full before writing any code. The blueprint contains the exact TypeScript code, SQL queries, GraphQL query, and prompt template. Your job is to implement them faithfully, not redesign them.

**When a task says "run this curl command"**, run it. Don't assume it works — verify it.

---

## Milestone 0 — Environment Setup & Project Scaffolding

### Goal

Get a bare NestJS application running with the correct Node version, all required npm packages installed, Redis running locally, and the environment variables configured. By the end of this milestone, you will have a server that responds to `GET /triage/health` with `{"status":"ok"}`.

### Prerequisites

- Access to the repository (or a blank NestJS project to work within)
- A GitHub Personal Access Token (PAT) with `repo:read` and `user:read` scopes — you will use this for local testing of the GraphQL fetch. Create one at: https://github.com/settings/tokens
- A Google Gemini API key. Obtain one at: https://aistudio.google.com/app/apikey
- Docker installed locally (used to run Redis without a separate install)

### Tasks

**Task 0.1 — Verify Node.js version**

The blueprint mandates Node.js 20. Confirm this before anything else:

```bash
node --version
# Must output v20.x.x
```

If you have a different version, use `nvm` to switch:

```bash
nvm install 20
nvm use 20
```

If `nvm` is not installed, follow: https://github.com/nvm-sh/nvm#installing-and-updating

---

**Task 0.2 — Install NestJS CLI globally**

```bash
npm install -g @nestjs/cli
nest --version
# Should output 10.x.x or higher
```

NestJS CLI documentation: https://docs.nestjs.com/cli/overview

---

**Task 0.3 — Install all required npm packages**

Navigate to the project root and install the following packages. These are all referenced explicitly in blueprint Section 3 (Tech Stack). Do not install anything else without approval.

```bash
# Core NestJS and HTTP
npm install @nestjs/common @nestjs/core @nestjs/platform-express @nestjs/axios

# WebSocket support
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io

# Config and validation
npm install @nestjs/config class-validator class-transformer

# Rate limiting
npm install @nestjs/throttler

# Redis client
npm install ioredis

# Google Gemini SDK
npm install @google/generative-ai

# HTTP client (Axios is a peer dependency of @nestjs/axios, install explicitly)
npm install axios rxjs

# TypeScript types (dev dependencies)
npm install -D @types/node @types/ioredis
```

Confirm all packages are in `package.json` under `dependencies` before continuing.

---

**Task 0.4 — Start Redis with Docker**

Redis is used as the cache layer (blueprint Section 11). Run it in the background:

```bash
docker run -d --name triage-redis -p 6379:6379 redis:7
```

Verify Redis is running and reachable:

```bash
docker ps
# You should see 'triage-redis' in the list with STATUS 'Up'

# Also confirm you can connect:
docker exec -it triage-redis redis-cli ping
# Should respond: PONG
```

Redis documentation: https://redis.io/docs/getting-started/

---

**Task 0.5 — Configure environment variables**

Create a `.env` file in the project root by copying the example from blueprint Section 13:

```bash
cp .env.example .env
```

Open `.env` and fill in the following values. Leave `CLICKHOUSE_URL`, `CLICKHOUSE_USER`, and `CLICKHOUSE_PASSWORD` at their defaults — they point to the public ClickHouse playground and require no authentication.

```env
GEMINI_API_KEY=your_actual_gemini_key_here
REDIS_URL=redis://localhost:6379
CLICKHOUSE_URL=https://play.clickhouse.com
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
MACRO_FETCH_TIMEOUT=10
MICRO_FETCH_TIMEOUT=30
LLM_TIMEOUT=90
RATE_LIMIT_PER_MINUTE=20
```

**Never commit `.env` to source control.** Confirm `.env` is in `.gitignore` before proceeding.

---

**Task 0.6 — Enable the Global ValidationPipe in `main.ts`**

Open `src/modules/main.ts`. This is where the NestJS application bootstraps. Add the global `ValidationPipe` with the exact options below.

> **Why this matters:** The `transform: true` option is what makes `@Transform` decorators on DTOs actually execute. Without it, the `githubUsername` field will NOT be lowercased at entry, causing inconsistent cache keys and potentially zero ClickHouse results for valid users. This is called out in blueprint Section 15 (Common Pitfalls) as one of the most common mistakes.

```typescript
// src/modules/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,    // Makes @Transform decorators run on DTOs
      whitelist: true,    // Strips any properties not declared in the DTO
    }),
  );

  await app.listen(3000);
  console.log('Server running on http://localhost:3000');
}
bootstrap();
```

NestJS ValidationPipe documentation: https://docs.nestjs.com/pipes#validation-pipe

---

**Task 0.7 — Create a temporary health endpoint and start the server**

Before building any triage logic, confirm the server starts and responds. Add a minimal health endpoint to `AppController` (the default one generated by the CLI) or directly in `AppModule` temporarily:

```typescript
// src/modules/app.controller.ts (default generated file — edit it)
import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
```

Start the server:

```bash
npm run start:dev
```

### Checkpoint 0 — Must pass before proceeding to Milestone 1

Run every command below and confirm the expected output:

```bash
# 1. Node version check
node --version
# ✅ Must be v20.x.x

# 2. NestJS CLI check
nest --version
# ✅ Must be 10.x.x or higher

# 3. Redis connectivity
docker exec -it triage-redis redis-cli ping
# ✅ Must respond: PONG

# 4. Server health (run while server is running in another terminal)
curl http://localhost:3000/health
# ✅ Must respond: {"status":"ok"}

# 5. Confirm .env is NOT tracked by git
git status
# ✅ .env must NOT appear under "Changes to be committed" or "Untracked files"
```

Do not proceed until all 5 pass.

---

## Milestone 1 — Module Foundation: Folder Structure, Interfaces, DTOs & Registration

### Goal

Create the exact directory structure defined in blueprint Section 4, populate the interface files and DTO files with their full type definitions, register the `TriageModule` in `AppModule`, and confirm the module loads without errors on server start. No business logic yet — just the structural skeleton.

### Prerequisites

- Milestone 0 checkpoint fully passed

### Tasks

**Task 1.1 — Create the triage module directory structure**

Navigate to `src/modules/analysis-v3/workflows/triage/` and create the folders and empty files below. The exact paths matter — they are referenced throughout the blueprint and this document.

```bash
mkdir -p src/modules/analysis-v3/workflows/triage/services
mkdir -p src/modules/analysis-v3/workflows/triage/dto
mkdir -p src/modules/analysis-v3/workflows/triage/interfaces

# Create all the files the blueprint defines (empty for now)
touch src/modules/analysis-v3/workflows/triage/triage.module.ts
touch src/modules/analysis-v3/workflows/triage/triage.controller.ts
touch src/modules/analysis-v3/workflows/triage/triage.gateway.ts
touch src/modules/analysis-v3/workflows/triage/services/triage.service.ts
touch src/modules/analysis-v3/workflows/triage/services/cache.service.ts
touch src/modules/analysis-v3/workflows/triage/services/macro-fetch.service.ts
touch src/modules/analysis-v3/workflows/triage/services/micro-fetch.service.ts
touch src/modules/analysis-v3/workflows/triage/services/llm-eval.service.ts
touch src/modules/analysis-v3/workflows/triage/services/prompt-builder.ts
touch src/modules/analysis-v3/workflows/triage/dto/triage-request.dto.ts
touch src/modules/analysis-v3/workflows/triage/dto/triage-scorecard.dto.ts
touch src/modules/analysis-v3/workflows/triage/interfaces/macro-stats.interface.ts
touch src/modules/analysis-v3/workflows/triage/interfaces/micro-data.interface.ts
```

Confirm the structure matches blueprint Section 4 exactly by running:

```bash
find src/modules/analysis-v3/workflows/triage -type f | sort
```

---

**Task 1.2 — Implement `interfaces/macro-stats.interface.ts`**

Copy the full interface from blueprint Section 8 (Data Schemas — Interfaces) into this file. Every field must be present including the optional ones. The `macroAvailable: boolean` field is required (not optional) — this is the flag used throughout the pipeline to check whether ClickHouse returned data.

```typescript
// src/modules/analysis-v3/workflows/triage/interfaces/macro-stats.interface.ts
export interface MacroStats {
  actorLogin: string;
  totalEvents?: number;
  totalPushEvents?: number;
  totalPrEvents?: number;
  totalIssueEvents?: number;
  firstEventAt?: string;
  lastEventAt?: string;
  monthsActive?: number;
  repsTouched?: string[];
  macroAvailable: boolean;
}
```

---

**Task 1.3 — Implement `interfaces/micro-data.interface.ts`**

Copy the full interface from blueprint Section 8. Pay attention to the comments — `readmeExcerpt` has a max of 2000 chars and `manifestContent` has a max of 1000 chars. These limits are enforced in the service, not the interface, but understanding them helps you understand the data you're working with.

```typescript
// src/modules/analysis-v3/workflows/triage/interfaces/micro-data.interface.ts
export interface MicroData {
  repoName?: string;
  repoDescription?: string;
  primaryLanguage?: string;
  stars?: number;
  forks?: number;
  pushedAt?: string;
  readmeExcerpt?: string;       // max 2000 chars — enforced in micro-fetch.service.ts
  manifestType?: string;        // e.g. "package.json", "Cargo.toml"
  manifestContent?: string;     // max 1000 chars — enforced in micro-fetch.service.ts
  recentCommits?: string[];     // commit headlines only, max 60
  userName?: string;
  userBio?: string;
  userCompany?: string;
  accountCreatedAt?: string;
  microAvailable: boolean;
}
```

---

**Task 1.4 — Implement `dto/triage-request.dto.ts`**

Copy from blueprint Section 8. The three decorators on `githubUsername` (`@IsString`, `@Matches`, `@Transform`) work together:
- `@IsString()` — rejects non-strings before the regex check runs
- `@Matches(/^[a-zA-Z0-9\-]+$/)` — rejects anything that isn't a valid GitHub username format
- `@Transform(({ value }) => value.toLowerCase())` — lowercases the value **at entry**, so every downstream service always receives a lowercase username

The `transform: true` option you set on `ValidationPipe` in `main.ts` is what makes `@Transform` execute. Without it, the username is never lowercased.

```typescript
// src/modules/analysis-v3/workflows/triage/dto/triage-request.dto.ts
import { IsString, IsOptional, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class TriageRequestDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9\-]+$/, {
    message: 'Invalid GitHub username. Only letters, numbers, and hyphens are allowed.',
  })
  @Transform(({ value }) => value.toLowerCase())
  githubUsername: string;

  @IsString()
  githubOauthToken: string;

  @IsOptional()
  @IsString()
  roleContext?: string;
}
```

`class-validator` documentation: https://github.com/typestack/class-validator#readme
`class-transformer` documentation: https://github.com/typestack/class-transformer#readme

---

**Task 1.5 — Implement `dto/triage-scorecard.dto.ts`**

This is the shape of the final output returned to the client. Copy it exactly from blueprint Section 8. The `Recommendation` type is a union of exactly four string literals — the LLM service validates against these at runtime.

```typescript
// src/modules/analysis-v3/workflows/triage/dto/triage-scorecard.dto.ts
export type Recommendation =
  | 'Interview Recommended'
  | 'Proceed with Caution'
  | 'Insufficient Public Evidence'
  | 'Probable Enterprise Developer';

export class TriageScorecardDto {
  githubUsername: string;
  recommendation: Recommendation;
  executiveSummary: string;
  observedSignals: string[];
  gaps: string[];
  enterpriseFlag: boolean;
  macroAvailable: boolean;
  microAvailable: boolean;
  cached: boolean;
  evaluatedAt: string; // ISO 8601 format: "2024-01-15T10:30:00.000Z"
}
```

---

**Task 1.6 — Implement `triage.module.ts`**

Copy the full module from blueprint Section 4. This file registers all providers (services), controllers, and imports. The `ThrottlerModule.forRoot()` configuration sets the rate limit: 20 requests per 60 seconds per IP. Do not change these values.

```typescript
// src/modules/analysis-v3/workflows/triage/triage.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TriageController } from './triage.controller';
import { TriageGateway } from './triage.gateway';
import { TriageService } from './services/triage.service';
import { CacheService } from './services/cache.service';
import { MacroFetchService } from './services/macro-fetch.service';
import { MicroFetchService } from './services/micro-fetch.service';
import { LlmEvalService } from './services/llm-eval.service';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
  ],
  controllers: [TriageController],
  providers: [
    TriageGateway,
    TriageService,
    CacheService,
    MacroFetchService,
    MicroFetchService,
    LlmEvalService,
  ],
})
export class TriageModule {}
```

NestJS modules documentation: https://docs.nestjs.com/modules

---

**Task 1.7 — Register `TriageModule` in `AppModule`**

Open `src/modules/app.module.ts` and add `TriageModule` to the `imports` array:

```typescript
// src/modules/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { TriageModule } from './triage/triage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // Makes ConfigService available everywhere without re-importing
    TriageModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
```

> **Important:** `ConfigModule.forRoot({ isGlobal: true })` makes the `ConfigService` injectable in every module without needing to import `ConfigModule` again in each one. If you omit this, services will throw `ConfigService is not injectable` errors.

---

**Task 1.8 — Add stub implementations to all service files**

The module can't load if the classes it declares in `providers` don't exist. Add a minimal stub to each service file so NestJS can resolve the DI graph. You will fill in the real logic in subsequent milestones.

For each service file, add only the class decorator and constructor. Example for `cache.service.ts`:

```typescript
// src/modules/analysis-v3/workflows/triage/services/cache.service.ts  — STUB ONLY
import { Injectable } from '@nestjs/common';

@Injectable()
export class CacheService {}
```

Repeat for `triage.service.ts`, `macro-fetch.service.ts`, `micro-fetch.service.ts`, and `llm-eval.service.ts`. For `triage.controller.ts` and `triage.gateway.ts` add:

```typescript
// src/modules/analysis-v3/workflows/triage/triage.controller.ts  — STUB ONLY
import { Controller } from '@nestjs/common';

@Controller('triage')
export class TriageController {}
```

```typescript
// src/modules/analysis-v3/workflows/triage/triage.gateway.ts  — STUB ONLY
import { WebSocketGateway } from '@nestjs/websockets';

@WebSocketGateway({ namespace: '/triage/ws' })
export class TriageGateway {}
```

### Checkpoint 1 — Must pass before proceeding to Milestone 2

```bash
# 1. Start the server
npm run start:dev
# ✅ Terminal must show no errors and print "Server running on http://localhost:3000"
# ✅ No "Nest can't resolve dependencies" errors — this means DI is wired correctly

# 2. Health check still works
curl http://localhost:3000/health
# ✅ {"status":"ok"}

# 3. Confirm triage folder structure
find src/modules/analysis-v3/workflows/triage -type f | sort
# ✅ 13 files listed — all from Task 1.1 plus prompt-builder.ts
```

If the server fails to start, read the error carefully. "Cannot find module" means a missing import path. "Nest can't resolve dependencies" means a provider is listed in `triage.module.ts` but its class file doesn't export the correct class name.

---

## Milestone 2 — Cache Service (Stage 0: Cache Check)

### Goal

Implement `cache.service.ts` — the Redis wrapper that provides `get()` and `set()` for triage scorecards. This is Stage 0 in the pipeline (blueprint Section 6, Stage 0). The service must handle Redis unavailability gracefully — a Redis error must never crash the pipeline or return an error to the user.

### Prerequisites

- Milestone 1 checkpoint fully passed
- Redis running (`docker ps` shows `triage-redis` as `Up`)

### Tasks

**Task 2.1 — Implement `cache.service.ts`**

Replace the stub in `src/modules/analysis-v3/workflows/triage/services/cache.service.ts` with the full implementation from blueprint Section 6 (Stage 0). Read the blueprint section carefully before copying — the notes explain the design decisions.

Key points to understand before you implement:

- The cache key format is `triage:{githubUsername}` where the username is already lowercased by the DTO. Do not lowercase again here — the blueprint is explicit on this.
- TTL is 14 days expressed in seconds: `14 * 24 * 60 * 60 = 1,209,600`.
- `get()` returns `null` on cache miss (no key) AND on Redis errors. It never throws.
- `set()` returns `void`. A Redis write failure is logged as a warning but never propagated.
- The `ioredis` client is instantiated in the constructor using the `REDIS_URL` env variable.

```typescript
// src/modules/analysis-v3/workflows/triage/services/cache.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis;
  private readonly TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

  constructor(private readonly config: ConfigService) {
    this.redis = new Redis(this.config.get<string>('REDIS_URL', 'redis://localhost:6379'));
  }

  async get(githubUsername: string): Promise<Record<string, unknown> | null> {
    const key = `triage:${githubUsername}`; // username already lowercased by DTO
    try {
      const result = await this.redis.get(key);
      return result ? JSON.parse(result) : null;
    } catch (err) {
      this.logger.warn(`Redis GET failed for key ${key}: ${err}`);
      return null; // Degrade gracefully — never throw
    }
  }

  async set(githubUsername: string, scorecard: object): Promise<void> {
    const key = `triage:${githubUsername}`;
    try {
      await this.redis.setex(key, this.TTL_SECONDS, JSON.stringify(scorecard));
    } catch (err) {
      this.logger.warn(`Redis SET failed for key ${key}: ${err}`);
      // Intentionally no rethrow — a cache write failure is non-fatal
    }
  }
}
```

`ioredis` documentation: https://github.com/redis/ioredis#readme
`ioredis` API reference: https://redis.github.io/ioredis/classes/Redis.html

---

**Task 2.2 — Manually test cache `set` and `get` via Redis CLI**

Start the server and use `redis-cli` to verify a `setex` write works. This manual test confirms the Redis connection is live before you build anything on top of it.

```bash
# In terminal 1: server is running (npm run start:dev)

# In terminal 2: interact with Redis directly
docker exec -it triage-redis redis-cli

# Inside redis-cli, set a test key
127.0.0.1:6379> SETEX triage:testuser 60 '{"test":"value"}'
OK

# Retrieve it
127.0.0.1:6379> GET triage:testuser
"{\"test\":\"value\"}"

# Check TTL
127.0.0.1:6379> TTL triage:testuser
(integer) 59   # (some value close to 60, decreasing)

# Clean up
127.0.0.1:6379> DEL triage:testuser
(integer) 1

# Exit
127.0.0.1:6379> EXIT
```

If `GET` returns `nil` or the `SETEX` fails, check that the Docker container is running and that `REDIS_URL=redis://localhost:6379` in your `.env`.

### Checkpoint 2 — Must pass before proceeding to Milestone 3

```bash
# 1. Server still starts without errors
npm run start:dev
# ✅ No errors in terminal

# 2. Redis is reachable
docker exec -it triage-redis redis-cli ping
# ✅ PONG

# 3. Confirm CacheService loads by checking NestJS DI output
# In the startup logs you should see no "cannot resolve" errors for CacheService

# 4. Confirm graceful degradation: stop Redis and confirm server still starts
docker stop triage-redis
npm run start:dev
# ✅ Server starts. You will see ioredis connection error warnings in the log — this is expected.
# ✅ The server must NOT crash.
docker start triage-redis  # bring Redis back up
```

---

## Milestone 3 — Macro Fetch Service (Stage 1A: ClickHouse)

### Goal

Implement `macro-fetch.service.ts` — the service that queries the public ClickHouse GH Archive endpoint for lifetime GitHub activity stats. This is Stage 1A in the pipeline (blueprint Section 6, Stage 1A). The service sends one HTTP POST to ClickHouse and parses the JSON response into a `MacroStats` object.

### Prerequisites

- Milestone 2 checkpoint fully passed
- Internet access to `https://play.clickhouse.com` (test this before you start)

### Background Reading (Required)

Before writing any code, read these resources to understand what you're working with:

- **ClickHouse HTTP Interface:** https://clickhouse.com/docs/en/interfaces/http — explains the POST body format, `FORMAT JSON` output structure, and authentication parameters
- **GH Archive dataset on ClickHouse:** https://ghe.clickhouse.com — the public dataset you're querying. The table is `github_events`. You can run queries interactively here to understand the schema.
- **ClickHouse `FORMAT JSON` response:** https://clickhouse.com/docs/en/interfaces/formats#json — shows you the exact JSON shape returned, including the `data`, `rows`, and `meta` fields

### Tasks

**Task 3.1 — Verify the ClickHouse endpoint is reachable**

Run this `curl` command before writing any code. It hits the public endpoint with a minimal query to confirm connectivity:

```bash
curl -s -X POST 'https://play.clickhouse.com' \
  --data-urlencode "query=SELECT 1 FORMAT JSON" \
  --data-urlencode "user=default" \
  --data-urlencode "password="
```

Expected response:

```json
{
  "meta": [{"name":"1","type":"UInt8"}],
  "data": [{"1":1}],
  "rows": 1,
  ...
}
```

If this fails, you have a network issue. Do not proceed until it works.

---

**Task 3.2 — Run the actual SQL query manually against a known username**

Test the exact SQL query from the blueprint with a real GitHub username. Use `torvalds` (Linus Torvalds) as the test subject — he has known activity and should always return data.

```bash
curl -s -X POST 'https://play.clickhouse.com' \
  --data-urlencode "user=default" \
  --data-urlencode "password=" \
  --data-urlencode "query=SELECT actor_login, count() AS total_events, countIf(type = 'PushEvent') AS total_push_events, countIf(type = 'PullRequestEvent') AS total_pr_events, countIf(type = 'IssuesEvent') AS total_issue_events, min(created_at) AS first_event_at, max(created_at) AS last_event_at, dateDiff('month', min(created_at), max(created_at)) AS months_active, groupUniqArray(50)(repo_name) AS repos_touched FROM github_events WHERE actor_login = 'torvalds' AND created_at >= now() - INTERVAL 3 YEAR GROUP BY actor_login FORMAT JSON"
```

Inspect the response structure. Note: the response has a `data` array and a `rows` integer. When `rows` is `0`, the `data` array is empty. Your code will check `data.rows === 0` to detect a username with no history.

> **Why this manual step matters:** The ClickHouse query is the most opaque part of the pipeline. If you implement the service and it always returns `macroAvailable: false`, the broad `catch` in the service will silently swallow the error. Running the query manually first confirms the endpoint and SQL are correct before you add the layer of TypeScript around it.

---

**Task 3.3 — Implement `macro-fetch.service.ts`**

Replace the stub with the full implementation from blueprint Section 6 (Stage 1A). The blueprint includes the complete code — copy it faithfully. Notes on the key implementation details:

- The SQL query is built inline using a template literal. The `githubUsername` is already sanitised (alphanumeric + hyphens only) by the DTO regex, so inline interpolation is safe here. Do not use external SQL libraries.
- `URLSearchParams` serialises the query and credentials into `application/x-www-form-urlencoded` format, which is what ClickHouse's HTTP interface expects.
- `firstValueFrom()` from `rxjs` converts the `HttpService` Observable into a Promise. NestJS's `HttpService` returns Observables by default — `firstValueFrom` is the idiomatic way to convert them.
- The broad `catch` at the bottom is intentional. Both a `TypeError` (from bad parsing) and a network timeout will be caught here, logged, and returned as `{ macroAvailable: false }`. The `logger.warn` is your only signal that something went wrong — always check logs when diagnosing.

`@nestjs/axios` (HttpService) documentation: https://docs.nestjs.com/techniques/http-module
`rxjs` `firstValueFrom` documentation: https://rxjs.dev/api/index/function/firstValueFrom

---

**Task 3.4 — Write a manual test for `MacroFetchService`**

Since you're not setting up a full test framework in this milestone, write a temporary test script that exercises the service. Create `test-macro.ts` in the project root (not inside `src/modules/analysis-v3/workflows/triage`):

```typescript
// test-macro.ts — delete this file after testing, it's for manual verification only
import 'dotenv/config';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { MacroFetchService } from './src/modules/analysis-v3/workflows/triage/services/macro-fetch.service';
import axios from 'axios';
import { AxiosInstance } from 'axios';

// Minimal manual test — not using NestJS DI, just constructing directly
async function main() {
  const axiosInstance = axios.create();
  const httpService = new HttpService(axiosInstance as any);
  const configService = new ConfigService();
  const service = new MacroFetchService(httpService, configService);

  console.log('Testing with known user: torvalds');
  const result = await service.fetch('torvalds');
  console.log(JSON.stringify(result, null, 2));

  console.log('\nTesting with unknown user: thisuserverydefinitelydoesnotexist99999');
  const missing = await service.fetch('thisuserverydefinitelydoesnotexist99999');
  console.log(JSON.stringify(missing, null, 2));
}

main().catch(console.error);
```

Run it:

```bash
npx ts-node test-macro.ts
```

Expected for `torvalds`: a `MacroStats` object with `macroAvailable: true` and numeric values for `totalPushEvents`, `monthsActive`, etc.

Expected for the unknown user: `{ actorLogin: '...', macroAvailable: false }`.

### Checkpoint 3 — Must pass before proceeding to Milestone 4

```bash
# 1. ClickHouse endpoint reachable
curl -s -X POST 'https://play.clickhouse.com' --data-urlencode "query=SELECT 1 FORMAT JSON" --data-urlencode "user=default" --data-urlencode "password="
# ✅ Returns JSON with "rows":1

# 2. Known user returns data
npx ts-node test-macro.ts
# ✅ torvalds: macroAvailable: true, totalPushEvents > 0
# ✅ Unknown user: macroAvailable: false (graceful degradation — no throw, no crash)

# 3. Server still starts with no errors
npm run start:dev
# ✅ No errors

# 4. Delete the test file
rm test-macro.ts
```

---

## Milestone 4 — Micro Fetch Service (Stage 1B: GitHub GraphQL)

### Goal

Implement `micro-fetch.service.ts` — the service that sends a single GraphQL query to GitHub's API v4 to fetch semantic repository data. This is Stage 1B in the pipeline (blueprint Section 6, Stage 1B). The service must return a rich `MicroData` object when a repo exists, a profile-only object when the user exists but has no public repos, and `{ microAvailable: false }` when anything fails.

### Prerequisites

- Milestone 3 checkpoint fully passed
- A GitHub Personal Access Token with `repo` and `read:user` scopes. If you don't have one, create it at: https://github.com/settings/tokens

### Background Reading (Required)

- **GitHub GraphQL API v4 introduction:** https://docs.github.com/en/graphql/overview/about-the-graphql-api
- **GitHub GraphQL Explorer (interactive):** https://docs.github.com/en/graphql/overview/explorer — use this to test the Sniper query before implementing the service
- **GitHub GraphQL rate limits:** https://docs.github.com/en/graphql/overview/resource-limitations — important to understand: 5,000 points/hour per authenticated user. The Sniper query costs roughly 1 point.
- **GitHub OAuth token scopes:** https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps

### Tasks

**Task 4.1 — Test the GraphQL Sniper query in the GitHub Explorer**

Go to https://docs.github.com/en/graphql/overview/explorer and log in with your GitHub account. Paste the full GraphQL query from blueprint Section 6 (Stage 1B) into the explorer. Run it with a test `$login` variable:

```json
{"login": "torvalds"}
```

Inspect the response. You should see:
- `user.name`, `user.bio`, `user.company`, `user.createdAt`
- `user.repositories.nodes[0]` with `name`, `description`, `primaryLanguage`, `stargazerCount`, `forkCount`, `pushedAt`
- `readme` or `readmeLower` containing the README text
- `defaultBranchRef.target.history.nodes` containing up to 60 commit headlines

Understanding this response shape is essential before you write the parsing code.

---

**Task 4.2 — Implement `micro-fetch.service.ts`**

Replace the stub with the full implementation from blueprint Section 6 (Stage 1B). The blueprint includes the complete code — copy it faithfully. Critical implementation notes:

**The GraphQL query constant:** The blueprint shows `const GRAPHQL_QUERY = \`...\`;` with a note to paste the query above. The full query is defined in the Stage 1B section. Store it as a module-level constant above the `@Injectable()` class — not inside a method.

**The `MANIFEST_KEYS` mapping:** This maps GraphQL field aliases to their real filenames. The query fetches multiple dependency manifest files simultaneously using aliases (`packageJson`, `requirementsTxt`, etc.). The service checks them in order and uses the first one found.

**README null-coalescing:** `repo.readme?.text ?? repo.readmeLower?.text ?? ''` — the query fetches both `README.md` and `readme.md` because some repos use lowercase. Take whichever one has content.

**Slice limits:** `readmeText.slice(0, 2000)` and `manifestContent.slice(0, 1000)` keep the payload manageable for the LLM prompt. These limits come from the interface comments and the prompt builder.

**Null safety with `?.` operator:** GitHub's GraphQL response may have `null` nodes. Use optional chaining (`?.`) throughout the parsing section. The blueprint notes this explicitly in Section 15 (Common Pitfalls): "Always check `nodes.length > 0` before accessing `nodes[0]`."

**401 handling:** When the OAuth token is invalid or expired, GitHub returns a `401`. Axios throws on non-2xx status codes, so this lands in the `catch` block and returns `{ microAvailable: false }`. The outer pipeline in `triage.service.ts` handles the distinction between a 401 and a general failure — see blueprint Section 12 (Error Handling).

`@nestjs/axios` documentation: https://docs.nestjs.com/techniques/http-module
GitHub GraphQL API v4 reference: https://docs.github.com/en/graphql/reference

---

**Task 4.3 — Write a manual test for `MicroFetchService`**

Create `test-micro.ts` in the project root:

```typescript
// test-micro.ts — delete after testing
import 'dotenv/config';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { MicroFetchService } from './src/modules/analysis-v3/workflows/triage/services/micro-fetch.service';
import axios from 'axios';

async function main() {
  const httpService = new HttpService(axios.create() as any);
  const configService = new ConfigService();
  const service = new MicroFetchService(httpService, configService);

  // Replace with your actual GitHub OAuth token
  const token = process.env.GITHUB_TEST_TOKEN || 'YOUR_TOKEN_HERE';

  console.log('Testing with known user: torvalds');
  const result = await service.fetch('torvalds', token);
  console.log(JSON.stringify(result, null, 2));

  console.log('\nTesting with invalid token (should degrade gracefully):');
  const badToken = await service.fetch('torvalds', 'invalid_token_xxx');
  console.log(JSON.stringify(badToken, null, 2));
}

main().catch(console.error);
```

Add your GitHub token to `.env` temporarily:

```bash
# In .env (temporary for testing — remove after)
GITHUB_TEST_TOKEN=ghp_your_actual_token_here
```

Run:

```bash
npx ts-node test-micro.ts
```

Expected for `torvalds`: `microAvailable: true`, `repoName` populated, `recentCommits` array with messages, `primaryLanguage` set.

Expected for invalid token: `{ microAvailable: false }` — no crash, no throw.

**Task 4.4 (Optional Reference) — Review Legacy GitHub API Patterns**

If the `MicroFetchService` encounters GitHub API rate limiting or needs to expand its query scope, the old module's `data-collector/group-collectors/` directory contains working implementations for:

- Octokit-based pagination through large repo lists (`GroupBCollector`)
- Commit message retrieval across multiple repos (`GroupCCollector`)
- GitHub search API usage (`GroupDCollector`)
- File content checking for CI configs and test directories (`GroupECollector`)

The legacy `CircuitBreakerService` also provides a tested pattern for aborting early when GitHub rate limits approach exhaustion.


### Checkpoint 4 — Must pass before proceeding to Milestone 5

```bash
# 1. Known user returns rich MicroData
npx ts-node test-micro.ts
# ✅ torvalds: microAvailable: true, repoName present, recentCommits is an array
# ✅ Invalid token: microAvailable: false — graceful degradation, no throw

# 2. Server still starts with no errors
npm run start:dev
# ✅ No errors

# 3. Confirm readmeExcerpt is sliced to max 2000 chars
# In the test output, check: result.readmeExcerpt.length <= 2000

# 4. Delete the test file and remove temp token from .env
rm test-micro.ts
# Remove GITHUB_TEST_TOKEN line from .env
```

---

## Milestone 5 — LLM Evaluation Service (Stage 2)

### Goal

Implement `prompt-builder.ts` and `llm-eval.service.ts`. The prompt builder assembles the `MacroStats` and `MicroData` payloads into the exact prompt template defined in blueprint Section 9. The LLM eval service calls Gemini 1.5 Flash, parses the JSON response, validates the `recommendation` field, and returns a `TriageScorecardDto`. This is the most critical service — it determines the quality of the final output.

### Prerequisites

- Milestone 4 checkpoint fully passed
- A valid Gemini API key in `.env` as `GEMINI_API_KEY`

### Background Reading (Required)

- **Google Gemini API JavaScript SDK:** https://ai.google.dev/api/generate-content — specifically the `generateContent()` method and `GenerationConfig`
- **Gemini JSON output mode (`responseMimeType`):** https://ai.google.dev/gemini-api/docs/json-mode — this is how you force the model to return only JSON. It reduces (but does not eliminate) malformed JSON responses, which is why the retry logic exists.
- **`@google/generative-ai` npm package:** https://www.npmjs.com/package/@google/generative-ai

### Tasks

**Task 5.1 — Implement `services/prompt-builder.ts`**

This is a pure function (no `@Injectable()`, no DI) that takes `MacroStats`, `MicroData`, and a `roleContext` string and returns the completed prompt string. Copy the full implementation from blueprint Section 9.

Key points:

- `macro.repsTouched?.slice(0, 10).join(', ')` — the SQL query caps at 50 repos, but the prompt only uses 10. This keeps the prompt a manageable size.
- `micro.recentCommits?.slice(0, 60)` — only the first 60 commit headlines are used even though the GraphQL query fetches 60. This is already aligned.
- The prompt ends with `.trim()` — remove leading/trailing whitespace from the template literal.
- The four valid recommendation values in the prompt (`Interview Recommended | Proceed with Caution | Insufficient Public Evidence | Probable Enterprise Developer`) must **exactly match** the `Recommendation` type in `triage-scorecard.dto.ts` and the `VALID_RECOMMENDATIONS` array in `llm-eval.service.ts`. Do not change any of these strings.

---

**Task 5.2 — Implement `services/llm-eval.service.ts`**

Replace the stub with the full implementation from blueprint Section 6 (Stage 2). Copy faithfully.

Critical implementation notes:

**Gemini client initialisation:** The `GoogleGenerativeAI` instance is created once in the constructor using `this.config.getOrThrow<string>('GEMINI_API_KEY')`. `getOrThrow` (not `get`) means the app crashes at startup if the key is missing — this is intentional. A missing Gemini key means the pipeline can never work, so failing fast is correct.

**`temperature: 0.1`:** Keep this value. A low temperature produces consistent, structured JSON output. Raising it introduces variance and increases the chance of malformed or out-of-spec responses.

**`responseMimeType: 'application/json'`:** This instructs Gemini to return JSON. Even with this set, the response can occasionally contain extraneous text (markdown fences, preamble). The `JSON.parse()` call will throw, which triggers the retry.

**The retry pattern:** On a `JSON.parse` failure, the service retries once with `temperature: 0` and an explicit `IMPORTANT: Return ONLY a valid JSON object` instruction appended to the prompt. If the retry also fails, the error propagates to `triage.service.ts`, which catches it and pushes an `ERROR` event to the client.

**`VALID_RECOMMENDATIONS` validation:** After parsing the JSON, the service checks that `parsed.recommendation` is one of the four valid values. If the LLM returns anything else (e.g. `"Highly Recommended"` or `"Not Recommended"`), it throws. This throw is caught by `runPipeline` in `triage.service.ts`.

**JS async note:** Blueprint Section 15 calls this out explicitly: the JavaScript `@google/generative-ai` SDK is fully async — `generateContent()` returns a `Promise`. Just `await` it. Do not look for or use `asyncio.to_thread()` equivalents (those are Python concepts).

---

**Task 5.3 — Write a manual test for `LlmEvalService`**

Create `test-llm.ts` in the project root. Use hardcoded `MacroStats` and `MicroData` objects so you don't need ClickHouse or GitHub to run this test:

```typescript
// test-llm.ts — delete after testing
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { LlmEvalService } from './src/modules/analysis-v3/workflows/triage/services/llm-eval.service';
import { MacroStats } from './src/modules/analysis-v3/workflows/triage/interfaces/macro-stats.interface';
import { MicroData } from './src/modules/analysis-v3/workflows/triage/interfaces/micro-data.interface';

async function main() {
  const configService = new ConfigService();
  const service = new LlmEvalService(configService);

  const macro: MacroStats = {
    actorLogin: 'testcandidate',
    totalEvents: 450,
    totalPushEvents: 300,
    totalPrEvents: 50,
    totalIssueEvents: 30,
    firstEventAt: '2021-06-01T00:00:00Z',
    lastEventAt: '2024-01-10T00:00:00Z',
    monthsActive: 31,
    repsTouched: ['myorg/backend-api', 'myorg/data-pipeline', 'openssl/openssl'],
    macroAvailable: true,
  };

  const micro: MicroData = {
    repoName: 'distributed-kv-store',
    repoDescription: 'A Raft-based key-value store implemented in Go',
    primaryLanguage: 'Go',
    stars: 120,
    forks: 18,
    pushedAt: '2024-01-09T12:00:00Z',
    readmeExcerpt: 'This project implements the Raft consensus algorithm for distributed state replication.',
    manifestType: 'go.mod',
    manifestContent: 'module github.com/testcandidate/distributed-kv-store\ngo 1.21\nrequire etcd.io/etcd/client/v3 v3.5.10',
    recentCommits: [
      'Implement log replication across followers',
      'Add leader election timeout with random backoff',
      'Fix split-brain detection in network partition scenario',
      'Add integration tests for 3-node cluster',
    ],
    userName: 'Test Candidate',
    userBio: 'Backend engineer, distributed systems enthusiast',
    userCompany: null,
    accountCreatedAt: '2019-03-15T00:00:00Z',
    microAvailable: true,
  };

  console.log('Calling LLM with test macro+micro data...');
  const scorecard = await service.evaluate(macro, micro, 'Senior Backend Engineer, distributed systems team');
  console.log(JSON.stringify(scorecard, null, 2));

  // Verify output shape
  const validRecs = ['Interview Recommended', 'Proceed with Caution', 'Insufficient Public Evidence', 'Probable Enterprise Developer'];
  console.log('\n--- Validation ---');
  console.log('recommendation valid:', validRecs.includes(scorecard.recommendation));
  console.log('executiveSummary length:', scorecard.executiveSummary?.length ?? 0);
  console.log('observedSignals count:', scorecard.observedSignals?.length ?? 0);
  console.log('gaps count:', scorecard.gaps?.length ?? 0);
  console.log('enterpriseFlag is boolean:', typeof scorecard.enterpriseFlag === 'boolean');
}

main().catch(console.error);
```

Run it:

```bash
npx ts-node test-llm.ts
```

The LLM call takes 15–40 seconds. This is expected.

Expected output: a `TriageScorecardDto` with `recommendation` set to one of the four valid values, `executiveSummary` as a 3–5 sentence paragraph referencing Raft/distributed systems (the test data), and `gaps` containing at least one entry.

**Task 5.4 (Optional Reference) — Review Legacy LLM Error Patterns**

If the production LLM shows above-expected failure rates (JSON parse failures, model refusals, timeouts), review the old module's `llm/llm-integration.service.ts` for advanced recovery patterns:

- `parseWave3Response()` — handles nested JSON extraction, field validation, and graceful fallback per field
- `defaultWave3BatchOutput()` + `defaultNarrativeOutput()` — fallback objects that prevent pipeline crashes
- `chatCompletionWithRetry()` in `gemini-client.ts` — exponential backoff with max 45s delay

These are not part of the implementation scope for Milestone 5 but serve as a reference if the basic retry-once pattern proves insufficient.

### Checkpoint 5 — Must pass before proceeding to Milestone 6

```bash
# 1. LLM returns a valid scorecard
npx ts-node test-llm.ts
# ✅ recommendation is one of the four valid values
# ✅ executiveSummary is a non-empty string (3+ sentences)
# ✅ observedSignals is a non-empty array
# ✅ gaps has at least one entry
# ✅ enterpriseFlag is a boolean (not undefined, not a string)
# ✅ No crash, no throw

# 2. Server still starts
npm run start:dev
# ✅ No errors

# 3. Delete the test file
rm test-llm.ts
```

---

## Milestone 6 — WebSocket Gateway, Controller & Pipeline Orchestrator (Stage 3)

### Goal

Implement the final three files that wire everything together: `triage.gateway.ts` (WebSocket delivery), `triage.service.ts` (the pipeline orchestrator), and `triage.controller.ts` (HTTP entry point). After this milestone, the full pipeline runs end-to-end.

### Prerequisites

- Milestone 5 checkpoint fully passed
- Understanding of socket.io basics: https://socket.io/docs/v4/

### Background Reading (Required)

- **NestJS WebSocket Gateways:** https://docs.nestjs.com/websockets/gateways
- **socket.io rooms:** https://socket.io/docs/v4/rooms/ — understand how `socket.join(room)` and `server.to(room).emit(event, data)` work. Rooms are how the gateway targets a specific client's session.
- **NestJS `@Throttle` decorator:** https://docs.nestjs.com/security/rate-limiting — rate limiting at the route level

### Tasks

**Task 6.1 — Implement `triage.gateway.ts`**

Replace the stub with the full implementation from blueprint Section 6 (Stage 3). The gateway has three responsibilities:

- Expose the `/triage/ws` socket.io namespace
- Handle the `join` event (the client joins its `sessionId` room)
- Provide `pushFinal()` and `pushError()` methods that `triage.service.ts` calls to broadcast events to the correct room

The `@WebSocketServer()` decorator injects the socket.io `Server` instance. The `server.to(sessionId).emit(event, payload)` pattern broadcasts to everyone in the `sessionId` room (which is always just one client).

> **Do not replace rooms with a manual `Map<string, Socket>`** — blueprint Section 15 explains why: rooms work with multi-worker deployments via `socket.io-redis-adapter`, a manual map does not.

```typescript
// src/modules/analysis-v3/workflows/triage/triage.gateway.ts
import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  MessageBody, ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ namespace: '/triage/ws' })
export class TriageGateway {
  @WebSocketServer() server: Server;

  @SubscribeMessage('join')
  handleJoin(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(data.sessionId);
  }

  pushFinal(sessionId: string, scorecard: object): void {
    this.server.to(sessionId).emit('FINAL', scorecard);
  }

  pushError(sessionId: string, message: string): void {
    this.server.to(sessionId).emit('ERROR', { message });
  }
}
```

---

**Task 6.2 — Implement `services/triage.service.ts`**

This is the orchestrator. It calls the four services in the correct order, handles the two-path flow (macro + micro parallel → LLM → push), and catches any unhandled exceptions. Copy the full implementation from blueprint Section 6 (Stage 3).

**Critical:** The `runPipeline()` method is designed to be called **without `await`** from the controller. This means any exception inside `runPipeline` that is not caught internally will become an unhandled Promise rejection. The outer `try/catch` ensures this never happens — every error path either calls `this.gateway.pushError()` or falls into the global catch which also calls `pushError`.

The `Promise.all()` call runs macro and micro fetches in parallel. Both services are guaranteed to return (never throw), so `Promise.all` will always resolve. The check `if (!macro.macroAvailable && !micro.microAvailable)` handles the case where both sources failed — in that case, calling the LLM would be pointless and misleading.

The cache write is fire-and-forget: `this.cache.set(...).catch(...)`. The `.catch()` on the Promise prevents an unhandled rejection if Redis fails after the FINAL event is sent.

---

**Task 6.3 — Implement `triage.controller.ts`**

Replace the stub with the full implementation from blueprint Section 6 (Stage 3) and the API reference from blueprint Section 7. The controller has three endpoints:

- `GET /triage/health` — liveness check
- `POST /triage` — main entry point; cache check + pipeline kickoff
- `GET /triage/:username` — polling fallback for clients that missed the WebSocket FINAL event

**The most important line in the controller:**

```typescript
// Fire-and-forget — do NOT await
this.triageService.runPipeline(sessionId, body.githubUsername, body.githubOauthToken, body.roleContext ?? 'General Software Engineer');
```

The absence of `await` is intentional. If you add `await`, the HTTP response will block for the entire pipeline duration (up to 120 seconds). The client needs the `sessionId` immediately so it can open the WebSocket connection. Blueprint Section 15 lists this as the most common mistake.

**The `@Throttle` decorator** on `POST /triage` enforces 20 requests per minute per IP. The `ThrottlerModule` is already configured in `triage.module.ts`.

NestJS controllers documentation: https://docs.nestjs.com/controllers
NestJS throttler documentation: https://docs.nestjs.com/security/rate-limiting

---

**Task 6.4 — Verify the full structure compiles**

```bash
npm run build
```

There must be zero TypeScript errors. Fix any compilation errors before running the server. Common issues:

- Missing return types on methods
- Incorrect import paths (check relative paths between files)
- DI constructor argument mismatches

### Checkpoint 6 — Must pass before proceeding to Milestone 7

```bash
# 1. Build succeeds with zero errors
npm run build
# ✅ No TypeScript errors

# 2. Server starts and all routes respond
npm run start:dev

# In another terminal:
curl http://localhost:3000/triage/health
# ✅ {"status":"ok"}

curl -X POST http://localhost:3000/triage \
  -H "Content-Type: application/json" \
  -d '{"githubUsername":"INVALID USER!!!","githubOauthToken":"token123"}'
# ✅ 400 Bad Request — ValidationPipe rejects the invalid username

curl http://localhost:3000/triage/unknownuser
# ✅ 404 Not Found — correct behavior for a user with no cached triage
```

---

## Milestone 7 — End-to-End Integration Testing

### Goal

Run the full pipeline end-to-end for the first time with real data. Verify cache miss → WebSocket connection → pipeline execution → FINAL event delivery → cache write. Then verify the cache hit path. Then test the major error scenarios from blueprint Section 12.

### Prerequisites

- Milestone 6 checkpoint fully passed
- A real GitHub OAuth token in hand for testing
- Redis running

### Tasks

**Task 7.1 — Full pipeline smoke test (cache miss path)**

You will need a tool that can connect to socket.io. Use the `socket.io-client` package in a test script, or use the browser console on any page that has socket.io loaded. The easiest approach is a Node.js test script.

Create `test-e2e.ts` in the project root:

```typescript
// test-e2e.ts — delete after testing
import 'dotenv/config';
import { io } from 'socket.io-client';

async function runTest(githubUsername: string, oauthToken: string, roleContext: string) {
  console.log(`\n=== Testing with: ${githubUsername} ===`);

  // Step 1: POST /triage
  const postResponse = await fetch('http://localhost:3000/triage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ githubUsername, githubOauthToken: oauthToken, roleContext }),
  }).then(r => r.json());

  console.log('POST /triage response:', JSON.stringify(postResponse, null, 2));

  // Cache HIT path — done
  if (postResponse.status === 'cached') {
    console.log('✅ Cache HIT — scorecard returned directly');
    return postResponse.scorecard;
  }

  // Cache MISS path — connect to WebSocket
  console.log(`Status: processing. Session ID: ${postResponse.sessionId}`);
  console.log('Connecting to WebSocket...');

  return new Promise((resolve, reject) => {
    const socket = io('http://localhost:3000/triage/ws');
    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Timed out waiting for FINAL event after 120 seconds'));
    }, 120_000);

    socket.on('connect', () => {
      console.log('WebSocket connected. Joining session room...');
      socket.emit('join', { sessionId: postResponse.sessionId });
    });

    socket.on('FINAL', (scorecard) => {
      clearTimeout(timeout);
      console.log('✅ FINAL event received:', JSON.stringify(scorecard, null, 2));
      socket.disconnect();
      resolve(scorecard);
    });

    socket.on('ERROR', ({ message }) => {
      clearTimeout(timeout);
      console.error('❌ ERROR event received:', message);
      socket.disconnect();
      reject(new Error(message));
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket connection error: ${err.message}`));
    });
  });
}

async function main() {
  const token = process.env.GITHUB_TEST_TOKEN;
  if (!token) throw new Error('Set GITHUB_TEST_TOKEN in .env');

  // Test 1: Fresh triage (should be a cache miss if never run before)
  await runTest('torvalds', token, 'Senior kernel engineer');

  // Test 2: Same user again (should be a cache hit)
  await runTest('torvalds', token, 'Senior kernel engineer');
}

main().catch(console.error);
```

Install `socket.io-client` as a dev dependency (only needed for this test):

```bash
npm install -D socket.io-client
```

Run (server must be running in another terminal):

```bash
npx ts-node test-e2e.ts
```

This will take 30–120 seconds for the first run (pipeline executing). The second run should return immediately with `status: cached`.

---

**Task 7.2 — Verify the cache entry in Redis**

After the e2e test completes, confirm the cache was written:

```bash
docker exec -it triage-redis redis-cli

# Inside redis-cli:
127.0.0.1:6379> KEYS triage:*
# ✅ Should show: 1) "triage:torvalds"

127.0.0.1:6379> TTL triage:torvalds
# ✅ Should be close to 1209600 (14 days in seconds)

127.0.0.1:6379> GET triage:torvalds
# ✅ Should show the JSON scorecard

127.0.0.1:6379> EXIT
```

---

**Task 7.3 — Test the GET polling fallback**

The `GET /triage/:username` endpoint is the recovery path for clients that miss the WebSocket FINAL event. Test it with the cached user:

```bash
curl http://localhost:3000/triage/torvalds
# ✅ Returns the full TriageScorecardDto JSON

curl http://localhost:3000/triage/TorVaLdS
# ✅ Returns the same result — case-insensitive because .toLowerCase() is called in the controller
```

---

**Task 7.4 — Test error scenarios**

Test each major error scenario from blueprint Section 12. Verify the correct `ERROR` event message is sent.

**Test: Invalid OAuth token**

Modify `test-e2e.ts` to use `'invalid_token_xxx'` as the token for a user that has never been cached. Expect the WebSocket to receive `ERROR` with message `"Invalid or expired GitHub OAuth token"`.

```bash
# Clear the cache first if torvalds is cached
docker exec -it triage-redis redis-cli DEL triage:torvalds
```

**Test: Completely unknown user (no public data)**

Test with a username that has no GitHub history and no public repos. This should trigger `ERROR: "Insufficient public data to evaluate this profile"`.

```bash
# Use a username that is guaranteed to not exist on GitHub
# (very long random string)
```

**Test: Rate limit**

Send 21 `POST /triage` requests within 60 seconds. The 21st should return `429 Too Many Requests`:

```bash
for i in {1..21}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:3000/triage \
    -H "Content-Type: application/json" \
    -d '{"githubUsername":"testuser","githubOauthToken":"token"}'
done
# ✅ First 20 return 200, 21st returns 429
```

### Checkpoint 7 — Must pass before proceeding to Milestone 8

```bash
# 1. Cache miss path works end-to-end
npx ts-node test-e2e.ts  (first run)
# ✅ FINAL event received within 120 seconds
# ✅ scorecard.recommendation is one of the 4 valid values
# ✅ scorecard.cached === false

# 2. Cache hit path works
npx ts-node test-e2e.ts  (second run, same user)
# ✅ POST /triage returns status: "cached" immediately
# ✅ scorecard.cached === true
# ✅ No WebSocket needed

# 3. Redis has the cached entry
docker exec -it triage-redis redis-cli TTL triage:torvalds
# ✅ Returns a number close to 1209600

# 4. Polling fallback works
curl http://localhost:3000/triage/torvalds
# ✅ Returns full scorecard JSON

# 5. Invalid token returns ERROR event (not a crash)
# ✅ WebSocket receives ERROR event, not a server crash (5xx)

# 6. Rate limit enforced
# ✅ 21st request returns 429

# 7. Delete the test files
rm test-e2e.ts
```

---

## Milestone 8 — Security Audit, Rate Limiting & Production Readiness

### Goal

Review the implementation against the security rules in blueprint Section 15 (Developer Rules). The focus is on three risks: OAuth token leakage through logs, numerical scores in LLM output, and proper error surfacing. This milestone is a code review checklist — you are auditing your own implementation.

### Prerequisites

- Milestone 7 checkpoint fully passed

### Tasks

**Task 8.1 — OAuth Token Audit**

The GitHub OAuth token arrives in the request body and is passed through the pipeline. It must never appear in logs, Redis, or error objects. Audit these specific files:

```
Files to audit:
  src/modules/analysis-v3/workflows/triage/triage.controller.ts
  src/modules/analysis-v3/workflows/triage/services/triage.service.ts
  src/modules/analysis-v3/workflows/triage/services/micro-fetch.service.ts
  src/modules/analysis-v3/workflows/triage/services/cache.service.ts
```

Check for:

- Any `this.logger.log(body)` or `this.logger.debug(body)` calls that would print the full request body
- Any `this.logger.error(err)` calls inside `MicroFetchService` — axios errors include the request config, which contains the `Authorization` header with the token. Log only `err.message` or `err.response?.status`, not the full error object.
- Any place where `oauthToken` is passed to `CacheService.set()` — the cached object must be only the `TriageScorecardDto`

Blueprint Section 15 states explicitly: "Do not log `body`, `err.config`, or axios request objects inside `MicroFetchService` — these may include the `Authorization` header containing the token."

If you find any violations, fix them before proceeding.

---

**Task 8.2 — LLM Output Audit**

The most critical product rule is: **no numerical scores, ever** (blueprint Section 15, Golden Rule #1). Review the prompt in `prompt-builder.ts` and the validation in `llm-eval.service.ts`:

- Confirm the prompt says "Never output numerical scores or ratings of any kind" in the CRITICAL RULES section
- Confirm `VALID_RECOMMENDATIONS` in `llm-eval.service.ts` has exactly these four values and no others:
  ```
  'Interview Recommended'
  'Proceed with Caution'
  'Insufficient Public Evidence'
  'Probable Enterprise Developer'
  ```
- Run the LLM test from Milestone 5 one more time and manually check the `executiveSummary` and `observedSignals` fields for any numbers that look like scores (e.g. "82/100", "high confidence score of 7.5"). If you see any, the prompt needs strengthening.

---

**Task 8.3 — Graceful degradation audit**

Open each service and confirm the error handling matches blueprint Section 12:

For `cache.service.ts`:
- `get()` must return `null` on any error (not throw)
- `set()` must return `void` on any error (not throw)

For `macro-fetch.service.ts`:
- All paths outside the happy path must return `{ actorLogin: githubUsername, macroAvailable: false }` (not throw)

For `micro-fetch.service.ts`:
- All paths outside the happy path must return `{ microAvailable: false }` (not throw)

For `triage.service.ts`:
- The outer `try/catch` must call `this.gateway.pushError()` — not rethrow
- If `!macro.macroAvailable && !micro.microAvailable`, must call `pushError` and return early (not call the LLM)

---

**Task 8.4 — Confirm `.env` is never committed**

```bash
git status
# ✅ .env does NOT appear in the file list

cat .gitignore | grep ".env"
# ✅ .env is listed
```

---

**Task 8.5 — Confirm the SLA budget is realistic in your environment**

Run the full pipeline one more time and time each stage using server logs. Blueprint Section 14 defines the budget. Add temporary `performance.now()` timing logs to `triage.service.ts` around the key stages:

```typescript
// Temporary timing in triage.service.ts (remove after measuring)
const t0 = performance.now();
const [macro, micro] = await Promise.all([...]);
const t1 = performance.now();
console.log(`Parallel fetch took: ${((t1 - t0) / 1000).toFixed(2)}s`);

const scorecard = await this.llmEval.evaluate(macro, micro, roleContext);
const t2 = performance.now();
console.log(`LLM eval took: ${((t2 - t1) / 1000).toFixed(2)}s`);
console.log(`Total pipeline: ${((t2 - t0) / 1000).toFixed(2)}s`);
```

Expected ranges (from blueprint Section 14):

| Stage | Expected | Maximum |
|---|---|---|
| Parallel fetch (both sources) | 2–5s | 30s |
| LLM evaluation | 15–40s | 90s |
| Total pipeline | 20–50s | 120s |

If you see the LLM taking consistently over 90 seconds, check the Gemini API status: https://status.cloud.google.com

Remove the timing logs after measuring.

**Task 8.6 — Verify No References to Deleted Module Remain**

After deleting the old `backend/src/modules/analysis/` module, confirm that:

1. `AppModule` no longer imports `AnalysisV2Module` (line 28)
2. `WorkerModule` no longer imports analysis sub-modules (lines 15-20)
3. `QueuesModule` no longer registers an `'analysis'` queue (line 45)
4. The `AnalysisProcessor` in `queues/analysis.processor.ts` is removed
5. Prisma schema models (`AnalysisJob`, `evidence_primitives`, `briefs`, `corpus`) and related enums are dropped via migration
6. All test files referencing the deleted module are removed or updated
7. The controller at `analysis-v2.controller.ts` is removed
8. Any remaining imports from `@prisma/client` for deleted models are cleaned up


### Checkpoint 8 — Final Checklist

Go through each item below. This is your sign-off before declaring the implementation complete.

```
Security:
  ✅ GitHub OAuth token never appears in any log output
  ✅ GitHub OAuth token never written to Redis
  ✅ .env is in .gitignore and not committed
  ✅ axios error objects are not logged whole in MicroFetchService

Correctness:
  ✅ POST /triage returns 200 with sessionId on cache miss
  ✅ POST /triage returns 200 with scorecard on cache hit (no WebSocket)
  ✅ WebSocket FINAL event delivers valid TriageScorecardDto
  ✅ WebSocket ERROR event fires on invalid token, not a crash
  ✅ GET /triage/:username returns cached scorecard
  ✅ GET /triage/:username returns 404 for uncached user
  ✅ Invalid username format returns 400 (DTO validation)

Cache:
  ✅ Redis key format is triage:{lowercased_username}
  ✅ TTL is 1209600 seconds (14 days)
  ✅ cached: true is set on cache hit responses
  ✅ Server continues normally if Redis is unavailable

Rate limiting:
  ✅ 21st request per minute per IP returns 429

LLM rules:
  ✅ No numerical scores in any LLM output field
  ✅ VALID_RECOMMENDATIONS has exactly 4 values
  ✅ LLM JSON parse failure triggers retry once

Performance:
  ✅ Total pipeline completes in < 120 seconds
  ✅ runPipeline() is NOT awaited in the controller
  ✅ Cache write is fire-and-forget (does not block FINAL push)
  ✅ Parallel fetch uses Promise.all()
```

---

## Reference: Error Scenarios Cheat Sheet

This table summarises every error case from blueprint Section 12. Use it during testing and debugging.

| Scenario | What the code should do | Signal to look for |
|---|---|---|
| ClickHouse returns 0 rows | `macroAvailable: false`, pipeline continues | `WARN` log in `MacroFetchService` |
| ClickHouse timeout | `macroAvailable: false`, pipeline continues | `WARN` log with timeout message |
| GitHub GraphQL 401 | `microAvailable: false` (axios throws, caught) | `WARN` log in `MicroFetchService` |
| GitHub GraphQL no repos | `microAvailable: false` | No warn needed — not an error |
| Both macro AND micro unavailable | `pushError("Insufficient public data...")`, return early | `ERROR` WebSocket event |
| LLM returns bad JSON | Retry once with `temperature: 0`, stricter instruction | `WARN` log "LLM returned invalid JSON on first attempt" |
| LLM retry also fails | `pushError("LLM evaluation failed — please retry")` | `ERROR` WebSocket event |
| LLM returns invalid recommendation | Service throws, caught in `runPipeline`, `pushError` | `ERROR` log in `TriageService` |
| Redis unavailable | Log warning, skip cache. Pipeline continues normally | `WARN` log in `CacheService` |
| Client misses FINAL event | Cache was written. Client calls `GET /triage/:username` | N/A — client-side recovery |
| Uncaught exception in pipeline | Outer `try/catch` in `runPipeline`, `pushError` | `ERROR` log in `TriageService` |

---

## Reference: SLA Budget Cheat Sheet

From blueprint Section 14. Every stage must stay within its maximum.

| Stage | Expected | Maximum | File |
|---|---|---|---|
| Cache check (Redis GET) | ~50ms | 200ms | `cache.service.ts` |
| Cache HIT total (HTTP response) | ~100ms total | 500ms | `triage.controller.ts` |
| Initial HTTP 200 (cache miss) | ~100ms | 500ms | `triage.controller.ts` |
| ClickHouse macro fetch | 1–2s | 10s | `macro-fetch.service.ts` |
| GitHub GraphQL micro fetch | 2–5s | 30s | `micro-fetch.service.ts` |
| **Both fetches (parallel)** | **~5s** | **30s** | `triage.service.ts` |
| Gemini Flash LLM eval | 15–40s | 90s | `llm-eval.service.ts` |
| FINAL WebSocket push | ~50ms | 500ms | `triage.gateway.ts` |
| Cache write (fire-and-forget) | — | — | Does not block |
| **Total pipeline (cache miss)** | **~20–50s** | **≤120s** | End-to-end |

---

*This document supplements `w1-architecture.md`. All architectural decisions remain in the blueprint. When in doubt, the blueprint wins. Raise questions before implementing, not after.*

*Implementation Tasks v1.0 — Workflow 1: Interview Decision (Fast-Pass Triage)*