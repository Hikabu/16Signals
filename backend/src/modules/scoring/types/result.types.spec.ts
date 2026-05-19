import { AnalysisResult, ExtractedSignals } from './result.types';

describe('Scoring Types Verification', () => {
  it('should define a valid AnalysisResult structure', () => {
    const result: AnalysisResult = {
      summary: 'Test summary',
      capabilities: {
        backend: { score: 85, confidence: 'high' },
        frontend: { score: 20, confidence: 'low' },
        devops: { score: 40, confidence: 'medium' },
      },
      ownership: {
        ownedProjects: 5,
        activelyMaintained: 3,
        confidence: 'high',
      },
      impact: {
        activityLevel: 'high',
        consistency: 'strong',
        externalContributions: 10,
        confidence: 'high',
      },
      stack: {
        languages: [],
        tools: [],
      },
      organizations: [],
      interactionProfile: null,
      web3: null,
    };
    expect(result.summary).toBeDefined();
  });

  it('should define a valid ExtractedSignals structure', () => {
    const signals: ExtractedSignals = {
      ownershipDepth: 0.8,
      projectLongevity: 24,
      activityConsistency: 0.9,
      techStackBreadth: 5,
      externalContributions: 12,
      projectMeaningfulness: 150,
      stackIdentity: ['TypeScript', 'Node.js'],
      dataCompleteness: 0.95,
    };
    expect(signals.techStackBreadth).toBeDefined();
  });
});
