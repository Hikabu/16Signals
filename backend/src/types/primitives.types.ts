import { PrimitiveAssessment, SeniorityTier } from './evidence-brief.types';

/**
 * RawGroupA — Identity & Profile
 * Populated in both Light and Deep Mode via the GitHub API (user profile, organizations)
 * and verified employment registration signals.
 */
export interface RawGroupA {
  /**
   * The candidate's public bio description.
   */
  bio: string | null;
  /**
   * The candidate's public company association.
   */
  company: string | null;
  /**
   * The candidate's public blog or website URL.
   */
  blog: string | null;
  /**
   * Total age of the GitHub account calculated in months from its creation date.
   */
  accountAgeMonths: number;
  /**
   * Whether the candidate has marked their profile as hireable.
   */
  hireable: boolean | null;
  /**
   * Commit email domains extracted from public push events. Useful for verifying professional domains.
   */
  commitEmailDomains: string[];
  /**
   * Public organization memberships on GitHub and the role achieved within them.
   */
  orgMemberships: Array<{
    org: string;
    role: 'member' | 'owner';
  }>;
}

/**
 * RawGroupB — Repository Inventory
 * Populated in both Light and Deep Mode via the GitHub API repository catalog.
 * Represents a comprehensive list of all repositories associated with the candidate.
 */
export interface RawGroupB {
  /**
   * List of public repositories owned, contributed to, or forked by the user.
   */
  repos: Array<{
    name: string;
    language: string | null;
    topics: string[];
    hasReadme: boolean;
    lastPushedAt: string; // ISO-8601 string timestamp
    isFork: boolean;
    isArchived: boolean;
    homepageUrl: string | null;
    starCount: number;
    forkCount: number;
    createdAt: string; // ISO-8601 string timestamp
    description: string | null;
    /**
     * Sample of root-level files and directories for Light Mode AST/heuristic checks.
     */
    fileTreeSample: string[];
  }>;
}

/**
 * RawGroupC — Commit Intelligence
 * Populated in both Light and Deep Mode. Light Mode utilizes the GitHub API metrics
 * and events timeline. Deep Mode enriches this using local git history analysis.
 */
export interface RawGroupC {
  /**
   * Weekly contribution graph counts for the last 52 weeks.
   */
  weeklyContributions: Array<{
    week: string; // Date string representing the start of the week
    total: number;
  }>;
  /**
   * Recent commits sampled from the candidate's most active non-fork repositories.
   */
  commitSample: Array<{
    sha: string;
    message: string;
    additions: number;
    deletions: number;
    timestamp: string; // ISO-8601 string timestamp
    isMerge: boolean;
    isDocOnly: boolean;
    isSigned: boolean;
  }>;
  /**
   * Map showing distribution of commits per hour of the day (0-23) to assess consistency and work patterns.
   */
  workHourDistribution: Record<string, number>;
  /**
   * Rate of GPG/SSH signed commits (from 0 to 1).
   */
  commitSigningRate: number;
}

/**
 * RawGroupD — Collaboration & Review
 * Populated in both Light and Deep Mode using public repository pull requests,
 * reviews, and issues timelines from the GitHub API.
 */
export interface RawGroupD {
  /**
   * Pull requests authored by the candidate on public repositories.
   */
  prsAuthored: Array<{
    number: number;
    title: string;
    bodyWordCount: number;
    additions: number;
    deletions: number;
    mergedAt: string | null; // ISO-8601 string timestamp or null if unmerged
    wasSelfMerged: boolean;
    repoOwner: string;
  }>;
  /**
   * Review comments and reviews submitted by the candidate on others' codebases.
   */
  reviewsGiven: Array<{
    body: string;
    wordCount: number;
    submittedAt: string; // ISO-8601 string timestamp
    prRepoOwner: string;
  }>;
  /**
   * Total number of external pull requests successfully merged.
   */
  externalPRsMerged: number;
  /**
   * List of external repository names where the candidate's PRs were merged.
   */
  externalPRRepos: string[];
}

/**
 * RawGroupE — Engineering Practices
 * API-level practices checker populated in both Light and Deep Mode.
 * Scans repository configurations, configurations file namespaces, and releases.
 */
export interface RawGroupE {
  /**
   * Whether CI/CD system configs (e.g., GitHub Actions, CircleCI) were detected.
   */
  ciConfigPresent: boolean;
  /**
   * Whether a testing directory structure was detected in the file tree.
   */
  testDirPresent: boolean;
  /**
   * Whether a Dockerfile is present at the repository root.
   */
  dockerfilePresent: boolean;
  /**
   * Whether Infrastructure as Code configuration (e.g., Terraform, Pulumi, CDK) was detected.
   */
  iacPresent: boolean;
  /**
   * Whether code linters or formatting rules (e.g., ESLint, Prettier, Ruff) were configured.
   */
  lintConfigPresent: boolean;
  /**
   * Rate of releases adhering strictly to Semantic Versioning specifications (0 to 1).
   */
  semanticVersioningRate: number;
  /**
   * Whether Dependabot configurations are present or active.
   */
  dependabotEnabled: boolean;
  /**
   * Whether a SECURITY.md or security configuration is present in the repository root.
   */
  hasSecurityMd: boolean;
  /**
   * Detected AI engineering/development configurations (e.g., copilot config, cursor config).
   */
  aiConfigFiles: string[];
}

/**
 * RawGroupF — Impact & External Signals
 * Populated in both Light and Deep Mode via global GitHub aggregates
 * and external developer networks (Registries, StackOverflow).
 */
export interface RawGroupF {
  /**
   * Total active weeks in the last calendar year.
   */
  contributionCalendarWeeks: number;
  /**
   * Aggregate star count across all owned non-fork repositories.
   */
  totalStarsOwned: number;
  /**
   * Aggregate fork count across all owned non-fork repositories.
   */
  totalForksOwned: number;
  /**
   * Package registry publication records (npm, PyPI, Crates).
   */
  packageRegistryPresence: Array<{
    registry: 'npm' | 'pypi' | 'crates';
    packageName: string;
    weeklyDownloads?: number;
    dependentCount?: number;
  }>;
  /**
   * Stack Overflow reputation score (if lookup succeeded).
   */
  stackOverflowReputation?: number;
  /**
   * Top tech tags associated with the candidate's Stack Overflow profile.
   */
  stackOverflowTopTags?: string[];
}

/**
 * RawGroupG — Anti-Gaming Signals
 * Populated in both Light and Deep Mode via anti-gaming audit models.
 */
export interface RawGroupG {
  /**
   * The calculated commit inflation rate, indicating unnatural velocity peaks.
   */
  commitInflationRate: number | null;
  /**
   * The rate of massive dump commits from forks, suggesting fake histories.
   */
  forkDumpRate: number | null;
  /**
   * The ratio of burst activity relative to dormancy phases.
   */
  burstRatio: number | null;
  /**
   * Whether the repository exhibits signs of laundering (rewriting history or author fields).
   */
  launderingFlagged: boolean;
  /**
   * Whether public credentials have been leaked within active repositories.
   */
  credentialLeakDetected: boolean;
}

/**
 * SccOutput
 * Deep Mode only: Code complexity and lines counts analyzed locally using `scc`.
 */
export interface SccOutput {
  languages: Array<{
    name: string;
    lines: number;
    code: number;
    comments: number;
    complexity: number;
  }>;
  totalComplexity: number;
  autoGeneratedDetected: boolean;
}

/**
 * TokeiOutput
 * Deep Mode only: Language statistics and testing counts analyzed locally using `tokei`.
 */
export interface TokeiOutput {
  byLanguage: Record<
    string,
    {
      code: number;
      comments: number;
      blanks: number;
      files: number;
    }
  >;
  testFileCount: number;
  totalCodeLines: number;
}

/**
 * GitinspectorOutput
 * Deep Mode only: Git history contribution analysis calculated locally via `gitinspector`.
 */
export interface GitinspectorOutput {
  linesAdded: number;
  linesDeleted: number;
  commits: number;
  activeDays: number;
  firstCommit: string | null; // ISO-8601 string timestamp or null
  lastCommit: string | null;  // ISO-8601 string timestamp or null
}

/**
 * GitleaksOutput
 * Deep Mode only: Local scanning output generated by `gitleaks` for leaked secrets.
 */
export interface GitleaksOutput {
  leaksFound: boolean;
  count: number;
  findings: Array<{
    ruleId: string;
    file: string;
    commit: string;
    secretPreview: string;
  }>;
}

/**
 * SemgrepOutput
 * Deep Mode only: Static analysis findings generated locally using `semgrep` rulesets.
 */
export interface SemgrepOutput {
  findings: Array<{
    ruleId: string;
    file: string;
    severity: 'ERROR' | 'WARNING' | 'INFO';
    message: string;
  }>;
  totalFindings: number;
  errorCount: number;
}

/**
 * ActionlintOutput
 * Deep Mode only: GitHub Action workflows validation issues generated locally using `actionlint`.
 */
export interface ActionlintOutput {
  issues: Array<{
    file: string;
    line: number;
    message: string;
    severity: string;
  }>;
  totalIssues: number;
}

/**
 * EmploymentRungResult
 * Describes verified achievements in technical roles.
 */
export interface EmploymentRungResult {
  employer: string;
  rungAchieved: 0 | 1 | 2 | 3;
  rungText: string;
}

/**
 * Primitive Evaluator P1: Execution Reliability Input.
 */
export interface P1ExecutionReliabilityInput {
  groupC: RawGroupC;
  groupE: RawGroupE;
  tokei?: TokeiOutput;
  scc?: SccOutput;
}

/**
 * Primitive Evaluator P2: Systems Evolution Input.
 */
export interface P2SystemsEvolutionInput {
  groupC: RawGroupC;
  groupB: RawGroupB;
  scc?: SccOutput;
}

/**
 * Primitive Evaluator P3: Collaboration Leverage Input.
 */
export interface P3CollaborationLeverageInput {
  groupD: RawGroupD;
  seniorityTarget: SeniorityTier;
}

/**
 * Primitive Evaluator P4: Technical Depth Input.
 */
export interface P4TechnicalDepthInput {
  groupB: RawGroupB;
  groupC: RawGroupC;
  groupD: RawGroupD;
  groupF: RawGroupF;
}

/**
 * Primitive Evaluator P5: Operational Maturity Input.
 */
export interface P5OperationalMaturityInput {
  groupE: RawGroupE;
  groupB: RawGroupB;
  gitleaks?: GitleaksOutput;
  semgrep?: SemgrepOutput;
}

/**
 * Primitive Evaluator P6: AI Leverage Input.
 */
export interface P6AILeverageInput {
  groupB: RawGroupB;
  groupC: RawGroupC;
  tokei?: TokeiOutput;
}

/**
 * Primitive Evaluator P7: Authenticity Confidence Input.
 */
export interface P7AuthenticityConfidenceInput {
  groupA: RawGroupA;
  groupG: RawGroupG;
  gitleaks?: GitleaksOutput;
  employmentRungs: EmploymentRungResult[];
}

/**
 * Map connecting each primitive key (p1 to p7) to its respective input shape.
 */
export interface PrimitiveInputMap {
  p1: P1ExecutionReliabilityInput;
  p2: P2SystemsEvolutionInput;
  p3: P3CollaborationLeverageInput;
  p4: P4TechnicalDepthInput;
  p5: P5OperationalMaturityInput;
  p6: P6AILeverageInput;
  p7: P7AuthenticityConfidenceInput;
}

/**
 * The standard evaluation output type returned by all primitive services.
 */
export type PrimitiveEvaluatorOutput = PrimitiveAssessment;
