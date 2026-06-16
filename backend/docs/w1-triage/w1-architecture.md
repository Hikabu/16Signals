# Workflow 1: Interview Decision (Fast-Pass Triage)
## Engineering Blueprint v3.0

> **Status:** Ready for Development
> **SLA Target:** Full scorecard delivered ≤120 seconds from request
> **Audience:** Junior Engineers — this document is the single source of truth. If something is not in here, ask before inventing it.
> **Tech Stack:** NestJS (TypeScript). This supersedes v2.0 entirely.

---

## Table of Contents

1. [Overview](#1-overview)
2. [System Architecture](#2-system-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Project Structure](#4-project-structure)
5. [End-to-End Data Flow](#5-end-to-end-data-flow)
6. [Pipeline Stage Reference](#6-pipeline-stage-reference)
   - [Stage 0: Cache Check](#stage-0-cache-check)
   - [Stage 1A: Macro Fetch — ClickHouse](#stage-1a-macro-fetch--clickhouse)
   - [Stage 1B: Micro Fetch — GitHub GraphQL Sniper](#stage-1b-micro-fetch--github-graphql-sniper)
   - [Stage 2: LLM Evaluation](#stage-2-llm-evaluation)
   - [Stage 3: Response Delivery](#stage-3-response-delivery)
7. [API Reference](#7-api-reference)
8. [Data Schemas (DTOs & Interfaces)](#8-data-schemas-dtos--interfaces)
9. [LLM Prompt Specification](#9-llm-prompt-specification)
10. [Triage Scorecard Output Format](#10-triage-scorecard-output-format)
11. [Caching Strategy](#11-caching-strategy)
12. [Error Handling & Fallbacks](#12-error-handling--fallbacks)
13. [Environment Variables](#13-environment-variables)
14. [SLA Budget](#14-sla-budget)
15. [Developer Rules & Common Pitfalls](#15-developer-rules--common-pitfalls)

---

## 1. Overview

Workflow 1 is a **fast-pass triage pipeline** that evaluates a candidate's public GitHub profile and produces a plain-language "Interview Decision" within **120 seconds**. It serves HR and Recruiting teams who need to screen engineering candidates without requiring engineering expertise to interpret the results.

This is implemented as a **NestJS module** (`TriageModule`) that plugs into a parent NestJS application.

### Core Philosophy (Must Read)

These four rules govern every technical decision in this system. When in doubt, refer back to them.

| # | Rule | What It Means in Practice |
|---|---|---|
| 1 | **Evidence over scores** | The system never outputs numbers like "score: 82". It outputs observed facts: "candidate implemented an orderbook in Rust". |
| 2 | **Sub-2-minute SLA** | No operation in the hot path may be slow. No repo cloning. No recursive API traversal. |
| 3 | **Plain language** | A recruiter with no engineering background must be able to read and act on the output without assistance. |
| 4 | **Explicit unknowns** | If data is missing, say so explicitly ("insufficient public evidence"). Never treat missing data as a negative signal. |

### What This System Is NOT

- It is not a scoring system. No numbers.
- It is not a code quality analyzer. It does not read source files.
- It is not a background check. It only reads public data.

---

## 2. System Architecture

### Request Sequence (Read this before writing a single line of code)

There are two distinct paths depending on whether the result is already cached.

**Path A — Cache HIT (result already exists):**

```
Client                  NestJS Backend            Redis
  │                           │                      │
  │── POST /triage ─────────► │                      │
  │                           │── GET cache_key ───► │
  │                           │◄── HIT (scorecard) ──│
  │◄── 200 {scorecard} ───────│
  │   (full result, done)     │
```

On a cache hit the full scorecard is returned **directly in the HTTP response**. No WebSocket is needed. The client renders it immediately.

**Path B — Cache MISS (pipeline runs):**

```
Client              NestJS Backend        Redis     ClickHouse   GitHub GraphQL   Gemini Flash
  │                       │                 │            │              │               │
  │── POST /triage ──────►│                 │            │              │               │
  │                       │── GET cache ───►│            │              │               │
  │                       │◄── MISS ────────│            │              │               │
  │◄── 200 {session_id} ──│  (instant ack)  │            │              │               │
  │                       │                 │            │              │               │
  │── WS /triage/ws/{id}─►│                 │            │              │               │
  │                       │── macro_fetch() ────────────►│              │               │
  │                       │── micro_fetch() ─────────────────────────── ►│              │
  │                       │◄── macro rows ───────────────│              │               │
  │                       │◄── repo+commits ─────────────────────────────│              │
  │                       │── prompt ────────────────────────────────────────────────── ►│
  │                       │◄── JSON scorecard ──────────────────────────────────────────│
  │◄── WS: FINAL ─────────│                 │            │              │               │
  │                       │── SET cache ───►│            │              │               │
```

> **Why two separate paths?** Returning cached results directly in the HTTP response eliminates a race condition where the WebSocket FINAL message could be pushed before the client connects, silently losing the result.

### Component Summary

| Component | Responsibility |
|---|---|
| **NestJS Module (TriageModule)** | Orchestrates the entire pipeline; exposes REST + WebSocket gateway |
| **Redis** | Caches completed triage scorecards for 14 days |
| **ClickHouse (GH Archive)** | Pre-aggregated lifetime GitHub activity stats — no auth required |
| **GitHub GraphQL API v4** | Fetches semantic repo data in a single round-trip using the client's OAuth token |
| **Gemini 1.5 Flash** | Evaluates the combined payload and writes the scorecard |

---

## 3. Tech Stack

This entire system runs as a **single NestJS module**. No microservices, no message queues, no container orchestration required at launch.

| Layer | Technology | Why |
|---|---|---|
| **Runtime** | Node.js 20 + TypeScript | Async-native, strong typing, NestJS ecosystem |
| **Framework** | NestJS 10 | Modules, DI, WebSocket gateway, validation pipe — all built-in |
| **Cache** | Redis 7 via `ioredis` | TTL support, fast, trivial to run locally with Docker |
| **LLM** | Google Gemini 1.5 Flash via `@google/generative-ai` | Fast inference, JSON output mode |
| **Macro data** | ClickHouse HTTP API (GH Archive public endpoint) | No auth, no driver, plain HTTPS query |
| **Micro data** | GitHub GraphQL API v4 | Single-request semantic fetch |
| **HTTP client** | `axios` (via `@nestjs/axios`) | Standard in NestJS; wraps in Observables, easy to convert to Promises |
| **Parallelism** | `Promise.all()` | Built-in; runs macro and micro fetches concurrently |
| **Validation** | `class-validator` + `class-transformer` + NestJS `ValidationPipe` | Decorators on DTOs; consistent with NestJS idioms |
| **Config** | `@nestjs/config` + `.env` | Environment variable loading with type safety |
| **WebSocket** | `@nestjs/websockets` + `socket.io` | Gateway built into NestJS; handles rooms and namespaces |
| **Rate limiting** | `@nestjs/throttler` | One decorator on the controller; no extra middleware setup |

---

## 4. Project Structure

This is a **NestJS module**. Drop the `triage/` folder into your parent app's `src/modules/analysis-v3/workflows/` directory and register `TriageModule` in `AppModule`.

```
src/modules/analysis-v3/workflows/
└── triage/                          # The entire workflow lives here
    │
    ├── triage.module.ts             # Registers all providers; imports HttpModule, ConfigModule
    ├── triage.controller.ts         # POST /triage, GET /triage/:username, GET /health
    ├── triage.gateway.ts            # WebSocket gateway — WS /triage/ws/:sessionId
    │
    ├── services/
    │   ├── triage.service.ts        # Orchestrator: runs the pipeline, calls other services
    │   ├── cache.service.ts         # Redis get/set wrapper
    │   ├── macro-fetch.service.ts   # ClickHouse SQL query and response parsing
    │   ├── micro-fetch.service.ts   # GitHub GraphQL Sniper query and response parsing
    │   └── llm-eval.service.ts      # Prompt builder, Gemini API call, response parser
    │
    ├── dto/
    │   ├── triage-request.dto.ts    # Input validation (username, token, role_context)
    │   └── triage-scorecard.dto.ts  # Output shape returned to client
    │
    └── interfaces/
        ├── macro-stats.interface.ts  # Shape of ClickHouse response after parsing
        └── micro-data.interface.ts   # Shape of GitHub GraphQL response after parsing
```

**Rule:** Do not add files, directories, or abstractions not listed here without explicit approval. Premature abstraction is the primary cause of slow junior development.

### Module Registration

**`triage.module.ts`** — registers everything:

```typescript
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

In your parent `AppModule`, add `TriageModule` to the `imports` array. That's it.

---

## 5. End-to-End Data Flow

This section is a numbered walk-through of exactly what happens from client request to final WebSocket message. Implement this flow step by step.

### Step 1 — Client Submits a Triage Request

Client sends `POST /triage` with:
- `githubUsername` — the candidate's GitHub handle (e.g., `"johndoe"`)
- `githubOauthToken` — the **client's own** GitHub OAuth token (used only for the GraphQL request; never stored)
- `roleContext` — optional string describing the role (e.g., `"Senior Backend Engineer, fintech"`)

### Step 2 — Cache Check

Before any external call, the backend generates a cache key: `triage:{githubUsername}` (the username is lowercased and validated by the DTO at entry).

- **Cache HIT:** Return the cached scorecard **directly in the HTTP `200` response body** with `"status": "cached"`. The pipeline stops here — no sessionId, no WebSocket needed.
- **Cache MISS:** Return HTTP `200` with a `sessionId` (a UUID) and `"status": "processing"`. This is not the result — it is a handle the client uses to open a WebSocket connection. Proceed to Step 3.

### Step 3 — Parallel Fetch

`TriageService` launches both fetches concurrently using `Promise.all()`:

```typescript
const [macro, micro] = await Promise.all([
  this.macroFetchService.fetch(username),
  this.microFetchService.fetch(username, token),
]);
```

- **Macro:** HTTP request to ClickHouse — runs a pre-defined SQL query for lifetime stats. Expected ~1–2 seconds.
- **Micro:** HTTPS POST to `api.github.com/graphql` — runs the single optimized GraphQL Sniper query. Expected ~2–5 seconds.

Total wait = `max(macroTime, microTime)`.

### Step 4 — LLM Evaluation

With both payloads in hand, `LlmEvalService.evaluate()` builds the prompt and calls Gemini 1.5 Flash. This is the longest step (~15–40 seconds). Gemini's SDK is async-native in the JS SDK — no thread-pool workaround needed (unlike the Python version).

### Step 5 — Final Push + Cache Write

`TriageGateway` pushes a `FINAL` event to the client's WebSocket room. Simultaneously (fire-and-forget), `CacheService.set()` writes the scorecard to Redis with a 14-day TTL. The WebSocket connection is then closed by the server.

---

## 6. Pipeline Stage Reference

### Stage 0: Cache Check

**File:** `services/cache.service.ts` — called from `triage.service.ts`

```typescript
// services/cache.service.ts

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
      return null;
    }
  }

  async set(githubUsername: string, scorecard: object): Promise<void> {
    const key = `triage:${githubUsername}`;
    try {
      await this.redis.setex(key, this.TTL_SECONDS, JSON.stringify(scorecard));
    } catch (err) {
      this.logger.warn(`Redis SET failed for key ${key}: ${err}`);
    }
  }
}
```

> **Note on lowercasing:** The username arrives here already lowercased. The DTO normalises it at the entry point (see Section 8). Do not lowercase again here.

**Cache hit behaviour in the controller:**

```typescript
// In triage.controller.ts — POST /triage handler
const cached = await this.cacheService.get(body.githubUsername);
if (cached) {
  return { status: 'cached', scorecard: { ...cached, cached: true } };
}

// Only reach here on cache miss
const sessionId = randomUUID();
// ... kick off background pipeline, return sessionId
```

---

### Stage 1A: Macro Fetch — ClickHouse

**File:** `services/macro-fetch.service.ts`

**What it does:** Queries the GH Archive ClickHouse public instance for pre-aggregated lifetime GitHub statistics. No authentication required.

**ClickHouse HTTP Interface:**

```
POST https://play.clickhouse.com/
Content-Type: application/x-www-form-urlencoded
Body: query=<your SQL>&user=default&password=
```

**SQL Query:**

```sql
SELECT
    actor_login,
    count()                                               AS total_events,
    countIf(type = 'PushEvent')                          AS total_push_events,
    countIf(type = 'PullRequestEvent')                   AS total_pr_events,
    countIf(type = 'IssuesEvent')                        AS total_issue_events,
    min(created_at)                                      AS first_event_at,
    max(created_at)                                      AS last_event_at,
    dateDiff('month', min(created_at), max(created_at))  AS months_active,
    groupUniqArray(50)(repo_name)                        AS repos_touched
FROM github_events
WHERE actor_login = '{githubUsername}'
  AND created_at >= now() - INTERVAL 3 YEAR
GROUP BY actor_login
FORMAT JSON
```

> **`groupUniqArray(50)`** caps results at 50 repo names. The prompt further limits this to 10, but capping at SQL level keeps the network payload small.

**Implementation:**

```typescript
// services/macro-fetch.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { MacroStats } from '../interfaces/macro-stats.interface';

@Injectable()
export class MacroFetchService {
  private readonly logger = new Logger(MacroFetchService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async fetch(githubUsername: string): Promise<MacroStats> {
    const sql = `
      SELECT actor_login, count() AS total_events,
             countIf(type = 'PushEvent') AS total_push_events,
             countIf(type = 'PullRequestEvent') AS total_pr_events,
             countIf(type = 'IssuesEvent') AS total_issue_events,
             min(created_at) AS first_event_at, max(created_at) AS last_event_at,
             dateDiff('month', min(created_at), max(created_at)) AS months_active,
             groupUniqArray(50)(repo_name) AS repos_touched
      FROM github_events
      WHERE actor_login = '${githubUsername}'
        AND created_at >= now() - INTERVAL 3 YEAR
      GROUP BY actor_login FORMAT JSON
    `;

    try {
      const params = new URLSearchParams({
        query: sql,
        user: this.config.get('CLICKHOUSE_USER', 'default'),
        password: this.config.get('CLICKHOUSE_PASSWORD', ''),
      });

      const { data } = await firstValueFrom(
        this.http.post(
          this.config.get('CLICKHOUSE_URL', 'https://play.clickhouse.com'),
          params.toString(),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: this.config.get<number>('MACRO_FETCH_TIMEOUT', 10) * 1000,
          },
        ),
      );

      if (!data?.rows || data.rows === 0) {
        return { actorLogin: githubUsername, macroAvailable: false };
      }

      const row = data.data[0];
      return {
        actorLogin: row.actor_login,
        totalEvents: row.total_events,
        totalPushEvents: row.total_push_events,
        totalPrEvents: row.total_pr_events,
        totalIssueEvents: row.total_issue_events,
        firstEventAt: row.first_event_at,
        lastEventAt: row.last_event_at,
        monthsActive: row.months_active,
        repsTouched: row.repos_touched,
        macroAvailable: true,
      };
    } catch (err) {
      this.logger.warn(`macro_fetch failed for ${githubUsername}: ${err}`);
      return { actorLogin: githubUsername, macroAvailable: false };
    }
  }
}
```

> **On broad `catch`:** Intentional — ensures graceful degradation if ClickHouse is slow or unreachable. The `logger.warn` is critical: always check logs before assuming it's a data issue. A `TypeError` in your parsing code looks identical to a timeout without the log.

---

### Stage 1B: Micro Fetch — GitHub GraphQL Sniper

**File:** `services/micro-fetch.service.ts`

**What it does:** Fires exactly **one** GraphQL query to GitHub's API v4. Fetches the candidate's most recently pushed-to public repository, including its README, dependency manifest, and last 60 commit messages.

**The GraphQL Query (store as a module-level constant):**

```graphql
query GithubSniper($login: String!) {
  user(login: $login) {
    name
    bio
    company
    createdAt
    repositories(
      first: 1
      ownerAffiliations: [OWNER]
      privacy: PUBLIC
      orderBy: { field: PUSHED_AT, direction: DESC }
    ) {
      nodes {
        name
        description
        primaryLanguage { name }
        stargazerCount
        forkCount
        pushedAt

        readme: object(expression: "HEAD:README.md") {
          ... on Blob { text }
        }
        readmeLower: object(expression: "HEAD:readme.md") {
          ... on Blob { text }
        }

        packageJson:     object(expression: "HEAD:package.json")     { ... on Blob { text } }
        requirementsTxt: object(expression: "HEAD:requirements.txt") { ... on Blob { text } }
        goMod:           object(expression: "HEAD:go.mod")           { ... on Blob { text } }
        cargoToml:       object(expression: "HEAD:Cargo.toml")       { ... on Blob { text } }
        gemfile:         object(expression: "HEAD:Gemfile")          { ... on Blob { text } }

        defaultBranchRef {
          target {
            ... on Commit {
              history(first: 60) {
                nodes { messageHeadline }
              }
            }
          }
        }
      }
    }
  }
}
```

> Only `messageHeadline` is fetched per commit. Do not add `committedDate`, `additions`, or `deletions` — they are unused and waste bytes.

**Implementation:**

```typescript
// services/micro-fetch.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { MicroData } from '../interfaces/micro-data.interface';

const GRAPHQL_QUERY = `...`; // paste the query above

const MANIFEST_KEYS: Record<string, string> = {
  packageJson: 'package.json',
  requirementsTxt: 'requirements.txt',
  goMod: 'go.mod',
  cargoToml: 'Cargo.toml',
  gemfile: 'Gemfile',
};

@Injectable()
export class MicroFetchService {
  private readonly logger = new Logger(MicroFetchService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async fetch(githubUsername: string, oauthToken: string): Promise<MicroData> {
    try {
      const { data } = await firstValueFrom(
        this.http.post(
          'https://api.github.com/graphql',
          { query: GRAPHQL_QUERY, variables: { login: githubUsername } },
          {
            headers: {
              Authorization: `bearer ${oauthToken}`,
              'Content-Type': 'application/json',
            },
            timeout: this.config.get<number>('MICRO_FETCH_TIMEOUT', 30) * 1000,
          },
        ),
      );

      const user = data?.data?.user;
      if (!user) return { microAvailable: false };

      const nodes: any[] = user.repositories?.nodes ?? [];

      if (nodes.length === 0) {
        // User exists but has no public repos — capture profile metadata only
        return {
          userName: user.name,
          userBio: user.bio,
          userCompany: user.company,
          accountCreatedAt: user.createdAt,
          microAvailable: false,
        };
      }

      const repo = nodes[0];

      const readmeText =
        repo.readme?.text ?? repo.readmeLower?.text ?? '';

      let manifestType: string | undefined;
      let manifestContent: string | undefined;
      for (const key of Object.keys(MANIFEST_KEYS)) {
        const val = repo[key]?.text;
        if (val) {
          manifestType = MANIFEST_KEYS[key];
          manifestContent = val.slice(0, 1000);
          break;
        }
      }

      const commitMessages: string[] =
        repo.defaultBranchRef?.target?.history?.nodes
          ?.map((c: any) => c.messageHeadline)
          .filter(Boolean) ?? [];

      return {
        repoName: repo.name,
        repoDescription: repo.description,
        primaryLanguage: repo.primaryLanguage?.name,
        stars: repo.stargazerCount ?? 0,
        forks: repo.forkCount ?? 0,
        pushedAt: repo.pushedAt,
        readmeExcerpt: readmeText ? readmeText.slice(0, 2000) : undefined,
        manifestType,
        manifestContent,
        recentCommits: commitMessages,
        userName: user.name,
        userBio: user.bio,
        userCompany: user.company,
        accountCreatedAt: user.createdAt,
        microAvailable: true,
      };
    } catch (err) {
      this.logger.warn(`micro_fetch failed for ${githubUsername}: ${err}`);
      return { microAvailable: false };
    }
  }
}
```

> **GitHub 401 handling edge case:** Axios throws on non-2xx responses. A 401 from GitHub lands in the `catch` block and returns `{ microAvailable: false }`. The outer pipeline checks this and pushes an `ERROR` with a specific message if the token is bad. See Section 12 for the full error table.

---

### Stage 2: LLM Evaluation

**File:** `services/llm-eval.service.ts`

**What it does:** Assembles the macro and micro payloads into the prompt defined in Section 9, calls Gemini 1.5 Flash, parses the JSON response, and returns a `TriageScorecard`.

```typescript
// services/llm-eval.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenerativeAI,
  GenerativeModel,
} from '@google/generative-ai';
import { MacroStats } from '../interfaces/macro-stats.interface';
import { MicroData } from '../interfaces/micro-data.interface';
import { TriageScorecardDto } from '../dto/triage-scorecard.dto';
import { buildPrompt } from './prompt-builder'; // see Section 9

const VALID_RECOMMENDATIONS = [
  'Interview Recommended',
  'Proceed with Caution',
  'Insufficient Public Evidence',
  'Probable Enterprise Developer',
] as const;

@Injectable()
export class LlmEvalService {
  private readonly logger = new Logger(LlmEvalService.name);
  private readonly model: GenerativeModel;

  constructor(private readonly config: ConfigService) {
    const genAI = new GoogleGenerativeAI(
      this.config.getOrThrow<string>('GEMINI_API_KEY'),
    );
    this.model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  async evaluate(
    macro: MacroStats,
    micro: MicroData,
    roleContext: string,
  ): Promise<TriageScorecardDto> {
    const prompt = buildPrompt(macro, micro, roleContext);

    const generationConfig = { temperature: 0.1, responseMimeType: 'application/json' };

    let parsed: any;

    try {
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig,
      });
      parsed = JSON.parse(result.response.text());
    } catch (err) {
      this.logger.warn('LLM returned invalid JSON on first attempt; retrying once.');
      const retry = await this.model.generateContent({
        contents: [
          { role: 'user', parts: [{ text: prompt + '\n\nIMPORTANT: Return ONLY a valid JSON object. No markdown.' }] },
        ],
        generationConfig: { ...generationConfig, temperature: 0 },
      });
      // If this throws, the caller catches it and sends ERROR to the client
      parsed = JSON.parse(retry.response.text());
    }

    if (!VALID_RECOMMENDATIONS.includes(parsed.recommendation)) {
      throw new Error(`LLM returned invalid recommendation: "${parsed.recommendation}"`);
    }

    return {
      githubUsername: macro.actorLogin,
      recommendation: parsed.recommendation,
      executiveSummary: parsed.executive_summary,
      observedSignals: parsed.observed_signals ?? [],
      gaps: parsed.gaps ?? ['No gaps identified in available public data'],
      enterpriseFlag: parsed.enterprise_flag ?? false,
      macroAvailable: macro.macroAvailable,
      microAvailable: micro.microAvailable,
      cached: false,
      evaluatedAt: new Date().toISOString(),
    };
  }
}
```

> **`temperature: 0.1`** keeps output consistent and structured. Do not raise this value.

> **No `asyncio.to_thread()` needed:** Unlike the Python Gemini SDK, the JavaScript `@google/generative-ai` SDK is fully async. `generateContent()` returns a Promise — just `await` it directly.

---

### Stage 3: Response Delivery

**File:** `triage.gateway.ts` + `services/triage.service.ts`

**WebSocket Gateway:**

```typescript
// triage.gateway.ts

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ namespace: '/triage/ws' })
export class TriageGateway {
  @WebSocketServer() server: Server;

  // Client connects and joins its session room immediately
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

> **Why socket.io rooms instead of a manual `active_sessions` dict?** The original Python blueprint stored WebSocket connections in a plain dict — this breaks under multiple Node.js workers. Socket.io rooms are the idiomatic NestJS solution: the gateway manages connections, and you broadcast to a named room. It works correctly with a single worker and can be upgraded to multi-worker with `socket.io-redis-adapter` later without changing the gateway code.

**Orchestrator — full pipeline:**

```typescript
// services/triage.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { TriageGateway } from '../triage.gateway';
import { CacheService } from './cache.service';
import { MacroFetchService } from './macro-fetch.service';
import { MicroFetchService } from './micro-fetch.service';
import { LlmEvalService } from './llm-eval.service';

@Injectable()
export class TriageService {
  private readonly logger = new Logger(TriageService.name);

  constructor(
    private readonly gateway: TriageGateway,
    private readonly cache: CacheService,
    private readonly macroFetch: MacroFetchService,
    private readonly microFetch: MicroFetchService,
    private readonly llmEval: LlmEvalService,
  ) {}

  // Called by the controller as a fire-and-forget (no await at call site)
  async runPipeline(
    sessionId: string,
    username: string,
    token: string,
    roleContext: string,
  ): Promise<void> {
    try {
      const [macro, micro] = await Promise.all([
        this.macroFetch.fetch(username),
        this.microFetch.fetch(username, token),
      ]);

      if (!macro.macroAvailable && !micro.microAvailable) {
        this.gateway.pushError(sessionId, 'Insufficient public data to evaluate this profile');
        return;
      }

      const scorecard = await this.llmEval.evaluate(macro, micro, roleContext);

      this.gateway.pushFinal(sessionId, scorecard);

      // Fire-and-forget cache write — does not block FINAL push
      this.cache.set(username, scorecard).catch((err) =>
        this.logger.warn(`Cache write failed for ${username}: ${err}`),
      );
    } catch (err) {
      this.logger.error(`Pipeline crashed for session ${sessionId}`, err);
      this.gateway.pushError(sessionId, 'An unexpected error occurred. Please retry.');
    }
  }
}
```

**Controller:**

```typescript
// triage.controller.ts

import {
  Controller, Post, Get, Body, Param, NotFoundException, UseGuards
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import { TriageRequestDto } from './dto/triage-request.dto';
import { TriageService } from './services/triage.service';
import { CacheService } from './services/cache.service';

@Controller('triage')
export class TriageController {
  constructor(
    private readonly triageService: TriageService,
    private readonly cacheService: CacheService,
  ) {}

  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async postTriage(@Body() body: TriageRequestDto) {
    const cached = await this.cacheService.get(body.githubUsername);
    if (cached) {
      return { status: 'cached', scorecard: { ...cached, cached: true } };
    }

    const sessionId = randomUUID();

    // Fire-and-forget — do NOT await
    this.triageService.runPipeline(
      sessionId,
      body.githubUsername,
      body.githubOauthToken,
      body.roleContext ?? 'General Software Engineer',
    );

    return {
      sessionId,
      status: 'processing',
      message: `Connect to /triage/ws and emit join({ sessionId }) to receive updates`,
    };
  }

  @Get(':username')
  async getTriage(@Param('username') username: string) {
    const cached = await this.cacheService.get(username.toLowerCase());
    if (!cached) {
      throw new NotFoundException(
        'No completed triage for this user. Use POST /triage to start evaluation.',
      );
    }
    return cached;
  }
}
```

---

## 7. API Reference

### `GET /triage/health`

Confirms the server is running.

**Response `200 OK`:**
```json
{ "status": "ok" }
```

---

### `POST /triage`

Initiates a triage evaluation.

**Request Body:**
```json
{
  "githubUsername": "johndoe",
  "githubOauthToken": "gho_xxxxxxxxxxxx",
  "roleContext": "Senior Backend Engineer, fintech trading systems"
}
```

**Response `200 OK` — Cache MISS:**
```json
{
  "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "processing",
  "message": "Connect to /triage/ws and emit join({ sessionId }) to receive updates"
}
```

**Response `200 OK` — Cache HIT:**
```json
{
  "status": "cached",
  "scorecard": {
    "githubUsername": "johndoe",
    "recommendation": "Interview Recommended",
    "executiveSummary": "...",
    "observedSignals": ["..."],
    "gaps": ["..."],
    "enterpriseFlag": false,
    "macroAvailable": true,
    "microAvailable": true,
    "cached": true,
    "evaluatedAt": "2024-01-15T10:30:00Z"
  }
}
```

**Response `400 Bad Request`:** Validation error — invalid username format, missing required fields.

**Response `429 Too Many Requests`:** Rate limit exceeded (20 requests/minute per IP).

---

### `GET /triage/:username`

Polling fallback — returns a completed scorecard from cache. Useful when a client misses the WebSocket FINAL event.

**Response `200 OK`:** Full `TriageScorecard` JSON object.

**Response `404 Not Found`:**
```json
{
  "message": "No completed triage for this user. Use POST /triage to start evaluation."
}
```

---

### `WebSocket /triage/ws` (socket.io namespace)

Live event stream for a triage session. Only used on cache miss.

**Client flow:**
1. Connect to the `/triage/ws` namespace.
2. Immediately emit a `join` event with `{ sessionId }`.
3. Listen for `FINAL` or `ERROR` events.

**Events sent by server:**

| Event | Trigger | Payload |
|---|---|---|
| `FINAL` | LLM evaluation completes | Full `TriageScorecard` object |
| `ERROR` | Any unrecoverable failure | `{ "message": "Human-readable description" }` |

**Example Client (JavaScript/TypeScript):**

```typescript
import { io } from 'socket.io-client';

async function runTriage(githubUsername: string, githubOauthToken: string, roleContext: string) {
  const response = await fetch('/triage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ githubUsername, githubOauthToken, roleContext }),
  }).then(r => r.json());

  // Cache hit — result is already here
  if (response.status === 'cached') {
    renderScorecard(response.scorecard);
    return;
  }

  // Cache miss — open WebSocket and wait for FINAL
  const socket = io('/triage/ws');

  socket.on('connect', () => {
    socket.emit('join', { sessionId: response.sessionId });
  });

  socket.on('FINAL', (scorecard) => {
    renderScorecard(scorecard);
    socket.disconnect();
  });

  socket.on('ERROR', ({ message }) => {
    showError(message);
    socket.disconnect();
  });
}
```

> **WebSocket timing:** Connect and emit `join` immediately after receiving the `sessionId`. The pipeline runs in the background — if `FINAL` fires before the client joins the room, the event is missed. The client can recover by calling `GET /triage/:username`.

---

## 8. Data Schemas (DTOs & Interfaces)

### DTOs (Validated Input/Output)

**File: `dto/triage-request.dto.ts`**

```typescript
import { IsString, IsOptional, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class TriageRequestDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9\-]+$/, {
    message: 'Invalid GitHub username. Only letters, numbers, and hyphens are allowed.',
  })
  @Transform(({ value }) => value.toLowerCase()) // Normalise at entry point — only here, nowhere else
  githubUsername: string;

  @IsString()
  githubOauthToken: string;

  @IsOptional()
  @IsString()
  roleContext?: string;
}
```

> **Enable the global `ValidationPipe`** in your `main.ts`: `app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))`. The `transform: true` option is what makes `@Transform` run. Without it, `githubUsername` will not be lowercased.

**File: `dto/triage-scorecard.dto.ts`**

```typescript
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
  evaluatedAt: string; // ISO 8601
}
```

### Interfaces (Internal Pipeline Shapes)

**File: `interfaces/macro-stats.interface.ts`**

```typescript
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

**File: `interfaces/micro-data.interface.ts`**

```typescript
export interface MicroData {
  repoName?: string;
  repoDescription?: string;
  primaryLanguage?: string;
  stars?: number;
  forks?: number;
  pushedAt?: string;
  readmeExcerpt?: string;       // max 2000 chars
  manifestType?: string;        // e.g. "package.json"
  manifestContent?: string;     // max 1000 chars
  recentCommits?: string[];     // commit headlines only
  userName?: string;
  userBio?: string;
  userCompany?: string;
  accountCreatedAt?: string;
  microAvailable: boolean;
}
```

---

## 9. LLM Prompt Specification

**File: `services/prompt-builder.ts`** — exported as a pure function, no DI needed.

```typescript
// services/prompt-builder.ts

import { MacroStats } from '../interfaces/macro-stats.interface';
import { MicroData } from '../interfaces/micro-data.interface';

export function buildPrompt(
  macro: MacroStats,
  micro: MicroData,
  roleContext: string,
): string {
  const reposList = macro.repsTouched?.slice(0, 10).join(', ') || 'None found';
  const commitsText =
    micro.recentCommits?.slice(0, 60).map(c => `- ${c}`).join('\n') ||
    'None available';

  return `
You are a senior engineering hiring assistant. Your job is to evaluate a software engineer candidate
using only their public GitHub data and produce a structured triage scorecard for HR and Recruiters.

CRITICAL RULES — follow these without exception:
1. Never output numerical scores or ratings of any kind.
2. Never infer a negative from absence of data. Label gaps explicitly with the phrase "insufficient public evidence".
3. Use ONLY the data provided below. Do not speculate or fabricate.
4. Write in plain English a recruiter with no engineering background can understand.
5. Return ONLY a valid JSON object. No preamble, no explanation, no markdown fences.

---

CANDIDATE: ${macro.actorLogin}
ROLE BEING EVALUATED FOR: ${roleContext}

MACRO DATA (Lifetime GitHub Activity — last 3 years):
- Months active: ${macro.monthsActive ?? 0}
- Push events: ${macro.totalPushEvents ?? 0}
- Pull request events: ${macro.totalPrEvents ?? 0}
- Issue events: ${macro.totalIssueEvents ?? 0}
- Repositories touched: ${reposList}
- Data available: ${macro.macroAvailable}

MICRO DATA (Most Recently Active Repo: ${micro.repoName ?? 'N/A'}):
- Primary language: ${micro.primaryLanguage ?? 'Unknown'}
- Repo description: ${micro.repoDescription ?? 'None'}
- Stars: ${micro.stars ?? 0} | Forks: ${micro.forks ?? 0}
- User bio: ${micro.userBio ?? 'None'}
- User company: ${micro.userCompany ?? 'None'}
- GitHub account created: ${micro.accountCreatedAt ?? 'Unknown'}

README excerpt (may be truncated):
${micro.readmeExcerpt ?? 'Not available'}

Dependency manifest (${micro.manifestType ?? 'none found'}):
${micro.manifestContent ?? 'Not available'}

Last commit messages:
${commitsText}

---

ENTERPRISE DEVELOPER HEURISTIC:
If macro data is absent or sparse (total_push_events < 50) AND the account is older than 3 years
OR the user lists a company affiliation, set "enterprise_flag" to true and use recommendation
"Probable Enterprise Developer". This is NOT a negative signal — state that explicitly.

---

OUTPUT — return exactly this JSON structure, nothing else:

{
  "recommendation": "<exactly one of: Interview Recommended | Proceed with Caution | Insufficient Public Evidence | Probable Enterprise Developer>",
  "executive_summary": "<3-5 sentences. Reference specific observed artifacts. Plain English. No scores.>",
  "observed_signals": [
    "<concrete observed evidence, e.g.: Recent commits reference RAFT consensus, indicating distributed systems experience>"
  ],
  "gaps": [
    "<explicit gap, e.g.: No public collaboration on external open-source projects — insufficient public evidence on teamwork patterns>"
  ],
  "enterprise_flag": <true | false>
}

IMPORTANT: "gaps" must always have at least one entry.
If no genuine gaps exist, use: "No significant gaps identified in the available public data."
`.trim();
}
```

---

## 10. Triage Scorecard Output Format

### Layer 0 — Recommendation

A single string. Exactly one of four values. The service throws if the LLM returns anything else.

| Value | When to Use |
|---|---|
| `Interview Recommended` | Strong, specific public signal that aligns with the role |
| `Proceed with Caution` | Mixed or thin signal; evidence is present but incomplete |
| `Insufficient Public Evidence` | Very low or no public activity; cannot determine suitability |
| `Probable Enterprise Developer` | Low public volume but account age/company affiliation suggests private enterprise work |

### Layer 1 — Executive Summary

A 3–5 sentence paragraph. Rules:

- Must reference specific observed artifacts (actual commit messages, repo names, technologies from README or manifest)
- Must not say "the candidate scored X" or "high performance in Y"
- Must not speculate beyond what is in the data
- Must be readable by a recruiter with no engineering background

**Good example:**
> *"Sarah's most recently active repository is a Python-based options pricing engine with 43 commits over the past three months. Commit messages reference Black-Scholes model implementation and delta-gamma hedging, indicating direct experience with quantitative finance systems. The requirements.txt confirms use of NumPy and SciPy. No public collaborative contributions were found on external projects, though this is labelled as insufficient public evidence rather than a negative signal."*

**Bad example (do not produce this):**
> *"The candidate scored 82/100 on technical depth. GitHub activity is above average. Recommended."*

### Enterprise Fallback

If `enterpriseFlag: true`, the executive summary must include a sentence like:

> *"This profile shows limited public repository activity; however, the GitHub account is [X] years old and lists [Company Name] as the employer. This pattern is consistent with engineers who work primarily in private enterprise codebases. This is not a negative signal and is flagged accordingly."*

### Observed Signals vs. Gaps

| Field | Purpose | Format |
|---|---|---|
| `observedSignals` | Positive or neutral specific evidence | Past-tense declarative sentences |
| `gaps` | Explicitly labelled unknowns | Always use the phrase "insufficient public evidence" for missing data |

---

## 11. Caching Strategy

| Property | Value |
|---|---|
| Backend | Redis 7.x via `ioredis` |
| Key format | `triage:{githubUsername}` (always lowercased — enforced by DTO, not in `CacheService`) |
| TTL | 14 days (1,209,600 seconds) |
| Value format | JSON-serialised `TriageScorecardDto` |
| Cache hit behaviour | Return full scorecard directly in `POST /triage` HTTP response — no pipeline, no WebSocket |
| Cache miss behaviour | Run full pipeline, write result to cache after LLM completes |

**What is cached:** Only the final `TriageScorecardDto`.

**What is never cached:** The OAuth token, raw ClickHouse response, raw GraphQL response, or the LLM prompt.

**On cache hit, set `cached: true`** before returning so the client knows the result came from cache.

**Cache invalidation:** Not implemented. TTL expiry is the only mechanism. If a re-evaluation is required before 14 days, delete the key directly in Redis via `DEL triage:{username}`.

**Redis unavailable:** Log a warning. Skip cache check and cache write. Pipeline continues normally. Do not return an error to the client.

---

## 12. Error Handling & Fallbacks

Every service call is wrapped in `try/catch` with logging. The pipeline degrades gracefully.

| Scenario | Behaviour |
|---|---|
| ClickHouse returns 0 rows | Set `macroAvailable: false`; continue with micro-only LLM evaluation |
| ClickHouse times out or errors | Set `macroAvailable: false`; continue. Warning logged. |
| GitHub GraphQL returns no repos | Set `microAvailable: false`; continue with macro-only LLM evaluation |
| GitHub GraphQL returns 401 | Axios throws; caught; `microAvailable: false`. Gateway pushes `ERROR`: `"Invalid or expired GitHub OAuth token"` |
| GitHub GraphQL times out | Set `microAvailable: false`; continue. Warning logged. |
| Both macro and micro unavailable | Gateway pushes `ERROR`: `"Insufficient public data to evaluate this profile"`. Do not call LLM. |
| LLM returns invalid JSON | Retry once. If retry also fails, gateway pushes `ERROR`: `"LLM evaluation failed — please retry"` |
| LLM returns invalid `recommendation` | Service throws; caught by pipeline; gateway pushes `ERROR`. |
| WebSocket client disconnects before FINAL | Background pipeline continues; result still written to cache. Client can call `GET /triage/:username` to retrieve it. |
| Redis unavailable | Log warning. Skip cache check and write. Pipeline continues normally. |
| Uncaught exception anywhere in pipeline | Caught by `try/catch` in `runPipeline`. Gateway pushes `ERROR`. |

**Error socket.io event format:**
```json
{
  "message": "Human-readable description of what went wrong"
}
```

---

## 13. Environment Variables

**File: `.env.example`** (copy to `.env` and fill in values before running)

```env
# ── LLM ──────────────────────────────────────────────────
GEMINI_API_KEY=your_gemini_api_key_here

# ── Redis ─────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ── ClickHouse (GH Archive) ────────────────────────────────
# Default points to the public ClickHouse playground.
# Replace with a self-hosted instance if available.
CLICKHOUSE_URL=https://play.clickhouse.com
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=

# ── Timeouts (seconds) ────────────────────────────────────
MACRO_FETCH_TIMEOUT=10
MICRO_FETCH_TIMEOUT=30
LLM_TIMEOUT=90

# ── Rate Limiting ─────────────────────────────────────────
# Max POST /triage requests per minute per IP address.
RATE_LIMIT_PER_MINUTE=20
```

**`ConfigService` usage pattern:**

Use `this.config.get<number>('MACRO_FETCH_TIMEOUT', 10)` everywhere. The second argument is the default — this prevents crashes if a value is missing from `.env` during local development.

Use `this.config.getOrThrow<string>('GEMINI_API_KEY')` for values that have no safe default — the app should fail fast on startup if the API key is missing.

---

## 14. SLA Budget

**Total target: ≤120 seconds from `POST /triage` to `FINAL` WebSocket event**

| Stage | Expected | Maximum Allowed | Notes |
|---|---|---|---|
| Cache check | ~50ms | 200ms | Redis local or nearby |
| Cache hit response | ~100ms total | 500ms | Full scorecard in POST response — done |
| Initial HTTP `200` response (miss) | ~100ms | 500ms | Instant ack before any fetching |
| Macro fetch (ClickHouse) | ~1–2s | 10s | Public endpoint; simple aggregation query |
| Micro fetch (GitHub GraphQL) | ~2–5s | 30s | Single-round-trip; uses OAuth token |
| Stage 1 total (parallel) | ~5s | 30s | `= max(macroTime, microTime)` |
| LLM evaluation (Gemini Flash) | ~15–40s | 90s | Main variable; fully async in JS SDK |
| FINAL push | ~50ms | 500ms | socket.io room emit |
| Cache write (fire-and-forget) | — | — | Does not block FINAL push |
| **Total (cache miss)** | **~20–50s** | **≤120s** | Well within SLA |

---

## 15. Developer Rules & Common Pitfalls

### The Golden Rules

These are non-negotiable. If a PR violates any of these, it will be rejected.

1. **No scores, ever.** The prompt, the schema, the response — none of it may contain a numerical rating.
2. **No repo cloning, ever.** All data comes from API responses only.
3. **One GraphQL request.** Do not add more GitHub API calls. The Sniper is a single query.
4. **Absence is not a negative.** Missing data → label it as "insufficient public evidence". Never penalise.
5. **The OAuth token is ephemeral.** It lives in memory for one request only. Never log it, cache it, or write it anywhere.
6. **Cache the output, not the inputs.** Only the final `TriageScorecardDto` is stored in Redis.

### Running Locally

```bash
# 1. Install Node dependencies
npm install

# 2. Start Redis
docker run -d -p 6379:6379 redis:7

# 3. Configure environment
cp .env.example .env
# Fill in GEMINI_API_KEY in .env

# 4. Run the server in watch mode
npm run start:dev

# 5. Verify the server is running
curl http://localhost:3000/triage/health
# Expected: {"status":"ok"}
```

> **Always hit `/triage/health` first.** If it doesn't respond, nothing else will work. Check your terminal for startup errors.

### Common Pitfalls

**Enable `transform: true` on the global `ValidationPipe`.**
Without `transform: true`, `@Transform` decorators on DTOs (specifically the lowercase normalisation on `githubUsername`) do not run. Your cache keys will be inconsistent and the ClickHouse query may return zero rows for valid users. Set `app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))` in `main.ts`.

**`whitelist: true` strips unknown properties.**
The `whitelist: true` option silently removes any properties not declared in the DTO. This is intentional security hygiene — the OAuth token is declared in the DTO and will pass through. Don't add `forbidNonWhitelisted: true` unless you want requests with extra fields to throw a 400.

**The JS Gemini SDK is async — no thread-pool workaround needed.**
Unlike the Python SDK which required `asyncio.to_thread()`, the JavaScript `@google/generative-ai` SDK's `generateContent()` returns a Promise. Just `await` it. Don't look for or add a thread-pool equivalent — it's unnecessary and would be an error.

**`Promise.all()` is fail-fast.**
`Promise.all([macro_fetch(), micro_fetch()])` rejects immediately if either promise rejects. Both fetch services catch all errors internally and return a degraded object (`macroAvailable: false` or `microAvailable: false`) — they never throw. If you add a new service call to the `Promise.all` array, make sure it also catches internally.

**Silent exceptions hide bugs — always check the logs.**
Both `MacroFetchService` and `MicroFetchService` return a degraded fallback on any exception. This means a `TypeError` in your parsing code looks identical to a genuine ClickHouse timeout. If `macroAvailable` or `microAvailable` is always `false` in local testing, run the server with `LOG_LEVEL=debug` and look for `WARN` lines with stack traces.

**`runPipeline` must never be awaited in the controller.**
The controller calls `this.triageService.runPipeline(...)` without `await`. This is intentional — the pipeline runs in the background while the `POST /triage` response (`sessionId`) is returned immediately. If you add `await`, the HTTP request will hang for up to 120 seconds before responding. This is the most common mistake.

**socket.io rooms vs. `active_sessions` dict.**
Do not replace the room-based approach with a manual `Map<string, Socket>`. Rooms work correctly when the socket.io server is in the same process. They can be upgraded to multi-worker support with `socket.io-redis-adapter` without changing the gateway code. A manual map is per-process only and cannot be upgraded.

**WebSocket timing on cache miss.**
The client must connect to the WebSocket namespace and emit `join` before the pipeline pushes `FINAL`. Open the connection and join the room immediately after receiving the `sessionId`. If the client is slow and `FINAL` has already been emitted, the event is missed. The client recovers by calling `GET /triage/:username`.

**`githubUsername` case sensitivity.**
GitHub usernames are case-insensitive. The DTO `@Transform` lowercases the username at entry. All downstream code receives an already-lowercased string. Do not lowercase again in any service file — doing it in two places is how inconsistencies happen.

**GraphQL null safety.**
If a user has no public repositories, `repositories.nodes` is an empty array `[]`, not `null`. Always check `nodes.length > 0` before accessing `nodes[0]`. The optional chaining (`?.`) operator is your friend throughout the micro-fetch response parsing.

**Don't log the OAuth token.**
The GitHub OAuth token arrives in the request body. Do not log `body`, `err.config`, or axios request objects inside `MicroFetchService` — these may include the `Authorization` header containing the token. If you need to debug, log only `githubUsername` and the HTTP status code.

**LLM JSON parsing.**
Even with `responseMimeType: 'application/json'` set, always wrap `JSON.parse()` in try/catch. The one-retry pattern is already in `LlmEvalService` — do not remove it.

---

### 16. Legacy Code References

This module replaces the previous `backend/src/modules/analysis/` module entirely. The following patterns from the legacy module are documented here for reference during development:

__16.1 LLM Error Recovery (Legacy: `llm/llm-integration.service.ts`)__ The old module implemented a robust three-layer LLM error recovery pattern:

1. `chatCompletionWithRetry()` — exponential backoff retry (up to 2 retries, 45s max delay)
2. Fallback default objects (`defaultWave3BatchOutput()`, `defaultNarrativeOutput()`) — guarantee the pipeline never crashes on LLM failure
3. Multi-format JSON parsing — handles markdown fences, regex extraction, field-by-field validation

The triage module implements a simpler retry-once in `LlmEvalService`. If production usage shows higher failure rates, reference the legacy code for a more advanced recovery strategy.

__16.2 Circuit Breaker Pattern (Legacy: `data-collector/circuit-breaker.service.ts`)__ If GitHub API rate limiting (5000 points/hour) becomes a bottleneck in the micro-fetch or any future GitHub API calls, the legacy circuit breaker monitors `x-ratelimit-remaining` headers and aborts early when remaining drops below threshold. This pattern can be adapted for the triage module's `MicroFetchService`.

__16.3 GitHub API Authentication & Pagination (Legacy: `data-collector/group-collectors/`)__ The legacy group collectors demonstrate GitHub API patterns using Octokit (the official GitHub SDK). While the triage module uses raw GraphQL + ClickHouse, any future expansion that requires:

- Paginating through user repos, commits, or PRs
- Handling GitHub secondary rate limits
- Using GitHub App installation tokens

...should reference the legacy collectors' patterns, particularly `GroupBCollector` (repository inventory) and `GroupCCollector` (commit intelligence).




*All implementation decisions must trace back to a section of this document.*