/**
 * GitHubCredentialsService — Central orchestrator for GitHub credential resolution.
 *
 * Resolves credentials for any analysis mode by consulting available providers
 * in priority order. Produces an OctokitPair containing:
 *   - primary: Octokit for public API calls
 *   - installation (optional): Octokit for private repo access
 *   - rawToken (optional): Raw token string for git clone
 *
 * Provider priority:
 *   Primary Octokit:
 *     1. UserOAuthProvider    (user's stored OAuth PAT, if userId + token present)
 *     2. SystemPatProvider    (GITHUB_SYSTEM_TOKEN fallback)
 *
 *   Installation Octokit:
 *     1. AppInstallationProvider (if installationId present AND App config valid)
 *
 * Validation:
 *   - If installation Octokit is created, validates it can access the target user
 *   - Throws 401 if validation fails
 *
 * Future extensibility:
 *   - Add more providers to the arrays
 *   - Add 'appConfig' field to context for selecting specific Apps
 */

import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppInstallationProvider } from './providers/app-installation.provider';
import {
  GitHubCredentialContext,
  OctokitPair,
} from './providers/provider.interface';

@Injectable()
export class GitHubCredentialsService {
  private readonly logger = new Logger(GitHubCredentialsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly appInstallationProvider: AppInstallationProvider,
  ) {}

  /**
   * Resolve credentials for a given analysis context.
   *
   * For deep mode with installationId:
   *   - primary = system PAT (public corpus)
   *   - installation = App installation Octokit (private repos)
   *   - rawToken = installation token string (git clone)
   *
   * For light/cv-verify mode:
   *   - primary = system PAT (or user OAuth if available)
   *   - installation = undefined
   */
  async resolve(context: GitHubCredentialContext): Promise<OctokitPair> {
    this.logger.log(
      `Resolving credentials mode=${context.mode} user=${context.githubUsername} userId=${context.userId ?? 'anonymous'} installationId=${context.installationId ?? 'none'}`,
    );

    // ── Step 1: Resolve primary Octokit (for public API calls) ──
    const primary = await this.resolvePrimaryOctokit(context);

    // ── Step 2: Resolve installation Octokit (if applicable) ──
    let installationOctokit;
    let rawToken;
    let sourceDescription = `primary=${primary.__githubTokenSource ?? 'unknown'}`;

    if (await this.appInstallationProvider.canProvide(context)) {
      try {
        installationOctokit =
          await this.appInstallationProvider.createInstallationOctokit(context);

        // Validate installation has access to the target user
        await this.validateInstallationAccess(
          installationOctokit,
          context.githubUsername,
        );

        // Get raw token for git clone operations
        rawToken =
          (await this.appInstallationProvider.getRawToken(context)) ??
          undefined;

        sourceDescription += ` installation=github_app_installation(installId=${context.installationId})`;
        if (rawToken) {
          sourceDescription += ` rawToken=present`;
        }

        this.logger.log(
          `Installation Octokit resolved and validated for installationId=${context.installationId} user=${context.githubUsername}`,
        );
      } catch (error) {
        // If this is already an HttpException (from validation), rethrow
        if (error instanceof HttpException) throw error;

        // Otherwise, wrap as 401
        this.logger.error(
          `Failed to create installation Octokit for installationId=${context.installationId}: ${(error as Error).message}`,
        );
        throw new HttpException(
          `GitHub App installation not authorized: ${(error as Error).message}`,
          HttpStatus.UNAUTHORIZED,
        );
      }
    }

    return {
      primary,
      installation: installationOctokit,
      rawToken,
      sourceDescription,
    };
  }

  /**
   * Resolve the primary Octokit for public API calls.
   *
   * Currently uses GITHUB_SYSTEM_TOKEN directly.
   * In the future, this will try UserOAuthProvider first, then fall back.
   */
  private async resolvePrimaryOctokit(
    _context: GitHubCredentialContext,
  ): Promise<any> {
    const { Octokit } = await import('octokit');
    const systemToken = this.config.get<string>('GITHUB_SYSTEM_TOKEN');

    if (!systemToken) {
      this.logger.warn(
        'GITHUB_SYSTEM_TOKEN not set — making unauthenticated requests (60 req/hr limit)',
      );
      return new Octokit();
    }

    const octokit = new Octokit({
      auth: systemToken,
      request: {
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    });

    (octokit as any).__githubTokenSource = 'system';
    return octokit;
  }

  /**
   * Validate that an installation Octokit can access the target user's data.
   *
   * Performs a lightweight API call to check if the installation has access
   * to the target username. If the call fails with 404 or 403, the installation
   * is not authorized for this user.
   */
  private async validateInstallationAccess(
    installationOctokit: any,
    username: string,
  ): Promise<void> {
    try {
      // Try to fetch the user's public profile — lightweight validation
      await installationOctokit.rest.users.getByUsername({
        username,
      });
      this.logger.debug(`Installation access validated for user=${username}`);
    } catch (error: any) {
      const status = error.status || error.response?.status;

      if (status === 404 || status === 403 || status === 401) {
        throw new HttpException(
          `GitHub App installation not authorized for user '${username}'. ` +
            "Ensure the installation has access to this user's repositories.",
          HttpStatus.UNAUTHORIZED,
        );
      }

      // Other errors (network, rate limit) — log but don't fail validation
      // The actual data collection will surface the real error
      this.logger.warn(
        `Installation access validation warning for user=${username}: ${error.message}`,
      );
    }
  }
}
