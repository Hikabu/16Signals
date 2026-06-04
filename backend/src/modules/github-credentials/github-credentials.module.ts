/**
 * GitHubCredentialsModule — NestJS module for GitHub credential resolution.
 *
 * Provides a pluggable credential provider system that any analysis mode can use
 * to obtain the appropriate Octokit instances for public and private GitHub access.
 *
 * Exports:
 *   - GitHubCredentialsService — central orchestrator for credential resolution
 *
 * Internal providers (not exported, used via service):
 *   - AppInstallationProvider — GitHub App installation token generation
 *
 * Usage in other modules:
 *   imports: [GitHubCredentialsModule]
 *   constructor(private readonly credentials: GitHubCredentialsService) {}
 *
 *   const { primary, installation, rawToken } = await this.credentials.resolve({
 *     mode: 'deep',
 *     githubUsername: '...',
 *     installationId: 12345678,
 *   });
 */

import { Module } from '@nestjs/common';
import { GitHubCredentialsService } from './github-credentials.service';
import { AppInstallationProvider } from './providers/app-installation.provider';

@Module({
  providers: [GitHubCredentialsService, AppInstallationProvider],
  exports: [GitHubCredentialsService],
})
export class GitHubCredentialsModule {}