import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateJobDto } from './dto/create-job.dto';
import { JobStatus, RoleType, Seniority, JobPost } from '@prisma/client';
import { AppException } from '../../shared/app.exception';

@Injectable()
export class JobsService {
  constructor(private prisma: PrismaService) {}

  async create(companyId: string, dto: CreateJobDto) {
    const data: any = {
      title: dto.title,
      description: dto.description,
      companyId,
      status: JobStatus.DRAFT,
    };

    if (dto.location) {
      data.location = dto.location;
    }

    if (dto.employmentType) {
      data.employmentType = dto.employmentType;
    }

    if (dto.currency) {
      data.currency = dto.currency;
    }

    data.bonusAmount = dto.bonusAmount ?? 0;

    if (dto.roleType) {
      data.roleType = dto.roleType;
    }

    return this.prisma.jobPost.create({ data });
  }

  async findMyJobs(
    companyId: string,
    status?: 'draft' | 'active' | 'all',
  ) {
    const where: { companyId: string; status?: JobStatus } = { companyId };

    if (status === 'draft') {
      where.status = JobStatus.DRAFT;
    } else if (status === 'active') {
      where.status = JobStatus.ACTIVE;
    }

    return this.prisma.jobPost.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async publish(id: string, companyId: string) {
    const job = await this.prisma.jobPost.findUnique({ where: { id } });

    if (!job || job.companyId !== companyId) {
      throw new AppException('Job not found or access denied', 404);
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedJob = await tx.jobPost.update({
        where: { id },
        data: {
          status: JobStatus.ACTIVE,
          publishedAt: new Date(),
        },
      });

      await tx.company.update({
        where: { id: companyId },
        data: {
          totalJobsPosted: { increment: 1 },
        },
      });

      return updatedJob;
    });
  }

  async close(id: string, companyId: string) {
    const job = await this.prisma.jobPost.findUnique({ where: { id } });

    if (!job || job.companyId !== companyId) {
      throw new AppException('Job not found or access denied', 404);
    }

    return this.prisma.jobPost.update({
      where: { id },
      data: {
        status: JobStatus.CLOSED,
        closedAt: new Date(),
      },
    });
  }

  async updateDraft(id: string, companyId: string, dto: CreateJobDto) {
    const job = await this.prisma.jobPost.findUnique({ where: { id } });

    if (!job || job.companyId !== companyId) {
      throw new AppException('Job not found or access denied', 404);
    }
    if (job.status !== JobStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT jobs can be updated');
    }

    const data: any = {
      title: dto.title,
      description: dto.description,
      location: dto.location ?? null,
      employmentType: dto.employmentType ?? null,
      currency: dto.currency ?? job.currency,
      bonusAmount: dto.bonusAmount ?? 0,
      roleType: dto.roleType ?? null,
    };

    return this.prisma.jobPost.update({
      where: { id },
      data,
    });
  }

  async verifyOwnership(id: string, companyId: string) {
    const job = await this.prisma.jobPost.findUnique({ where: { id } });
    if (!job || job.companyId !== companyId) {
      throw new AppException('Job not found or access denied', 404);
    }
    return job;
  }

  async confirmRequirements(
    jobId: string,
    companyId: string,
    parsed: any,
  ): Promise<JobPost> {
    const job = await this.prisma.jobPost.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== companyId) throw new NotFoundException();

    return this.prisma.jobPost.update({
      where: { id: jobId },
      data: {
        requirementsConfirmedAt: new Date(),
        parsedRequirements: parsed, // keep full blob intact

        // ── Promote to typed columns ──────────────────────────────────────
        roleType: parsed.requiredRoleType ?? job.roleType,
        seniorityLevel: parsed.seniorityLevel ?? job.seniorityLevel,
        requiredSkills: parsed.requiredSkills ?? [], // string array from AI parse
        isWeb3Role: parsed.isWeb3Role ?? job.isWeb3Role,
        dynamicWeights: parsed.dynamicWeights ?? job.dynamicWeights,
      },
    });
  }

  async getPublicJobs(query: {
    search?: string;
    roleType?: RoleType;
    seniority?: Seniority;
    skills?: string[];
    isWeb3?: any;
    isEscrowFunded?: any;
    isVerifiedPayer?: any;
    page?: number;
    limit?: number;
  }) {
    const {
      search,
      roleType,
      seniority,
      skills,
      isWeb3,
      isEscrowFunded,
      isVerifiedPayer,
      page = 1,
      limit = 20,
    } = query;
    const take = Math.min(limit, 50);
    const skip = (page - 1) * take;

    const where: any = {
      status: JobStatus.ACTIVE,
    };

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (roleType) {
      where.roleType = roleType;
    }

    if (seniority) {
      where.seniorityLevel = seniority;
    }

    if (skills?.length) {
      where.requiredSkills = { hasSome: skills };
    }

    const isWeb3Bool =
      isWeb3 === undefined ? undefined : isWeb3 === true || isWeb3 === 'true';

    if (isWeb3 !== undefined) {
      where.isWeb3Role = isWeb3Bool ?? false;
    }

    const isEscrowFundedBool =
      isEscrowFunded === undefined ? undefined : isEscrowFunded === true || isEscrowFunded === 'true';

    if (isEscrowFundedBool) {
      where.escrowStatus = { in: ['FUNDED', 'RELEASED'] };
    }

    const isVerifiedPayerBool =
      isVerifiedPayer === undefined ? undefined : isVerifiedPayer === true || isVerifiedPayer === 'true';

    if (isVerifiedPayerBool) {
      where.company = {
        ...(where.company || {}),
        isVerifiedPayer: true,
      };
    }

    const [jobs, total] = await Promise.all([
      this.prisma.jobPost.findMany({
        where,
        select: {
          id: true,
          title: true,
          description: true,
          roleType: true,
          seniorityLevel: true,
          isWeb3Role: true,
          createdAt: true,
          publishedAt: true,
          escrowStatus: true,
          company: {
            select: {
              name: true,
              logoUrl: true,
              website: true,
              isVerifiedPayer: true,
            },
          },
        },
        skip,
        take,
        orderBy: { publishedAt: 'desc' },
      }),
      this.prisma.jobPost.count({ where }),
    ]);

    return { jobs, total, page, limit: take };
  }

  async getPublicJobById(id: string) {
    const job = await this.prisma.jobPost.findUnique({
      where: { id, status: JobStatus.ACTIVE },
      select: {
        id: true,
        title: true,
        description: true,
        roleType: true,
        seniorityLevel: true,
        isWeb3Role: true,
        createdAt: true,
        publishedAt: true,
        company: {
          select: {
            name: true,
            logoUrl: true,
            website: true,
          },
        },
        _count: {
          select: {
            shortlists: true,
          },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found or is no longer active');
    }

    const { _count, ...rest } = job;
    return {
      ...rest,
      applicationCount: _count.shortlists,
    };
  }
}
