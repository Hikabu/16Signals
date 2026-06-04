/**
 * AppInstallationProvider — GitHub App installation credential provider.
 *
 * Uses @octokit/auth-app's createAppAuth strategy to:
 *   1. Sign a JWT using GITHUB_APP_ID + GITHUB_PRIVATE_KEY
 *   2. Exchange the JWT for an installation access token via
 *      POST /app/installations/{installationId}/access_tokens
 *   3. Return an Octokit instance authenticated with that installation token
 *   4. Provide raw token string for git clone operations
 *
 * Token lifecycle:
 *   - Installation tokens expire after 1 hour
 *   - @octokit/auth-app handles automatic refresh transparently
 *   - getRawToken() fetches a fresh token on each call
 *
 * Private key format:
 *   - Stored in .env as GITHUB_PRIVATE_KEY
 *   - Supports both base64-encoded PEM and raw PEM with \n literals
 *   - Real key must be generated from GitHub App settings page
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from 'octokit';
import {
  IGitHubCredentialProvider,
  GitHubCredentialContext,
} from './provider.interface';

@Injectable()
export class AppInstallationProvider implements IGitHubCredentialProvider {
  readonly name = 'AppInstallationProvider';
  private readonly logger = new Logger(AppInstallationProvider.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * This provider is active when:
   *   1. installationId is present in the context
   *   2. GITHUB_APP_ID is configured
   *   3. GITHUB_PRIVATE_KEY is configured
   */
  canProvide(context: GitHubCredentialContext): boolean {
    const can =
      !!context.installationId &&
      !!this.config.get<string | number>('GITHUB_APP_ID') &&
      !!this.config.get<string>('GITHUB_PRIVATE_KEY');

    this.logger.debug(
      `canProvide=${can} installationId=${context.installationId} appId=${!!this.config.get('GITHUB_APP_ID')} keyPresent=${!!this.config.get('GITHUB_PRIVATE_KEY')}`,
    );

    return can;
  }

  /**
   * Create a public-API Octokit. For App installations, the installation
   * Octokit can also be used for public API calls.
   */
  async createOctokit(context: GitHubCredentialContext): Promise<Octokit> {
    return this.createInstallationOctokit(context);
  }

  /**
   * Create an installation-scoped Octokit.
   *
   * Uses @octokit/auth-app which handles:
   *   - JWT creation and signing
   *   - Installation token exchange
   *   - Automatic token refresh on expiry
   */
  async createInstallationOctokit(
    context: GitHubCredentialContext,
  ): Promise<Octokit> {
    const appId = this.requireConfig('GITHUB_APP_ID');
    const privateKey = this.decodePrivateKey(
      this.requireConfig('GITHUB_PRIVATE_KEY'),
    );

    this.logger.log(
      `Creating installation Octokit for installationId=${context.installationId} appId=${appId}`,
    );

    const octokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: Number(appId),
        privateKey,
        installationId: context.installationId,
      },
    });

    // Tag the Octokit for debugging/logging
    (octokit as any).__githubTokenSource = 'github_app_installation';
    (octokit as any).__installationId = context.installationId;

    return octokit;
  }

  /**
   * Get a raw installation token string for direct use (git clone, curl, etc.).
   * Fetches a fresh token via the auth strategy.
   */
  async getRawToken(context: GitHubCredentialContext): Promise<string | null> {
    try {
      const octokit = await this.createInstallationOctokit(context);
      const auth = await (octokit.auth as any)({ type: 'installation' });
      this.logger.debug(
        `Raw token obtained for installationId=${context.installationId} tokenHint=${auth.token?.slice(0, 8)}...`,
      );
      return auth.token;
    } catch (error) {
      this.logger.error(
        `Failed to get raw token for installationId=${context.installationId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Decode the private key from its stored format.
   *
   * Supports two formats:
   *   1. Raw PEM string (starts with -----BEGIN)
   *   2. Base64-encoded PEM string
   *
   * For .env storage, base64 encoding is recommended to avoid newline escaping
   * issues:  cat key.pem | base64 -w0  →  paste into GITHUB_PRIVATE_KEY=
   */
  private decodePrivateKey(encoded: string): string {
    // Already a raw PEM key (stored with literal \n or actual newlines)
    if (encoded.includes('-----BEGIN')) {
      return encoded;
    }

    // Base64-encoded PEM
    try {
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      if (decoded.includes('-----BEGIN')) {
        return decoded;
      }
      throw new Error('Decoded content is not a valid PEM key');
    } catch (error) {
      if ((error as Error).message.includes('Decoded content')) throw error;

      this.logger.error(
        'GITHUB_PRIVATE_KEY is not a valid base64-encoded PEM key. ' +
          'Generate a real key from GitHub App settings and encode it with: cat key.pem | base64 -w0',
      );
      throw new Error(
        'GITHUB_PRIVATE_KEY is not a valid base64-encoded PEM key. ' +
          'Generate a key from GitHub App settings, then: cat key.pem | base64 -w0',
      );
    }
  }

  /**
   * Retrieve a required config value, throwing if missing.
   */
  private requireConfig(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) {
      throw new Error(
        `GitHub App config missing: ${key} is not set. Ensure GITHUB_APP_ID and GITHUB_PRIVATE_KEY are configured.`,
      );
    }
    return value;
  }
}