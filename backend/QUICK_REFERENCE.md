# GitIntel Migration — Quick Reference Guide

**Last Updated:** June 1, 2026  
**Print This:** Quick lookup for daily work

---

## 📋 DOCUMENTS & WHERE TO FIND THEM

| Document | Location | Use When |
|----------|----------|----------|
| **Handoff & Executive Summary** | `backend/HANDOFF_AND_EXECUTIVE_SUMMARY.md` | Starting work, understanding scope |
| **Comprehensive Migration Plan** | `backend/MIGRATION_PLAN_TO_TARGET_ARCHITECTURE.md` | 8-week planning, status updates |
| **Implementation Checklist** | `backend/IMPLEMENTATION_CHECKLIST.md` | Daily task assignments |
| **User Flows & Goals Verification** | `backend/USER_FLOWS_AND_GOALS_VERIFICATION.md` | Testing, final validation |
| **Refactor Plan (Master)** | `backend/DEEPSEEK_V4_REFACTOR_PLAN.md` | Deep dive into stages 0–8 |
| **Target Architecture Spec** | `backend/Analysys_specs_architecture.md` | Understanding 3-layer pipeline |
| **Architecture Gap Analysis** | `backend/ARCHITECTURE_REFACTOR_ANALYSIS.md` | Comparing legacy vs. target |
| **User Flows (Traces)** | `backend/src/modules/analysis/FINAL_USER_FLOWS.md` | Expected tracing output |

---

## 🎯 WHAT TO DO TODAY

### If You're the Project Manager
```
1. Read: HANDOFF_AND_EXECUTIVE_SUMMARY.md (30 min)
2. Create Jira epic from IMPLEMENTATION_CHECKLIST.md
3. Schedule Monday planning with backend team
4. Ensure 2 engineers allocated full-time
```

### If You're a Backend Engineer
```
1. Read: HANDOFF_AND_EXECUTIVE_SUMMARY.md (30 min)
2. Read applicable Stages from IMPLEMENTATION_CHECKLIST.md
3. Clone fresh branch: git checkout -b feat/stage-X-[task]
4. Run: npm test -- "analysis/" (verify current state)
5. Pick first task, implement + test
```

### If You're QA/Testing
```
1. Read: USER_FLOWS_AND_GOALS_VERIFICATION.md (1 hour)
2. Wait: Until Week 6 (Swagger ready)
3. Start: Swagger UI testing from /api/docs
4. Execute: npm test:e2e -- "test/analysis/"
```

---

## 🚀 WEEKLY SCHEDULE

| Week | Focus | Stages | Deliverable |
|------|-------|--------|---|
| **1** | Corpus + Modules | 1–2 | All 14 modules passing unit tests |
| **2** | Wave Orchestration | 3 | 5 waves (1, 2a[cond], 2b/c/d[parallel], 3, 4) |
| **3–4** | Data Collection + LLM | 4–5 | Light Mode end-to-end working |
| **5–6** | Brief Assembly + Swagger | 6–7 | All endpoints callable from /api/docs |
| **7–8** | Testing + Integration | 8 | Production ready |

---

## 🧪 COMMON TEST COMMANDS

```bash
# Corpus layer
npm test -- "corpus/*.spec.ts"

# Individual modules
npm test -- "modules/primitives/p1*.spec.ts"
npm test -- "modules/anti-gaming/ag1*.spec.ts"
npm test -- "modules/employment/ev*.spec.ts"

# Orchestration
npm test -- "orchestration/*.spec.ts"

# All analysis tests
npm test -- "analysis/"

# E2E tests (run locally)
npm test:e2e -- "test/analysis/analysis-light-mode.e2e-spec.ts"
npm test:e2e -- "test/analysis/analysis-deep-mode.e2e-spec.ts"
npm test:e2e -- "test/analysis/analysis-cv-verify.e2e-spec.ts"

# Run with tracing
TRACING_LEVEL=detailed npm start

# View Swagger docs
npm start  # then open http://localhost:3000/api/docs
```

---

## 📊 ARCHITECTURE AT A GLANCE

```
REQUEST: POST /api/v2/analysis/light
         ↓
[JobDispatcher]
         ↓
[CorpusCache] ← Redis 7d TTL
    ├─ Cache Hit? → Skip to Waves
    └─ Cache Miss? → Fetch Data
         ↓
[DataCollector] ← 7 groups (A–G) parallel
         ↓
[SignalCorpus] ← Merged into Redis
         ↓
[WaveOrchestrator]
    ├─ Wave 1: AG1, AG2, AG3 (parallel, ~2s)
    ├─ Wave 2a: AG4 (conditional, ~20s if triggered)
    ├─ Wave 2b/c/d: P1–P5 (parallel, ~1s)
    ├─ Wave 3: P6 + AG5 + LLM batch (need to wait, ~25s)
    └─ Wave 4: Brief + Narrative LLM (wait, ~20s)
         ↓
[BriefAssembler]
    ├─ Section A: Profile in 90 Seconds
    ├─ Section B: CV Claims Cross-Reference
    ├─ Section C: Work Pattern Intelligence
    ├─ Section D: Red Flags
    ├─ Section E: Interview Probes
    ├─ Section F: Technical Assessment
    └─ Section G: Limitations
         ↓
RESPONSE: { jobId, status, result }
         ↓
GET /api/v2/analysis/{jobId} polls until complete
```

---

## 🎪 THE 14 MODULES

### P1–P7: Primitives (Capability Scores)
| Module | Groups | When | LLM? |
|--------|--------|------|------|
| P1: Execution Reliability | C, E | Wave 2b | No |
| P2: Systems Evolution | C, E | Wave 2b | No |
| P3: Collaboration Leverage | D | Wave 2c | No |
| P4: Technical Depth | B, D, F | Wave 2d | No |
| P5: Operational Maturity | E | Wave 2b | No |
| P6: AI Leverage | C, D, A | Wave 3 | **Yes** |
| P7: Authenticity/Domain Fit | All | Wave 2d | No |

### AG1–AG6: Anti-Gaming Detectors
| Module | Groups | Flags | LLM? |
|--------|--------|-------|------|
| AG1: Commit Inflation | C | Yes | No |
| AG2: Fork Dump | B | Yes | No |
| AG3: Burst Dormancy | C, G | Yes | No |
| AG4: Repository Laundering | B, C | Yes | No (uses Search API) |
| AG5: AI Generation Detection | C, D | Yes | **Yes** |
| AG6: Credential Leak | E | Yes | No |

### EV: Employment Verification
| Module | Groups | Cross-Ref | LLM? |
|--------|--------|-----------|------|
| EV: Employment Verification | A, C, D | CV claims | No |

---

## 🔐 ENVIRONMENT VARIABLES

**Deepseek v4 (Required Week 3+):**
```bash
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_MAX_TOKENS=4096
DEEPSEEK_TEMPERATURE=0
DEEPSEEK_TIMEOUT_MS=35000
```

**GitHub App (Required Week 4+):**
```bash
GITHUB_APP_ID=12345
GITHUB_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----..."
GITHUB_WEBHOOK_SECRET=whsec_...
```

**Tracing (Optional, any time):**
```bash
TRACING_LEVEL=detailed  # or "summary" or "off"
TRACING_COMPONENTS=DataCollector,WaveOrchestrator  # optional filter
```

---

## ✅ SUCCESS CRITERIA (FINAL VERIFICATION)

- [ ] All 5 Swagger endpoints show in /api/docs
- [ ] Light Mode: POST → 30s data collection → brief (2–3 min total)
- [ ] Deep Mode: POST → private repos cloned → brief (5–10 min total)
- [ ] CV Verify: POST with CV text → Section B populated  
- [ ] Cache Hit: Same username, different seniority → no re-collection (< 5s)
- [ ] Error Cases: Bad input → 400; LLM failure → fallback narrative
- [ ] Trace logs: TRACING_LEVEL=detailed shows all waves
- [ ] All 14 modules in result: moduleResults[] has 14 entries
- [ ] Brief rendering: 7 sections in Markdown + JSON
- [ ] No legacy API breaking: Old consumers still work OR clear timeline

---

## 🚨 COMMON ISSUES & QUICK FIXES

| Problem | Cause | Fix |
|---------|-------|-----|
| Module test fails | Missing corpus group handling | Add `preflight()` check in module |
| Swagger won't load | DTO missing @ApiProperty | Add decorators to all fields |
| Wave 2a runs always | Gate logic wrong | Check: `if (ag1Flags \|\| ag3Flags)` |
| LLM timeout | API too slow | Check DEEPSEEK_TIMEOUT_MS, add retry |
| Brief has errors | Section rendering broke | Check brief-renderer.ts template |
| E2E test hangs | Job stuck in wave_1 | Check orchestrator state machine |

---

## 📞 WHO TO ASK

| Question | Ask |
|----------|-----|
| How does Wave 3 LLM call work? | Read DEEPSEEK_V4_REFACTOR_PLAN.md Stage 5 |
| What signals go in Group B? | Read Analysys_specs_architecture.md Section 1.4 |
| How should P1 module score? | Read Analysys_specs_architecture.md Section 3.P1 |
| What are the exact traces? | Read FINAL_USER_FLOWS.md "Example Trace Output" |
| Did I implement module correctly? | Run `npm test -- "modules/primitives/p1*.spec.ts"` |
| Is Swagger complete? | Check `npm test:e2e -- "test/analysis/analysis-swagger.e2e-spec.ts"` |
| Is Light Mode working? | Run `npm test:e2e -- "test/analysis/analysis-light-mode.e2e-spec.ts"` |

---

## 📈 PROGRESS TRACKING

**Week 1 Target:** ✅ Corpus + 14 modules complete  
**Week 2 Target:** ✅ Wave orchestrator complete  
**Week 3–4 Target:** ✅ Light Mode end-to-end working  
**Week 5–6 Target:** ✅ All Swagger endpoints documented  
**Week 7 Target:** ✅ E2E tests passing  
**Week 8 Target:** ✅ Production ready  

---

**Print this page, keep handy, reference daily.**

**Questions?** → Open the relevant document from the table above.

**Ready to start?** → Pick a task from `IMPLEMENTATION_CHECKLIST.md` and code!
