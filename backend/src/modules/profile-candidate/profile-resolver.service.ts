import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProfileResolverService {
  constructor(private prisma: PrismaService) {}

  async ensureDevStack(userId: string) {
    const candidate = await this.prisma.candidate.upsert({
      where: { userId },
      create: {
        user: { connect: { id: userId } },
        careerPath: 1,
      },
      update: {},
      include: {
        devProfile: {
          include: {
            githubProfile: true,
            web3Profile: true,
          },
        },
      },
    });

    let devProfile = candidate.devProfile;

    if (!devProfile) {
      devProfile = await this.prisma.developerProfile.create({
        data: {
          candidateId: candidate.id,
        },
        include: {
          githubProfile: true,
          web3Profile: true,
        },
      });
    }

    return { candidate, devProfile };
  }
}
