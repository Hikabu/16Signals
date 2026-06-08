/**
 * GitHubAppService — Handles GitHub App webhook events and installation management.
 *
 * Webhook events handled:
 *   - installation.created  → stores installationId on GithubProfile
 *   - installation.deleted  → clears installationId from GithubProfile
 *
 * Installation management:
 *   - getInstallationStatus() → checks if candidate has installed the App
 *   - verifyInstallation()   → re-checks installation via App JWT (recovery)
 *   - uninstall()            → manually clear installation
 *
 * Webhook security:
 *   - Verifies HMAC-SHA256 signature using GITHUB_ANALYSIS_WEBHOOK_SECRET
 *   - Signature header: X-Hub-Signature-256
 */

import { Injectable, Logger } from '@nestjs/common';
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
   */
verifySignature(
  payload: Buffer,
  signatureHeader: string,
): boolean {
  const secret = this.config.get<string>(
    'GITHUB_ANALYSIS_WEBHOOK_SECRET',
  );

  if (!secret) {
    return true;
  }

  const received = signatureHeader.replace('sha256=', '');

  const digest = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(received, 'hex'),
    Buffer.from(digest, 'hex'),
  );
}

  /**
   * Handle a GitHub App webhook event.
   */
  async handleWebhookEvent(event: string, payload: any) {
    this.logger.log(`Webhook event received: ${event}`);
    switch (event) {
      case 'installation':
        return this.handleInstallationEvent(payload);
      case 'ping':
        return { handled: true, event: 'ping', message: 'Webhook configured successfully' };
      default:
        return { handled: false, event, message: `Event '${event}' not handled` };
    }
  }

  /**
   * Handle installation.created and installation.deleted events.
   * Uses upsert so a GithubProfile is created if it doesn't exist yet
   * (covers the case where the App is installed before OAuth connect).
   */
  private async handleInstallationEvent(payload: any) {
    const action = payload?.action;
    const installation = payload?.installation;
    const account = installation?.account;

    if (!installation?.id || !account?.login) {
      return { handled: false, event: 'installation', message: 'Missing installation id or account login' };
    }

    const installationId = String(installation.id);
    const githubUsername = account.login;

    switch (action) {
      case 'unsuspend':
      case 'created': {
        // Use upsert to create GithubProfile if it doesn't exist yet.
        // This covers the case where the candidate installs the App BEFORE
        // connecting via OAuth (when GithubProfile wouldn't exist yet).
        await this.prisma.githubProfile.upsert({
          where: { githubUsername },
          create: {
            githubUsername,
            githubUserId: String(account.id || installation.account?.id || ''),
            encryptedToken: '', // No PAT yet — will be set when candidate connects via OAuth
            installationId,
            syncStatus: 'NOT_SYNCED',
          },
          update: { installationId },
        });

        this.logger.log(
          `Installation ${installationId} linked to GithubProfile '${githubUsername}' (upserted)`,
        );
        return { handled: true, event: 'installation.created', message: `Installation ${installationId} linked to '${githubUsername}'` };
      }

      case 'suspend':
      case 'deleted': {
        await this.prisma.githubProfile.updateMany({
          where: { githubUsername, installationId },
          data: { installationId: null },
        });
        this.logger.log(`Installation ${installationId} removed from GithubProfile '${githubUsername}'`);
        return { handled: true, event: 'installation.deleted', message: `Installation removed from '${githubUsername}'` };
      }

      default:
        return { handled: false, event: `installation.${action}`, message: `Action '${action}' acknowledged` };
    }
  }

  /**
   * Check whether the authenticated user has installed the GitHub App.
   * Reads GithubProfile.installationId via the User → Candidate → DeveloperProfile → GithubProfile chain.
   */
  async getInstallationStatus(userId: string) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { userId },
      select: {
        devProfile: {
          select: {
            githubProfile: {
              select: { installationId: true, githubUsername: true },
            },
          },
        },
      },
    });

    const profile = candidate?.devProfile?.githubProfile;
    if (!profile) {
      return { installed: false, githubUsername: null, installationId: null };
    }

    return {
      installed: !!profile.installationId,
      installationId: profile.installationId,
      githubUsername: profile.githubUsername,
    };
  }

  async getInstallationStatusByUsername(githubUsername: string){
    const profile = await this.prisma.githubProfile.findUnique({
      where: { githubUsername },
      select: { installationId: true, githubUsername: true },
    });

    if (!profile) {
      return { installed: false, githubUsername, installationId: null };
    }

    return {
      installed: !!profile.installationId,
      installationId: profile.installationId,
      githubUsername: profile.githubUsername, 
    };
  }

  /**
   * Verify and link a GitHub App installation for the authenticated user.
   * Uses the App's JWT to list installations and matches by GitHub username.
   * This is a recovery path for when the webhook was missed.
   */
  async verifyInstallation(userId: string) {
    // Get the candidate's GitHub profile
    const candidate = await this.prisma.candidate.findUnique({
      where: { userId },
      select: {
        devProfile: {
          select: {
            githubProfile: {
              select: { githubUsername: true, installationId: true, id: true },
            },
          },
        },
      },
    });

    const profile = candidate?.devProfile?.githubProfile;
    if (!profile) {
      return { linked: false, message: 'No GitHub profile found. Connect GitHub first via /sync/github/connect.' };
    }

    if (profile.installationId) {
      return { linked: true, installationId: profile.installationId, message: 'Already linked' };
    }

    // Try to find the installation via the App's JWT
    try {
      const { Octokit } = await import('octokit');
      const { createAppAuth } = await import('@octokit/auth-app');

      const appId = this.config.get<string>('GITHUB_ANALYSIS_APP_ID');
      const privateKey = this.decodePrivateKey(
        this.config.get<string>('GITHUB_ANALYSIS_PRIVATE_KEY') || '',
      );

      if (!appId || !privateKey) {
        return { linked: false, message: 'GitHub App not configured (missing GITHUB_ANALYSIS_APP_ID or GITHUB_ANALYSIS_PRIVATE_KEY)' };
      }

      const appOctokit = new Octokit({
        authStrategy: createAppAuth,
        auth: { appId: Number(appId), privateKey },
      });

      // List installations for this App
      const { data: installations } = await (appOctokit as any).rest.apps.listInstallations({
        per_page: 100,
      });

      // Find installation matching the candidate's GitHub username
      const match = installations.find(
        (inst: any) => inst.account?.login === profile.githubUsername,
      );

      if (match) {
        await this.prisma.githubProfile.update({
          where: { id: profile.id },
          data: { installationId: String(match.id) },
        });
        this.logger.log(`Installation ${match.id} linked to '${profile.githubUsername}' via verify`);
        return { linked: true, installationId: String(match.id), message: 'Installation linked' };
      }

      return {
        linked: false,
        message: `No installation found for GitHub user '${profile.githubUsername}'. Install the App at /sync/github/app/install.`,
      };
    } catch (error) {
      this.logger.error(`verifyInstallation failed: ${(error as Error).message}`);
      return { linked: false, message: `Verification failed: ${(error as Error).message}` };
    }
  }

  /**
   * Manually clear the installationId from the user's GithubProfile.
   */
  async uninstall(userId: string) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { userId },
      select: {
        devProfile: {
          select: {
            githubProfile: { select: { id: true, installationId: true, githubUsername: true } },
          },
        },
      },
    });

    const profile = candidate?.devProfile?.githubProfile;
    if (!profile) {
      return { ok: true, message: 'No GitHub profile to unlink' };
    }

    await this.prisma.githubProfile.update({
      where: { id: profile.id },
      data: { installationId: null },
    });

    this.logger.log(`Installation manually cleared for '${profile.githubUsername}'`);
    return { ok: true, message: 'Installation cleared' };
  }

  /**
   * Decode the private key from its stored format.
   */
  private decodePrivateKey(encoded: string): string {
    if (encoded.includes('-----BEGIN')) return encoded;
    try {
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      if (decoded.includes('-----BEGIN')) return decoded;
      throw new Error('Decoded content is not a valid PEM key');
    } catch (error) {
      if ((error as Error).message.includes('Decoded content')) throw error;
      throw new Error('GITHUB_ANALYSIS_PRIVATE_KEY is not a valid base64-encoded PEM key');
    }
  }
}