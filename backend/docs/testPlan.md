# v5 Phase Gate Tests
## Test Prompts + Human Verification Checklists

**How to use this document:**
1. Complete all steps in a phase
2. Run the HUMAN CHECKS first (these are fast — catch obvious breaks before using tokens)
3. If human checks pass, run the LLM TEST PROMPT to generate the automated test suite
4. Run the tests
5. If all pass → move to next phase. If any fail → fix before proceeding.

The rule: **never start a new phase with a failing test from the previous one.**

---

## PHASE 0 GATE — Foundation Verified

### Human Checks (do these manually, ~5 min)

```
[ ] npx prisma validate       → no errors
[ ] npx prisma migrate dev    → migration runs cleanly, no warnings
[ ] npx prisma generate       → client generated successfully
[ ] npx ts-node -e "import('./src/types/evidence-brief.types')" → no TypeScript errors
[ ] npx ts-node -e "import('./src/types/primitives.types')"     → no TypeScript errors
[ ] npx nest build            → project compiles, 0 errors
[ ] node -e "require('scc')"  → if this fails, binary isn't installed (run: scc --version)
[ ] gitleaks version          → prints version, not "command not found"
[ ] semgrep --version         → prints version
[ ] echo $ANTHROPIC_API_KEY   → not empty
[ ] echo $GITHUB_ID       → not empty
```

### LLM Test Prompt — Phase 0
**Model:** Codex  
**Target file:** `test/phase-gates/phase-0.spec.ts`

```
Write a Jest test suite that validates the Phase 0 foundation is correctly set up.
These are type-level and structural tests — no runtime logic, no API calls.

Test file: test/phase-gates/phase-0.spec.ts

TESTS:

describe('Phase 0 — Type Contracts') {

  test('EvidenceBrief has all 7 sections') {
    // Import EvidenceBrief from src/types/evidence-brief.types
    // Use TypeScript satisfies operator to assert the shape exists
    // Check: sectionA, sectionB, sectionC, sectionD, sectionE, sectionF (optional), sectionG all exist on the type
    // Check: primitives block has p1–p7 keys
    // Check: meta block exists
    // These are compile-time checks — if the file compiles, the test passes
    expect(true).toBe(true) // placeholder — compile errors are the real test
  }

  test('ConfidenceLevel has exactly 5 values') {
    const validLevels: ConfidenceLevel[] = [
      'strong_evidence', 'moderate_evidence', 'low_evidence',
      'observability_gap', 'insufficient_data'
    ]
    expect(validLevels).toHaveLength(5)
  }

  test('AILeverageClass has exactly 5 values') {
    const validClasses: AILeverageClass[] = [
      'ai_operator', 'ai_architect', 'ai_passenger',
      'traditional_engineer', 'disclosure_flag'
    ]
    expect(validClasses).toHaveLength(5)
  }

  test('AntiGamingFlag.autoReject is always false (type-level)') {
    const flag: AntiGamingFlag = {
      type: 'commit_inflation',
      severity: 'soft_concern',
      evidence: 'test',
      confidenceScore: 50,
      interviewProbe: 'test question',
      autoReject: false
    }
    // This should compile. If autoReject: true is assigned, TypeScript will error.
    expect(flag.autoReject).toBe(false)
  }

  test('PrimitiveAssessment score can be null') {
    const assessment: PrimitiveAssessment = {
      score: null,
      confidence: 'insufficient_data',
      confidenceText: 'test',
      keyEvidence: [],
      observabilityGaps: [],
      interviewProbes: []
    }
    expect(assessment.score).toBeNull()
  }

  test('All 7 primitive input shapes exist in PrimitiveInputMap') {
    // Import PrimitiveInputMap — check it has p1 through p7 keys
    type Keys = keyof PrimitiveInputMap
    const keys: Keys[] = ['p1','p2','p3','p4','p5','p6','p7']
    expect(keys).toHaveLength(7)
  }

  test('SeniorityTier has exactly 5 values') {
    // Import from types, check all 5 exist
    expect(['INTERN_JUNIOR','MID','SENIOR','STAFF_LEAD','PRINCIPAL_PLUS']).toHaveLength(5)
  }

  test('RoleArchetype has exactly 6 values') {
    expect(['BACKEND','FRONTEND','PLATFORM_DEVOPS_SRE','DATA_ML','SECURITY','MOBILE']).toHaveLength(6)
  }
}

describe('Phase 0 — Env Schema') {
  test('Required env vars are defined in schema') {
    // Import the env schema, check ANTHROPIC_API_KEY and GITHUB_ID are required fields
    // Use zod schema inspection: schema.shape.ANTHROPIC_API_KEY should not be optional
    const schema = require('../../src/config/env.schema')
    expect(schema.ANTHROPIC_API_KEY).toBeDefined()
    expect(schema.GITHUB_ID).toBeDefined()
  }
}

describe('Phase 0 — Empty Service Scaffold') {
  test('All scaffolded services throw NotImplemented, not crash') {
    // For each scaffolded service, instantiate it with null deps and call the main method
    // Expect it to throw Error('not implemented') not a module-load error
    const { P1ExecutionReliabilityService } = require('../../src/signals/primitives/p1-execution-reliability.service')
    const svc = new P1ExecutionReliabilityService(null)
    expect(() => svc.evaluate({})).toThrow('not implemented')
  }
}
```

---

## PHASE 1 GATE — Light Fetcher Working

### Human Checks (~10 min)

```
[ ] Pick a real public GitHub username with >10 repos (e.g. 'sindresorhus' or your own)
[ ] POST http://localhost:3000/analysis { githubUsername: "sindresorhus", mode: "LIGHT" }
    → Returns { jobId, status: "pending" } with no 500 error
[ ] Check Redis: the job should appear in the BullMQ queue
    (use Bull Board if set up, or: redis-cli KEYS "bull:*")
[ ] Wait 3 minutes, GET /analysis/:jobId/status → should show progress > 0
[ ] Check database: SELECT * FROM analysis_jobs WHERE id = '[jobId]'
    → status should be 'processing' or 'completed', NOT 'failed'
[ ] Check application logs for: "Rate limit budget initialised" or similar
[ ] If status = 'failed': check error field in DB — most common cause is missing GITHUB token
```

### LLM Test Prompt — Phase 1
**Model:** Codex  
**Target file:** `test/phase-gates/phase-1.spec.ts`

```
Write Jest integration tests for the Light Mode data fetcher. Use nock to mock GitHub API responses. No real network calls.

Test file: test/phase-gates/phase-1.spec.ts

SETUP: Create a fixture file at test/fixtures/github-sindresorhus.json with a minimal mock of:
- GET /users/sindresorhus → { login, bio, company, blog, created_at, hireable, public_repos: 20 }
- GET /users/sindresorhus/repos → array of 5 mock repo objects each with: { name, language, topics, fork, pushed_at, created_at, stargazers_count, forks_count, has_readme: true }
- GraphQL response mock for contributionsCollection → { weeks: [52 items with random contribution counts] }
- GraphQL response mock for pullRequests → { nodes: [3 mock PRs] }
- GraphQL response mock for reviews → { nodes: [5 mock reviews with bodies > 50 words] }

TESTS:

describe('LightFetcherService') {

  test('fetch() returns RawLightData with all 6 groups populated') {
    // Mock GitHub API with nock
    // Call LightFetcherService.fetch('sindresorhus')
    // Assert result has: groupA, groupB, groupC, groupD, groupE, groupF
    // Assert groupA.accountAgeMonths > 0
    // Assert groupB.repos.length > 0
    // Assert groupC.weeklyContributions.length === 52
    // Assert groupD (may be empty arrays — that's fine)
  }

  test('fetch() maps account age correctly') {
    // Mock created_at: '2012-01-01T00:00:00Z'
    // Assert groupA.accountAgeMonths > 100 (account is old)
  }

  test('fetch() excludes unmodified forks from groupB.repos') {
    // Mock: 3 original repos + 2 forks where pushed_at === created_at (unmodified)
    // Assert groupB.repos.length === 3 (forks excluded)
  }

  test('fetch() builds workHourDistribution from commit timestamps') {
    // Mock commits with timestamps spread across different hours
    // Assert groupC.workHourDistribution is a Record with numeric values
    // Assert sum of all values === total commit count
  }

  test('fetch() throws RateLimitExhaustedException when budget < 500') {
    // Mock RateLimitService to return remaining: 499
    // Assert fetch() throws RateLimitExhaustedException
    // Assert AnalysisJob status is NOT updated to 'failed' (the processor handles retries)
  }

  test('fetch() handles user with 0 public repos gracefully') {
    // Mock /repos response as empty array
    // Assert groupB.repos === []
    // Assert no throw
    // Assert groupC.weeklyContributions still populated from contribution calendar
  }

  test('fetch() detects AI config files in fileTreeSample') {
    // Mock one repo with fileTreeSample containing '.cursorrules'
    // Assert groupE.aiConfigFiles includes '.cursorrules'
  }
}

describe('GroupMapperService') {
  test('map() produces valid PrimitiveInputMap from raw octokit data') {
    // Use the fixture data directly (no HTTP mock needed — mapper takes raw objects)
    // Assert all 7 primitive inputs are present
    // Assert p3.groupD.prsAuthored is an array
    // Assert p1.groupC.commitSigningRate is between 0 and 1
  }

  test('map() correctly identifies external PRs') {
    // Mock PRs: 2 to own repos, 3 to other users repos
    // Pass githubUsername as second arg
    // Assert p3.groupD.externalPRsMerged === 3
  }
}

describe('ExternalSignalService') {
  test('fetch() returns empty packageRegistryPresence when no packages found') {
    // Mock npm registry search returning 0 results
    // Assert result.packageRegistryPresence === []
    // Assert no throw
  }

  test('fetch() handles npm API timeout gracefully') {
    // Use nock to delay npm response > 5s
    // Assert fetch() still returns a result (with null npm data)
    // Assert other registries were still attempted
  }
}

describe('BriefCacheService') {
  test('set() then get() returns the same brief') {
    // Use real Prisma with test database (or mock PrismaService)
    // Set a brief with TTL 60s
    // Get it back — assert deep equality
  }

  test('get() returns null for expired cache entry') {
    // Set with TTL -1 (already expired)
    // Get — assert null returned
  }

  test('buildKey() produces correct format') {
    const key = BriefCacheService.buildKey('testuser', 'light')
    expect(key).toBe('brief:testuser:light:v5')
  }
}
```

---

## PHASE 2 GATE — All 7 Primitives Return Valid Output

### Human Checks (~5 min)

```
[ ] npx nest build → 0 errors (all new services compile)
[ ] Run: npx jest src/signals --testPathPattern=spec → all pass
[ ] Manually call each primitive service with a minimal input object and check it returns
    a PrimitiveAssessment (not throws 'not implemented' — Phase 0 stub must be replaced)
[ ] Check ConfidenceLanguageService: call getText('strong_evidence', { n_repos: 5, n_months: 24 })
    → must return exact string from spec, not a generic placeholder
[ ] Check SeniorityWeightsService.getWeights('INTERN_JUNIOR')
    → p3 should be 'minimal', p7 should be 'always'
[ ] Check ArchetypeConfigService.getConfig('SECURITY').securityAmplified → true
```

### LLM Test Prompt — Phase 2
**Model:** Codex  
**Target file:** `test/phase-gates/phase-2.spec.ts`

```
Write Jest unit tests for all 7 primitive evaluator services and their supporting services.
No HTTP calls. No database. Pure unit tests with crafted input objects.

Test file: test/phase-gates/phase-2.spec.ts

Create test input factories at the top of the file:

const makeGroupC = (overrides = {}): RawGroupC => ({
  weeklyContributions: Array(52).fill(null).map((_, i) => ({ week: `2024-W${i}`, total: 3 })),
  commitSample: Array(50).fill(null).map((_, i) => ({
    sha: `sha${i}`, message: `feat: add feature ${i}`,
    additions: 50, deletions: 20, timestamp: new Date().toISOString(),
    isMerge: false, isDocOnly: false, isSigned: i % 3 === 0
  })),
  workHourDistribution: { '9': 20, '10': 30, '14': 25, '15': 20 },
  commitSigningRate: 0.33,
  ...overrides
})

const makeGroupD = (overrides = {}): RawGroupD => ({
  prsAuthored: Array(10).fill(null).map((_, i) => ({
    number: i, title: `PR ${i}`, bodyWordCount: 150,
    additions: 200, deletions: 50, mergedAt: new Date().toISOString(),
    wasSelfMerged: false, repoOwner: 'other-user'
  })),
  reviewsGiven: Array(15).fill(null).map((_, i) => ({
    body: 'This approach has a potential race condition in the state update. Consider using a mutex here.',
    wordCount: 22, submittedAt: new Date().toISOString(), prRepoOwner: 'other-user'
  })),
  externalPRsMerged: 10,
  externalPRRepos: ['facebook/react', 'nestjs/nest'],
  ...overrides
})

// ... (similar factories for GroupA, GroupB, GroupE, GroupF)

TESTS:

describe('P1 ExecutionReliability') {
  test('returns strong_evidence for consistent active developer') {
    const input: P1ExecutionReliabilityInput = {
      groupC: makeGroupC(), // 52 weeks, all active
      groupE: { ciConfigPresent: true, testDirPresent: true, dockerfilePresent: true,
                iacPresent: false, lintConfigPresent: true, semanticVersioningRate: 0.9,
                dependabotEnabled: true, hasSecurityMd: false, aiConfigFiles: [] }
    }
    const result = svc.evaluate(input)
    expect(result.confidence).toBe('strong_evidence')
    expect(result.score).toBeGreaterThan(70)
    expect(result.keyEvidence.length).toBeGreaterThan(0)
  }

  test('returns observability_gap when no CI data and no test dir') {
    const input = { groupC: makeGroupC(), groupE: makeGroupE({ ciConfigPresent: false, testDirPresent: false, dependabotEnabled: false }) }
    const result = svc.evaluate(input)
    // CI absence in light mode → many observability gaps → should not be strong
    expect(['low_evidence', 'moderate_evidence', 'observability_gap']).toContain(result.confidence)
  }

  test('score is null when confidence is insufficient_data') {
    // Pass minimal input — no commit data
    const input = { groupC: makeGroupC({ commitSample: [], weeklyContributions: Array(52).fill({ week: 'x', total: 0 }) }), groupE: makeGroupE() }
    const result = svc.evaluate(input)
    if (result.confidence === 'insufficient_data') {
      expect(result.score).toBeNull()
    }
  }
}

describe('P3 CollaborationLeverage') {
  test('returns observability_gap when fewer than 5 PRs and 3 external contributions') {
    const input = { groupD: makeGroupD({ prsAuthored: [], reviewsGiven: [], externalPRsMerged: 0 }), seniorityTarget: 'SENIOR' as SeniorityTier }
    const result = svc.evaluate(input)
    expect(result.confidence).toBe('observability_gap')
    expect(result.score).toBeNull()
    expect(result.confidenceText).toContain('Do not penalise')
  }

  test('flags high self-merge rate as soft concern at SENIOR level') {
    const input = {
      groupD: makeGroupD({
        prsAuthored: Array(20).fill({ ...prBase, wasSelfMerged: true, repoOwner: 'other-user' })
      }),
      seniorityTarget: 'SENIOR' as SeniorityTier
    }
    const result = svc.evaluate(input)
    expect(result.observabilityGaps.some(g => g.toLowerCase().includes('self-merge'))).toBe(true)
  }

  test('does NOT flag high self-merge rate at JUNIOR level') {
    const input = { groupD: makeGroupD({ prsAuthored: Array(10).fill({ ...prBase, wasSelfMerged: true }) }), seniorityTarget: 'INTERN_JUNIOR' as SeniorityTier }
    const result = svc.evaluate(input)
    expect(result.observabilityGaps.some(g => g.toLowerCase().includes('self-merge'))).toBe(false)
  }
}

describe('P6 AILeverage') {
  test('classifies ai_operator when AI config files present and high velocity') {
    const input: P6AILeverageInput = {
      groupB: makeGroupB({ repos: [{ ...repoBase, fileTreeSample: ['.cursorrules', 'src', 'tests'] }] }),
      groupC: makeGroupC({
        // Simulate burst: last 4 weeks have 5x normal activity
        weeklyContributions: [
          ...Array(48).fill({ week: 'x', total: 3 }),
          ...Array(4).fill({ week: 'x', total: 18 })
        ]
      })
    }
    const result = svc.evaluate(input)
    expect(result.aiLeverageClass).toBe('ai_operator')
  }

  test('classifies traditional_engineer when no AI config files and stable velocity') {
    const input = { groupB: makeGroupB(), groupC: makeGroupC() }
    const result = svc.evaluate(input)
    expect(result.aiLeverageClass).toBe('traditional_engineer')
  }
}

describe('P7 AuthenticityConfidence — Phase 2 stub') {
  test('returns hard stop when credential leak detected') {
    const input: P7AuthenticityConfidenceInput = {
      groupA: makeGroupA(), groupG: makeGroupG(),
      gitleaks: { leaksFound: true, count: 1, findings: [{ ruleId: 'aws-access-token', file: 'config.js', commit: 'abc123', secretPreview: 'AKIA****' }] },
      employmentRungs: [], flags: []
    }
    const result = svc.evaluate(input)
    expect(result.confidence).toBe('low_evidence')
    expect(result.confidenceText.toLowerCase()).toContain('hard stop')
    expect(result.interviewProbes[0].toLowerCase()).toContain('credential')
  }

  test('stub returns observability_gap when no gaming data available') {
    const input = { groupA: makeGroupA(), groupG: makeGroupG({ commitInflationRate: null }), employmentRungs: [], flags: [] }
    const result = svc.evaluate(input)
    expect(result.confidence).toBe('observability_gap')
  }
}

describe('ConfidenceLanguageService') {
  test('strong_evidence text contains "high confidence"') {
    const text = svc.getText('strong_evidence', { n_repos: '5', n_months: '24' })
    expect(text).toContain('high confidence')
    expect(text).toContain('5')
    expect(text).toContain('24')
  }

  test('observability_gap text contains "Do not penalise"') {
    const text = svc.getText('observability_gap', { interview_question: 'Describe your review process.' })
    expect(text).toContain('Do not penalise')
  }

  test('mandatory language is exact — no paraphrasing allowed') {
    const text = svc.getText('insufficient_data')
    expect(text).toBe("This profile cannot be assessed from available public signals. Do not use this report as a filter for this candidate. Proceed directly to technical interview using the generated interview questions.")
  }
}

describe('SeniorityWeightsService') {
  test('INTERN_JUNIOR has p2 as not_expected') {
    const weights = svc.getWeights('INTERN_JUNIOR')
    expect(weights.p2).toBe('not_expected')
  }
  test('p7 is always "always" regardless of seniority') {
    const tiers: SeniorityTier[] = ['INTERN_JUNIOR','MID','SENIOR','STAFF_LEAD','PRINCIPAL_PLUS']
    tiers.forEach(tier => {
      expect(svc.getWeights(tier).p7).toBe('always')
    })
  }
}

describe('ArchetypeConfigService') {
  test('SECURITY archetype has securityAmplified = true') {
    expect(svc.getConfig('SECURITY').securityAmplified).toBe(true)
  }
  test('PLATFORM_DEVOPS_SRE has iacRequired = true') {
    expect(svc.getConfig('PLATFORM_DEVOPS_SRE').iacRequired).toBe(true)
  }
  test('All 6 archetypes return a valid config') {
    const archetypes: RoleArchetype[] = ['BACKEND','FRONTEND','PLATFORM_DEVOPS_SRE','DATA_ML','SECURITY','MOBILE']
    archetypes.forEach(a => {
      const config = svc.getConfig(a)
      expect(config.elevatedSignals.length).toBeGreaterThan(0)
      expect(config.contextualRedFlags.length).toBeGreaterThan(0)
    })
  }
}
```

---

## PHASE 3 GATE — Full Light Mode Brief Generated End-to-End

### Human Checks (~15 min) — most important gate in the project

```
[ ] POST /analysis { githubUsername: "sindresorhus", mode: "LIGHT", seniorityTarget: "SENIOR", archetypeTarget: "BACKEND" }
    → Save the jobId

[ ] Poll GET /analysis/:jobId/status every 30s until status = "completed"
    → Must complete in < 3 minutes

[ ] GET /analysis/:jobId/brief → save the full JSON response

INSPECT THE BRIEF MANUALLY:
[ ] sectionA exists and has operatingStyleArchetype (a non-empty string)
[ ] sectionA.topThreeCapabilities has exactly 3 items, each with evidence string
[ ] sectionA.recommendedInterviewDepth is one of: 'light', 'standard', 'deep'
[ ] sectionB.languages has at least 1 entry with evidenced: true
[ ] sectionC fields are all non-empty strings (not "undefined" or "null")
[ ] sectionD.flags is an array (may be empty — that's fine)
[ ] sectionD.credentialLeakDetected is boolean
[ ] sectionE.technicalQuestions has 3–5 items
[ ] sectionG.epistemicBoundaries has exactly 6 items
[ ] sectionG.routedProbes has exactly 6 items
[ ] primitives block has keys: p1ExecutionReliability through p7AuthenticityConfidence
[ ] CRITICAL: no field named "overallScore", "totalScore", or "compositeScore" anywhere in the JSON
[ ] Every primitive has confidence field set to one of the 5 valid values
[ ] Every primitive with confidence "strong_evidence" has score > 0
[ ] Every primitive with confidence "insufficient_data" has score === null
[ ] meta.analysisMode === "light"
[ ] meta.profileLevelGate is boolean

[ ] Run the same request again (same username)
    → Second run should complete in < 5 seconds (cache hit)
    → GET /analysis/:jobId/status should jump straight to completed

[ ] Test with a minimal profile (create a throwaway GitHub account with 0 repos)
    → Brief should still return (not 500)
    → Most primitives should have confidence "observability_gap" or "insufficient_data"
    → sectionG must still be present
```

### LLM Test Prompt — Phase 3
**Model:** Codex  
**Target file:** `test/phase-gates/phase-3.spec.ts`

```
Write Jest integration tests for the complete Light Mode pipeline end-to-end.
Use nock to mock all external HTTP calls (GitHub API, npm, PyPI).
Use a real in-memory BullMQ (use bullmq-mock or ioredis-mock).
Use a real Prisma client pointed at a test database (TEST_DATABASE_URL env var).

Test file: test/phase-gates/phase-3.spec.ts

SETUP:
- Before all: run prisma migrate deploy on test DB
- After each: truncate analysis_jobs and cached_results tables
- Use a fixture set: test/fixtures/phase-3/ with mock responses for 3 profiles:
  - active-developer.json (20 repos, regular commits, 10 PRs, 15 reviews)
  - minimal-profile.json (2 repos, sparse commits, 0 PRs)
  - enterprise-dev.json (3 public repos, mostly private, high account age)

TESTS:

describe('Light Mode Pipeline — End-to-End') {

  test('full pipeline completes in under 3 minutes for active-developer') {
    jest.setTimeout(180_000)
    // 1. POST /analysis with fixture username
    // 2. Poll GET /analysis/:jobId/status until completed or 180s timeout
    // 3. Assert status === 'completed'
    // 4. Assert progress === 100
  }

  test('brief has all 7 sections') {
    const brief = await runPipeline('active-developer')
    expect(brief).toHaveProperty('sectionA')
    expect(brief).toHaveProperty('sectionB')
    expect(brief).toHaveProperty('sectionC')
    expect(brief).toHaveProperty('sectionD')
    expect(brief).toHaveProperty('sectionE')
    // sectionF is optional — do not assert presence
    expect(brief).toHaveProperty('sectionG')
    expect(brief).toHaveProperty('primitives')
    expect(brief).toHaveProperty('meta')
  }

  test('brief NEVER contains a composite score') {
    const brief = await runPipeline('active-developer')
    const briefStr = JSON.stringify(brief)
    expect(briefStr).not.toContain('"overallScore"')
    expect(briefStr).not.toContain('"totalScore"')
    expect(briefStr).not.toContain('"compositeScore"')
    expect(briefStr).not.toContain('"roleFitScore"')
  }

  test('all 7 primitives present with valid confidence values') {
    const brief = await runPipeline('active-developer')
    const validConfidence = ['strong_evidence','moderate_evidence','low_evidence','observability_gap','insufficient_data']
    const primitiveKeys = ['p1ExecutionReliability','p2SystemsEvolution','p3CollaborationLeverage','p4TechnicalDepth','p5OperationalMaturity','p6AILeverage','p7AuthenticityConfidence']
    primitiveKeys.forEach(key => {
      expect(brief.primitives).toHaveProperty(key)
      expect(validConfidence).toContain(brief.primitives[key].confidence)
    })
  }

  test('score is null when confidence is insufficient_data') {
    const brief = await runPipeline('active-developer')
    Object.values(brief.primitives).forEach((p: PrimitiveAssessment) => {
      if (p.confidence === 'insufficient_data') {
        expect(p.score).toBeNull()
      }
    })
  }

  test('sectionG is always present with 6 epistemic boundaries') {
    const brief1 = await runPipeline('active-developer')
    const brief2 = await runPipeline('minimal-profile')
    expect(brief1.sectionG.epistemicBoundaries).toHaveLength(6)
    expect(brief2.sectionG.epistemicBoundaries).toHaveLength(6)
  }

  test('minimal profile returns observability_gap, not crash') {
    const brief = await runPipeline('minimal-profile')
    expect(brief).toBeDefined()
    const gaps = Object.values(brief.primitives).filter((p: any) =>
      p.confidence === 'observability_gap' || p.confidence === 'insufficient_data'
    )
    expect(gaps.length).toBeGreaterThan(3) // minimal profile should have many gaps
  }

  test('cache hit returns same brief on second request') {
    const brief1 = await runPipeline('active-developer')
    const brief2 = await runPipeline('active-developer') // same username
    expect(brief2.meta.generatedAt).toBe(brief1.meta.generatedAt) // same timestamp = cache hit
  }

  test('employment verification returns rung 0 when no org signal') {
    // minimal-profile fixture: no org memberships, no commit email domains
    const brief = await runPipeline('minimal-profile')
    brief.sectionA.employmentVerification.forEach((ev: EmploymentVerification) => {
      expect([0, 1]).toContain(ev.rungAchieved) // rung 2+3 not possible in light mode
    })
  }

  test('sectionE has 3-5 technical questions') {
    const brief = await runPipeline('active-developer')
    expect(brief.sectionE.technicalQuestions.length).toBeGreaterThanOrEqual(3)
    expect(brief.sectionE.technicalQuestions.length).toBeLessThanOrEqual(5)
  }

  test('AnalysisJob record in DB matches brief') {
    const { jobId, brief } = await runPipelineWithJobId('active-developer')
    const job = await prisma.analysisJob.findUnique({ where: { id: jobId } })
    expect(job.status).toBe('completed')
    expect(job.progress).toBe(100)
    expect(job.result).toMatchObject({ sectionA: brief.sectionA })
  }
}

// Helper function (define at bottom of file):
// async function runPipeline(fixtureName: string): Promise<EvidenceBrief>
// - Intercept GitHub API with nock using fixture file
// - POST /analysis, poll until complete, return brief
// - Throw if takes > 3 minutes or status = failed
```

---

## PHASE 4 GATE — Anti-Gaming Flags Fire Correctly

### Human Checks (~10 min)

```
[ ] Manually test each detection algorithm by constructing edge-case inputs:

Commit inflation test:
  Create a mock commitSample where 35% of commits are < 5 lines
  Call CommitInflationService.analyze(commits)
  → Should return a flag (not null)
  → flag.type === 'commit_inflation'
  → flag.autoReject === false

Fork dumping test:
  Create mock repos: 10 total, 6 are unmodified forks (pushed_at === created_at, no stars, no topics)
  Call ForkDumpingService.analyze(repos)
  → Should return a flag (60% > 50% threshold)
  → adjustedRepos should have length 4 (only non-fork repos)

Burst/dormancy test:
  Create weeklyContributions: 48 weeks of { total: 2 } then 4 weeks of { total: 20 }
  burstRatio = 20/2 = 10x (> 5x threshold)
  Call BurstDormancyService.analyze(weekly)
  → Should return a flag
  → evidence string should mention the ratio

Clean profile test:
  All 3 services with normal data → should all return null (no false positives)

[ ] Check that flags have flag.autoReject === false in ALL cases (critical spec requirement)
[ ] Check P7 now returns a real score when flags are present (not just the stub)
[ ] Check sectionD in a brief for a flagged profile — flags array should be populated
```

### LLM Test Prompt — Phase 4
**Model:** Codex  
**Target file:** `test/phase-gates/phase-4.spec.ts`

```
Write Jest unit tests for all anti-gaming detection services.
Pure unit tests — no HTTP, no database. Crafted edge cases only.

Test file: test/phase-gates/phase-4.spec.ts

CRITICAL INVARIANT TO TEST IN EVERY FLAG-RETURNING TEST:
expect(flag.autoReject).toBe(false)  // must be in every test that asserts a flag is returned

describe('CommitInflationService') {

  const makeCommits = (count: number, size: number) =>
    Array(count).fill(null).map((_, i) => ({
      sha: `sha${i}`, message: 'feat: something', additions: size, deletions: 0,
      timestamp: new Date().toISOString(), isMerge: false, isDocOnly: false, isSigned: false
    }))

  test('flags when >30% commits are under 5 lines') {
    const commits = [...makeCommits(35, 2), ...makeCommits(65, 50)] // 35% tiny
    const flag = svc.analyze(commits)
    expect(flag).not.toBeNull()
    expect(flag!.type).toBe('commit_inflation')
    expect(flag!.autoReject).toBe(false)
    expect(flag!.severity).toBe('soft_concern')
    expect(flag!.interviewProbe.length).toBeGreaterThan(0)
  }

  test('does NOT flag when 29% commits are under 5 lines (below threshold)') {
    const commits = [...makeCommits(29, 2), ...makeCommits(71, 50)]
    expect(svc.analyze(commits)).toBeNull()
  }

  test('excludes merge commits from inflation calculation') {
    const commits = [...makeCommits(50, 2).map(c => ({ ...c, isMerge: true })), ...makeCommits(50, 50)]
    // merge commits excluded → only 50 counted, none are tiny → no flag
    expect(svc.analyze(commits)).toBeNull()
  }

  test('excludes doc-only commits from inflation calculation') {
    const docCommits = makeCommits(40, 1).map(c => ({ ...c, isDocOnly: true }))
    const realCommits = makeCommits(60, 50)
    expect(svc.analyze([...docCommits, ...realCommits])).toBeNull()
  }

  test('evidence string contains the inflation percentage') {
    const commits = [...makeCommits(40, 2), ...makeCommits(60, 50)]
    const flag = svc.analyze(commits)!
    expect(flag.evidence).toContain('40%')
  }
}

describe('ForkDumpingService') {

  const makeRepo = (isFork: boolean, hasCommits: boolean, stars = 0, topics: string[] = []) => ({
    name: 'repo', language: 'TypeScript', topics, hasReadme: true,
    lastPushedAt: hasCommits ? '2024-06-01' : '2024-01-01',
    isFork, isArchived: false, homepageUrl: null, starCount: stars,
    forkCount: 0, createdAt: '2024-01-01', description: null, fileTreeSample: []
  })

  test('flags when >50% repos are unmodified forks') {
    const repos = [
      ...Array(6).fill(makeRepo(true, false, 0, [])),  // unmodified forks
      ...Array(4).fill(makeRepo(false, true, 5, []))   // real repos
    ]
    const { flag, adjustedRepos } = svc.analyze(repos)
    expect(flag).not.toBeNull()
    expect(flag!.type).toBe('fork_dumping')
    expect(flag!.autoReject).toBe(false)
    expect(adjustedRepos).toHaveLength(4) // unmodified forks excluded
  }

  test('does NOT flag forks with commits (pushed_at > created_at)') {
    const repos = Array(10).fill(makeRepo(true, true, 2, []))
    const { flag } = svc.analyze(repos)
    expect(flag).toBeNull()
  }

  test('does NOT flag forks with stars (community validated)') {
    const repos = Array(10).fill(makeRepo(true, false, 10, []))
    const { flag } = svc.analyze(repos)
    expect(flag).toBeNull()
  }
}

describe('BurstDormancyService') {

  test('flags when last 4 weeks are 5x+ the trailing average') {
    const weekly = [
      ...Array(48).fill({ week: 'x', total: 2 }),
      ...Array(4).fill({ week: 'x', total: 15 })  // ratio: 15/2 = 7.5x
    ]
    const flag = svc.analyze(weekly)
    expect(flag).not.toBeNull()
    expect(flag!.type).toBe('burst_dormancy')
    expect(flag!.autoReject).toBe(false)
    expect(flag!.evidence).toContain('7.5x')
  }

  test('does NOT flag consistent activity') {
    const weekly = Array(52).fill({ week: 'x', total: 5 })
    expect(svc.analyze(weekly)).toBeNull()
  }

  test('does NOT flag when trailing average is 0 (new account)') {
    const weekly = [...Array(48).fill({ week: 'x', total: 0 }), ...Array(4).fill({ week: 'x', total: 10 })]
    // ratio would be Infinity — should not flag (new account, no history to compare against)
    const flag = svc.analyze(weekly)
    expect(flag).toBeNull()
  }

  test('confidenceScore is higher for more extreme burst ratios') {
    const mild = [...Array(48).fill({ week: 'x', total: 2 }), ...Array(4).fill({ week: 'x', total: 12 })]  // 6x
    const extreme = [...Array(48).fill({ week: 'x', total: 2 }), ...Array(4).fill({ week: 'x', total: 40 })] // 20x
    const mildFlag = svc.analyze(mild)!
    const extremeFlag = svc.analyze(extreme)!
    expect(extremeFlag.confidenceScore).toBeGreaterThan(mildFlag.confidenceScore)
  }
}

describe('P7 AuthenticityConfidence — Full Implementation') {

  test('hard stop on credential leak overrides all other signals') {
    const input = {
      groupA: makeGroupA(), groupG: makeGroupG({ commitInflationRate: 0.05 }), // good gaming signals
      gitleaks: { leaksFound: true, count: 1, findings: [{ ruleId: 'aws-access-token', file: 'config.js', commit: 'abc', secretPreview: 'AKIA****' }] },
      employmentRungs: [{ employer: 'Google', rungAchieved: 3, rungText: 'Rung 3...' }],
      flags: [{ type: 'credential_leak', severity: 'hard_stop', evidence: '...', confidenceScore: 100, interviewProbe: '...', autoReject: false as const }]
    }
    const result = svc.evaluate(input)
    expect(result.confidence).toBe('low_evidence')
    expect(result.confidenceText.toLowerCase()).toContain('hard stop')
  }

  test('Rung 3 employment verification contributes positively to score') {
    const inputRung3 = { ...baseInput, employmentRungs: [{ employer: 'Stripe', rungAchieved: 3 as const, rungText: '...' }], flags: [] }
    const inputRung0 = { ...baseInput, employmentRungs: [], flags: [] }
    const r3 = svc.evaluate(inputRung3)
    const r0 = svc.evaluate(inputRung0)
    expect(r3.score!).toBeGreaterThan(r0.score!)
  }

  test('multiple gaming flags lower the score') {
    const noFlags = { ...baseInput, flags: [] }
    const manyFlags = { ...baseInput, flags: [
      { type: 'commit_inflation', severity: 'soft_concern', evidence: '', confidenceScore: 50, interviewProbe: '', autoReject: false as const },
      { type: 'burst_dormancy', severity: 'soft_concern', evidence: '', confidenceScore: 70, interviewProbe: '', autoReject: false as const },
      { type: 'fork_dumping', severity: 'soft_concern', evidence: '', confidenceScore: 60, interviewProbe: '', autoReject: false as const }
    ]}
    expect(svc.evaluate(manyFlags).score!).toBeLessThan(svc.evaluate(noFlags).score!)
  }

  test('score is never negative') {
    const worstCase = {
      ...baseInput,
      flags: Array(10).fill({ type: 'repo_laundering', severity: 'soft_concern', evidence: '', confidenceScore: 100, interviewProbe: '', autoReject: false as const })
    }
    expect(svc.evaluate(worstCase).score!).toBeGreaterThanOrEqual(0)
  }
}
```

---

## PHASE 5 GATE — LLM Integration Working

### Human Checks (~10 min)

```
[ ] Check ANTHROPIC_API_KEY is set and valid:
    curl https://api.anthropic.com/v1/messages \
      -H "x-api-key: $ANTHROPIC_API_KEY" \
      -H "anthropic-version: 2023-06-01" \
      -H "content-type: application/json" \
      -d '{"model":"claude-sonnet-4-20250514","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}'
    → Should return a response, not 401

[ ] Run a full Light Mode brief on a profile with decent PR history (e.g. your own GitHub)
[ ] Compare two runs: one with LLM calls mocked to fail (set ANTHROPIC_API_KEY=invalid)
    and one with real LLM calls
    → Both should complete (LLM failure falls back to rule-based)
    → LLM-enhanced brief should have higher confidence levels on P1, P3, P6

[ ] Check token usage in logs — should not exceed 4000 tokens per Light Mode job
[ ] Verify LLM calls are batched: only 1-2 API calls per job, not 5 separate calls
[ ] Check that commit quality score appears in P1.keyEvidence
[ ] Check that P6.aiLeverageClass is one of the 5 valid values (not undefined)
```

### LLM Test Prompt — Phase 5
**Model:** Codex  
**Target file:** `test/phase-gates/phase-5.spec.ts`

```
Write Jest tests for LLM integration — both the happy path and fallback behaviour.
Mock the Anthropic API using nock. Never make real API calls in tests.

Test file: test/phase-gates/phase-5.spec.ts

ANTHROPIC API MOCK HELPER (define at top):
function mockAnthropicSuccess(responseJson: object) {
  nock('https://api.anthropic.com')
    .post('/v1/messages')
    .reply(200, {
      content: [{ type: 'text', text: JSON.stringify(responseJson) }],
      usage: { input_tokens: 500, output_tokens: 200 }
    })
}

function mockAnthropicFailure(statusCode: number) {
  nock('https://api.anthropic.com').post('/v1/messages').reply(statusCode, { error: 'test error' })
}

TESTS:

describe('LLMClientService') {
  test('returns parsed JSON when expectJSON is true and response is valid') {
    mockAnthropicSuccess({ score: 8, label: 'good' })
    const result = await svc.analyze({ systemPrompt: 'test', userContent: 'test', maxTokens: 100, expectJSON: true })
    expect(result.parsedJSON).toEqual({ score: 8, label: 'good' })
    expect(result.tokensUsed).toBe(700)
  }

  test('retries 3 times on 429, then throws') {
    nock('https://api.anthropic.com').post('/v1/messages').times(3).reply(429, { error: 'rate limit' })
    await expect(svc.analyze({ systemPrompt: '', userContent: '', maxTokens: 100, expectJSON: false })).rejects.toThrow()
  }

  test('strips markdown fences before JSON parse') {
    nock('https://api.anthropic.com').post('/v1/messages').reply(200, {
      content: [{ type: 'text', text: '```json\n{"score": 5}\n```' }],
      usage: { input_tokens: 100, output_tokens: 50 }
    })
    const result = await svc.analyze({ systemPrompt: '', userContent: '', maxTokens: 100, expectJSON: true })
    expect(result.parsedJSON).toEqual({ score: 5 })
  }

  test('times out after 30 seconds') {
    jest.setTimeout(35_000)
    nock('https://api.anthropic.com').post('/v1/messages').delayConnection(31_000).reply(200, {})
    await expect(svc.analyze({ systemPrompt: '', userContent: '', maxTokens: 100, expectJSON: false })).rejects.toThrow()
  }
}

describe('LLMSignalMergerService — Fallback') {
  test('when commitQuality is null, P1 retains rule-based confidence') {
    const ruleBasedP1: PrimitiveAssessment = { score: 60, confidence: 'moderate_evidence', confidenceText: '...', keyEvidence: ['rule-based'], observabilityGaps: [], interviewProbes: [] }
    const merged = svc.merge({ p1: ruleBasedP1 }, { commitQuality: null })
    expect(merged.p1ExecutionReliability.confidence).toBe('moderate_evidence')
    expect(merged.p1ExecutionReliability.observabilityGaps).toContain(expect.stringContaining('LLM analysis unavailable'))
  }

  test('when prDepth is available and substantive_rate >= 60, P3 confidence upgrades') {
    const ruleBasedP3: PrimitiveAssessment = { score: 50, confidence: 'low_evidence', confidenceText: '...', keyEvidence: [], observabilityGaps: [], interviewProbes: [] }
    const merged = svc.merge({ p3: ruleBasedP3 }, { prDepth: { root_cause_identification: 8, architectural_thinking: 7, substantive_rate: 75, communication_quality: 8 } })
    expect(merged.p3CollaborationLeverage.confidence).toBe('moderate_evidence') // upgraded from low
  }

  test('high ai_generation_likelihood in commits adds observability gap to P1') {
    const ruleBasedP1: PrimitiveAssessment = { score: 70, confidence: 'strong_evidence', confidenceText: '...', keyEvidence: [], observabilityGaps: [], interviewProbes: [] }
    const merged = svc.merge({ p1: ruleBasedP1 }, { commitQuality: { informativeness: 8, intent_communication: 8, consistency: 9, ai_generation_likelihood: 85, examples: { good: '', bad: '' } } })
    expect(merged.p1ExecutionReliability.observabilityGaps.some(g => g.includes('AI generation'))).toBe(true)
  }
}

describe('LLMBatchManagerService') {
  test('combines multiple tasks into one API call') {
    const callCount = { value: 0 }
    nock('https://api.anthropic.com').post('/v1/messages').reply(200, () => {
      callCount.value++
      return { content: [{ type: 'text', text: JSON.stringify({ commit_quality: {}, pr_depth: {}, ai_generation: {} }) }], usage: { input_tokens: 500, output_tokens: 300 } }
    })
    await svc.batchAnalyze([
      { name: 'commit_quality', systemPrompt: '...', content: '...', maxTokens: 500 },
      { name: 'pr_depth', systemPrompt: '...', content: '...', maxTokens: 500 },
      { name: 'ai_generation', systemPrompt: '...', content: '...', maxTokens: 500 }
    ])
    expect(callCount.value).toBe(1) // all 3 in one call
  }

  test('falls back to individual calls when combined parse fails') {
    // First call returns unparseable JSON, subsequent calls return individual results
    nock('https://api.anthropic.com').post('/v1/messages').reply(200, { content: [{ type: 'text', text: 'invalid json {' }], usage: { input_tokens: 100, output_tokens: 50 } })
    nock('https://api.anthropic.com').post('/v1/messages').times(3).reply(200, { content: [{ type: 'text', text: '{"result": "ok"}' }], usage: { input_tokens: 100, output_tokens: 50 } })
    const result = await svc.batchAnalyze([
      { name: 'task1', systemPrompt: '', content: '', maxTokens: 100 },
      { name: 'task2', systemPrompt: '', content: '', maxTokens: 100 },
      { name: 'task3', systemPrompt: '', content: '', maxTokens: 100 }
    ])
    expect(result).toBeDefined() // fallback worked, no throw
  }
}
```

---

## PHASE 6 GATE — Deep Mode End-to-End

### Human Checks (~30 min — longest gate)

```
PRE-REQUISITE: GitHub App must be registered and installed on a test account.

[ ] Generate an evaluation link:
    POST /evaluation-links { candidateEmail: "test@test.com", seniorityTarget: "MID", archetypeTarget: "BACKEND" }
    → Returns { linkId, evaluationUrl }

[ ] Open evaluationUrl in a browser → should redirect to GitHub App install page
[ ] Install the GitHub App on your personal GitHub account, select 3-5 repos
[ ] Check webhook was received: look in application logs for "Installation webhook received"
[ ] Check EvaluationLink in DB: status should be CONSENTED, installationId should be set

[ ] Poll GET /analysis/:jobId/status (job was auto-created on webhook)
    → Should move through stages: fetching_data → analysing_signals → building_brief
    → Should complete in 8–15 minutes

[ ] GET /analysis/:jobId/brief and inspect:
    [ ] meta.analysisMode === "deep"
    [ ] meta.reposCloned > 0
    [ ] P1 confidence should be higher than Light Mode equivalent (more signals)
    [ ] P7 authenticity should now have employment verification signals
    [ ] sectionD.credentialLeakDetected is present (true or false — either is valid)

[ ] Check disk: /tmp/colosseum-analysis/[jobId] should NOT exist after completion
    (cleanup must have run — ls /tmp/colosseum-analysis/ should be empty or missing)

[ ] Check that installationToken in DB is encrypted (should look like "v1:<iv>:<tag>:<cipher>")
    NOT a plaintext GitHub token
```

### LLM Test Prompt — Phase 6
**Model:** Codex  
**Target file:** `test/phase-gates/phase-6.spec.ts`

```
Write Jest tests for Deep Mode infrastructure. Mock the GitHub App OAuth flow and all external services.

Test file: test/phase-gates/phase-6.spec.ts

TESTS:

describe('EvaluationLinkModule') {
  test('POST /evaluation-links creates link with correct expiry') {
    const response = await request(app).post('/evaluation-links')
      .set('Authorization', bearerToken)
      .send({ candidateEmail: 'test@test.com', seniorityTarget: 'MID', archetypeTarget: 'BACKEND' })
    expect(response.status).toBe(201)
    expect(response.body.evaluationUrl).toContain('/eval/')
    const link = await prisma.evaluationLink.findFirst({ where: { candidateEmail: 'test@test.com' } })
    const expiryDays = Math.round((new Date(link.expiresAt).getTime() - Date.now()) / 86_400_000)
    expect(expiryDays).toBeCloseTo(7, 0)
  }

  test('GET /evaluation-links/consent/:token redirects to GitHub App install URL') {
    const link = await createTestLink()
    const response = await request(app).get(`/evaluation-links/consent/${link.token}`)
    expect(response.status).toBe(302)
    expect(response.headers.location).toContain('github.com/apps/')
    expect(response.headers.location).toContain(link.token) // state param
  }

  test('webhook with valid HMAC creates Deep Mode AnalysisJob') {
    const payload = { action: 'created', installation: { id: 12345 }, repositories: [{ id: 1, full_name: 'user/repo' }] }
    const sig = computeHMAC(JSON.stringify(payload), process.env.GITHUB_WEBHOOK_SECRET!)
    const response = await request(app)
      .post('/webhooks/github')
      .set('X-Hub-Signature-256', `sha256=${sig}`)
      .set('X-GitHub-Event', 'installation')
      .send(payload)
    expect(response.status).toBe(200)
    const job = await prisma.analysisJob.findFirst({ where: { mode: 'DEEP' } })
    expect(job).not.toBeNull()
  }

  test('webhook with invalid HMAC returns 401 and creates NO job') {
    const response = await request(app)
      .post('/webhooks/github')
      .set('X-Hub-Signature-256', 'sha256=invalidsignature')
      .set('X-GitHub-Event', 'installation')
      .send({ action: 'created' })
    expect(response.status).toBe(401)
    const jobs = await prisma.analysisJob.findMany({ where: { mode: 'DEEP' } })
    expect(jobs).toHaveLength(0)
  }

  test('expired evaluation link returns 410') {
    const expiredLink = await createTestLink({ expiresAt: new Date(Date.now() - 1000) })
    const response = await request(app).get(`/evaluation-links/consent/${expiredLink.token}`)
    expect(response.status).toBe(410)
  }
}

describe('RepoClonerService') {
  test('clones repos in parallel with concurrency limit of 4') {
    // Mock git clone command — track concurrent executions
    let maxConcurrent = 0
    let current = 0
    jest.spyOn(child_process, 'execFile').mockImplementation((cmd, args, opts, callback) => {
      current++
      maxConcurrent = Math.max(maxConcurrent, current)
      setTimeout(() => { current--; callback(null, '', '') }, 100)
    })
    const repos = Array(8).fill({ name: 'repo', owner: 'user' })
    await svc.cloneTop30(repos, 'token', 'jobId')
    expect(maxConcurrent).toBeLessThanOrEqual(4)
  }

  test('cleanup deletes the job directory') {
    const jobId = 'test-job-123'
    fs.mkdirSync(`/tmp/colosseum-analysis/${jobId}`, { recursive: true })
    fs.writeFileSync(`/tmp/colosseum-analysis/${jobId}/test.txt`, 'data')
    await svc.cleanup(jobId)
    expect(fs.existsSync(`/tmp/colosseum-analysis/${jobId}`)).toBe(false)
  }

  test('cleanup does not throw if directory already deleted') {
    await expect(svc.cleanup('non-existent-job-id')).resolves.not.toThrow()
  }
}

describe('Tool Wrappers — Smoke Tests') {
  // These test the tool wrappers with a real minimal git repo created in /tmp

  beforeAll(() => {
    // Create a minimal git repo with a known file
    execSync('mkdir -p /tmp/test-repo && cd /tmp/test-repo && git init && echo "test" > index.js && git add . && git commit -m "init"')
  })

  test('SccService returns output for a valid repo path') {
    const result = await scc.run('/tmp/test-repo')
    expect(result).not.toBeNull()
    expect(result!.languages.length).toBeGreaterThan(0)
  }

  test('TokeiService returns output for a valid repo path') {
    const result = await tokei.run('/tmp/test-repo')
    expect(result).not.toBeNull()
    expect(result!.totalCodeLines).toBeGreaterThanOrEqual(0)
  }

  test('GitleaksService returns clean result for a repo with no secrets') {
    const result = await gitleaks.run('/tmp/test-repo')
    expect(result).not.toBeNull()
    expect(result!.leaksFound).toBe(false)
  }

  test('ActionlintService returns empty issues for a repo with no .github/workflows') {
    const result = await actionlint.run('/tmp/test-repo')
    expect(result).not.toBeNull()
    expect(result!.totalIssues).toBe(0)
  }

  test('all tool wrappers return null gracefully for invalid path') {
    const fakeRepo = '/tmp/this-path-does-not-exist'
    await expect(scc.run(fakeRepo)).resolves.toBeNull()
    await expect(tokei.run(fakeRepo)).resolves.toBeNull()
    await expect(gitleaks.run(fakeRepo)).resolves.toBeNull()
  }
}

describe('Employment Verification — Rungs 2+3') {
  test('Rung 2 achieved when org membership matches employer') {
    const groupA = makeGroupA({
      orgMemberships: [{ org: 'stripe', role: 'member' }]
    })
    const result = await svc.verify(groupA, 'deep', [{ name: 'Stripe' }])
    expect(result[0].rungAchieved).toBe(2)
    expect(result[0].rungText).toContain('Organisation membership confirmed')
  }

  test('Rung 3 achieved when contribution fingerprint matches tenure') {
    const deepData = { orgContributions: [{ org: 'stripe', firstContributionAt: '2022-01-01', lastContributionAt: '2023-12-31', totalCommits: 150 }] }
    const result = await svc.verifyDeep(groupA, deepData, [{ name: 'Stripe', startDate: '2022-01-01', endDate: '2023-12-31' }])
    expect(result[0].rungAchieved).toBe(3)
    expect(result[0].rungText).toContain('Contribution fingerprint confirmed')
  }
}
```

---

## PHASE 7 GATE — JD Matching Works

### Human Checks (~10 min)

```
[ ] POST /job-descriptions { title: "Senior Backend Engineer", rawText: "[paste a real JD]" }
    → Returns { id, status: "processing" }

[ ] Wait ~30s, GET /job-descriptions/:id
    → extractedSignals should be populated (not null)
    → Check: requiredLanguages is an array of strings, not empty
    → Check: inferredArchetype is one of the 6 RoleArchetype values
    → Check: inferredSeniority is one of the 5 SeniorityTier values

[ ] Run a full Light Mode analysis on a developer profile
[ ] GET /analysis/:jobId/brief
    → For now sectionF should be absent (sectionF only appears when JD + Deep Mode)

[ ] Optional: trigger a Deep Mode analysis WITH jobPostId linked
    → GET brief → sectionF should now be present
    → sectionF.overlapScore should be 0–100
    → sectionF.gapSignals should list missing skills

[ ] PUT /job-descriptions/:id/confirm { extractedSignals: [edited version] }
    → Returns 200
    → GET confirms new extractedSignals saved
```

### LLM Test Prompt — Phase 7
**Model:** Codex  
**Target file:** `test/phase-gates/phase-7.spec.ts`

```
Write Jest tests for the Job Description module and Role Stack Match service.

Test file: test/phase-gates/phase-7.spec.ts

MOCK JD TEXT (use this in all tests):
const SAMPLE_JD = `
We are looking for a Senior Backend Engineer to join our platform team.
You will design and build distributed systems handling millions of requests per day.
Required: 5+ years Go or Rust, PostgreSQL, Redis, Kubernetes, experience with gRPC or GraphQL APIs.
Nice to have: Terraform, experience with Kafka or similar event streaming.
You will lead technical design reviews and mentor junior engineers.
`

describe('JobDescriptionModule') {
  test('POST /job-descriptions creates record and queues extraction') {
    const response = await request(app).post('/job-descriptions')
      .set('Authorization', companyBearerToken)
      .send({ title: 'Senior Backend Engineer', rawText: SAMPLE_JD })
    expect(response.status).toBe(201)
    expect(response.body.status).toBe('processing')
    const jd = await prisma.jobDescription.findUnique({ where: { id: response.body.id } })
    expect(jd).not.toBeNull()
    expect(jd!.extractedSignals).toBeNull() // not yet processed
  }

  test('extraction populates requiredLanguages from JD text') {
    // Mock LLM to return structured extraction
    mockAnthropicSuccess({
      requiredLanguages: ['Go', 'Rust'],
      requiredTools: ['PostgreSQL', 'Redis', 'Kubernetes'],
      requiredFrameworks: ['gRPC', 'GraphQL'],
      niceToHave: ['Terraform', 'Kafka'],
      senioritySignals: ['5+ years', 'lead technical design reviews', 'mentor junior engineers'],
      inferredArchetype: 'BACKEND',
      inferredSeniority: 'SENIOR'
    })
    await triggerJDExtraction(jdId)
    const jd = await prisma.jobDescription.findUnique({ where: { id: jdId } })
    expect(jd!.extractedSignals.requiredLanguages).toContain('Go')
    expect(jd!.extractedSignals.inferredArchetype).toBe('BACKEND')
  }

  test('PUT /job-descriptions/:id/confirm saves edited signals') {
    const editedSignals = { requiredLanguages: ['Go'], requiredTools: ['PostgreSQL'], requiredFrameworks: [], niceToHave: [], senioritySignals: [], inferredArchetype: 'BACKEND', inferredSeniority: 'SENIOR' }
    const response = await request(app).put(`/job-descriptions/${jdId}/confirm`)
      .set('Authorization', companyBearerToken)
      .send({ extractedSignals: editedSignals })
    expect(response.status).toBe(200)
    const jd = await prisma.jobDescription.findUnique({ where: { id: jdId } })
    expect(jd!.extractedSignals.requiredLanguages).toEqual(['Go'])
  }
}

describe('RoleStackMatchService') {
  test('overlapScore is 100 when candidate has all required skills') {
    const evidencedStack = { languages: ['Go', 'Rust'], tools: ['PostgreSQL', 'Redis', 'Kubernetes'], frameworks: ['gRPC', 'GraphQL'] }
    const jdSignals = { requiredLanguages: ['Go'], requiredTools: ['PostgreSQL', 'Redis'], requiredFrameworks: ['gRPC'] }
    const result = svc.match(evidencedStack, jdSignals)
    expect(result.overlapScore).toBe(100)
    expect(result.gapSignals).toHaveLength(0)
  }

  test('overlapScore is 0 when candidate has no required skills') {
    const evidencedStack = { languages: ['PHP'], tools: ['MySQL'], frameworks: ['Laravel'] }
    const jdSignals = { requiredLanguages: ['Go'], requiredTools: ['PostgreSQL', 'Redis'], requiredFrameworks: ['gRPC'] }
    const result = svc.match(evidencedStack, jdSignals)
    expect(result.overlapScore).toBe(0)
    expect(result.gapSignals.length).toBe(4) // all 4 required items missing
  }

  test('fuzzy matching: "Node.js" in JD matches "Node" in evidence') {
    const evidencedStack = { languages: ['Node', 'TypeScript'], tools: [], frameworks: ['Express'] }
    const jdSignals = { requiredLanguages: ['Node.js', 'TypeScript'], requiredTools: [], requiredFrameworks: [] }
    const result = svc.match(evidencedStack, jdSignals)
    expect(result.overlapScore).toBe(100)
  }

  test('gap signals generate specific interview probes') {
    const evidencedStack = { languages: ['Python'], tools: [], frameworks: [] }
    const jdSignals = { requiredLanguages: ['Go'], requiredTools: ['Kubernetes'], requiredFrameworks: [] }
    const result = svc.match(evidencedStack, jdSignals)
    expect(result.gapInterviewProbes.length).toBe(2)
    expect(result.gapInterviewProbes[0].probe.length).toBeGreaterThan(20)
  }
}
```

---

## PHASE 8 GATE — Production Ready

### Human Checks (~20 min)

```
LOAD TEST:
[ ] Run 10 concurrent Light Mode requests (use k6 or artillery):
    artillery quick --count 10 --num 10 http://localhost:3000/analysis
    → All 10 should complete
    → No 500 errors
    → p95 completion time < 3 minutes

[ ] Check rate limit circuit breaker fires under load:
    Mock GitHub API to return X-RateLimit-Remaining: 400
    → Processor should pause and log "Rate limit circuit breaker activated"
    → Job should resume after rate limit window, not fail permanently

GDPR:
[ ] Create a candidate with a few analysis jobs and shortlists
[ ] POST /gdpr/delete/:candidateId (or however the endpoint is exposed)
[ ] Check:
    - User record still exists but email=null, name=null
    - Candidate scorecard=null
    - GithubProfile deleted (SELECT → 0 rows)
    - AnalysisJob deleted
    - Shortlist frozenScorecard=null BUT shortlist record still exists (employer audit trail)
    - Redis: no brief cache keys for this username

OUTCOME TRACKING:
[ ] POST /outcomes { analysisJobId, hired: true, performanceRating: 4 }
    → 201 response
[ ] GET /outcomes/summary → shows hire rate and avg performance
[ ] Try POST /outcomes with invalid performanceRating: 6 → 422 validation error

MONITORING:
[ ] Check Sentry is receiving errors: temporarily throw an error in a processor, run a job, check Sentry
[ ] Check BullMQ dashboard (if set up) shows job counts, failed jobs, completed jobs
[ ] Check logs have structured JSON format (pino) with jobId field on all log lines during processing
```

### LLM Test Prompt — Phase 8
**Model:** Codex  
**Target file:** `test/phase-gates/phase-8.spec.ts`

```
Write Jest tests for Phase 8 hardening: outcomes API, GDPR deletion, and error resilience.

Test file: test/phase-gates/phase-8.spec.ts

describe('HireOutcome API') {
  test('POST /outcomes creates outcome record') {
    const job = await createCompletedAnalysisJob()
    const response = await request(app).post('/outcomes')
      .set('Authorization', adminToken)
      .send({ analysisJobId: job.id, hired: true, performanceRating: 4, flagsWereAccurate: false })
    expect(response.status).toBe(201)
    const outcome = await prisma.hireOutcome.findUnique({ where: { analysisJobId: job.id } })
    expect(outcome!.hired).toBe(true)
    expect(outcome!.performanceRating).toBe(4)
  }

  test('POST /outcomes rejects performanceRating > 5') {
    const job = await createCompletedAnalysisJob()
    const response = await request(app).post('/outcomes').set('Authorization', adminToken)
      .send({ analysisJobId: job.id, hired: true, performanceRating: 6 })
    expect(response.status).toBe(422)
  }

  test('POST /outcomes is idempotent (upserts, not duplicates)') {
    const job = await createCompletedAnalysisJob()
    await request(app).post('/outcomes').set('Authorization', adminToken).send({ analysisJobId: job.id, hired: false })
    await request(app).post('/outcomes').set('Authorization', adminToken).send({ analysisJobId: job.id, hired: true })
    const outcomes = await prisma.hireOutcome.findMany({ where: { analysisJobId: job.id } })
    expect(outcomes).toHaveLength(1) // upsert, not two records
    expect(outcomes[0].hired).toBe(true) // latest value wins
  }

  test('GET /outcomes/summary returns correct hire rate') {
    // Create 3 hired outcomes and 1 rejected
    // Assert hireRate === 0.75
  }
}

describe('GDPRService') {
  test('deleteCandidate removes PII and keeps employer audit trail') {
    const { candidateId, jobId, shortlistId } = await createFullCandidateFixture()
    await gdprService.deleteCandidate(candidateId)

    const user = await prisma.user.findFirst({ where: { candidate: { id: candidateId } } })
    expect(user!.email).toBeNull()
    expect(user!.name).toBeNull()

    const githubProfile = await prisma.githubProfile.findFirst({ where: { developerProfile: { candidateId } } })
    expect(githubProfile).toBeNull() // hard deleted

    const analysisJob = await prisma.analysisJob.findUnique({ where: { id: jobId } })
    expect(analysisJob).toBeNull() // hard deleted

    const shortlist = await prisma.shortlist.findUnique({ where: { id: shortlistId } })
    expect(shortlist).not.toBeNull() // employer record preserved
    expect(shortlist!.frozenScorecard).toBeNull() // but PII cleared
  }

  test('deleteCandidate invalidates brief cache') {
    const username = 'test-user-gdpr'
    await briefCacheService.set(BriefCacheService.buildKey(username, 'light'), mockBrief, 86400)
    await gdprService.deleteCandidate(candidateId)
    const cached = await briefCacheService.get(BriefCacheService.buildKey(username, 'light'))
    expect(cached).toBeNull()
  }
}

describe('Error Resilience') {
  test('pipeline completes even when ExternalSignalService throws') {
    jest.spyOn(externalSignalService, 'fetch').mockRejectedValue(new Error('npm API down'))
    const brief = await runLightModePipeline('test-user')
    expect(brief).toBeDefined() // pipeline continued despite error
    // npm signals absent but brief still generated
  }

  test('pipeline completes even when a single primitive throws') {
    jest.spyOn(p4Service, 'evaluate').mockImplementation(() => { throw new Error('unexpected error') })
    const brief = await runLightModePipeline('test-user')
    expect(brief).toBeDefined()
    // P4 should have observability_gap not a 500
    expect(brief.primitives.p4TechnicalDepth.confidence).toBe('observability_gap')
  }

  test('AnalysisJob is marked failed when the entire pipeline crashes') {
    jest.spyOn(lightFetcherService, 'fetch').mockRejectedValue(new Error('catastrophic failure'))
    await runLightModePipelineJob('test-user')
    const job = await prisma.analysisJob.findFirst({ order: { createdAt: 'desc' } })
    expect(job!.status).toBe('failed')
    expect(job!.error).toContain('catastrophic failure')
  }
}
```

---

## Quick Reference — Phase Gate Summary

| Phase | Gate Requirement | Key Invariants to Check |
|---|---|---|
| 0 | Types compile, binaries installed | No TS errors, all 5 confidence levels exist |
| 1 | Light fetcher returns all 6 groups | Cache works, rate limit circuit breaker fires |
| 2 | All 7 primitives return valid output | Mandatory confidence language exact, P7 hard stop |
| 3 | Full brief generated end-to-end | No composite score, sectionG always present |
| 4 | Anti-gaming flags fire correctly | `autoReject === false` on EVERY flag, always |
| 5 | LLM enhances primitives, fallback works | Fallback never causes pipeline failure |
| 6 | Deep Mode clones repos, tools run, cleanup | No source code on disk after completion |
| 7 | JD extraction and stack match work | sectionF absent without JD, present with it |
| 8 | Load test passes, GDPR works | Employer audit trail preserved after candidate deletion |

**Never skip a gate. A broken phase 3 will corrupt every phase after it.**