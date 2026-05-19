import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { decrypt } from '../../../shared/utils/crypto.utils';
import { Octokit } from 'octokit';

@Injectable()
export class OctokitFactory {
  private readonly logger = new Logger(OctokitFactory.name);
  private readonly githubAuthEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const systemToken = this.config.get<string>('GITHUB_SYSTEM_TOKEN');
    if (!systemToken) {
      throw new Error(
        'GITHUB_SYSTEM_TOKEN is not set. Set it in .env. Without it all GitHub requests are unauthenticated (60 req/hr).',
      );
    }
    this.githubAuthEnabled =
      this.config.get<string>('GITHUB_AUTH_ENABLED') === 'true';

    this.logger.log(
      {
        githubAuthEnabled: this.githubAuthEnabled,
        tokenLength: systemToken?.length ?? 0,
      },
      'octokit_factory_ready',
    );
  }

  async forJob(userId: string | null): Promise<Octokit> {
    if (userId) {
      // Navigate through new schema: User -> Candidate -> DeveloperProfile -> GithubProfile
      const candidate = await this.prisma.candidate.findUnique({
        where: { userId },
        select: {
          devProfile: {
            select: {
              githubProfile: {
                select: { encryptedToken: true },
              },
            },
          },
        },
      });

      const profile = candidate?.devProfile?.githubProfile;

      if (profile?.encryptedToken) {
        try {
          const key = this.config.get<string>('AUTH_ENCRYPTION_KEY');
          if (!key) throw new Error('AUTH_ENCRYPTION_KEY not set');

          const data = profile.encryptedToken.startsWith('v1:')
            ? profile.encryptedToken.substring(3)
            : profile.encryptedToken;

          const token = decrypt(data, key);
          this.logger.debug({ userId }, 'octokit_using_user_token');
          const octokit = new Octokit({
            request: {
              headers: {
                authorization: `token ${token}`,
                'X-GitHub-Api-Version': '2022-11-28',
              },
            },
          });
          (octokit as any).__githubTokenSource = 'user';
          return octokit;
        } catch (err: any) {
          // Token decrypt failed, fall through to system token
          this.logger.warn(
            { userId, err: err.message },
            'octokit_token_decrypt_failed',
          );
        }
      }
    }

    const systemToken = this.config.get<string>('GITHUB_SYSTEM_TOKEN');

    // This should never happen after the constructor guard above,
    // but log clearly if it somehow does.
    if (!systemToken) {
      this.logger.error(
        'GITHUB_SYSTEM_TOKEN is undefined at request time, making unauthenticated request',
      );
      return new Octokit();
    }

    this.logger.debug(
      {
        userId: userId ?? 'anonymous',
        tokenSource: 'system_pat',
        tokenHint: `${systemToken.slice(0, 8)}...`,
      },
      'octokit_using_system_token',
    );
    const octokit = new Octokit({
      request: {
        headers: {
          authorization: `token ${systemToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    });
    (octokit as any).__githubTokenSource = 'system';
    return octokit;
  }
}
