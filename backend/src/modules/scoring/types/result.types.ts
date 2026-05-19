export type ConfidenceLevel = 'low' | 'medium' | 'high';
export type ActivityLevel = 'high' | 'medium' | 'low';
export type ConsistencyLevel = 'strong' | 'moderate' | 'sparse';
export type ProgressStage =
  | 'queued'
  | 'fetching_repos'
  | 'analyzing_projects'
  | 'building_profile'
  | 'complete';

export interface DeployedProgram {
  programId: string;
  deployedAt: string | null;
  isActive: boolean;
  uniqueCallers: number;
  upgradeCount: number;
}

export interface VouchDisplay {
  voucherWallet: string; // truncated: first4...last4
  message: string;
  weight: 'verified' | 'standard' | 'new';
  confirmedAt: string;
  expiresAt: string;
}

export interface ReputationBlock {
  vouchCount: number; // unique active non-expired non-flagged standard+verified
  verifiedVouchCount: number; // verified only
  confidence: 'low' | 'medium' | 'high';
  vouches: VouchDisplay[]; // max 10, ordered by confirmedAt desc
}

export interface OrgAnalysisResult {
  login: string;
  description: string;
  publicRepos: number;
  confirmedContributor: boolean;
  notableRepos: string[];
}

export interface InteractionProfile {
  topicAffinity: string[];
  languageAffinity: string[];
  ecosystemAffinity: 'solana' | null;
}

export interface AnalysisResult {
  summary: string;
  capabilities: {
    backend: { score: number; confidence: ConfidenceLevel };
    frontend: { score: number; confidence: ConfidenceLevel };
    devops: { score: number; confidence: ConfidenceLevel };
  };
  ownership: {
    ownedProjects: number;
    activelyMaintained: number;
    confidence: ConfidenceLevel;
  };
  impact: {
    activityLevel: ActivityLevel;
    consistency: ConsistencyLevel;
    externalContributions: number;
    confidence: ConfidenceLevel;
  };
  reputation: ReputationBlock | null; // null if vouchCount === 0
  privateWorkNote?: string;
  organizations: OrgAnalysisResult[];
  interactionProfile: InteractionProfile | null;
  stack: {
    languages: string[];
    tools: string[];
  };
  web3: {
    ecosystem: 'solana' | null;
    ecosystemSource?: 'owned_repos' | 'interaction_affinity';
    ecosystemReinforcedByInteraction?: boolean;
    ecosystemPRs: number;
    deployedPrograms: DeployedProgram[];
  } | null;
  schemaVersion: string,
}

export interface ExtractedSignals {
  ownershipDepth: number;
  projectLongevity: number;
  activityConsistency: number;
  techStackBreadth: number;
  externalContributions: number;
  projectMeaningfulness: number;
  stackIdentity: string[];
  dataCompleteness: number;
}
