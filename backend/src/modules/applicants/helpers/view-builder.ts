export function buildHrView(shortlist: any): object {
  const dc = shortlist.decisionCard ?? {};
  return {
    // Summary, plain language, readable by non-technical HR
    verdict: dc.verdict ?? null,
    reviewOutcome: dc.reviewOutcome ?? null,
    hrSummary: dc.hrSummary ?? null,
    reputationNote: dc.reputationNote ?? null,

    pipelineStage: shortlist.pipelineStage,
    appliedAt: shortlist.appliedAt,
    fitTier: shortlist.fitTier,
    roleFitScore: shortlist.roleFitScore,
    status: shortlist.status ?? null, // SHORTLISTED | REJECTED | REVIEWED

    candidate: {
      name:
        shortlist.candidate?.user?.name ??
        (`${shortlist.candidate?.user?.firstName || ''} ${shortlist.candidate?.user?.lastName || ''}`.trim() ||
          null),
      username: shortlist.candidate?.user?.username ?? null,
      avatarUrl: shortlist.candidate?.user?.avatarUrl ?? null,
    },
  };
}

export function buildTechnicalView(shortlist: any): object {
  const dc = shortlist.decisionCard ?? {};
  const sc = shortlist.frozenScorecard ?? {}; // source of truth for technical detail
  const gap = shortlist.gapReport ?? {};
  const stack = sc.stack ?? { languages: [], tools: [] };
  const matchedTechnologies = gap.matchedTechnologies ?? [];
  const missingTechnologies = gap.missingTechnologies ?? [];

  return {
    // Deep technical, for CTO / technical interviewers
    technicalSummary: dc.technicalSummary ?? null,
    strengths: dc.strengths ?? [],
    risks: dc.risks ?? [],

    // Scores
    roleFitScore: shortlist.roleFitScore,
    fitTier: shortlist.fitTier,
    confidenceTier: shortlist.confidenceTier ?? sc.confidenceTier ?? null,
    fraudTier: shortlist.fraudTier ?? sc.fraudTier ?? 'CLEAN',
    behaviorPattern: shortlist.behaviorPattern ?? sc.behaviorPattern ?? null,

    // Final scorecard breakdown (from freeze, NOT live)
    scorecard: {
      summary: sc.summary ?? null,
      capabilities: sc.capabilities ?? {},
      ownership: sc.ownership ?? null,
      impact: sc.impact ?? null,
      reputation: sc.reputation ?? null,
      privateWorkNote: sc.privateWorkNote ?? null,
      organizations: sc.organizations ?? [],
      interactionProfile: sc.interactionProfile ?? null,
      stack,
      web3: sc.web3 ?? null,
    },

    // Kept for older clients while the frontend migrates to scorecard.stack.
    languagesUsed: stack.languages ?? [],

    // Web3 (if applicable)
    web3: sc.web3 ?? null,

    // Gap analysis
    gapSummary: {
      matchedTechnologies: gap.matchedTechnologies ?? [],
      missingTechnologies: gap.missingTechnologies ?? [],
      gaps: (gap.gaps ?? []).map((g: any) => ({
        dimension: g.dimension,
        severity: g.severity,
        description: g.description,
        probeQuestion: g.probeQuestion ?? null, // visible to CTO view, hidden in candidate responses
      })),
    },

    skillsGap: {
      requiredSkills: [...matchedTechnologies, ...missingTechnologies],
      matchedTechnologies,
      missingTechnologies,
      gaps: (gap.gaps ?? []).filter((g: any) =>
        g.dimension?.startsWith('Technology: '),
      ),
    },
  };
}
