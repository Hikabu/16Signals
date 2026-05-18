import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { AccountStatus, Prisma } from '@prisma/client';
import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import cloudinary from '../../cloudinary/cloudinary.config';
import { CacheService } from '../scoring/cache/cache.service';

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    @InjectQueue('email') private readonly emailQueue: Queue,
  ) {}

  // ─── User Profile ─────────────────────────────────────────────────────────

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        name: true,

        role: true,
        accountStatus: true,
        isEmailVerified: true,
        mfaEnabled: true,
        createdAt: true,
        updatedAt: true,
        authAccounts: {
          select: {
            provider: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    return user;
  }

async getPublicProfile(username: string) {
  const user = await this.prisma.user.findUnique({
    where: { username },

    select: {
      username: true,

      candidate: {
        select: {
          bio: true,
          location: true,
          website: true,
          careerPath: true,
          avatarUrl: true, 

          vouches: {
            where: {
              isActive: true,
            },

            orderBy: {
              confirmedAt: 'desc',
            },

            select: {
              id: true,
              message: true,
              voucherWallet: true,
              weight: true,
              confirmedAt: true,
            },
          },
        },
      },
    },
  });

  

  if (!user) {
    throw new NotFoundException(
      'Profile not found',
    );
  }

  const enrichedVouches = await Promise.all(
  (user.candidate?.vouches ?? []).map(
    async (vouch) => {
      const linkedWallet =
        await this.prisma.web3Profile.findFirst({
          where: {
            solanaAddress: vouch.voucherWallet,
          },

          select: {
            developerProfile: {
              select: {
                candidate: {
                  select: {
                    user: {
                      select: {
                        username: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });

      const voucherUsername = linkedWallet?.developerProfile?.candidate?.user?.username ?? null;

      return {
        ...vouch,

        voucherUser: voucherUsername,
      };
    },
  ),
);

  return {
    username: user.username,

    bio: user.candidate?.bio ?? null,

    location:
      user.candidate?.location ?? null,
       avatarUrl: user.candidate?.avatarUrl ?? null,

    website:
      user.candidate?.website ?? null,

    careerPath:
      user.candidate?.careerPath ?? 1,

    vouches:
      enrichedVouches,
  };
}
  async updateProfile(userId: string, dto: UpdateUserDto) {
    // Check username uniqueness if being changed
    if (dto.username) {
      const existing = await this.prisma.user.findUnique({
        where: { username: dto.username },
      });
      if (existing && existing.id !== userId) {
        throw new ConflictException('Username is already taken');
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.username !== undefined && { username: dto.username }),

      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        name: true,
        updatedAt: true,

      },
    });
  }
async deleteAccount(userId: string) {
  // Optional: suspend immediately so sessions/UI lock instantly
  await this.deactivateAccount(userId);

  // Fetch candidate profile BEFORE deletion
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    include: {
      candidate: {
        include: {
          devProfile: {
            include: {
              githubProfile: true,
              web3Profile: true,
            },
          },
        },
      },
    },
  });

  const githubUsername =
    user?.candidate?.devProfile?.githubProfile?.githubUsername;

  const walletAddress =
    user?.candidate?.devProfile?.web3Profile?.solanaAddress;

  // Build all possible cache keys
  const cacheKeys = [
    githubUsername
      ? this.cacheService.buildCacheKey(githubUsername, undefined)
      : null,

    walletAddress
      ? this.cacheService.buildCacheKey(undefined, walletAddress)
      : null,

    githubUsername && walletAddress
      ? this.cacheService.buildCacheKey(
          githubUsername,
          walletAddress,
        )
      : null,
  ].filter(Boolean) as string[];

  // Delete cache entries
  if (cacheKeys.length > 0) {
    await this.prisma.cachedResult.deleteMany({
      where: {
        cacheKey: {
          in: cacheKeys,
        },
      },
    });
  }

  // Delete user (cascade wipes everything else)
  await this.prisma.user.delete({
    where: { id: userId },
  });

  return {
    message: 'Account deleted successfully',
  };
}

  async deactivateAccount(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { accountStatus: AccountStatus.SUSPENDED },
    });

    return { message: 'Account deactivated successfully' };
  }

  async getCooldowns(userId: string) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { userId },
      select: {
        generateCooldownUntil: true,
        devProfile: {
          select: {
            githubCooldownUntil: true,
            walletCooldownUntil: true,
          },
        },
      },
    });

    return {
      github: { cooldownUntil: candidate?.devProfile?.githubCooldownUntil ?? null },
      wallet: { cooldownUntil: candidate?.devProfile?.walletCooldownUntil ?? null },
      generate: { cooldownUntil: candidate?.generateCooldownUntil ?? null },
    };
  }

  // ─── Candidate Profile ────────────────────────────────────────────────────

  async getCandidateProfile(userId: string) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { userId },
      select: {
        id: true,
        bio: true,
        location: true,
        website: true,
        careerPath: true,
avatarUrl: true, 
        scorecard: true,
        createdAt: true,
        vouches: true,
        devProfile: {
          select: {
            id: true,
            createdAt: true,
            githubProfile: {
              select: {
                githubUsername: true,
                syncStatus: true,
                lastSyncAt: true,
                syncProgress: true,
              },
            },
            web3Profile: true,
          },
        },
      },
    });

    if (!candidate) throw new NotFoundException('Candidate profile not found');

    return candidate;
  }
async updateCandidateProfile(userId: string, dto: UpdateCandidateDto) {
  const candidate = await this.prisma.candidate.findUnique({
    where: { userId },
  });

  if (!candidate) {
    throw new NotFoundException('Candidate profile not found');
  }

  return this.prisma.candidate.update({
    where: { userId },
    data: {
      ...(dto.bio !== undefined && { bio: dto.bio }),
      ...(dto.location !== undefined && { location: dto.location }),
      ...(dto.website !== undefined && { website: dto.website }),
      ...(dto.careerPath !== undefined && { careerPath: dto.careerPath }),

      ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
    },
    select: {
      id: true,
      bio: true,
      location: true,
      website: true,
      careerPath: true,
      avatarUrl: true,
      createdAt: true,
    },
  });
}
  // ─── GitHub Connection ────────────────────────────────────────────────────

  async getConnectedGithub(userId: string) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { userId },
      select: {
        devProfile: {
          select: {
            githubProfile: {
              select: {
                githubUsername: true,
                githubUserId: true,
                scopes: true,
                syncStatus: true,
                syncProgress: true,
                lastSyncAt: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!candidate) throw new NotFoundException('Candidate profile not found');

    const github = candidate.devProfile?.githubProfile ?? null;

    return {
      connected: !!github,
      github,
    };
  }

  // ─── Wallet Connection ────────────────────────────────────────────────────

  async getConnectedWallet(userId: string) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { userId },
      select: {
        devProfile: {
          select: {
            web3Profile: {
              select: {
                solanaAddress: true,
                verifiedContracts: true,
                onChainMetrics: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!candidate) throw new NotFoundException('Candidate profile not found');

    const web3 = candidate.devProfile?.web3Profile ?? null;

    return {
      connected: !!web3,
      web3,
    };
  }

  async uploadAvatar(userId: string, file: Express.Multer.File) {
  if (!file) throw new Error('No file provided');

  const result = await new Promise<any>((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: 'avatars',
          transformation: [
            { width: 300, height: 300, crop: 'fill', gravity: 'face' },
            { quality: 'auto:good', fetch_format: 'auto' },
          ],
          strip_metadata: true,
        },
        (err, result) => {
          if (err) return reject(err);
          resolve(result);
        },
      )
      .end(file.buffer);
  });

  const avatarUrl = result.secure_url;

  // FIXED: use userId (not req)
  await this.prisma.candidate.upsert({
  where: { userId },
  update: {
    avatarUrl,
  },
  create: {
    userId,
    avatarUrl,
  },
});
  return { url: avatarUrl };
}

async searchPublicProfiles(
  query: string,
  sort: string = 'recent',
) {
  const orderBy: Prisma.UserOrderByWithRelationInput =
    (() => {
      switch (sort) {
        case 'name':
          return {
            username: 'asc',
          };

        case 'career':
          return {
            candidate: {
              careerPath: 'asc',
            },
          };

        case 'recent':
        default:
          return {
            createdAt: 'desc',
          };
      }
    })();

  const users = await this.prisma.user.findMany({
where: {
  accountStatus: AccountStatus.ACTIVE,

  candidate: {
    isNot: null,
  },

  username: query.length > 0
    ? {
        not: null,
        contains: query,
        mode: 'insensitive',
      }
    : {
        not: null,
      },
},

    select: {
      username: true,
      createdAt: true,

      candidate: {
        select: {
          bio: true,
          location: true,
          avatarUrl: true,
          careerPath: true,
        },
      },
    },

    orderBy,

    take: 20,
  });

  return {
    profiles: users.map((u) => ({
      username: u.username,
      bio: u.candidate?.bio ?? null,
      location: u.candidate?.location ?? null,
      avatarUrl: u.candidate?.avatarUrl ?? null,
      careerPath: u.candidate?.careerPath ?? null,
    })),
  };
}

  // ─── Employer Launch Waitlist ────────────────────────────────────────────

  /**
   * Guest (unauthenticated) sign-up.
   * Stores the email and queues a confirmation email that also encourages
   * account creation.
   */
  async registerWaitlistGuest(email: string) {
    // Idempotent, second call for same email is a no-op
    await this.prisma.employerLaunchWaitlist.upsert({
      where: { email },
      update: {},
      create: { email },
    });

    await this.emailQueue.add('send', {
      to: email,
      subject: "You're on the list, 16Signals employer marketplace",
      html: this.buildGuestWaitlistEmail(email),
    });

    return { message: "You're on the list! We'll notify you when employers go live." };
  }

  /**
   * Authenticated candidate sign-up.
   * Looks up the user's email from the DB, upserts with userId, and queues
   * a confirmation that nudges them to build their scorecard.
   */
  async registerWaitlistAuth(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        candidate: { select: { scorecard: true } },
      },
    });

    if (!user?.email) {
      throw new NotFoundException('User email not found');
    }

    await this.prisma.employerLaunchWaitlist.upsert({
      where: { email: user.email },
      update: { userId },
      create: { email: user.email, userId },
    });

    const hasScorecard = !!user.candidate?.scorecard;

    await this.emailQueue.add('send', {
      to: user.email,
      subject: "You're on the list, 16Signals employer marketplace",
      html: this.buildAuthWaitlistEmail(user.email, hasScorecard),
    });

    return { message: "You're on the list! We'll notify you when employers go live." };
  }

  // ─── Email templates ─────────────────────────────────────────────────────

  private buildGuestWaitlistEmail(email: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You're on the list</title>
  <style>
    body { margin: 0; padding: 0; background: #0a0a0f; font-family: 'Inter', system-ui, sans-serif; }
    .wrapper { max-width: 580px; margin: 0 auto; padding: 40px 20px; }
    .card { background: #12121a; border: 1px solid #1e1e2e; border-radius: 16px; padding: 40px 36px; }
    .badge { display: inline-block; background: rgba(42,161,152,0.12); border: 1px solid rgba(42,161,152,0.3); color: #2aa198; border-radius: 6px; padding: 4px 12px; font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 24px; }
    h1 { color: #e2e8f0; font-size: 22px; font-weight: 700; margin: 0 0 12px; line-height: 1.3; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.7; margin: 0 0 16px; }
    .cta { display: inline-block; background: #2aa198; color: #0a0a0f; font-weight: 700; font-size: 14px; padding: 12px 28px; border-radius: 10px; text-decoration: none; margin-top: 8px; }
    .divider { border: none; border-top: 1px solid #1e1e2e; margin: 28px 0; }
    .footer { color: #475569; font-size: 12px; text-align: center; margin-top: 28px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="badge">✓ You're on the list</div>
      <h1>Employers are coming to 16Signals</h1>
      <p>We're building the fairest hiring experience in tech, where candidates are evaluated on real contribution signals, not resumes.</p>
      <p>You'll be the first to know when companies start posting roles. In the meantime, create your candidate profile so you're ready when the moment comes.</p>
      <a href="${process.env.FRONTEND_URL ?? 'https://app.16signals.io'}/auth" class="cta">Create your account →</a>
      <hr class="divider" />
      <p style="font-size:13px;">Once you're in, connect GitHub and let your code speak for itself. Your AI-scored candidate card will be visible to verified employers the moment they go live.</p>
    </div>
    <div class="footer">16Signals · You received this because ${email} signed up for employer launch notifications. · <a href="#" style="color:#475569;">Unsubscribe</a></div>
  </div>
</body>
</html>`;
  }

  private buildAuthWaitlistEmail(email: string, hasScorecard: boolean): string {
    const scorecardSection = hasScorecard
      ? `<p>Your candidate card is already set up, you're ahead of the curve. When employers go live, you'll be discoverable immediately.</p>`
      : `<p style="background:rgba(42,161,152,0.06);border:1px solid rgba(42,161,152,0.2);border-radius:10px;padding:16px;"><strong style="color:#2aa198;">One thing before we launch:</strong> Your candidate scorecard isn't built yet. Connect your GitHub and run analysis now, employers will only see candidates with verified signal data.</p>
         <a href="${process.env.FRONTEND_URL ?? 'https://app.16signals.io'}/profile" class="cta">Build my scorecard →</a>`;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You're on the list</title>
  <style>
    body { margin: 0; padding: 0; background: #0a0a0f; font-family: 'Inter', system-ui, sans-serif; }
    .wrapper { max-width: 580px; margin: 0 auto; padding: 40px 20px; }
    .card { background: #12121a; border: 1px solid #1e1e2e; border-radius: 16px; padding: 40px 36px; }
    .badge { display: inline-block; background: rgba(42,161,152,0.12); border: 1px solid rgba(42,161,152,0.3); color: #2aa198; border-radius: 6px; padding: 4px 12px; font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 24px; }
    h1 { color: #e2e8f0; font-size: 22px; font-weight: 700; margin: 0 0 12px; line-height: 1.3; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.7; margin: 0 0 16px; }
    .cta { display: inline-block; background: #2aa198; color: #0a0a0f; font-weight: 700; font-size: 14px; padding: 12px 28px; border-radius: 10px; text-decoration: none; margin-top: 8px; }
    .divider { border: none; border-top: 1px solid #1e1e2e; margin: 28px 0; }
    .footer { color: #475569; font-size: 12px; text-align: center; margin-top: 28px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="badge">✓ Notification enabled</div>
      <h1>We'll let you know when employers go live</h1>
      <p>You're already part of the 16Signals network. Employers are coming, and when they do, you'll be the first to explore open roles matched to your real-world signal data.</p>
      ${scorecardSection}
      <hr class="divider" />
      <p style="font-size:13px;">You'll receive one email when the employer marketplace launches. No spam, ever.</p>
    </div>
    <div class="footer">16Signals · You received this because ${email} enabled employer launch notifications. · <a href="#" style="color:#475569;">Unsubscribe</a></div>
  </div>
</body>
</html>`;
  }

}

