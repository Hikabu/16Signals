/**
 * GitHubAppService — Handles GitHub App webhook events and installation management.
 *
 * Webhook events handled:
 *   - installation.created  → stores installationId on GithubProfile
 *   - installation.deleted  → clears installationId on GithubProfile
 *
 * Webhook security:
 *   - Verifies HMAC-SHA256 signature using GITHUB_WEBHOOK_SECRET
 *   - Signature header: X-Hub-Signature-256
 */

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class GitHubAppService {
  private readonly logger = new Logger(GitHubAppService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Verify the webhook signature from GitHub.
   *
   * GitHub signs webhook payloads with HMAC-SHA256 using the webhook secret.
   * The signature is sent in the X-Hub-Signature-256 header as:
   *   sha256=<hex-encoded-hmac>
   */
  verifySignature(payload: string, signatureHeader: string): boolean {
    const secret = this.config.get<string>('GITHUB_WEBHOOK_SECRET');

    if (!secret) {
      this.logger.warn('GITHUB_WEBHOOK_SECRET not configured — skipping signature verification');
      return true; // Allow unverified if secret not configured (dev mode)
    }

    if (!signatureHeader) {
      this.logger.warn('No X-Hub-Signature-256 header present');
      return false;
    }

    const expectedPrefix = 'sha256=';
    if (!signatureHeader.startsWith(expectedPrefix)) {
      this.logger.warn('Invalid signature header format');
      return false;
    }

    const signature = signatureHeader.substring(expectedPrefix.length);
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload, 'utf-8');
    const digest = hmac.digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(digest, 'hex'),
      );
    } catch {
      return false;
    }
  }

  /**
   * Handle a GitHub App webhook event.
   *
   * Supported events:
   *   - installation.created: Store the installationId on the candidate's GithubProfile
   *   - installation.deleted: Clear the installationId from the candidate's GithubProfile
   */
  async handleWebhookEvent(
    event: string,
    payload: any,
  ): Promise<{ handled: boolean; event: string; message: string }> {
    this.logger.log(`Webhook event received: ${event}`);

    switch (event) {
      case 'installation':
        return this.handleInstallationEvent(payload);
      case 'ping':
        return { handled: true, event: 'ping', message: 'Webhook configured successfully' };
      default:
        this.logger.debug(`Unhandled webhook event: ${event}`);
        return { handled: false, event, message: `Event '${event}' not handled (not needed)` };
    }
  }

  /**
   * Handle installation.created and installation.deleted events.
   */
  private async handleInstallationEvent(
    payload: any,
  ): Promise<{ handled: boolean; event: string; message: string }> {
    const action = payload?.action;
    const installation = payload?.installation;
    const account = installation?.account;

    if (!installation?.id || !account?.login) {
      this.logger.warn('Missing installation id or account login in webhook payload');
      return { handled: false, event: 'installation', message: 'Missing installation id or account login' };
    }

    const installationId = String(installation.id);
    const githubUsername = account.login;

    switch (action) {
      case 'created': {
        const updated = await this.prisma.githubProfile.updateMany({
          where: { githubUsername },
          data: { installationId },
        });

        this.logger.log(
          `Installation ${installationId} created for GitHub user '${githubUsername}'. ` +
          `Profiles updated: ${updated.count}`,
        );

        return {
          handled: true,
          event: 'installation.created',
          message: `Installation ${installationId} linked to GithubProfile '${githubUsername}'`,
        };
      }

      case 'deleted': {
        const updated = await this.prisma.githubProfile.updateMany({
          where: { githubUsername, installationId },
          data: { installationId: null },
        });

        this.logger.log(
          `Installation ${installationId} deleted for GitHub user '${githubUsername}'. ` +
          `Profiles updated: ${updated.count}`,
        );

        return {
          handled: true,
          event: 'installation.deleted',
          message: `Installation ${installationId} removed from GithubProfile '${githubUsername}'`,
        };
      }

      default:
        this.logger.debug(`Unhandled installation action: ${action}`);
        return {
          handled: false,
          event: `installation.${action}`,
          message: `Installation action '${action}' acknowledged but not processed`,
        };
    }
  }
}