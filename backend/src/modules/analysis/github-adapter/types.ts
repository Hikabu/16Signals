export interface GithubRestData {
  repos: any[];
  languages: Record<string, any>; // repoId -> languages
  commits: Record<string, any>; // repoId -> commits
  fileTrees?: Record<string, string[]>; // repoId -> filenames in root
}

export interface GithubGraphQLData {
  pullRequests: any[];
  reviewsGiven: any[];
  contributionCalendar: any;
}

export interface GithubEventsData {
  events: any[];
}

export interface GithubRawDataSnapshot {
  rest: GithubRestData;
  graphql: GithubGraphQLData;
  events: GithubEventsData;
  fetchedAt: string;
}
