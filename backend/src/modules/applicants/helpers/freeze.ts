export function buildFrozenScorecard(analysis: any, candidate: any): object {
  return {
    capturedAt: new Date().toISOString(),
    candidateUsername: candidate?.user?.username ?? null,
    githubHandle: candidate?.devProfile?.githubProfile?.githubUsername ?? null,
    walletAddress: candidate?.devProfile?.web3Profile?.solanaAddress ?? null,

    summary: analysis.summary ?? '',
    capabilities: analysis.capabilities ?? {},
    ownership: analysis.ownership ?? null,
    impact: analysis.impact ?? null,
    reputation: analysis.reputation ?? null,
    privateWorkNote: analysis.privateWorkNote ?? null,
    organizations: analysis.organizations ?? [],
    interactionProfile: analysis.interactionProfile ?? null,
    stack: analysis.stack ?? { languages: [], tools: [] },
    web3: analysis.web3 ?? null,
  };
}
