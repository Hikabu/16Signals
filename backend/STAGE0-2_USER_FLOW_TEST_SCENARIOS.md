# User Flow Test Scenarios — Stages 0-2
## How to Trace the Migrated Architecture via Console.log

**Date:** May 31, 2026  
**Scope:** Stages 0-2 of the GitIntel refactor (Corpus types, Module system, 14 analysis modules with tracing)  
**Run with:** `TRACING_LEVEL=detailed npm run start:dev`

---

## How to Follow the Architecture

All new code emits structured `console.log` at every architectural boundary. Set `TRACING_LEVEL=detailed` in your `.env` to see full output.

### Console.log Format
```
[Component] phase=PHASE key=value key2=value2
```

---

## Flow 1: Module Registry Initialization

**What to test:** When the server starts, the ModuleRegistry should register all 14 modules.

**Expected console output at startup:**
```
[ModuleRegistry] phase=registered moduleId=p1_execution_reliability primitiveId=p1 requiredGroups=C,E requiredMode=either
[ModuleRegistry] phase=registered moduleId=p2_systems_evolution primitiveId=p2 requiredGroups=C,E requiredMode=light
[ModuleRegistry] phase=registered moduleId=p3_collaboration_leverage primitiveId=p3 requiredGroups=D requiredMode=either
[ModuleRegistry] phase=registered moduleId=p4_technical_depth primitiveId=p4 requiredGroups=B,D,F requiredMode=either
[ModuleRegistry] phase=registered moduleId=p5_operational_maturity primitiveId=p5 requiredGroups=E,C requiredMode=light
[ModuleRegistry] phase=registered moduleId=p6_ai_leverage primitiveId=p6 requiredGroups=C,E requiredMode=either
[ModuleRegistry] phase=registered moduleId=p7_authenticity_confidence primitiveId=p7 requiredGroups=G,A requiredMode=either
[ModuleRegistry] phase=registered moduleId=ag1_commit_inflation primitiveId=null requiredGroups=C requiredMode=either
[ModuleRegistry] phase=registered moduleId=ag2_fork_dump primitiveId=null requiredGroups=B requiredMode=either
[ModuleRegistry] phase=registered moduleId=ag3_burst_dormancy primitiveId=null requiredGroups=C,G requiredMode=either
[ModuleRegistry] phase=registered moduleId=ag4_repository_laundering primitiveId=null requiredGroups=B,G requiredMode=either
[ModuleRegistry] phase=registered moduleId=ag5_ai_generation_detection primitiveId=null requiredGroups=C,G requiredMode=either
[ModuleRegistry] phase=registered moduleId=ag6_credential_leak primitiveId=null requiredGroups=E requiredMode=deep
[ModuleRegistry] phase=registered moduleId=ev_employment_verification primitiveId=null requiredGroups=A,C requiredMode=either
[ModuleRegistry] phase=init_complete totalModules=14 waves=6
```

**Pass criteria:** All 14 modules listed, totalModules=14, waves=6

---

## Flow 2: Module Wave Lookup

**What to test:** Calling `ModuleRegistry.getWaveModules('wave_1')` returns AG1, AG2, AG3.

**Expected output:**
```
[ModuleRegistry] phase=wave_lookup wave=wave_1 modules=ag1_commit_inflation,ag2_fork_dump,ag3_burst_dormancy count=3
```

**Pass criteria:** All 6 waves return correct module lists:
- wave_1: AG1, AG2, AG3
- wave_2a: AG4
- wave_2b: P1, P2, P5
- wave_2c: P3
- wave_2d: P4
- wave_3: P6, AG5

---

## Flow 3: Wave 2a Conditional Trigger

**What to test:** AG4 only runs when AG1 or AG3 raised flags.

**Scenario A — No flags (AG4 should NOT run):**
```
[ModuleRegistry] phase=wave2a_check ag1Flags=0 ag3Flags=0 trigger=false
```

**Scenario B — AG1 fired (AG4 SHOULD run):**
```
[Module:ag1_commit_inflation] phase=flag_raised flagId=COMMIT_INFLATION_SOFT ...
[ModuleRegistry] phase=wave2a_check ag1Flags=1 ag3Flags=0 trigger=true
```

---

## Flow 4: P1 Execution Reliability — Full Trace

**What to test:** P1 module analyzing a candidate with full signal corpus (Groups C, E present).

**Run:** Call `ModuleRegistry.executeModule('p1_execution_reliability', corpus, config)`

**Expected output:**
```
[Module:p1_execution_reliability] phase=run_start username=test-dev seniority=mid
[Module:p1_execution_reliability] phase=evidence signal="Commit cadence consistency" activeMonths=10 met=true
[Module:p1_execution_reliability] phase=evidence signal="Commit size discipline" median=85 sub5=0.120 met=true
[Module:p1_execution_reliability] phase=evidence signal="CI pass rate trajectory" quarters=4 allAbove80=true met=true
[Module:p1_execution_reliability] phase=run_complete confidence=strong primarySignalsMet=3/3 adjusted=3
```

**Edge case — Junior seniority:**
```
[Module:p1_execution_reliability] phase=run_start username=juniordev seniority=junior
[Module:p1_execution_reliability] phase=evidence signal="CI pass rate trajectory" quarters=0 allAbove80=false met=false
[Module:p1_execution_reliability] phase=run_complete confidence=low primarySignalsMet=1/3 adjusted=1
```

---

## Flow 5: P3 Collaboration Leverage — Observability Gap

**What to test:** P3 returns `observability_gap` when pr_reviewer_count < 5.

**Run:** Call `p3_collaboration_leverage.run()` with corpus where `collaboration_signals.pr_reviewer_count = 2`

**Expected output:**
```
[Module:p3_collaboration_leverage] phase=signal_threshold signal=review_activity count=2 threshold=5 result=observability_gap
[Module:p3_collaboration_leverage] phase=run_complete confidence=observability_gap prReviewerCount=2
```

**Pass criteria:** Confidence is `observability_gap`, NOT `low`. Score label says "No public evidence — likely private or enterprise context. Do not penalise."

---

## Flow 6: P5 Operational Maturity — Secret Leak Hard Flag

**What to test:** P5 raises HARD flag when secret_leak_detected is true and leaks are not in test/fixture paths.

**Expected output:**
```
[Module:p5_operational_maturity] phase=flag_raised flagId=SECRET_LEAK_HARD count=2
[Module:p5_operational_maturity] phase=run_complete confidence=low
```

**Edge case — False positive (test file):**
If leak is in `test/` directory, no HARD flag should be raised.

---

## Flow 7: AG1 Commit Inflation

**What to test:** AG1 detects tiny commits.

**Scenario A — Inflation detected:**
- Corpus: `sub_5_line_commit_ratio=0.35`, `p25_commit_size_lines=2`
- Expected:
```
[Module:ag1_commit_inflation] phase=flag_raised flagId=COMMIT_INFLATION_SOFT sub5=0.350 p25=2
```

**Scenario B — Context note (0.15–0.30):**
- Corpus: `sub_5_line_commit_ratio=0.20`, `p25_commit_size_lines=5`
- Expected: No flag, but evidence includes interpretation: "Sub-5-line ratio between 0.15–0.30. Noted as context."

**Scenario C — Clean:**
- Corpus: `sub_5_line_commit_ratio=0.05`, `p25_commit_size_lines=25`
- Expected: `confidence=strong`

---

## Flow 8: AG3 Burst Dormancy

**What to test:** AG3 detects activity bursts timed to evaluation.

**Scenario A — Suspicious (ratio > 5.0, trigger true):**
- Corpus: `burst_dormancy_ratio=8.2`, `burst_triggered_at_evaluation=true`
- Expected:
```
[Module:ag3_burst_dormancy] phase=flag_raised flagId=BURST_DORMANCY_SOFT ratio=8.20 threshold=5.0
```

**Scenario B — Context only (ratio > 5.0, trigger false):**
- Corpus: `burst_dormancy_ratio=6.3`, `burst_triggered_at_evaluation=false`
- Expected: No flag, context evidence only.

---

## Flow 9: EV Employment Verification

**What to test:** EV module for a candidate claiming "Acme Corp".

**Scenario A — Email domain match (Rung 1):**
- `identity.company_claim="Acme Corp"`, `identity.commit_email_domains=["acme.com"]`
- Expected:
```
[Module:ev_employment_verification] phase=domain_mapping claim=Acme Corp domains=acmecorp.com,acmecorp.com,acmecorp.io,acme.io
[Module:ev_employment_verification] phase=rung1 confirmed domain=acme.com claim=Acme Corp
```

**Scenario B — No claim (Rung 0):**
- `identity.company_claim=null`
- Expected:
```
[Module:ev_employment_verification] phase=rung0 no_company_claim
```

---

## Flow 10: P7 Profile-Level Gate

**What to test:** Enterprise profile pattern detection.

**Scenario — 4+ observability gaps:**
- Corpus with limited data across Groups C, D, E, F
- Expected:
```
[Module:p7_authenticity_confidence] phase=profile_gate_fired observabilityCount=4 threshold=4
```
- Score label says: "This profile pattern is consistent with enterprise or regulated-industry contexts..."

---

## Flow 11: Pre-flight Check — Missing Groups

**What to test:** ModuleRegistry preflight when corpus lacks required groups.

**Run:** `ModuleRegistry.preflight('ag6_credential_leak', corpus)` where corpus doesn't have Group E.

**Expected:**
```
[ModuleRegistry] phase=preflight_fail moduleId=ag6_credential_leak missingGroups=E presentGroups=A,B,C,D
```

**Run:** `ModuleRegistry.executeModule('ag6_credential_leak', corpus, config)`

**Expected:**
```
[ModuleRegistry] phase=execute_skipped moduleId=ag6_credential_leak reason=missing_groups groups=E
```

---

## Flow 12: AG6 Deep Mode Gate

**What to test:** AG6 credential leak module only runs in Deep Mode.

**Scenario — Light Mode:**
Regular corpus.
**Expected:**
```
[Module:ag6_credential_leak] phase=skip reason=deep_mode_required mode=light
```

**Scenario — Deep Mode:**
Corpus with `collection_mode='deep'`.
**Expected:** Normal execution (HARD flag or clean).

---

## Flow 13: Module Execution Error Handling

**What to test:** Module errors don't crash the pipeline.

**Run:** Call `ModuleRegistry.executeModule('missing_module', corpus, config)`

**Expected:**
```
[ModuleRegistry] phase=execute_error moduleId=missing_module reason=not_found
```
Returns: `ModuleResult` with `confidence='insufficient_data'`.

---

## Quick Reference: Tracing Checkpoints

| User Action | What Trace to Look For |
|---|---|
| Server startup | `[ModuleRegistry] phase=init_complete totalModules=14` |
| Any analysis request | `[ModuleRegistry] phase=wave_lookup wave=wave_1 modules=AG1,AG2,AG3` |
| P1 scoring | `[Module:p1_execution_reliability] phase=evidence signal="CI pass rate trajectory"` |
| P3 thin review activity | `[Module:p3_collaboration_leverage] phase=signal_threshold count=2 threshold=5 result=observability_gap` |
| P5 secret detection | `[Module:p5_operational_maturity] phase=flag_raised flagId=SECRET_LEAK_HARD` |
| AG1 tiny commits | `[Module:ag1_commit_inflation] phase=flag_raised flagId=COMMIT_INFLATION_SOFT` |
| AG3 burst | `[Module:ag3_burst_dormancy] phase=flag_raised flagId=BURST_DORMANCY_SOFT` |
| AG4 laundering | `[Module:ag4_repository_laundering] phase=flag_raised flagId=REPO_LAUNDERING_LIGHT` |
| AG6 deep mode gate | `[Module:ag6_credential_leak] phase=skip reason=deep_mode_required` |
| EV verification | `[Module:ev_employment_verification] phase=rung1 confirmed` |
| P7 enterprise gate | `[Module:p7_authenticity_confidence] phase=profile_gate_fired observabilityCount=4` |
| Module missing groups | `[ModuleRegistry] phase=execute_skipped moduleId=ag6_credential_leak reason=missing_groups` |