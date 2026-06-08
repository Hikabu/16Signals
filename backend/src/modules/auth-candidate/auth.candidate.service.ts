import {
  Injectable,
  UnauthorizedException,
  Inject,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { encrypt, decrypt } from '../../shared/utils/crypto.utils';
import * as QRCode from 'qrcode';

import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AuthState } from './schemas/auth-result.dto';

type Provider = 'LOCAL' | 'GITHUB' | 'GOOGLE';

@Injectable()
export class AuthCandidateService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    @Inject('REDIS') private readonly redis: Redis,
    @InjectQueue('email') private readonly emailQueue: Queue,
  ) {}

  private readonly logger = new Logger(AuthCandidateService.name);
  private readonly passwordHashRounds = 12;
  private readonly refreshTokenTtlSeconds = 60 * 60 * 24 * 7;
  private readonly genericRegistrationResponse = {
    success: true,
    message:
      'If an account can be created with these details, you will receive a verification email.',
  };

  private async checkRateLimit(identifier: string) {
    const key = `rl_login:${identifier}`;
    const attempts = await this.redis.incr(key);
    if (attempts === 1) {
      await this.redis.expire(key, 900); // 15 mins block
    }
    if (attempts > 5) {
      this.logger.warn('LOGIN_FAILURE: Rate limit exceeded');
      throw new UnauthorizedException(
        'Too many login attempts. Please try again later.',
      );
    }
  }

  private async resetRateLimit(identifier: string) {
    await this.redis.del(`rl_login:${identifier}`);
  }

  private getAuthenticator() {
    // Dynamic require to handle ESM/CJS compatibility in test environments
    const otplib = require('otplib');
    const { TOTP, NobleCryptoPlugin, ScureBase32Plugin } = otplib.TOTP
      ? otplib
      : otplib.default || {};

    if (!TOTP) {
      throw new Error(
        `Failed to load otplib components. Available keys: ${Object.keys(otplib)}`,
      );
    }

    return new TOTP({
      crypto: new NobleCryptoPlugin(),
      base32: new ScureBase32Plugin(),
    });
  }

  private getEncryptionKey(): string {
    const key = this.config.get<string>('AUTH_ENCRYPTION_KEY');
    if (!key)
      throw new Error('AUTH_ENCRYPTION_KEY is not defined in environment');
    return key;
  }

  async register(dto: any) {
    try {
      const hash = await bcrypt.hash(dto.password, this.passwordHashRounds);

      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          username: dto.username,
          isEmailVerified: false,
          authAccounts: {
            create: {
              provider: 'LOCAL',
              providerId: dto.email,
              passwordHash: hash,
            },
          },
        } as any,
      });

      await this.prisma.candidate.create({
        data: {
          userId: user.id,
        },
      });

      this.logger.log(
        `REGISTRATION_SUCCESS: User ${user.id} registered locally`,
      );
      await this.initiateEmailVerification(user.id, user.email!);
      return this.genericRegistrationResponse;
    } catch (error) {
      if (error.code === 'P2002') {
        this.logger.warn(
          'REGISTRATION_CONFLICT: Duplicate registration attempt',
        );
        return this.genericRegistrationResponse;
      }
      throw error;
    }
  }

  async login(dto: any) {
    await this.checkRateLimit(dto.identifier);

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.identifier }, { username: dto.identifier }],
      },
      include: { authAccounts: true },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const account = user.authAccounts.find((a) => a.provider === 'LOCAL');
    if (!account || !account.passwordHash)
      throw new UnauthorizedException('Invalid credentials');

    const isValid = await bcrypt.compare(dto.password, account.passwordHash);
    if (!isValid) {
      this.logger.warn('LOGIN_FAILURE: Invalid credentials');
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.resetRateLimit(dto.identifier);
    this.logger.log(`LOGIN_SUCCESS: User ${user.id} logged in locally`);

    return this.handleLoginResponse(user);
  }

  private async handleLoginResponse(user: any) {
    if (!user.isEmailVerified) {
      return {
        type: AuthState.NEEDS_VERIFICATION,
        data: { email: user.email },
      };
    }

    if (user.mfaEnabled) {
      const mfaToken = this.jwt.sign(
        { sub: user.id, type: 'mfa', jti: crypto.randomUUID() },
        {
          secret: this.config.get('jwt_secret.mfa'),
          expiresIn: '5m',
        },
      );
      return {
        type: AuthState.MFA_REQUIRED,
        data: { mfaToken, userId: user.id },
      };
    }

    return await this.issueTokens(user.id, user.isEmailVerified);
  }

  async verifyMfa(userId: string, code: string, mfaToken: string) {
    try {
      const payload: any = this.jwt.verify(mfaToken, {
        secret: this.config.get('jwt_secret.mfa'),
      });
      if (payload.sub !== userId || payload.type !== 'mfa')
        throw new UnauthorizedException();
    } catch {
      throw new UnauthorizedException('Invalid MFA session');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(user as any).mfaSecret) throw new UnauthorizedException();

    const secret = decrypt((user as any).mfaSecret, this.getEncryptionKey());
    const isValid = this.getAuthenticator().verify({ token: code, secret });
    if (!isValid) throw new UnauthorizedException('Invalid MFA code');

    return await this.issueTokens(user.id, (user as any).isEmailVerified);
  }

  async refresh(user: any) {
    const userId = user.userId;
    const currentJti = user.jti;

    const dbUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!dbUser) throw new UnauthorizedException('User not found');

    return this.issueTokens(userId, dbUser.isEmailVerified, currentJti);
  }
  async logout(user: any) {
    await this.redis.del(`refresh:${user.id}`);
    return { message: 'Logged out' };
  }

  private async issueTokens(
    userId: string,
    isEmailVerified: boolean,
    expectedRefreshJti?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const accessToken = this.jwt.sign(
      {
        sub: userId,
        isEmailVerified,
        role: user.role,
        jti: crypto.randomUUID(),
      },
      {
        secret: this.config.get('jwt_secret.access'),
        expiresIn: '15m',
      },
    );
    const refreshJti = crypto.randomUUID();
    const refreshToken = this.jwt.sign(
      { sub: userId, jti: refreshJti },
      {
        secret: this.config.get('jwt_secret.refresh'),
        expiresIn: '7d',
      },
    );
    const refreshKey = `refresh:${userId}`;

    if (expectedRefreshJti) {
      const rotationResult = await this.redis.eval(
        `
          local current = redis.call("GET", KEYS[1])
          if not current then
            return -1
          end
          if current ~= ARGV[1] then
            redis.call("DEL", KEYS[1])
            return 0
          end
          redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])
          return 1
        `,
        1,
        refreshKey,
        expectedRefreshJti,
        refreshJti,
        this.refreshTokenTtlSeconds.toString(),
      );

      if (Number(rotationResult) !== 1) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }
    } else {
      await this.redis.set(
        refreshKey,
        refreshJti,
        'EX',
        this.refreshTokenTtlSeconds,
      );
    }

    return {
      type: AuthState.SUCCESS,
      data: { accessToken, refreshToken },
    };
  }

  // --- OAuth & Linking ---

  private extractProfileId(profile: any, provider: Provider): string {
    if (provider === 'GITHUB') return profile.githubId;
    if (provider === 'GOOGLE') return profile.googleId;
    throw new Error('Unsupported provider');
  }

  private async createOnboarding(profile: any, provider: Provider, id: string) {
    const claimId = crypto.randomBytes(32).toString('hex');

    await this.redis.set(
      `onboarding_claim:${claimId}`,
      JSON.stringify({
        provider,
        providerId: id,
        email: profile.email ?? null,
        firstName: profile.firstName ?? null,
        lastName: profile.lastName ?? null,
      }),
      'EX',
      900,
    );

    const tempToken = this.jwt.sign(
      {
        claimId,
        type: 'onboarding',
        jti: crypto.randomUUID(),
      },
      {
        secret: this.config.get('jwt_secret.onboarding'),
        expiresIn: '15m',
      },
    );

    return {
      type: AuthState.NEEDS_ONBOARDING,
      data: { tempToken },
    };
  }
  async oauthLogin(profile: any, provider: Provider) {
    if (!profile) throw new UnauthorizedException();

    const id = this.extractProfileId(profile, provider);

    // 1. Existing OAuth account → login
    const account = await this.prisma.authAccount.findUnique({
      where: { provider_providerId: { provider, providerId: id } },
      include: { user: true },
    });

    if (account) {
      if (!account.user.email && profile.email) {
        const emailTaken = await this.prisma.user.findUnique({ where: { email: profile.email } });
        if (!emailTaken) {
          await this.prisma.user.update({
            where: { id: account.user.id },
            data: { email: profile.email },
          });
          account.user.email = profile.email;
        }
      }
      return this.handleLoginResponse(account.user);
    }

    // 2. No email → cannot link → onboarding
    if (!profile.email) {
      this.logger.warn(`OAUTH_NO_EMAIL: ${provider} user ${id}`);
      return this.createOnboarding(profile, provider, id);
    }

    // 3. Try find existing user by email
    const user = await this.prisma.user.findUnique({
      where: { email: profile.email },
      include: { authAccounts: true },
    });

    // 4. Existing user → attempt secure linking
    if (user) {
      if (!user.isEmailVerified) {
        throw new UnauthorizedException(
          'Email registered but not verified. Verify locally first.',
        );
      }

      if (profile.email_verified === false) {
        throw new UnauthorizedException('OAuth email not verified.');
      }

      const existingAccount = user.authAccounts.find(
        (a) => a.provider === provider,
      );

      if (!existingAccount) {
        await this.prisma.authAccount.create({
          data: { userId: user.id, provider, providerId: id },
        });

        this.logger.log(
          `ACCOUNT_LINKED: User ${user.id} auto-linked to ${provider}`,
        );
      }

      return this.handleLoginResponse(user);
    }

    // 5. No user → onboarding
    return this.createOnboarding(profile, provider, id);
  }
  async generateLinkState(userId: string): Promise<string> {
    const state = crypto.randomBytes(16).toString('hex');
    await this.redis.set(`link_state:${state}`, userId, 'EX', 300);
    return state;
  }

  async linkOAuth(
    userId: string,
    profile: any,
    provider: Provider,
    state: string,
  ) {
    const storedUserId = await this.redis.get(`link_state:${state}`);
    if (!storedUserId || storedUserId !== userId)
      throw new UnauthorizedException('Invalid link state');
    await this.redis.del(`link_state:${state}`);
    const id = this.extractProfileId(profile, provider);
    const existing = await this.prisma.authAccount.findUnique({
      where: { provider_providerId: { provider, providerId: id } },
    });
    if (existing) throw new ConflictException('Account already linked');

    await this.prisma.authAccount.create({
      data: { userId, provider, providerId: id },
    });

    if (profile.email) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user && !user.email) {
        const emailTaken = await this.prisma.user.findUnique({ where: { email: profile.email } });
        if (!emailTaken) {
          await this.prisma.user.update({
            where: { id: userId },
            data: { email: profile.email },
          });
        }
      }
    }

    this.logger.log(
      `ACCOUNT_LINKED: User ${userId} successfully linked ${provider}`,
    );
  }

  async completeOnboarding(dto, oauth: any) {
    const usernameExists = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });

    if (usernameExists) {
      throw new ConflictException('Username taken');
    }

    const user = await this.prisma.user.create({
      data: {
        email: oauth.email,
        username: dto.username,
        firstName: oauth.firstName,
        lastName: oauth.lastName,
        isEmailVerified: true,
        authAccounts: {
          create: {
            provider: oauth.provider,
            providerId: oauth.providerId,
          },
        },
      },
    });

    await this.prisma.candidate.create({
        data: {
          userId: user.id,
        },
      });

    await this.redis.del(`onboarding_claim:${oauth.claimId}`);

    return this.handleLoginResponse(user);
  }

  // --- Email Verification ---

  async initiateEmailVerification(userId: string, email: string) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await this.redis.set(`verify_email:${code}`, userId, 'EX', 3600);

    await this.emailQueue.add('send-verification', {
      to: email,
      subject: 'Verify your Colosseum account',
      html: `<p>Your verification code is: <b>${code}</b></p>`,
    });
  }

  async verifyEmail(code: string) {
    const userId = await this.redis.get(`verify_email:${code}`);
    if (!userId) throw new BadRequestException('Invalid code');

    await this.prisma.user.update({
      where: { id: userId },
      data: { isEmailVerified: true } as any,
    });
    await this.redis.del(`verify_email:${code}`);
  }

  // --- MFA Setup ---

  async setupMfa(userId: string) {
    const auth = this.getAuthenticator();
    const secret = auth.generateSecret();
    const otpauthUrl = auth.keyuri(userId, 'Colosseeum', secret);
    const qrCode = await QRCode.toDataURL(otpauthUrl);

    await this.redis.set(`mfa_setup:${userId}`, secret, 'EX', 300);
    return { qrCode, secret };
  }

  async activateMfa(userId: string, code: string) {
    const secret = await this.redis.get(`mfa_setup:${userId}`);
    if (!secret) throw new BadRequestException('MFA session expired');

    const isValid = this.getAuthenticator().verify({ token: code, secret });
    if (!isValid) throw new BadRequestException('Invalid MFA code');

    const encryptedSecret = encrypt(secret, this.getEncryptionKey());
    const backupCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString('hex'),
    );
    const encryptedBackupCodes = backupCodes.map((c) =>
      encrypt(c, this.getEncryptionKey()),
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaSecret: encryptedSecret,
        mfaBackupCodes: encryptedBackupCodes,
      } as any,
    });
    await this.redis.del(`mfa_setup:${userId}`);
    return { backupCodes };
  }

  async verifyMfaRecovery(
    userId: string,
    backupCode: string,
    mfaToken: string,
  ) {
    try {
      const payload: any = this.jwt.verify(mfaToken, {
        secret: this.config.get('jwt_secret.mfa'),
      });
      if (payload.sub !== userId || payload.type !== 'mfa')
        throw new UnauthorizedException();
    } catch {
      throw new UnauthorizedException('Invalid MFA session');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (
      !user ||
      !(user as any).mfaEnabled ||
      !(user as any).mfaBackupCodes.length
    )
      throw new UnauthorizedException();

    const encryptionKey = this.getEncryptionKey();
    const decryptedCodes = (user as any).mfaBackupCodes.map((c: string) =>
      decrypt(c, encryptionKey),
    );

    const codeIndex = decryptedCodes.indexOf(backupCode);
    if (codeIndex === -1)
      throw new UnauthorizedException('Invalid backup code');

    // Use-once: remove the code
    const updatedCodes = [...(user as any).mfaBackupCodes];
    updatedCodes.splice(codeIndex, 1);

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaBackupCodes: updatedCodes } as any,
    });

    return await this.issueTokens(user.id, (user as any).isEmailVerified);
  }

  // --- Password Reset ---

  async requestPasswordReset(dto: any) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // SECURITY: Always return success to prevent email enumeration
    if (!user) {
      this.logger.warn('RESET_REQUEST: No matching account');
      return;
    }

    const token = crypto.randomBytes(32).toString('hex');
    await this.redis.set(`password_reset:${token}`, user.id, 'EX', 3600); // 1 hour

    await this.emailQueue.add('send-reset', {
      to: user.email,
      subject: 'Reset your Colosseum password',
      html: `<p>Click <a href="${this.config.get('FRONTEND_URL')}/reset-password?token=${token}">here</a> to reset your password.</p>`,
    });
  }

  async resetPassword(dto: any) {
    const userId = await this.redis.eval(
      `
        local userId = redis.call("GET", KEYS[1])
        if userId then
          redis.call("DEL", KEYS[1])
        end
        return userId
      `,
      1,
      `password_reset:${dto.token}`,
    );

    if (!userId) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const hash = await bcrypt.hash(dto.newPassword, this.passwordHashRounds);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: String(userId) },
        data: {
          authAccounts: {
            updateMany: {
              where: { provider: 'LOCAL' },
              data: { passwordHash: hash },
            },
          },
        },
      }),
    ]);

    await this.redis.del(`refresh:${userId}`); // Global logout/session invalidation

    this.logger.log(
      `PASSWORD_RESET_SUCCESS: User ${userId} reset their password`,
    );
  }

  async githubLink(userId: string) {
    const state = await this.generateLinkState(userId);

    const base = 'https://github.com/login/oauth/authorize';

    const clientId = this.config.get('GITHUB_AUTH_CLIENT_ID');
    const redirectUri = `${this.config.get('app.url')}${this.config.get('auth.githubLinkCallback')}`;

    return `${base}?client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&scope=user:email`;
  }

  async googleLink(userId: string) {
    const state = await this.generateLinkState(userId);

    const base = 'https://accounts.google.com/o/oauth2/v2/auth';
    const clientId = this.config.get('GOOGLE_CLIENT_ID');

    const redirectUri = `${this.config.get('app.url')}${this.config.get('auth.googleLinkCallback')}`;

    const scope = encodeURIComponent('openid email profile');

    return `${base}?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}&access_type=offline&prompt=consent`;
  }

  // --- Security Info ---

  async getSecurityInfo(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        mfaEnabled: true,
        authAccounts: { select: { provider: true } },
      } as any,
    });

    if (!user) throw new UnauthorizedException('User not found');

    const providers: string[] = (user as any).authAccounts.map(
      (a: any) => a.provider as string,
    );

    return {
      mfaEnabled: (user as any).mfaEnabled ?? false,
      hasPassword: providers.includes('LOCAL'),
      linkedProviders: providers,
    };
  }

  // --- Change / Set Password (authenticated) ---

  async changePassword(
    userId: string,
    dto: { currentPassword?: string; newPassword: string },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { authAccounts: true },
    });
    if (!user) throw new UnauthorizedException('User not found');

    const localAccount = (user as any).authAccounts.find(
      (a: any) => a.provider === 'LOCAL',
    );

    if (localAccount) {
      // Existing password, require currentPassword verification
      if (!dto.currentPassword) {
        throw new BadRequestException(
          'currentPassword is required to change an existing password',
        );
      }
      const isValid = await bcrypt.compare(
        dto.currentPassword,
        localAccount.passwordHash,
      );
      if (!isValid) {
        throw new UnauthorizedException('Current password is incorrect');
      }
      const hash = await bcrypt.hash(dto.newPassword, this.passwordHashRounds);
      await this.prisma.authAccount.update({
        where: { id: localAccount.id },
        data: { passwordHash: hash },
      });
    } else {
      // No local account, create one (set password for the first time)
      const hash = await bcrypt.hash(dto.newPassword, this.passwordHashRounds);
      await this.prisma.authAccount.create({
        data: {
          userId,
          provider: 'LOCAL',
          providerId: user.email!,
          passwordHash: hash,
        },
      });
    }

    this.logger.log(`PASSWORD_CHANGE: User ${userId} changed/set password`);
  }
}

