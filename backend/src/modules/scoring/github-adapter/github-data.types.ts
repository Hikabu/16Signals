export interface GitHubUserProfile {
  username: string;
  accountCreatedAt: Date;
  accountAge: number; // months since created_at
  publicRepos: number;
  followers: number;
}

export interface GitHubRepo {
  owner?: string;
  name: string;
  language: string | null;
  stars: number;
  forks: number;
  topics: string[];
  createdAt: Date;
  pushedAt: Date;
  isFork: boolean;
  description: string | null;
}

export interface GitHubContributionData {
  weeklyTotals: number[]; // exactly 52 values, one per week, most recent last
  activeWeeksCount: number; // pre-computed: count of weeks with total > 0
}

export interface GitHubExternalPRData {
  mergedExternalPRCount: number;
  externalRepoNames: string[]; // repo names only, no other details
}

export interface ExternalPRSummary {
  repo: string;
  mergedAt?: string;
}

export interface OrgSummary {
  login: string;
  description: string;
  publicRepos: number;
}

export interface OrgRepoSummary {
  name: string;
  pushedAt: string;
  language: string | null;
}

export interface StarredRepoSummary {
  language: string | null;
  topics: string[];
}

export interface RepoSummary extends GitHubRepo {
  owner: string;
}

export interface ManifestResult {
  repo: string;
  deps: string[];
  type: 'npm' | 'cargo';
}

export interface GitHubRawData {
  profile: GitHubUserProfile;
  repos: GitHubRepo[];
  contributions: GitHubContributionData;
  externalPRs: GitHubExternalPRData | ExternalPRSummary[];
  orgs?: OrgSummary[];
  orgRepos?: Record<string, OrgRepoSummary[]>;
  starredRepos?: StarredRepoSummary[];
  manifestKeys: Record<string, string[]>;
  manifests?: ManifestResult[];
  fetchedAt: Date;
}
