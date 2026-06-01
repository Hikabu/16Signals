# GitIntel Migration — Executive Summary & Handoff Document

**Date:** June 1, 2026  
**Status:** Ready for Implementation  
**Effort:** ~430 hours (8 weeks with 2 engineers)  
**Risk Level:** Medium (modular stages allow risk mitigation)

---

## SITUATION

The 16Signals backend has two analysis systems:
1. **Legacy (current):** Monolithic in `/modules/scoring/` — tightly coupled, single-threaded
2. **Refactored (new):** Composable in `/modules/analysis/` — 3-layer architecture, modular

**Goal:** Fully migrate from legacy to refactored architecture and ensure all user flows work through Swagger API.

---

## CURRENT STATE (As of June 1, 2026)

### Infrastructure ✅ Complete
- Prisma schema updated (signal_corpora, evidence_briefs tables)
- Corpus types & caching (Redis 7d TTL)
- Module interface & registry
- AnalysisV2Controller with 3 endpoints (light, cv-verify, deep)
- All 14 module files created (need implementation verification)
- Wave orchestrator skeleton (needs completion)
- Data collector skeleton (needs completion)
- LLM integration skeleton (needs completion)
- Brief assembler skeleton (needs completion)

### Missing / Incomplete 🟡
- All 14 module logic verification & testing (50+ hours)
- Wave orchestration full implementation (60 hours)
- Data collector group logic (80 hours)
- LLM integration logic (30 hours)
- Brief assembly rendering (50 hours)
- Swagger documentation (20 hours)
- E2E test suite (40 hours)
- Deep mode clone workers (60 hours)

**Total Remaining:** ~430 hours

---

## DELIVERABLES

### Document 1: Complete Migration Plan
**File:** `MIGRATION_PLAN_TO_TARGET_ARCHITECTURE.md`

Contains:
- Executive summary of both systems
- Gap analysis (35% aligned, 40% refactor needed, 25% new build)
- 8-stage roadmap (weeks 1–8)
- Effort estimates per stage
- Verification checklist for all target architecture goals
- Rollback plan

**Use This When:** Planning the overall initiative, explaining scope to stakeholders

---

### Document 2: Implementation Checklist
**File:** `IMPLEMENTATION_CHECKLIST.md`

Contains:
- Quick status of what's done vs. incomplete
- Stage-by-stage checklist with specific tasks
- Test command references
- Quick start for new developers
- Template for module implementation

**Use This When:** Assigning daily tasks, tracking progress, onboarding engineers

---

### Document 3: User Flows & Goals Verification
**File:** `USER_FLOWS_AND_GOALS_VERIFICATION.md`

Contains:
- 5 user flow specifications (with exact Swagger request/response)
- Callability tests from Swagger UI
- 10 target architecture goals with verification steps
- Final verification checklist (success criteria)
- Command reference

**Use This When:** Testing implementation, ensuring all endpoints work, final validation

---

## CRITICAL PATH (WHAT TO DO FIRST)

### Week 1: Stages 1–2 (Corpus + Modules)
1. **Verify corpus layer** (2 hours)
   - Run: `npm test -- "corpus/*.spec.ts"`
   - Check Redis TTL works, cache hit/miss logic

2. **Complete & test 14 modules** (40 hours)
   - Each module must: Have evidence collection, confidence logic, flags, interview probes
   - Reference: Analysys_specs_architecture.md Section 3 (P1–P7)
   - Test each: `npm test -- "modules/primitives/p1*.spec.ts"`

3. **Deliverable:** All modules passing unit tests

### Week 2: Stage 3 (Wave Orchestration)
1. **Complete wave orchestrator** (30 hours)
   - Wave 1: AG1, AG2, AG3 parallel
   - Wave 2a: Conditional gate
   - Waves 2b/c/d: Parallel P1–P5
   - Wave 3: LLM batch call
   - Wave 4: Brief assembly + narratives

2. **Test wave sequencing** (10 hours)
   - Run: `npm test:e2e -- "test/analysis/orchestration.e2e-spec.ts"`

3. **Deliverable:** Wave orchestrator fully functional

### Week 3–4: Stages 4–5 (Data Collection + LLM)
1. **Data collector & LLM integration** (90 hours)
2. **E2E tests for Light Mode** (10 hours)
3. **Deliverable:** Light Mode working end-to-end

### Week 5–6: Stages 6–7 (Brief Assembly + Swagger)
1. **Brief assembly (7 sections)** (50 hours)
2. **Swagger documentation (all endpoints)** (20 hours)
3. **E2E tests for Deep Mode + CV Verification** (10 hours)
4. **Deliverable:** All endpoints callable from /api/docs

### Week 7–8: Testing + Integration
1. **Full e2e test suite** (20 hours)
2. **Integration + cleanup** (20 hours)
3. **Deliverable:** Production-ready system

---

## SUCCESS METRICS

| Metric | Target | Verification |
|--------|--------|---|
| **Module completeness** | 14/14 implemented | `npm test -- "modules/**/*.spec.ts"` |
| **Swagger coverage** | 100% (5 endpoints) | `open /api/docs` |
| **User flow coverage** | 5/5 (Light, Deep, CV, cache, error) | `npm test:e2e -- "test/analysis/*.e2e-spec.ts"` |
| **Test pass rate** | >95% | CI/CD green |
| **Performance — Light Mode** | < 3 min | Measured from POST to result |
| **Performance — Deep Mode** | < 10 min | Measured from POST to result |
| **Performance — Cache hit** | < 5 sec | Verify from console logs |
| **Trace logging** | Matches FINAL_USER_FLOWS.md | Visual inspection + e2e test |
| **Backwards compatibility** | Zero breaking changes OR clear timeline | Legacy tests pass OR deprecation headers |

---

## KEY FILES TO REVIEW

### Architecture & Specification
- `backend/DEEPSEEK_V4_REFACTOR_PLAN.md` — Master plan (Stages 0–8)
- `backend/Analysys_specs_architecture.md` — Target architecture
- `backend/ARCHITECTURE_REFACTOR_ANALYSIS.md` — Gap analysis
- `backend/src/modules/analysis/FINAL_USER_FLOWS.md` — User flow traces

### Implementation Files
- `backend/src/modules/analysis/` — Refactored architecture root
- `backend/src/modules/scoring/` — Legacy system (to deprecate)

---

## TEAM STRUCTURE & RESPONSIBILITIES

### Recommended: 2 Engineers (Full-Time)

**Engineer 1 — Architecture Lead (Senior)**
- Weeks 1–2: Design & coordinate Stages 1–3
- Weeks 3–8: Lead wave orchestrator + LLM integration
- Code review for all PRs
- Unblock team on architectural questions

**Engineer 2 — Implementation Lead (Mid)**
- Weeks 1–2: Implement 14 modules (P1–P7, AG1–AG6, EV)
- Weeks 3–8: Data collection + brief assembly
- Create e2e tests
- Swagger documentation

### Team Blockers & Escalations
- **Deepseek v4 API key:** Must have before Week 3
- **GitHub App token:** Needed for Deep Mode (Week 4)
- **Product questions:** How should CV verification Section B prioritize claims?
- **Performance questions:** If Light Mode > 3 min, where is the bottleneck?

---

## WEEKLY CADENCE

**Monday:** Plan week objectives (pick next ~40 hours from IMPLEMENTATION_CHECKLIST)

**Daily:** 15-min standup
- What did I finish yesterday?
- What am I working on today?
- Any blockers?

**Thursday:** Code review + test verification
- All PRs merged must pass e2e tests
- Trace logs inspected for correctness

**Friday:** Milestone review
- Check off completed items in checklist
- Adjust timeline if needed
- Plan next week

---

## RISKS & MITIGATION

| Risk | Probability | Impact | Mitigation |
|------|---|---|---|
| LLM API rate limits | High | Medium | Use test account first, add exponential backoff |
| Deep Mode clone too slow | Medium | High | Implement parallel clones, measure early |
| Swagger schema generation fails | Low | Medium | Test Swagger generation early (Week 6) |
| Legacy API consumers break | High | High | Support legacy API in parallel, clear Timeline |
| Module logic bugs missed in review | Medium | Medium | >90% test coverage per module, peer review |

---

## APPENDIX: HOW TO USE THESE DOCUMENTS

### For Project Manager
1. Read: "SITUATION" + "DELIVERABLES" (5 min)
2. Review: "Weekly Cadence" + "Success Metrics" (5 min)
3. Track: Create Jira epics + tasks from IMPLEMENTATION_CHECKLIST (30 min)

### For Backend Engineers
1. Read: All three planning documents (1 hour)
2. Start: Day 1 item from IMPLEMENTATION_CHECKLIST
3. Reference: DEEPSEEK_V4_REFACTOR_PLAN.md + Analysys_specs_architecture.md as you code
4. Test: Commands in IMPLEMENTATION_CHECKLIST
5. Verify: Run checks from USER_FLOWS_AND_GOALS_VERIFICATION.md

### For QA / Testing
1. Read: USER_FLOWS_AND_GOALS_VERIFICATION.md (1 hour)
2. Wait: Until Week 6 when Swagger is ready
3. Run: Swagger UI "Try it out" tests
4. Execute: E2E test suite (`npm test:e2e`)

### For Product / Stakeholders
1. Read: "SITUATION" + "DELIVERABLES" (5 min)
2. Understand: 3-layer pipeline diagram in Analysys_specs_architecture.md (10 min)
3. Review: User flows from USER_FLOWS_AND_GOALS_VERIFICATION.md (10 min)

---

## DECISION POINTS & QUESTIONS FOR STAKEHOLDER

### Question 1: Backwards Compatibility
**Decision:** Should we keep legacy /api/analysis/* endpoints working in parallel, or cut over immediately to /api/v2/analysis/*?

**Recommendation:** Parallel operation (Strategy A from migration plan)
- Support both APIs for 2 quarters
- Add Deprecation headers to legacy endpoints
- Gives consumers time to migrate

**Alternative:** Immediate cutover (Strategy B)
- Faster deprecation
- Risk: Breaking changes for external systems

### Question 2: CV Verification Section B Priority
**Decision:** How should CV Verification Section B prioritize conflicting claims?
- Example: CV says "Senior Engineer 2010–2015", GitHub shows less activity in that period

**Options:**
- A: Show evidence quality score (low/medium/high) per claim
- B: Auto-reject claims with < 50% GitHub verification
- C: Flag for human review in brief Section D

**Recommendation:** Option A (show scores) then escalate to Section D

### Question 3: Deep Mode Clone Limits
**Decision:** Maximum repos to clone in Deep Mode?
- Torvalds has 3–4 repos
- Large corporations may have 50+

**Options:**
- A: Unlimited (may take > 1 hour for 50 repos)
- B: Max 10 repos
- C: Max 50 repos with parallel worker limit

**Recommendation:** Option C with max 4 parallel clones (takes ~60s per repo)

---

## NEXT STEPS

### Immediate (This Week)
- [ ] Review this document with team
- [ ] Create Jira epic "GitIntel Migration"
- [ ] Assign Week 1 tasks from IMPLEMENTATION_CHECKLIST
- [ ] Provision Deepseek v4 API key
- [ ] Allocate 2 engineers full-time

### Week 1
- [ ] Verify corpus layer (2 hours)
- [ ] Begin Stage 2: Implement 14 modules (40 hours)
- [ ] Daily standups start
- [ ] Weekly Thursday code review

### Week 2
- [ ] Complete Stage 2: All modules tested
- [ ] Begin Stage 3: Wave orchestration

### Week 3
- [ ] Light Mode end-to-end working
- [ ] Begin Deep Mode + LLM

### Week 6
- [ ] Swagger documentation complete
- [ ] Full e2e test suite written

### Week 8
- [ ] Production ready
- [ ] Handoff to operations

---

## CONTACT & ESCALATION

- **Architecture Questions:** @backend-lead
- **Blockers:** Escalate in daily standup + tag project manager
- **Deepseek API Issues:** Check docs + retry with exponential backoff first
- **GitHub App Access:** Contact platform-ops in #devops

---

**Document Version:** 1.0  
**Status:** Ready for Implementation Planning  
**Date:** June 1, 2026  
**Prepared By:** Senior Backend Architect

---

## APPENDIX: FILE MANIFEST

All planning documents created in `/backend/`:
```
backend/
├── MIGRATION_PLAN_TO_TARGET_ARCHITECTURE.md  (comprehensive 8-week plan)
├── IMPLEMENTATION_CHECKLIST.md                (day-to-day tasks)
├── USER_FLOWS_AND_GOALS_VERIFICATION.md       (verification guide)
├── DEEPSEEK_V4_REFACTOR_PLAN.md              (existing — stages 0–8)
├── Analysys_specs_architecture.md             (existing — target spec)
├── ARCHITECTURE_REFACTOR_ANALYSIS.md          (existing — gap analysis)
└── src/modules/analysis/
    ├── FINAL_USER_FLOWS.md                    (existing — traces)
    ├── analysis/
    │   └── analysis-v2.controller.ts          (5 RESTful endpoints)
    └── [other module files per structure]
```

**Total Documentation:** ~8,000 lines of specification + guidance

**Estimated Time to Read All:**
- Executive summary + this document: 30 min
- Full migration plan: 2 hours
- Implementation checklist: 1 hour
- Verification guide: 1 hour
- **Total: ~4 hours**

---

**Ready to proceed?** → Assign Week 1 tasks from IMPLEMENTATION_CHECKLIST.md
