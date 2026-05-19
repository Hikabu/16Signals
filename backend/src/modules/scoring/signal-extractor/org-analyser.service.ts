import { Injectable } from '@nestjs/common';
import {
  ExternalPRSummary,
  GitHubExternalPRData,
  OrgRepoSummary,
  OrgSummary,
} from '../github-adapter/github-data.types';

export interface OrgAnalysisResult {
  login: string;
  description: string;
  publicRepos: number;
  confirmedContributor: boolean;
  notableRepos: string[];
}

@Injectable()
export class OrgAnalyserService {
  analyse(
    orgs: OrgSummary[],
    orgReposMap: Map<string, OrgRepoSummary[]>,
    externalPRs: ExternalPRSummary[] | GitHubExternalPRData,
  ): OrgAnalysisResult[] {
    if (!orgs?.length) {
      return [];
    }

    const externalRepoNames = this.getExternalRepoNames(externalPRs);

    return orgs.map((org) => {
      const orgLogin = org.login.toLowerCase();
      const repoPrefix = `${orgLogin}/`;
      const repos =
        orgReposMap.get(org.login) ?? orgReposMap.get(orgLogin) ?? [];

      return {
        login: org.login,
        description: org.description,
        publicRepos: org.publicRepos,
        confirmedContributor: externalRepoNames.some((repo) =>
          repo.toLowerCase().startsWith(repoPrefix),
        ),
        notableRepos: [...repos]
          .sort(
            (a, b) =>
              new Date(b.pushedAt).getTime() - new Date(a.pushedAt).getTime(),
          )
          .slice(0, 3)
          .map((repo) => repo.name),
      };
    });
  }

  private getExternalRepoNames(
    externalPRs: ExternalPRSummary[] | GitHubExternalPRData,
  ): string[] {
    if (Array.isArray(externalPRs)) {
      return externalPRs.map((pr) => pr.repo).filter(Boolean);
    }

    return externalPRs?.externalRepoNames ?? [];
  }
}
