GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

## **GITINTEL HR PLATFORM** 

## Backend Technical Specification 

v1.0 · May 2026 · Engineering — Backend Platform Team 

|**3 Tiers**|**3 Modes**|**7 Primitives**|**4 Phases**|
|---|---|---|---|
|Starter · Scale-up ·|Light · Deep · CV|Canonical Assessment|Phased Feature Rollout|
|Enterprise|Verifier|Dimensions||



_CONFIDENTIAL — For internal backend engineering use only. This document specifies the complete backend architecture, data models, API contracts, job pipeline, billing engine, and integration layer for the GitIntel HR Platform._ 

© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

## **Table of Contents** 

© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

## **1. Executive Summary & Final Product Goal** 

GitIntel HR Platform is a multi-tenant SaaS product that delivers evidence-based GitHub profile analysis to engineering hiring teams. It transforms the GitHub Engineering Intelligence System analyser engine into a commercially distributed product, accessible through a tiered subscription model with usage-based billing overage. 

## **1.1 Final Goal Statement** 

The platform's final goal is a fully integrated, compliance-ready, multi-tenant hiring intelligence layer that can be adopted frictionlessly at the top of any engineering hiring funnel — operating alongside, not replacing, existing ATS systems. It targets three buyer segments in sequence: 

- Startup CTOs and Heads of Engineering (Series A–C) who purchase on credit card with no procurement cycle. 

- Scale-up TA teams (Series D+) who need ATS webhook integration and batch processing. 

- Enterprises and RPO firms who need SSO, HRIS connectors, GDPR-certified data processing agreements, white-label distribution, and annual contracts. 

## **1.2 Platform Capabilities at Full Maturity** 

|**Capability**|**Description**|**Available From**|
|---|---|---|
|Light Mode Analysis|Public-signal GitHub profile analysis in<br>under 3 minutes, zero candidate action<br>required.|Phase 1|
|Batch Light Mode|CSV or ATS-sourced bulk analysis of up<br>to 500 candidates per job run.|Phase 1|
|Deep Mode Analysis|Full private + public analysis via GitHub<br>App, 8–15 min async.|Phase 3|
|CV Verifier|GitHub-as-truth-layer cross-check<br>against extracted CV claims.|Phase 4|
|ATS Webhook Integration|Inbound webhooks from Lever,<br>Greenhouse, and Ashby. Outbound<br>evidence brief delivery.|Phase 4|
|HRIS Connectors|Workday, BambooHR, Rippling —<br>candidate record enrichment.|Phase 4|
|Interview Intelligence|LLM-generated, evidence-grounded<br>technical interview question sets.|Phase 3|
|Anti-Gaming Detection|Commit inflation, fork dumping,|Phase 1|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

|**Capability**|**Description**|**Available From**|
|---|---|---|
||burst/dormancy, laundering, AI-<br>generation detection.||
|Employment Verification|Three-rung ladder: email domain, org<br>membership, contribution fingerprint.|Phase 1 / 3|
|Role Archetype Config|Backend, Frontend, Platform/SRE,<br>Data/ML, Security, Mobile signal<br>weighting.|Phase 2|
|Seniority-Adjusted Briefs|Primitive weight shift by target seniority:<br>Intern through Principal+.|Phase 2|
|SSO / SCIM|SAML 2.0 and OIDC login. SCIM-based<br>user provisioning for Enterprise.|Phase 4|
|White-Label|Custom domain, logo, and colour<br>scheme per Enterprise tenant.|Phase 4|
|Outcome Feedback Loop|Post-hire performance signal ingestion<br>for anti-gaming model validation.|Phase 4|



## **1.3 Non-Goals** 

- The platform does not make hiring decisions. It produces evidence briefs for human review. 

- It does not store source code beyond the analysis session. Only derived metrics are persisted. 

- It is not an ATS replacement. It is a GitHub-as-truth layer that operates alongside existing ATS. 

- It does not score candidates with a composite number. The seven canonical primitives are never collapsed into a single rank. 

© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

## **2. Subscription Tiers & Feature Matrix** 

## **2.1 Free Trial** 

No credit card required. Expires after 5 Light Mode analyses or 14 days, whichever comes first. Deep Mode and CV Verifier are disabled. All features are watermarked in the Evidence Brief output. Conversion CTA surfaces at run 4. 

|**Parameter**|**Value**|
|---|---|
|Light Mode analyses|5 total (not per month — one-time trial bank)|
|Deep Mode|Disabled|
|CV Verifier|Disabled|
|Batch upload|Disabled|
|ATS integration|Disabled|
|Evidence Brief|Watermarked — not exportable to PDF or ATS|
|Anti-gaming layer|Enabled — key differentiator, shown in trial|
|Data retention|30 days from account creation — purged on expiry|
|Expiry|14 calendar days OR 5 Light Mode runs, whichever<br>occurs first|
|Upgrade prompt|Surfaces at run 4 and on trial expiry page|



## **2.2 Starter — $299 / month** 

Target: Series A–C startups, CTOs and Heads of Engineering with self-service purchasing. Card-level purchase. No ATS integration, no batch uploads — single-candidate analysis workflow. 

|**Feature**|**Starter Limit / Behaviour**|
|---|---|
|Light Mode analyses / month|50 included. Overage: $4.00 per additional analysis.|
|Deep Mode analyses / month|10 included. Overage: $18.00 per additional analysis.|
|CV Verifier|Disabled — Scale-up tier required.|
|Batch CSV upload|Disabled — Scale-up tier required.|
|ATS webhook integration|Disabled — Scale-up tier required.|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

|**Feature**|**Starter Limit / Behaviour**|
|---|---|
|||
|Role archetype config|Disabled — Scale-up tier required.|
|Seniority-adjusted briefs|Disabled — Scale-up tier required.|
|Evidence Brief export|PDF export enabled. No ATS push.|
|Employment verification|Rung 1 (email domain). Rung 2–3 only with Deep<br>Mode.|
|Anti-gaming detection|Full detection layer enabled.|
|Interview Intelligence|Included in Deep Mode runs only.|
|User seats|Up to 3 seats (CTO + 2 hiring managers).|
|Data retention|Scores and Evidence Brief: 12 months with candidate<br>consent. Raw API data: purged within 30 days.|
|Support|Email support. 48-hour SLA.|
|SSO|Disabled — Enterprise tier required.|



## **2.3 Scale-up — $899 / month** 

Target: Series D+ scale-ups, TA teams running 50–500 engineering hires per year. Requires ATS integration and batch screening. This is the primary revenue tier — highest volume, repeatable monthly spend. 

|**Feature**|**Scale-up Limit / Behaviour**|
|---|---|
|Light Mode analyses / month|250 included. Overage: $4.00 per analysis.|
|Deep Mode analyses / month|50 included. Overage: $18.00 per analysis.|
|CV Verifier|Enabled. Runs as a third analysis mode alongside<br>Light / Deep.|
|Batch CSV upload|Enabled. Max 500 GitHub usernames per batch job.<br>Job queued, async.|
|ATS webhook integration|Lever, Greenhouse, Ashby. Inbound webhook triggers<br>Light Mode analysis. Outbound: Evidence Brief<br>pushed back to ATS candidate record.|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

|**Feature**|**Scale-up Limit / Behaviour**|
|---|---|
|Role archetype config|Enabled. Per-job-requisition archetype selection:<br>Backend, Frontend, Platform/SRE, Data/ML, Security,<br>Mobile.|
|Seniority-adjusted briefs|Enabled. Target seniority configurable per analysis<br>request.|
|Evidence Brief export|PDF and JSON export. ATS push via webhook.|
|Employment verification|Full 3-rung ladder in Deep Mode.|
|Interview Intelligence|Included in all Deep Mode runs.|
|User seats|Up to 15 seats.|
|Data retention|Same as Starter.|
|Support|Email + Slack Connect. 24-hour SLA. Dedicated<br>onboarding call.|
|SSO|Disabled — Enterprise tier required.|
|Usage dashboard|Monthly usage breakdown by analysis type, seat, and<br>job requisition.|



## **2.4 Enterprise — Custom Annual Contract** 

Target: Enterprise tech companies (1,000+ employees), RPO firms, and technical staffing agencies. Longest sales cycle (6–18 months) but highest ACV. All Scale-up features plus compliance, identity federation, and reseller support. 

|**Feature**|**Enterprise Behaviour**|
|---|---|
|Light Mode analyses|Unlimited (fair-use policy applies: >50,000/month requires<br>capacity planning call).|
|Deep Mode analyses|Unlimited (same fair-use policy).|
|CV Verifier|Enabled + bulk CV import via HRIS connector.|
|ATS integration|All Scale-up ATS plus custom webhook targets. iCIMS and<br>SAP SuccessFactors adapters available (Phase 4).|
|HRIS connectors|Workday, BambooHR, Rippling. Candidate record<br>enrichment with Evidence Brief summary fields.|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

|**Feature**|**Enterprise Behaviour**|
|---|---|
|SSO / SCIM|SAML 2.0 and OIDC for identity federation. SCIM 2.0 for<br>automated user provisioning and deprovisioning.|
|White-label|Custom subdomain (e.g., talent.acmecorp.com), logo, and<br>primary colour palette per tenant.|
|Data processing agreement|DPA with GDPR Article 28 compliant terms. CCPA data<br>processor addendum. Executed at contract time.|
|Data residency|US or EU deployment regions. Data residency selection at<br>tenant creation.|
|Dedicated CSM|Named Customer Success Manager. Monthly business<br>reviews.|
|SLA|99.9% uptime SLA with credits. 4-hour P1 support response.|
|Outcome feedback API|POST endpoint for post-hire performance signals. Used to<br>validate anti-gaming detection heuristics.|
|Reseller / RPO mode|Sub-tenant accounts under RPO master. Branded candidate<br>evaluation links. Volume-tiered reseller pricing.|
|Audit logs|Full admin audit log: who ran which analysis, when, and on<br>which candidate. Exportable.|
|Custom contract terms|Annual billing, custom payment terms, PO-number invoicing.|



## **2.5 Overage & Usage Billing Rules** 

Overage is billed at the end of each calendar month at the per-unit rates defined in each tier. The billing engine must enforce the following rules precisely: 

- Overage accrues the moment a run is triggered, not when the brief is delivered. A failed analysis (due to rate limit exhaustion or GitHub outage) does not consume overage credit. 

- A partial brief (circuit breaker fired, fewer than 4 primitives assessed) is billed at 50% of the analysis rate. The brief must be labelled PARTIAL in the Evidence Brief header. 

- Batch runs consume overage per candidate in the batch, not per batch job. 

- Free Trial runs do not convert to overage — the trial bank is hard-capped at 5 runs. Run 6 prompts upgrade flow. 

- Overage invoices are auto-charged to the card on file on the 1st of each month. If charge fails, the account enters a 72-hour grace period before analyses are paused. 

|**Unit**|**Starter**|**Scale-up**|**Enterprise**|
|---|---|---|---|
|Light Mode overage|$4.00 / analysis|$4.00 / analysis|Volume-tiered in|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

|**Unit**|**Starter**|**Scale-up**|**Enterprise**|
|---|---|---|---|
||||contract|
|Deep Mode overage|$18.00 / analysis|$18.00 / analysis|Volume-tiered in<br>contract|
|CV Verifier overage|N/A (not available)|$6.00 / verification|Volume-tiered in<br>contract|
|Partial brief rate|50% of mode rate|50% of mode rate|50% of mode rate|
|Batch processing fee|N/A|No batch fee —<br>usage counted per<br>candidate|Included|
|ATS webhook fee|N/A|Included in plan|Included|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

## **3. System Architecture Overview** 

## **3.1 High-Level Component Map** 

The platform is composed of six primary service domains. All services communicate via internal message bus (Redis Streams) for async jobs and via REST/gRPC for synchronous calls. No service-toservice database sharing. 

|**Service Domain**|**Responsibility**|**Technology**|
|---|---|---|
|API Gateway|Auth, rate limiting, tenant routing, usage<br>metering interception.|Node.js (Fastify) + Redis|
|Analysis Engine|Light Mode, Deep Mode, CV Verifier<br>pipeline orchestration.|Python (FastAPI) +<br>Worker Pool|
|Job Queue|Async analysis job dispatch, priority<br>lanes, retry logic, DLQ.|Redis Streams + BullMQ|
|Evidence Brief<br>Service|LLM API orchestration, primitive scoring,<br>brief assembly and rendering.|Python + Claude API<br>(claude-sonnet-4-<br>20250514)|
|Integration Service|ATS webhook ingest/delivery, HRIS<br>connectors, CV claim extractor.|Node.js + Webhook<br>handlers|
|Billing & Metering|Usage tracking, Stripe integration,<br>overage calculation, invoice generation.|Node.js + Stripe SDK|
|Identity & Auth|Tenant auth, SSO/SAML/OIDC, SCIM,<br>GitHub OAuth for Deep Mode.|Node.js + Passport.js|
|Data Store|Tenant DB (Postgres), cache (Redis),<br>ephemeral code analysis (tmpfs only).|Postgres 16, Redis 7|
|Admin & Dashboard|Employer-facing UI, usage dashboards,<br>brief viewer, configuration.|Next.js (separate repo)|



## **3.2 Request Flow — Light Mode (Synchronous Path)** 

Light Mode analyses are completed within a 3-minute SLA and deliver results synchronously to a polling endpoint. The job is enqueued and processed by dedicated Light Mode worker processes. 

_Sequence: Employer submits username → API Gateway validates auth + checks usage budget → BullMQ enqueues LightJob → Worker picks up job → GitHub API crawl (Groups A/B/C/D/F via GraphQL-first) → Anti-gaming analysis → LLM batch call → Primitive scoring → Evidence Brief_ 

© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

_rendered → Brief stored → Dashboard notified via WebSocket → Employer polls or receives push notification._ 

|**St**<br>**ep**|**Action**|**Service**|**Target**<br>**Time**|
|---|---|---|---|
|1|Employer submits username +<br>role config. JWT validated.<br>Usage budget checked against<br>tenant plan.|API Gateway|< 200ms|
|2|LightJob payload written to Redis<br>Stream `jobs:light`. Usage unit<br>reserved (not yet billed).|API Gateway →<br>BullMQ|< 100ms|
|3|Worker dequeues job. Rate limit<br>token acquired from shared Light<br>Mode pool (5,000 req/hr).|Analysis Worker<br>(Light)|< 500ms|
|4|GraphQL bulk fetch: contribution<br>calendar, PRs, issue comments,<br>org memberships.|Analysis Worker<br>(Light)|~25<br>seconds|
|5|REST fetches for repo list,<br>commit stats, release history, CI<br>run metadata.|Analysis Worker<br>(Light)|~20<br>seconds|
|6|Package registry lookups (npm,<br>PyPI, Cargo). Stack Overflow<br>enrichment if present.|Analysis Worker<br>(Light)|~10<br>seconds|
|7|Commit inflation check, fork<br>dump ratio, burst/dormancy<br>fingerprint. GitHub Code Search<br>spot-checks on flagged repos.|Analysis Worker<br>(Light)|~20<br>seconds|
|8|LLM API batch call: commit<br>message quality, PR description<br>depth, AI-generation pattern<br>scoring.|Evidence Brief<br>Service|~25<br>seconds|
|9|Primitive scoring: all 7 primitives<br>assessed with confidence levels.<br>Employment verification Rung 1.|Evidence Brief<br>Service|~10<br>seconds|
|10|Evidence Brief assembled,<br>structured, and persisted to<br>Postgres (derived metrics only —<br>no raw code).|Evidence Brief<br>Service|~5<br>seconds|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

|**St**<br>**ep**|**Action**|**Service**|**Target**<br>**Time**|
|---|---|---|---|
|11|Usage unit confirmed-billed.<br>WebSocket push to employer<br>dashboard. Analysis status<br>updated.|API Gateway +<br>Billing|< 1<br>second|
|To<br>tal|End-to-end Light Mode analysis.|—|< 3<br>minutes|



## **3.3 Request Flow — Deep Mode (Async Path)** 

Deep Mode is fully asynchronous. The employer generates an evaluation link; the candidate authenticates via GitHub OAuth and installs the GitHub App. The analysis runs independently and the employer is notified on completion. 

|**St**<br>**ep**|**Action**|**Service**|**Target**<br>**Time**|
|---|---|---|---|
|1|Employer creates evaluation<br>request in dashboard.<br>EvaluationLink record created<br>with unique token.|API Gateway|< 200ms|
|2|Candidate receives link (email or<br>direct). Lands on candidate<br>consent page showing exact<br>repo list to be shared.|Candidate Portal|Candida<br>te-paced|
|3|Candidate completes GitHub<br>OAuth + GitHub App installation.<br>Installation ID and access token<br>stored (encrypted at rest, AES-<br>256).|Identity Service|< 10<br>seconds|
|4|DeepJob payload written to<br>Redis Stream `jobs:deep`.<br>Dedicated rate-limit pool<br>initialised per candidate token.|API Gateway →<br>BullMQ|< 200ms|
|5|Worker dequeues. Full repo<br>inventory crawl. Top 30 repos<br>selected by quality score.|Analysis Worker<br>(Deep)|~60<br>seconds|
|6|GraphQL bulk fetch: full<br>contribution history, all PRs,<br>issue comments, external|Analysis Worker<br>(Deep)|~30<br>seconds|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

|**St**<br>**ep**|**Action**|**Service**|**Target**<br>**Time**|
|---|---|---|---|
||contributions, org memberships.|||
|7|Top 30 repos cloned via HTTPS<br>(candidate token). Distributed<br>across 4 parallel sub-workers.|Clone Workers (x4)|~3–6<br>minutes|
|8|Per-repo: scc + tokei +<br>gitinspector + gitleaks + semgrep<br>run in parallel. Results<br>aggregated.|Clone Workers (x4)|~2<br>minutes<br>(parallel)|
|9|Package registry APIs. Stack<br>Overflow enrichment.<br>Employment verification Rungs<br>1–3.|Analysis Worker<br>(Deep)|~30<br>seconds|
|10|Full anti-gaming analysis on<br>cloned data. GitHub Code<br>Search + Copyleaks laundering<br>detection.|Analysis Worker<br>(Deep)|~2<br>minutes|
|11|Full LLM analysis: commit history<br>corpus, PR descriptions,<br>README scoring, AI-generation<br>detection.|Evidence Brief<br>Service|~60<br>seconds|
|12|Primitive scoring at high<br>confidence. Profile-level<br>sufficiency gate applied.<br>Evidence Brief assembled.|Evidence Brief<br>Service|~30<br>seconds|
|13|Cloned repos deleted from tmpfs.<br>GitHub App token revoked<br>(cleanup call). Derived metrics<br>persisted.|Analysis Worker<br>(Deep)|~10<br>seconds|
|14|Employer notified (email +<br>dashboard WebSocket). Brief<br>available in dashboard.|API Gateway +<br>Notification|< 5<br>seconds|
|To<br>tal|End-to-end Deep Mode analysis.|—|8–15<br>minutes|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

## **3.4 Request Flow — CV Verifier Mode** 

CV Verifier is an enhancement layer — not a standalone analysis mode. It ingests a CV (via ATS webhook, file upload, or paste), extracts structured claims, and runs GitHub as a verification pass against each claim. 

## **St Action ep** 

- 1 Employer submits CV (PDF, DOCX, or ATS-sourced structured data). Stored in temporary S3 object (TTL: 24 hours, deleted after extraction). 

- 2 CV Claim Extractor runs via LLM API: extracts company names, employment dates, role titles, tech stack claims, and stated seniority level as structured JSON. 

- 3 GitHub username resolved: if not in CV, platform prompts employer to provide it or fetches it from ATS candidate record. 

- 4 A Light Mode analysis is triggered automatically if no existing brief exists within 7 days for the candidate. 

- 5 Each extracted claim is cross-checked against Evidence Brief signals. Output: confirmed / unconfirmed / contradicted per claim. 

- 6 Discrepancy report generated: each contradiction or gap is surfaced with the specific evidence signal and a recommended interview probe. 

- 7 CV Verifier Report merged into Evidence Brief as Section B (Tech Reality vs. CV Claims) or delivered as a standalone report if no full brief was generated. 

© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

## **4. Data Models & Database Schema** 

## **4.1 Core Entities** 

All primary data is stored in a multi-tenant Postgres 16 database. Tenant isolation is enforced at the application layer via RLS (Row-Level Security) policies on the `tenant_id` column of every table. No cross-tenant query is permitted. 

## **tenants** 

|**Column**|**Type**|**Description**|
|---|---|---|
|id|UUID PK|Tenant identifier.|
|name|TEXT NOT NULL|Organisation name.|
|plan|ENUM('trial','starter','scaleu<br>p','enterprise')|Current subscription tier.|
|stripe_customer_id|TEXT|Stripe customer object ID.|
|stripe_subscription_id|TEXT|Stripe subscription object ID.|
|trial_runs_used|INT DEFAULT 0|Trial Light Mode runs consumed. Max<br>5.|
|trial_expires_at|TIMESTAMPTZ|Trial expiry timestamp (14 days from<br>account creation).|
|light_mode_quota|INT|Monthly included Light Mode<br>analyses.|
|deep_mode_quota|INT|Monthly included Deep Mode<br>analyses.|
|cv_verifier_enabled|BOOL|CV Verifier feature flag.|
|batch_upload_enable<br>d|BOOL|Batch CSV upload feature flag.|
|ats_integration_enabl<br>ed|BOOL|ATS webhook integration feature flag.|
|sso_enabled|BOOL|SSO feature flag (Enterprise only).|
|white_label_enabled|BOOL|White-label feature flag (Enterprise<br>only).|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

|**Column**|**Type**|**Description**|
|---|---|---|
|white_label_domain|TEXT|Custom subdomain for white-label<br>tenants.|
|data_region|ENUM('us','eu')|Data residency region selection.|
|created_at|TIMESTAMPTZ DEFAULT<br>NOW()|Tenant creation timestamp.|
|status|ENUM('active','paused','can<br>celled')|Account status.|



## **users** 

|**Column**|**Type**|**Description**|
|---|---|---|
|id|UUID PK|User identifier.|
|tenant_id|UUID FK → tenants.id|Owning tenant. RLS key.|
|email|TEXT UNIQUE NOT NULL|Primary email. Used for login.|
|role|ENUM('admin','hiring_mana<br>ger','viewer')|Platform role within tenant.|
|sso_subject|TEXT|External identity subject (SAML<br>NameID or OIDC sub).|
|github_oauth_token|TEXT ENCRYPTED|GitHub OAuth token for user-level<br>operations (encrypted, AES-256-<br>GCM).|
|last_login_at|TIMESTAMPTZ|Last login timestamp.|
|created_at|TIMESTAMPTZ DEFAULT<br>NOW()|User creation timestamp.|



## **analyses** 

Central record for every analysis run, regardless of mode. 

|**Column**|**Type**|**Description**|
|---|---|---|
|id|UUID PK|Analysis identifier.|
|tenant_id|UUID FK → tenants.id|Owning tenant. RLS key.|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

|**Column**|**Type**|**Description**|
|---|---|---|
|triggered_by_user_id|UUID FK → users.id|User who triggered the analysis.|
|github_username|TEXT NOT NULL|Candidate's GitHub username at<br>time of analysis.|
|mode|ENUM('light','deep','cv_v<br>erifier')|Analysis mode.|
|status|ENUM('queued','running',<br>'complete','partial','failed')|Current job status.|
|job_id|TEXT|BullMQ job ID for status tracking.|
|target_seniority|ENUM('intern','junior','mid<br>','senior','staff','principal')|Seniority level used for primitive<br>weighting.|
|role_archetype|ENUM('backend','fronten<br>d','platform','data_ml','sec<br>urity','mobile','generalist')|Role archetype for signal emphasis.|
|jd_text|TEXT|Job description text for role/stack<br>match (optional).|
|evaluation_link_id|UUID FK →<br>evaluation_links.id|Deep Mode: candidate evaluation<br>link used.|
|brief_id|UUID FK →<br>evidence_briefs.id|Resulting Evidence Brief, set on<br>completion.|
|is_partial|BOOL DEFAULT FALSE|True if circuit breaker fired and<br>fewer than 4 primitives assessed.|
|github_rate_limit_remaini<br>ng|INT|Rate limit remaining at job<br>completion — for observability.|
|billed_at|TIMESTAMPTZ|When the analysis unit was billed<br>(confirmed after job completion).|
|billing_units|NUMERIC(4,2)|Units billed: 1.0 normal, 0.5 partial.|
|created_at|TIMESTAMPTZ<br>DEFAULT NOW()|Analysis creation timestamp.|
|completed_at|TIMESTAMPTZ|Analysis completion timestamp.|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

## **evidence_briefs** 

|**Column**|**Type**|**Description**|
|---|---|---|
|id|UUID PK|Evidence Brief identifier.|
|analysis_id|UUID FK →<br>analyses.id|Owning analysis.|
|tenant_id|UUID FK →<br>tenants.id|Owning tenant. RLS key.|
|github_username|TEXT|Candidate's GitHub username at time of<br>analysis.|
|profile_archetype|TEXT|Engineering operating style archetype<br>assigned.|
|ai_leverage_classification|ENUM('ai_operator','a<br>i_architect','ai_passen<br>ger','traditional','disclo<br>sure_flag')|AI Leverage Quality classification.|
|employment_verification_<br>rung|INT|Highest rung achieved: 0–3.|
|profile_level_gate|BOOL DEFAULT<br>FALSE|True if Insufficient Data gate triggered<br>(senior enterprise profile).|
|primitive_scores|JSONB NOT NULL|JSON object: { p1: { score, confidence,<br>evidence }, … p7 }. See Section 5.|
|tech_reality_vs_cv|JSONB|CV Verifier cross-check results. Null if<br>CV Verifier not run.|
|red_flags|JSONB|Array of gaming/verification flags with<br>evidence and recommended probes.|
|interview_questions|JSONB|Array of 3–5 LLM-generated interview<br>questions with rationale.|
|role_stack_match|JSONB|Stack overlap and gap analysis<br>(requires JD). Null if no JD provided.|
|observability_gaps|JSONB|List of dimensions with Observability<br>Gap status and recommended interview<br>probes.|
|brief_md|TEXT|Full Evidence Brief in Markdown format<br>(rendered in dashboard).|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

|**Column**|**Type**|**Description**|
|---|---|---|
|brief_pdf_s3_key|TEXT|S3 object key for PDF export<br>(generated on demand, TTL 7 days).|
|analysis_mode_used|ENUM('light','deep')|Mode that produced this brief.|
|candidate_consent_obtai<br>ned|BOOL|True for Deep Mode briefs where<br>candidate granted consent.|
|consent_scope_repos|TEXT[]|Array of repo names included in<br>candidate's consent grant.|
|retained_until|TIMESTAMPTZ|Data retention expiry. 12 months from<br>creation with consent.|
|created_at|TIMESTAMPTZ<br>DEFAULT NOW()|Brief creation timestamp.|



## **evaluation_links** 

Deep Mode candidate evaluation links. 

|**Column**|**Type**|**Description**|
|---|---|---|
|id|UUID PK|Link identifier.|
|tenant_id|UUID FK → tenants.id|Owning tenant.|
|token|TEXT UNIQUE NOT<br>NULL|URL-safe random token (32 bytes,<br>URL-encoded). Never reused.|
|created_by_user_id|UUID FK → users.id|User who generated the link.|
|candidate_email|TEXT|Optional — used to pre-fill consent<br>page.|
|github_app_installation_id|TEXT|Set when candidate installs the<br>GitHub App.|
|installation_access_token|TEXT ENCRYPTED|Encrypted GitHub installation<br>access token (1-hour lifetime, auto-<br>refreshed).|
|status|ENUM('pending','installed<br>','analysis_running','comp<br>lete','expired','revoked')|Link lifecycle status.|
|expires_at|TIMESTAMPTZ|Link expiry — 7 days from creation.|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

|**Column**|**Type**|**Description**|
|---|---|---|
|completed_at|TIMESTAMPTZ|Set when analysis completes.|
|analysis_id|UUID FK → analyses.id|Analysis triggered by this link.|



## **usage_events** 

Append-only log of all billable events. Source of truth for billing and usage dashboards. 

|**Column**|**Type**|**Description**|
|---|---|---|
|id|UUID PK|Event identifier.|
|tenant_id|UUID FK →<br>tenants.id|Owning tenant.|
|analysis_id|UUID FK →<br>analyses.id|Associated analysis.|
|event_type|ENUM('light_analysis'<br>,'deep_analysis','cv_v<br>erifier','light_overage',<br>'deep_overage','cv_o<br>verage')|Usage event classification.|
|units|NUMERIC(4,2)|Usage units consumed (1.0 or 0.5 for<br>partial).|
|billing_period|TEXT|Billing period key: 'YYYY-MM'. Indexed for<br>monthly aggregation.|
|billed|BOOL DEFAULT<br>FALSE|False until end-of-month billing run<br>confirms Stripe charge.|
|stripe_usage_record_id|TEXT|Stripe Usage Record ID for metered<br>billing events.|
|created_at|TIMESTAMPTZ<br>DEFAULT NOW()|Event creation timestamp.|



## **ats_integrations** 

|**Column**|**Type**|**Description**|
|---|---|---|
|id|UUID PK|Integration identifier.|
|tenant_id|UUID FK → tenants.id|Owning tenant.|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

|**Column**|**Type**|**Description**|
|---|---|---|
|ats_provider|ENUM('lever','greenhous<br>e','ashby','icims','successf<br>actors')|ATS provider.|
|webhook_secret|TEXT ENCRYPTED|HMAC-SHA256 secret for inbound<br>webhook verification.|
|outbound_webhook_url|TEXT|Employer-configured URL for<br>outbound Evidence Brief delivery.|
|auto_trigger_light_mode|BOOL DEFAULT TRUE|Auto-trigger Light Mode analysis on<br>new application webhook.|
|auto_push_brief|BOOL DEFAULT FALSE|Auto-push Evidence Brief to ATS<br>candidate record on completion.|
|default_role_archetype|TEXT|Default role archetype for auto-<br>triggered analyses.|
|default_target_seniority|TEXT|Default seniority for auto-triggered<br>analyses.|
|status|ENUM('active','paused','e<br>rror')|Integration health status.|
|last_event_at|TIMESTAMPTZ|Last inbound webhook received.|
|created_at|TIMESTAMPTZ<br>DEFAULT NOW()|Integration creation timestamp.|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

## **5. Seven Canonical Primitives — Scoring Specification** 

The Evidence Brief Service scores each of the seven primitives independently. No composite score is produced. The output for each primitive is a structured object containing: the assessed confidence level, the supporting evidence list (each item traceable to a specific data group and signal), and the recommended interview probe if confidence is below Strong Evidence. 

_IMPLEMENTATION RULE: The primitive_scores JSONB column stores an object with keys p1 through p7. Each value is: { confidence:_ 

_'strong'|'moderate'|'low'|'observability_gap'|'insufficient_data', evidence: [{ signal, source_group, detail }], score_label: string, interview_probe: string|null }. The system MUST NOT compute or store a numeric aggregate of primitives._ 

|**Primitive**|**Core Question**|**Primary Signal Groups**|**Key Tools**|
|---|---|---|---|
|P1 — Execution<br>Reliability|Can this engineer ship<br>safely and consistently?|C (Commit Intelligence),<br>E (Engineering<br>Practices)|tokei, scc, GitHub<br>Actions API|
|P2 — Systems<br>Evolution|Do systems improve<br>under this engineer's<br>stewardship over time?|C, E, git history analysis|scc complexity<br>trends,<br>gitinspector|
|P3 —<br>Collaboration<br>Leverage|Does this engineer<br>amplify the people<br>around them?|D (Collaboration &<br>Review), issue comment<br>corpus|GraphQL PR<br>data, LLM scoring|
|P4 — Technical<br>Depth|Can this engineer go<br>deep when the problem<br>requires it?|B (Repo Inventory), D,<br>Package Registry APIs|LLM API analysis,<br>Stack Exchange<br>API (Tier 3)|
|P5 — Operational<br>Maturity|Can this engineer<br>handle production<br>reality?|E, gitleaks, semgrep, C<br>commit patterns|gitleaks, semgrep,<br>IaC file detection|
|P6 — AI<br>Leverage Quality|Can this engineer<br>effectively direct AI to<br>produce quality<br>outcomes?|C (Commit Intelligence)|LLM API, AI<br>config file<br>detection,<br>velocity/quality<br>correlation|
|P7 — Authenticity<br>Confidence|Is the evidence<br>trustworthy and the<br>identity coherent?|G (Anti-Gaming),<br>gitleaks, Code Search|GitHub Code<br>Search API,<br>Copyleaks, LLM<br>style analysis|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

## **5.1 Confidence Level Output Language — Mandatory** 

The following output language is mandatory. No alternate formulation is permitted. The confidence_label string is stored in the Evidence Brief and rendered verbatim in the UI and PDF export. 

|**Level**|**Trigger Condition**|**Mandatory Output Language**|
|---|---|---|
|strong|3+ independent signals<br>confirming the same<br>capability across 12+<br>months.|"Demonstrated across [N] repositories and [N]<br>months — high confidence."|
|moderate|1–2 signals or a single<br>time window of evidence.|"Evidenced in limited context — probe in<br>interview to confirm depth."|
|low|Single weak signal or<br>isolated instance.|"One instance detected — insufficient to<br>score. Treat as unconfirmed in hiring<br>decision."|
|observability_g<br>ap|Signal expected for this<br>seniority/role but absent<br>or unverifiable.|"No public evidence — likely private or<br>enterprise context. Do not penalise.<br>Recommend: [specific interview question]."|
|insufficient_dat<br>a|Majority of primary<br>primitives return<br>observability_gap.|"This profile cannot be assessed from<br>available public signals. Do not use this report<br>as a filter. Proceed directly to technical<br>interview using the generated questions."|



## **5.2 Seniority-Adjusted Primitive Weighting** 

The following weight table governs the narrative emphasis of each primitive in the Evidence Brief. Lower weights do not suppress scoring — all seven primitives are always assessed. Weight governs how prominently the primitive appears in the brief's narrative summary and interview recommendation ordering. 

|**Primitive**|**Intern/**<br>**Junior**|**Mid-Level**|**Senior**|**Staff/Lead**|**Principal+**|
|---|---|---|---|---|---|
|P1 Execution<br>Reliability|Primary|Primary|High|Moderate|Moderate|
|P2 Systems Evolution|Not<br>expected|Emerging|High|Primary|Primary|
|P3 Collaboration<br>Leverage|Minimal|Moderate|High|Primary|Primary|
|P4 Technical Depth|High|High|High|High|High|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

|**Primitive**|**Intern/**<br>**Junior**|**Mid-Level**|**Senior**|**Staff/Lead**|**Principal+**|
|---|---|---|---|---|---|
|||||||
|P5 Operational<br>Maturity|Minimal|Moderate|High|High|Primary|
|P6 AI Leverage<br>Quality|Moderate|High|High|High|High|
|P7 Authenticity<br>Confidence|Always<br>assessed<br>equally<br>regardless<br>of seniority|||||



## **5.3 AI Leverage Classification** 

P6 produces a classification label in addition to a confidence level. The classification is stored in evidence_briefs.ai_leverage_classification and displayed prominently in the Evidence Brief header. 

|**Classification**|**Definition**|**Hiring Signal**|
|---|---|---|
|ai_operator|High commit velocity periods with<br>maintained or improving test<br>coverage. AI config files present.<br>Human architectural decisions visible<br>in diffs.|Strong positive — engineer uses<br>AI efficiently without sacrificing<br>quality.|
|ai_architect|Evidence of guiding AI output:<br>iterative refinement commits<br>following large AI-assisted bursts.<br>LLM-default patterns modified with<br>domain-specific decisions.|Strongest positive — engineer<br>directs AI rather than accepting its<br>output.|
|ai_passenger|High volume, low quality: commit<br>velocity spikes not matched by test<br>coverage or quality indicators.<br>Abrupt style discontinuities with no<br>iterative refinement.|Risk flag — volume without<br>judgment. Disclose as interview<br>probe. Not automatic rejection.|
|traditional|Consistent hand-crafted commit<br>patterns across full history. No AI<br>tool config files. Organic stylistic drift<br>over time.|Neutral — not penalised. Note for<br>interviewer context.|
|disclosure_flag|AST entropy anomalies, style<br>discontinuities inconsistent with|Interview required to clarify<br>authorship. Not automatic|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

|**Classification**|**Definition**|**Hiring Signal**|
|---|---|---|
||declared work history. LLM pattern<br>detection confidence > 70.|rejection. Generates specific<br>interview probe.|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

## **6. Anti-Gaming Detection Layer** 

The anti-gaming layer is part of the Analysis Engine. It maps to Group G (Anti-Gaming Signals) and feeds primarily into P7 (Authenticity Confidence). All gaming flags are surfaced as explicit findings in the Evidence Brief — never as silent score deductions. No flag produces automatic rejection. 

|**Pattern**|**Detection Method**|**Threshold**|**Brief Output**|**Mode**|
|---|---|---|---|---|
|Commit<br>inflation|Histogram of commit<br>sizes (additions +<br>deletions, excluding<br>merges and doc-only).<br>Flag if >30% of commits<br>fall below 5-line threshold<br>or p25 of commit size < 3<br>lines.|>30% inflation<br>rate|P1 + P4 flags.<br>Contributes to P7<br>confidence.<br>Interview probe<br>generated.|Both|
|Fork dumping|gitinspector / contributor<br>stats: filter forks where<br>candidate email has zero<br>commits. Flag if >50% of<br>public repos are<br>unmodified forks.|>50%<br>unmodified<br>forks|Repo inventory<br>adjusted.<br>Language<br>analysis excludes<br>unmodified forks.|Deep|
|Burst /<br>dormancy|Contribution heatmap<br>analysis. Flag if last 30<br>days show >5× trailing<br>12-month weekly average<br>— especially when<br>evaluation was triggered<br>recently.|>5× burst vs<br>12-month<br>trailing|Consistency<br>narrative note.<br>Interview probe:<br>verify activity<br>timeline.|Both|
|Repository<br>laundering|Representative file<br>signatures queried<br>against GitHub Code<br>Search API. >40% near-<br>duplicate file matches<br>triggers Copyleaks Code<br>API secondary check.|>40% file<br>similarity|P7 flag. Interview<br>probe generated.<br>Copyleaks<br>confirmation<br>required before<br>hard flag.|Both|
|AI-generation<br>disclosure gap|LLM API analyses commit<br>patterns, style<br>consistency, structural<br>entropy. Identifies abrupt<br>discontinuities correlated<br>with large single-session<br>commits.|Pattern<br>confidence<br>scored 0–100|Classified on AI<br>Leverage Quality<br>scale. Interview<br>probe generated.<br>Never automatic<br>rejection.|Both|
|Credential leak<br>history|gitleaks run against all<br>cloned repos including full|Any detection,<br>any severity|Hard security<br>flag. P5 score|Deep|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

|**Pattern**|**Detection Method**|**Threshold**|**Brief Output**|**Mode**|
|---|---|---|---|---|
||git history, even for<br>revoked secrets.||capped.<br>Escalated to<br>hiring manager<br>regardless of<br>other scores.<br>Cannot be<br>cleared by<br>system —<br>requires interview<br>or background<br>check.||



## **6.1 Employment Verification — Three-Rung Ladder** 

Employment verification is a confidence spectrum, not a binary check. The brief displays the exact rung achieved per employment claim. The 'Unverified' label is never used as standalone output — it implies suspicion where the reality is insufficient data. 

|**Rung**|**Mechanism**|**What It Proves**|**Mode**|
|---|---|---|---|
|0 — No signal|No verifiable data for<br>claimed role.|System limitation, not candidate<br>failure. Output: 'Proceed to<br>interview with suggested probe.'|Both|
|1 — Email<br>domain|Commit author email<br>matches @employer.com<br>domain.|Candidate had access to a<br>company email at some point.<br>Weak signal. Does not prove<br>scope or role.|Both|
|2 — Org<br>membership|GitHub org membership<br>API confirms presence in<br>employer's GitHub org.|Candidate had an active GitHub<br>seat in the organisation. Org<br>admins control this list directly.|Deep|
|3 —<br>Contribution<br>fingerprint|Contribution activity in<br>employer org repos is<br>temporally consistent with<br>claimed employment<br>tenure.|Candidate was actively<br>engineering at the claimed<br>employer during the claimed<br>period. Hard to fabricate<br>retroactively.|Deep|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

## **7. API Design & Endpoint Specification** 

All API endpoints are versioned under /api/v1/. Authentication is via JWT Bearer token (issued at login) for employer-facing endpoints. Candidate-facing endpoints (evaluation link flow) use signed token URL parameters. All endpoints enforce tenant scoping at the middleware layer. 

## **7.1 Authentication** 

|**Mechanism**|**Used For**|**Token Lifetime**|
|---|---|---|
|JWT Bearer<br>(RS256)|All employer-facing API endpoints.<br>Issued on login (email/password or<br>SSO).|15 minutes access token / 7-<br>day refresh token.|
|API Key (SHA-256<br>hashed)|ATS webhook verification header (X-<br>GitIntel-API-Key). Machine-to-machine<br>integrations.|Non-expiring. Revocable.<br>One per ATS integration<br>record.|
|Signed URL Token|Candidate evaluation link. URL<br>parameter ?token=<32-byte-random>.|7 days from link creation.<br>Single-use after GitHub App<br>installation.|
|GitHub OAuth<br>Token|Deep Mode candidate GitHub App<br>installation flow. Stored encrypted per<br>evaluation_links record.|1-hour GitHub installation<br>access token, auto-refreshed<br>via JWT RS256 signing.|



## **7.2 Core Endpoints** 

|**Meth**<br>**od**|**Endpoint**|**Description**|**Tier Required**|
|---|---|---|---|
|POS<br>T|/api/v1/analyses/light|Submit a Light Mode analysis. Body:<br>{ github_username, target_seniority?,<br>role_archetype?, jd_text? }. Returns:<br>{ analysis_id, status: 'queued',<br>estimated_duration_seconds: 180 }.|All|
|POS<br>T|/api/v1/analyses/light/<br>batch|Batch Light Mode analysis. Body:<br>{ candidates: [{github_username, ...}],<br>job_name? }. Max 500 per batch.<br>Returns: { batch_job_id,<br>candidate_count,<br>estimated_duration_minutes }.|Scale-up,<br>Enterprise|
|POS<br>T|/api/v1/analyses/deep/<br>request|Create an evaluation link for Deep Mode.<br>Body: { candidate_email?,<br>target_seniority?, role_archetype?,|All (10/mo<br>Starter)|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

|**Meth**<br>**od**|**Endpoint**|**Description**|**Tier Required**|
|---|---|---|---|
|||jd_text? }. Returns: { evaluation_link_id,<br>candidate_url, expires_at }.||
|GET|/api/v1/analyses/:id|Get analysis status and brief reference.<br>Returns: { analysis_id, status, brief_id?,<br>is_partial, completed_at? }.|All|
|GET|/api/v1/analyses/:id/<br>brief|Retrieve full Evidence Brief for a<br>completed analysis. Returns: Full<br>evidence_briefs record as JSON.|All|
|GET|/api/v1/analyses/:id/<br>brief/pdf|Generate and return a signed S3 URL<br>for PDF export. PDF generated on first<br>call, cached for 7 days.|All|
|GET|/api/v1/analyses|List analyses for tenant. Supports filters:<br>mode, status, created_after,<br>github_username. Paginated.|All|
|POS<br>T|/api/v1/analyses/cv-<br>verify|Submit CV Verifier run. Body:<br>{ analysis_id?, github_username,<br>cv_text?, cv_s3_key?, ats_candidate_id?<br>}. Returns: { cv_verify_job_id }.|Scale-up,<br>Enterprise|
|GET|/api/v1/usage|Current period usage summary:<br>{ light_used, light_quota, deep_used,<br>deep_quota, overage_units,<br>overage_amount_cents }.|All|
|GET|/api/v1/usage/history|Monthly usage history (last 12 months).<br>Returns array of monthly summaries.|All|
|POS<br>T|/api/v1/integrations/ats|Create or update ATS integration. Body:<br>{ ats_provider, webhook_secret?,<br>outbound_webhook_url?,<br>auto_trigger_light_mode,<br>auto_push_brief,<br>default_role_archetype?,<br>default_target_seniority? }.|Scale-up,<br>Enterprise|
|POS<br>T|/api/v1/<br>webhooks/:provider/<br>inbound|Inbound ATS webhook receiver.<br>Provider: lever, greenhouse, ashby.<br>Verified via HMAC-SHA256 X-GitIntel-<br>Signature header.|Scale-up,<br>Enterprise|
|GET|/api/v1/<br>candidates/:github_user<br>name/brief/latest|Retrieve most recent brief for a GitHub<br>username, if within 7 days and same<br>tenant.|All|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

|**Meth**<br>**od**|**Endpoint**|**Description**|**Tier Required**|
|---|---|---|---|
|DEL<br>ETE|/api/v1/analyses/:id|Delete analysis and associated brief.<br>Initiates data purge. Logs deletion event<br>for audit.|admin role<br>only|
|GET|/api/v1/audit-log|Paginated audit log of all admin actions,<br>analysis triggers, and data deletions.<br>Enterprise only.|Enterprise|



## **7.3 Webhook Delivery — Outbound to ATS** 

When auto_push_brief is enabled and an analysis completes, the Integration Service delivers a POST request to the configured outbound_webhook_url with the following payload structure: 

_POST <outbound_webhook_url>  Content-Type: application/json  X-GitIntel-Signature: HMACSHA256(payload, webhook_secret)  X-GitIntel-Delivery: <uuid>  X-GitIntel-Event: analysis.complete { "event": "analysis.complete", "analysis_id": "<uuid>", "github_username": "<handle>", "mode": "light|deep", "status": "complete|partial", "brief_summary": { "profile_archetype": "...", "ai_leverage_classification": "...", "employment_verification_rung": 2, "red_flag_count": 1, "primitive_confidences": { "p1": "strong", "p2": "moderate", ... } }, "brief_url": "https://app.gitintel.io/briefs/<uuid>", "completed_at": "<ISO8601>" }_ 

Delivery retry policy: exponential backoff, 3 retries (30s, 5min, 30min). After 3 failures, delivery marked as failed and tenant admin notified. All delivery attempts logged to the audit trail. 

© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

## **8. Job Queue Architecture** 

## **8.1 Queue Design** 

The platform uses BullMQ (Redis Streams) for all asynchronous job management. Separate queues are maintained for each job type to enable independent scaling and priority management. 

|**Queue Name**|**Job Type**|**Concurrenc**<br>**y**|**Retry Policy**|**DLQ Threshold**|
|---|---|---|---|---|
|jobs:light|Light Mode<br>analysis jobs.|20<br>concurrent<br>workers|3 retries,<br>exponential<br>backoff (30s,<br>2min, 10min).<br>Retry on GitHub<br>rate limit or<br>transient error.<br>No retry on auth<br>failure.|After 3 retries:<br>dead letter queue.<br>Employer notified.<br>Usage unit not<br>billed.|
|jobs:deep:orch<br>estrate|Deep Mode<br>orchestration<br>(inventory crawl +<br>GraphQL fetch).|10<br>concurrent<br>workers|2 retries,<br>5min/30min<br>backoff.|DLQ after 2 retries.<br>Evaluation link<br>remains valid for 7<br>days — candidate<br>can re-trigger.|
|jobs:deep:clone|Deep Mode repo<br>clone sub-jobs (4<br>parallel clone<br>workers per<br>analysis).|40 total<br>clone slots<br>(10<br>analyses ×<br>4 workers<br>each)|1 retry per repo<br>clone. Skip repo<br>after retry failure<br>— mark as<br>partial.|No DLQ. Skipped<br>repos flagged in<br>brief.|
|jobs:cv_verify|CV Verifier jobs.|10<br>concurrent<br>workers|2 retries,<br>2min/10min<br>backoff.|DLQ after 2 retries.<br>Employer notified.|
|jobs:batch|Batch Light Mode<br>job coordinator<br>(one coordinator<br>per batch,<br>spawns individual<br>jobs:light entries).|5<br>concurrent<br>batch<br>coordinator<br>s|Coordinator is<br>retry-free.<br>Individual child<br>jobs inherit<br>jobs:light retry<br>policy.|Coordinator DLQ<br>triggers partial<br>batch completion<br>with report.|
|jobs:ats_outbou<br>nd|Outbound ATS<br>webhook delivery<br>jobs.|20<br>concurrent<br>workers|3 retries,<br>exponential<br>backoff (30s,<br>5min, 30min).|DLQ after 3 retries.<br>Tenant admin<br>notified. Delivery<br>failure logged.|
|jobs:billing|End-of-month|1 worker|3 retries with 1-|High-priority DLQ.|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

|**Queue Name**|**Job Type**|**Concurrenc**<br>**y**|**Retry Policy**|**DLQ Threshold**|
|---|---|---|---|---|
||usage<br>aggregation and<br>Stripe charge<br>jobs.|(serialised<br>per tenant)|hour spacing.<br>PagerDuty alert<br>on DLQ.|Engineering on-call<br>notified<br>immediately.|



## **8.2 GitHub Rate Limit Management** 

|**Token Type**|**Rate Limit**|**Strategy**|**Circuit Breaker**|
|---|---|---|---|
|Platform system<br>token (Light<br>Mode)|5,000 REST req/hr<br>shared across all<br>concurrent Light Mode<br>runs. GraphQL: 5,000<br>points/hr. Search API: 30<br>req/min.|GraphQL-first: nested<br>relational data fetched in<br>single batched queries<br>(~60% REST budget<br>saved). REST for flat<br>endpoints only. Search<br>API used sparingly.|If remaining<br>budget < 500<br>requests:<br>pause all new<br>Light Mode<br>jobs. Cache<br>partial results.<br>Resume after<br>rate limit<br>window resets<br>(tracked via X-<br>RateLimit-<br>Reset header).<br>Partial briefs<br>never<br>presented as<br>complete.|
|Candidate<br>installation token<br>(Deep Mode)|5,000 REST req/hr per<br>candidate — fully isolated<br>from Light Mode pool.|Same GraphQL-first<br>strategy. Isolated per<br>candidate — no cross-<br>candidate rate limit<br>sharing.|Per-candidate<br>circuit breaker<br>at < 500<br>remaining.<br>Pauses that<br>candidate's<br>clone workers<br>only.|
|GitHub Code<br>Search API|30 req/min<br>(authenticated).|Used sparingly for<br>laundering detection spot-<br>checks on flagged repos<br>only. Not used for general<br>enrichment.|Search<br>requests<br>queued with<br>minimum 2-<br>second<br>spacing. If<br>search triggers<br>secondary rate<br>limit, queue<br>pauses for 60<br>seconds.|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

## **9. Billing & Usage Metering Engine** 

## **9.1 Stripe Product Configuration** 

The billing engine uses Stripe for subscription management, metered overage billing, and invoice generation. The following Stripe products and prices must be configured per environment (staging and production). 

|**Stripe Product**|**Billing Model**|**Price IDs Needed**|
|---|---|---|
|Starter Plan Base|Flat monthly subscription —<br>$299/month.|price_starter_monthly|
|Scale-up Plan Base|Flat monthly subscription —<br>$899/month.|price_scaleup_monthly|
|Enterprise Plan Base|Custom — managed via<br>Stripe quotes and invoices.|N/A — manual billing.|
|Light Mode Overage|Metered billing — $4.00 per<br>unit. Billed monthly via<br>usage records.|price_light_overage_metered|
|Deep Mode Overage|Metered billing — $18.00<br>per unit. Billed monthly via<br>usage records.|price_deep_overage_metered|
|CV Verifier Overage|Metered billing — $6.00 per<br>unit (Scale-up only).|price_cv_overage_metered|



## **9.2 Usage Metering Flow** 

- When an analysis is triggered: a usage_events record is created with billed=false. The usage unit is reserved against the tenant's monthly quota. 

- When an analysis completes: the usage_events record is updated with the final billing_units (1.0 or 0.5 for partial). If the tenant is over quota, a Stripe Usage Record is created immediately via the Stripe API (stripe.subscriptionItems.createUsageRecord). 

- If an analysis fails after job DLQ: the usage_events record is deleted. No charge is applied. 

- At end of month (01:00 UTC on 1st of each month): a jobs:billing job aggregates all billed=false usage_events for the previous period, creates Stripe Usage Records for any unreported overage, and marks events as billed=true. 

- If a monthly charge fails: the account enters a 72-hour grace period. After 72 hours without successful payment, all analysis jobs are paused. Employer is notified via email at 0h, 24h, and 72h. 

© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

## **9.3 Quota Enforcement** 

Quota enforcement happens at the API Gateway layer, before any job is enqueued. The following check sequence must execute in order: 

- 1. Is the tenant in 'paused' or 'cancelled' status? If yes, reject with 402 Payment Required. 

- 2. Is the tenant on a Free Trial? Check trial_runs_used against the 5-run cap and trial_expires_at against current timestamp. If either exceeded, redirect to upgrade flow (402 with upgrade URL). 

- 3. Is the requested feature enabled for the tenant's plan? (cv_verifier_enabled, batch_upload_enabled, etc.) If not, reject with 403 Feature Not Available. 

- 4. Does the tenant have remaining included quota for the current month? If yes, proceed and reserve 1 unit. 

- 5. If over quota: is overage allowed for the tenant's plan? (Allowed for Starter and Scale-up. Blocked for Enterprise only if contract terms specify — configurable per tenant.) If overage allowed, proceed. If not, reject with 429 Quota Exceeded. 

© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

## **10. ATS & HRIS Integration Layer** 

## **10.1 ATS Inbound Webhook Handlers** 

Each supported ATS provider delivers events to provider-specific inbound endpoints. All endpoints verify the HMAC-SHA256 signature using the tenant's webhook_secret before processing. The handlers normalize provider-specific payloads into a canonical CandidateEvent struct before dispatching to the analysis pipeline. 

|**ATS Provider**|**Inbound Endpoint**|**Event Types Consumed**|**GitHub Username**<br>**Source**|
|---|---|---|---|
|Lever|/api/v1/webhooks/lever/<br>inbound|candidate.created,<br>application.created,<br>stage.changed (to<br>configurable stages).|Candidate profile link<br>field. Fallback: email<br>domain match.|
|Greenhouse|/api/v1/webhooks/<br>greenhouse/inbound|candidate_hired,<br>application_created,<br>prospect_created.|Custom application<br>question: 'GitHub<br>username'. Fallback:<br>email domain match.|
|Ashby|/api/v1/webhooks/<br>ashby/inbound|applicationCreated,<br>applicationStageChange<br>d.|Social links field<br>(GitHub URL parsed).<br>Fallback: email<br>domain match.|
|iCIMS (Phase<br>4)|/api/v1/webhooks/<br>icims/inbound|Application status<br>change events.|Custom profile field<br>configuration required.|
|SAP<br>SuccessFact<br>ors (Phase 4)|/api/v1/webhooks/<br>successfactors/inbound|Position application<br>events via SAP<br>Intelligent Services.|Custom field mapping<br>at tenant setup.|



## **10.2 Canonical CandidateEvent Struct** 

_{ "event_id": "<uuid>", "ats_provider": "lever|greenhouse|ashby", "ats_candidate_id": "<provider_id>", "ats_application_id": "<provider_id>", "candidate_email": "<email>", "github_username": "<handle>|null", "job_requisition_id": "<provider_id>", "job_title": "<string>", "event_type": "application_created|stage_changed|...", "received_at": "<ISO8601>" }_ 

## **10.3 HRIS Connectors (Enterprise Only — Phase 4)** 

HRIS connectors operate in outbound-push mode: when an Evidence Brief is completed, the Integration Service pushes a summary to the candidate record in the HRIS. No inbound data is pulled from the HRIS for analysis purposes. 

© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

|**HRIS Provider**|**Integration Method**|**Fields Written**|**Auth Method**|
|---|---|---|---|
|Workday|Workday REST API<br>(Worker Data API)|gitintel_brief_url (URL),<br>gitintel_profile_archetype<br>(text),<br>gitintel_red_flag_count<br>(number),<br>gitintel_ai_leverage (text),<br>gitintel_ev_rung (number).|OAuth 2.0 with<br>tenant-issued client<br>credentials.<br>Scoped to<br>candidate record<br>write.|
|BambooHR|BambooHR API v1|Custom field group: GitIntel<br>Assessment. Same field set<br>as Workday.|API key (per-<br>tenant, stored<br>encrypted).|
|Rippling|Rippling App Platform|Custom fields via Rippling<br>App SDK. Delivered as<br>candidate enrichment<br>module.|Rippling OAuth<br>App authorization<br>flow.|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

## **11. Compliance, Data Privacy & Security** 

## **11.1 Data Retention Policy** 

|**Data Class**|**Retention Duration**|**Deletion Trigger**|
|---|---|---|
|Source code (Deep<br>Mode cloned repos)|Session only. Deleted<br>from tmpfs immediately<br>after analysis completes<br>or fails. Never persisted to<br>permanent storage.|Job completion or job failure handler.|
|Raw GitHub API<br>response data|30 days maximum from<br>collection. Stored<br>temporarily in Redis with<br>TTL for pipeline<br>resumption only.|Redis TTL expires automatically. Also<br>purged on GDPR deletion request.|
|Derived metrics<br>(primitive signals)|Retained for 90 days from<br>analysis date.|Scheduled cleanup job, daily. Also<br>purged on GDPR deletion request.|
|Evidence Brief<br>(scores + narrative)|12 months with candidate<br>consent. 90 days without<br>explicit consent.|Scheduled cleanup job. Immediate<br>deletion on GDPR/CCPA deletion<br>request.|
|Usage events (billing<br>records)|7 years (financial record<br>retention requirement).<br>Anonymised after 12<br>months (github_username<br>replaced with SHA-256<br>hash).|Post-anonymisation scheduled job.<br>Financial record exception to GDPR<br>right to erasure.|
|Audit log entries|3 years for Enterprise. 1<br>year for other tiers.|Scheduled cleanup job.|
|Candidate access<br>tokens (GitHub App)|Deleted immediately after<br>analysis completes or<br>evaluation link expires/is<br>revoked.|Job completion handler. Link expiry job.|



## **11.2 GDPR / CCPA Compliance** 

- Data Processing Agreement (DPA): Enterprise tenants execute a DPA at contract time. Starter and Scale-up tenants accept the standard DPA via Terms of Service at signup. 

- Data Subject Rights: A GDPR/CCPA deletion endpoint is available to employers: DELETE /api/v1/candidates/:github_username/data. This triggers immediate deletion of all Evidence Briefs, derived metrics, and raw API data for the candidate within the tenant. Usage events are anonymised (not deleted) per financial record retention requirements. 

© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

- Candidate Consent (Deep Mode): The candidate consent page presents the exact list of repositories to be accessed before GitHub App installation. Consent is recorded in the evaluation_links record. Consent withdrawal: a candidate-accessible link in the consent confirmation email triggers GitHub App uninstallation and data deletion. 

- Data Residency: Enterprise tenants select US or EU at tenant creation. EU tenants are served from the EU deployment region with no cross-region data transfer for personal data. 

- Encryption at rest: All candidate personal data (emails, GitHub tokens, CV text) stored AES-256GCM encrypted. Database encryption at rest via cloud provider (AWS RDS encryption or GCP Cloud SQL encryption). 

- Encryption in transit: TLS 1.3 minimum on all external endpoints. mTLS on internal service-toservice communication. 

## **11.3 Security Controls** 

|**Control**|**Implementation**|
|---|---|
|API authentication|JWT RS256 with 15-minute access token lifetime. Refresh token<br>rotation on every use.|
|Webhook signature<br>verification|HMAC-SHA256 on all inbound ATS webhooks. Constant-time<br>comparison to prevent timing attacks.|
|GitHub token storage|AES-256-GCM encryption with per-record IV. Encryption key<br>managed via AWS KMS or GCP Cloud KMS. Key rotation every 90<br>days.|
|Database access|RLS policies enforce tenant isolation at Postgres level. No cross-<br>tenant queries permitted. Connection pooled via PgBouncer.|
|Clone worker<br>isolation|Each clone worker runs in an isolated container (Docker, no host<br>networking). tmpfs only — no persistent disk. Network egress<br>restricted to GitHub HTTPS only.|
|Secret scanning|gitleaks in Deep Mode. Credential exposure in any analysis triggers<br>hard security flag — no soft-failure path.|
|LLM API security|No raw source code sent to LLM API. Only derived metadata,<br>commit message text, PR description text, and README text.<br>Explicit contract with Claude API regarding no training on submitted<br>data.|
|Audit logging|All admin actions, analysis triggers, data deletions, and configuration<br>changes logged immutably. Logs forwarded to SIEM (configurable —<br>Datadog, Splunk, or CloudWatch).|
|Penetration testing|Annual third-party pentest required before Enterprise GA. Results<br>and remediation tracked in security backlog.|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

## **12. Evidence Brief — Section Specification** 

The Evidence Brief is the primary product output. It is assembled by the Evidence Brief Service and stored as Markdown (brief_md) and structured JSON (primitive_scores + supporting fields in evidence_briefs). The following sections are mandatory for all briefs. Sections F and G have conditional inclusion rules. 

|**Se**<br>**cti**<br>**on**|**Title**|**Contents**|**Conditional**|
|---|---|---|---|
|A|Profile in 90<br>Seconds|Engineering operating style archetype. Three<br>strongest evidenced capabilities with specific<br>citation. Employment verification rung achieved<br>per claim. AI Leverage Quality classification.<br>Analysis mode used. Recommended interview<br>depth.|Always included.|
|B|Tech Reality<br>vs. CV<br>Claims|Languages: claimed vs. evidenced by actual<br>commit volume over last 3 years (not repo count,<br>not self-reported). Frameworks: mentioned vs.<br>demonstrated. Infrastructure: claims vs. evidence<br>of IaC, deployments. Explicit flags for CV claims<br>with zero corroborating evidence.|Always included.<br>Depth increases<br>when CV Verifier<br>has been run.|
|C|Work Pattern<br>Intelligence|Shipping velocity (issue creation to merged PR,<br>averaged over career timeline). Quality discipline<br>trajectory over time. Collaboration style. AI<br>Leverage Quality classification with supporting<br>evidence. Communication quality in PR<br>descriptions and code comments.|Always included.|
|D|Red Flags &<br>Verification<br>Gaps|All gaming flags and verification gaps with: the<br>specific evidence that triggered the flag,<br>confidence level (false positive likelihood),<br>recommended interview question, and whether it<br>is a hard stop or soft concern.|Always included.<br>Empty section if no<br>flags — never<br>omitted (empty<br>state is a positive<br>signal to display<br>explicitly).|
|E|Interview<br>Intelligence|3–5 technical questions generated from actual<br>design decisions observed in the candidate's<br>code. Questions probing gaps between CV<br>claims and evidenced capabilities. Questions that<br>explore red flags without revealing the detection<br>mechanism.|Included in all Deep<br>Mode briefs.<br>Available in Light<br>Mode briefs when<br>LLM confidence is<br>sufficient.|
|F|Role & Stack<br>Match|Technical overlap between candidate's<br>evidenced stack and role requirements. Gap<br>analysis: skills required by the role with no<br>evidence in the candidate's profile. JD intent|Included only when<br>jd_text was<br>provided at analysis<br>trigger time. Deep|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

|**Se**<br>**cti**<br>**on**|**Title**|**Contents**|**Conditional**|
|---|---|---|---|
|||extraction: what the role actually needs beyond<br>keyword matching.|Mode and Scale-up<br>/ Enterprise only.|
|G|What This<br>Evaluation<br>Cannot Tell<br>You|Explicit list of qualities outside the epistemic<br>boundary of the system, routed to specific<br>interview probes. This section is permanent and<br>never omitted.|Always included.<br>Content varies by<br>mode and<br>confidence levels<br>achieved.|



_IMPLEMENTATION RULE: Section G ('What This Evaluation Cannot Tell You') MUST appear in every Evidence Brief. It cannot be hidden, collapsed, or omitted by any tenant configuration. This section is the system's epistemic honesty contract with the hiring manager. It must list, at minimum: problem-solving approach under novel ambiguity, verbal communication clarity, cultural fit, motivation and growth trajectory, and performance under pressure._ 

© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

## **13. Phased Feature Rollout** 

## **Phase 1 — Week 1–4 — Fake Resume Killer** 

Fastest path to revenue. Light Mode only. Single CTA: 'Paste a GitHub username, get a fraud report in 3 minutes.' Free trial = 5 Light Mode runs. Charge from run 6. 

|**Deliverable**|**Priority**|**Notes**|
|---|---|---|
|Light Mode analysis pipeline|P0|Full Groups A/B/C/D/F. GraphQL-first<br>strategy. Circuit breaker.|
|Anti-gaming detection (API-only)|P0|Commit inflation, burst/dormancy, fork dump<br>ratio. GitHub Code Search laundering.|
|LLM analysis integration|P0|Commit message quality, AI-generation<br>pattern detection, PR description depth.|
|P7 Authenticity Confidence scoring|P0|Employment verification Rung 1 only.|
|Evidence Brief assembly (Sections<br>A–D, G)|P0|Markdown rendered in dashboard. PDF<br>export. Section E/F excluded in Phase 1.|
|Tenant auth, signup, Stripe Starter<br>plan|P0|Email/password login. JWT. Stripe<br>subscription creation. Free trial<br>enforcement.|
|Usage metering (Light Mode)|P0|Quota enforcement. Overage tracking.<br>Usage events table.|
|Dashboard MVP|P0|Brief viewer. Analysis trigger. Usage<br>display.|
|All 7 primitives (Light Mode<br>confidence)|P1|P1–P6 at moderate/low confidence from<br>public signals. P7 primary focus.|
|Outcome data schema|P1|Build schema from Phase 1 for feedback<br>loop validation later.|



## **Phase 2 — Month 2 — Batch Screening Dashboard** 

CSV upload. Ranked batch output. Monthly retainer model replaces per-run. Starter → Scale-up upsell path opens. 

© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

|**Deliverable**|**Priority**|**Notes**|
|---|---|---|
|Batch Light Mode (CSV upload)|P0|Max 500 candidates. Async batch<br>coordinator. Per-candidate jobs:light<br>dispatch.|
|Role archetype configuration|P0|Backend, Frontend, Platform/SRE,<br>Data/ML, Security, Mobile signal weighting.|
|Seniority-adjusted brief narratives|P0|Primitive weight shift logic. P3 Collaboration<br>Leverage gap handling for enterprise<br>profiles.|
|Scale-up plan + ATS webhook stubs|P0|Stripe Scale-up subscription. ATS<br>integration UI (webhook config). Lever +<br>Greenhouse inbound handlers.|
|Package registry signals (npm,<br>PyPI, Cargo)|P1|External Signal Group F enrichment.|
|Stack Overflow enrichment (Tier 3)|P1|Additive only. Absence carries no negative<br>weight.|
|Batch result dashboard|P0|Ranked candidate list with primitive<br>confidence summary per candidate.<br>Sort/filter by flag count, archetype, seniority<br>match.|



## **Phase 3 — Month 3–4 — Deep Mode & Interview Intelligence** 

Full private repo analysis. Candidate consent flow. Interview Intelligence (Section E). Primary Scale-up upsell and RPO sales motion launch. 

|**Deliverable**|**Priority**|**Notes**|
|---|---|---|
|GitHub App (Deep Mode) — app<br>registration + installation flow|P0|Per-candidate installation token. Consent<br>page with repo selection. Installation ID<br>storage.|
|Deep Mode pipeline — clone<br>workers (x4 parallel)|P0|Top 30 repos cloned. scc + tokei +<br>gitinspector + gitleaks + semgrep.|
|Employment verification Rungs 2–3|P0|Org membership API. Contribution<br>fingerprint temporal analysis.|
|Section E — Interview Intelligence|P0|3–5 LLM-generated questions from code<br>design decisions. Probe questions for CV<br>gaps and red flags.|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

|**Deliverable**|**Priority**|**Notes**|
|---|---|---|
|Full AI Leverage Quality<br>classification|P0|ai_operator, ai_architect, ai_passenger,<br>traditional, disclosure_flag.|
|Copyleaks Code API integration|P1|Secondary laundering detection on GitHub<br>Code Search flagged repos.|
|Ashby ATS inbound webhook|P1|Third ATS provider.|
|Deep Mode brief PDF export|P0|Sections A–E + G. Section F if JD provided.|



## **Phase 4 — Month 5–6 — CV Verifier & Enterprise** 

Full ATS integration. CV Verifier mode. HRIS connectors. SSO/SCIM. Enterprise procurement readiness. RPO reseller model. 

|**Deliverable**|**Priority**|**Notes**|
|---|---|---|
|CV Verifier mode — LLM claim<br>extractor + cross-check engine|P0|CV PDF/DOCX parse → structured claims<br>→ GitHub signal cross-check →<br>discrepancy report.|
|Section F — Role & Stack Match|P0|JD intent extraction + candidate gap<br>analysis. Requires jd_text input.|
|SSO — SAML 2.0 + OIDC|P0|Enterprise login federation. Passport.js +<br>SAML strategy.|
|SCIM 2.0 user provisioning|P0|Automated user create/update/deactivate<br>from enterprise IdP.|
|HRIS connectors — Workday,<br>BambooHR, Rippling|P1|Outbound candidate enrichment. Evidence<br>Brief summary fields pushed to HRIS.|
|iCIMS + SAP SuccessFactors ATS<br>inbound|P1|Enterprise ATS coverage.|
|White-label tenant config|P1|Custom subdomain, logo, primary colour.<br>Per-tenant CSS variables.|
|Outcome feedback API|P1|POST endpoint for post-hire performance<br>signals. Anti-gaming validation loop.|
|RPO sub-tenant model|P1|Master RPO account with child tenants.<br>Branded evaluation links per child. Volume-<br>tiered reseller pricing.|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

|**Deliverable**|**Priority**|**Notes**|
|---|---|---|
|Enterprise audit log + SIEM<br>integration|P0|Immutable audit log. Datadog / Splunk /<br>CloudWatch export.|
|Data residency (EU region)|P0|EU deployment region. No cross-region<br>personal data transfer for EU tenants.|
|Annual contract billing (Stripe<br>quotes)|P0|PO-number invoicing. Custom payment<br>terms. Stripe Quote workflow.|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

## **14. Operational Concerns & SLAs** 

## **14.1 Uptime & SLA Targets** 

|**Tier**|**Uptime SLA**|**P1 Support**<br>**Response**|**Planned Maintenance Window**|
|---|---|---|---|
|Trial / Starter|Best-effort (no<br>SLA)|Email, 48-hour|Any time with 48h notice|
|Scale-up|99.5% monthly|Email + Slack, 24-<br>hour|Saturdays 02:00–06:00 UTC|
|Enterprise|99.9% monthly|4-hour P1, 24-hour<br>P2|Sundays 02:00–06:00 UTC.<br>Emergency windows by<br>agreement.|



## **14.2 Observability Stack** 

- Metrics: Prometheus + Grafana. Key dashboards: analysis pipeline throughput, queue depths per lane, GitHub rate limit remaining (updated every 60 seconds), LLM API latency and error rates. 

- Tracing: OpenTelemetry across all services. Jaeger for distributed trace storage. Every analysis_id propagated as a trace root span. 

- Logging: Structured JSON logs. Forwarded to centralised log aggregator (Datadog or ELK). Log level: INFO in production. DEBUG available via feature flag per tenant for support escalations. 

- Alerts: PagerDuty integration. Alerts for: queue depth > 100 for > 5 minutes (P2), GitHub rate limit < 500 (P3), Stripe billing job DLQ (P1), clone worker crash (P2), LLM API error rate > 5% (P2). 

## **14.3 Infrastructure Sizing (Phase 1)** 

|**Component**|**Phase 1 Sizing**|**Scaling Trigger**|
|---|---|---|
|API Gateway<br>(Node.js)|2 × 2vCPU, 4GB RAM. Load<br>balanced.|CPU > 70% for 5 minutes → add 1<br>instance.|
|Light Mode<br>Workers (Python)|4 × 2vCPU, 4GB RAM.<br>Horizontal.|Queue depth > 20 → add 1 worker.<br>Scale down after 15 minutes idle.|
|Deep Mode Clone<br>Workers|4 × 4vCPU, 8GB RAM, 50GB<br>tmpfs each.|Manual scaling review after Phase 3<br>GA. Triggered by active Deep Mode<br>queue depth.|
|Evidence Brief<br>Service (Python)|2 × 2vCPU, 4GB RAM.|LLM API call concurrency limit<br>governs — not CPU.|
|Redis (BullMQ +|1 × Redis 7 cluster, 3 nodes,|Memory > 70% → expand cluster.|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

|**Component**|**Phase 1 Sizing**|**Scaling Trigger**|
|---|---|---|
|cache)|8GB RAM each.||
|Postgres 16|1 × primary, 1 × read replica.<br>4vCPU, 16GB RAM, 500GB<br>SSD.|Read replica auto-scales at Phase 3.<br>Write primary manually scaled on<br>request volume.|
|Integration Service<br>(Node.js)|2 × 2vCPU, 2GB RAM.|Webhook volume scales with ATS<br>integration adoption (Phase 2+).|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

## **Appendix A — Glossary** 

|**Term**|**Definition**|
|---|---|
|Analysis|A single execution of the analyser pipeline (Light, Deep, or CV<br>Verifier) for one candidate.|
|Evidence Brief|The structured output of an analysis. Contains seven primitive<br>assessments, red flags, interview questions, and epistemic<br>limitations.|
|Light Mode|Public-signal analysis. No candidate action required. Under 3<br>minutes.|
|Deep Mode|Full analysis including private repos. Requires candidate<br>GitHub App installation and consent.|
|CV Verifier|Enhancement mode that cross-checks CV claims against<br>GitHub evidence.|
|Primitive|One of seven canonical assessment dimensions: Execution<br>Reliability, Systems Evolution, Collaboration Leverage,<br>Technical Depth, Operational Maturity, AI Leverage Quality,<br>Authenticity Confidence.|
|Observability Gap|A dimension that cannot be assessed because evidence is<br>absent or private — not a candidate failure.|
|Anti-Gaming Layer|Detection algorithms for commit inflation, fork dumping,<br>burst/dormancy, repository laundering, and AI-generation<br>disclosure gaps.|
|Employment Verification<br>Rung|A 0–3 scale of confidence that a candidate worked at a stated<br>employer, based on email domain (1), org membership (2),<br>and contribution fingerprint (3).|
|Circuit Breaker|GitHub rate limit safety mechanism. Pauses analysis and<br>caches partial results when remaining budget < 500 requests.|
|Partial Brief|An Evidence Brief produced when circuit breaker fired or fewer<br>than 4 primitives could be assessed. Billed at 50% rate.|
|AI Leverage Classification|One of five labels assigned to P6: ai_operator, ai_architect,<br>ai_passenger, traditional, disclosure_flag.|
|Tenant|An organisation with a GitIntel HR Platform subscription. All<br>data is isolated per tenant via RLS.|
|DLQ|Dead Letter Queue. Holds jobs that have exhausted retry|



© 2026 GitIntel. Internal use only. 

GitIntel HR Platform  ·  Backend Technical Specification  ·  v1.0  ·  May 2026  ·  CONFIDENTIAL 

|**Term**|**Definition**|
|---|---|
||attempts. Triggers engineering alert and employer notification.|
|RPO|Recruitment Process Outsourcing firm — a reseller / high-<br>volume user persona.|



_END OF DOCUMENT — GitIntel HR Platform Backend Technical Specification v1.0 · May 2026_ 

© 2026 GitIntel. Internal use only. 

