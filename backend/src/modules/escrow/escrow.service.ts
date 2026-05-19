import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EscrowStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SolanaService } from './solana.service';
import {
  ConfirmFundedDto,
  ConfirmResolvedDto,
  SetCandidateDto,
} from './dto/escrow.dto';
import { jobUuidToEscrowId } from './escrow.util';

function calculateTrustScore(funded: number, released: number): number {
  if (funded === 0) return 0;
  const releaseRate = released / funded;
  const volumeConfidence = 1 - (1 / (funded + 1));
  return Math.round(releaseRate * volumeConfidence * 100);
}

function calculateIsVerifiedPayer(funded: number, score: number): boolean {
  return funded >= 2 && score >= 70;
}

@Injectable()
export class EscrowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly solana: SolanaService,
  ) {}

  async getInitParams(
    companyId: string,
    employerWalletPubkey: string,
    jobPostId: string,
  ) {
    const job = await this.getCompanyJob(jobPostId, companyId);
    const employerWallet = this.getVerifiedEmployerWallet(
      job,
      employerWalletPubkey,
    );
    const escrowId = jobUuidToEscrowId(job.id);
    const expectedAmount = this.decimalToAtomicUnits(job.bonusAmount);
    const escrowAddress = this.solana
      .deriveEscrowPda(
        this.solana.parsePublicKey(employerWallet, 'employerPubkey'),
        escrowId,
      )
      .toBase58();

    return {
      escrowId: escrowId.toString(),
      expectedAmount: expectedAmount.toString(),
      escrowAddress,
    };
  }

  async confirmFunded(
    companyId: string,
    employerWalletPubkey: string,
    dto: ConfirmFundedDto,
  ) {
    const job = await this.getCompanyJob(dto.jobPostId, companyId);
    const employerWallet = this.getVerifiedEmployerWallet(
      job,
      employerWalletPubkey,
    );
    const escrowId = jobUuidToEscrowId(job.id);
    const expectedAmount = this.decimalToAtomicUnits(job.bonusAmount);

    const derivedAddress = this.solana
      .deriveEscrowPda(
        this.solana.parsePublicKey(employerWallet, 'employerPubkey'),
        escrowId,
      )
      .toBase58();
    if (derivedAddress !== dto.escrowAddress) {
      throw new BadRequestException(
        'Client escrow address does not match derived PDA',
      );
    }

    const onChainState = await this.solana.verifyEscrowFunded(
      derivedAddress,
      expectedAmount,
    );

    if (onChainState.employer !== employerWallet) {
      throw new BadRequestException(
        'On-chain employer does not match authenticated wallet',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedJob = await tx.jobPost.update({
        where: { id: job.id },
        data: {
          escrowId,
          escrowAddress: derivedAddress,
          escrowStatus: EscrowStatus.FUNDED,
          escrowFundedAt: job.escrowStatus === EscrowStatus.UNFUNDED ? new Date() : undefined,
        },
      });

      if (job.escrowStatus === EscrowStatus.UNFUNDED) {
        const funded = job.company.totalEscrowsFunded + 1;
        const released = job.company.totalEscrowsReleased;
        const score = calculateTrustScore(funded, released);

        await tx.company.update({
          where: { id: companyId },
          data: {
            totalEscrowsFunded: funded,
            trustScore: score,
            isVerifiedPayer: calculateIsVerifiedPayer(funded, score),
          },
        });
      }

      return updatedJob;
    });

    return this.serializeJob(updated);
  }

  async setCandidate(companyId: string, dto: SetCandidateDto) {
    const job = await this.getCompanyJob(dto.jobPostId, companyId);
    if (job.escrowStatus !== EscrowStatus.FUNDED) {
      throw new BadRequestException(
        'Escrow must be FUNDED before setting candidate',
      );
    }
    if (!job.escrowAddress) {
      throw new BadRequestException('Job post has no escrow address');
    }

    const escrowAddress = this.verifiedStoredEscrowAddress(job);
    const candidateWallet = this.solana.validatePublicKey(
      dto.candidateWallet,
      'candidateWallet',
    );
    await this.ensureCandidateWalletBelongsToCandidate(candidateWallet);
    const onChainState = await this.solana.getEscrowState(escrowAddress);
    this.ensureEmployerMatches(
      job.company.walletAddress,
      onChainState.employer,
    );
    if (onChainState.released) {
      throw new BadRequestException('Escrow is already resolved on-chain');
    }
    if (onChainState.candidate !== candidateWallet) {
      throw new BadRequestException(
        'On-chain candidate does not match candidateWallet',
      );
    }

    const updated = await this.prisma.jobPost.update({
      where: { id: job.id },
      data: { candidateWallet },
    });

    return this.serializeJob(updated);
  }

  async confirmReleased(companyId: string, dto: ConfirmResolvedDto) {
    return this.confirmResolved(
      companyId,
      dto.jobPostId,
      EscrowStatus.RELEASED,
    );
  }

  async confirmRefunded(companyId: string, dto: ConfirmResolvedDto) {
    return this.confirmResolved(
      companyId,
      dto.jobPostId,
      EscrowStatus.REFUNDED,
    );
  }

  async status(companyId: string, jobPostId: string) {
    const job = await this.getCompanyJob(jobPostId, companyId);
    const onChainState = job.escrowAddress
      ? await this.solana.getEscrowState(job.escrowAddress)
      : null;

    return {
      dbState: {
        jobPostId: job.id,
        escrowId: job.escrowId?.toString() ?? null,
        escrowAddress: job.escrowAddress,
        candidateWallet: job.candidateWallet,
        escrowStatus: job.escrowStatus,
      },
      onChainState,
    };
  }

  private async confirmResolved(
    companyId: string,
    jobPostId: string,
    status: EscrowStatus,
  ) {
    const job = await this.getCompanyJob(jobPostId, companyId);
    if (!job.escrowAddress) {
      throw new BadRequestException('Job post has no escrow address');
    }

    const escrowAddress = this.verifiedStoredEscrowAddress(job);
    const onChainState = await this.solana.getEscrowState(escrowAddress);
    this.ensureEmployerMatches(
      job.company.walletAddress,
      onChainState.employer,
    );
    if (!onChainState.released) {
      throw new BadRequestException('Escrow is not resolved on-chain');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedJob = await tx.jobPost.update({
        where: { id: job.id },
        data: { escrowStatus: status },
      });

      if (status === EscrowStatus.RELEASED && job.escrowStatus !== EscrowStatus.RELEASED) {
        const funded = job.company.totalEscrowsFunded;
        const released = job.company.totalEscrowsReleased + 1;
        const score = calculateTrustScore(funded, released);

        await tx.company.update({
          where: { id: companyId },
          data: {
            totalEscrowsReleased: released,
            trustScore: score,
            isVerifiedPayer: calculateIsVerifiedPayer(funded, score),
          },
        });
      }

      return updatedJob;
    });

    return this.serializeJob(updated);
  }

  private async getCompanyJob(jobPostId: string, companyId: string) {
    const job = await this.prisma.jobPost.findUnique({
      where: { id: jobPostId },
      include: { company: true },
    });

    if (!job) {
      throw new NotFoundException('Job post not found');
    }
    if (job.companyId !== companyId) {
      throw new ForbiddenException(
        'Authenticated company does not own job post',
      );
    }

    return job;
  }

  private getVerifiedEmployerWallet(
    job: Awaited<ReturnType<EscrowService['getCompanyJob']>>,
    employerWalletPubkey: string,
  ) {
    const employerWallet = job.company.walletAddress;
    if (!employerWallet) {
      throw new BadRequestException('Employer company has no wallet address');
    }

    const normalizedCompanyWallet = this.solana.validatePublicKey(
      employerWallet,
      'company.walletAddress',
    );
    const normalizedAuthenticatedWallet = this.solana.validatePublicKey(
      employerWalletPubkey,
      'req.user.walletPubkey',
    );

    if (normalizedCompanyWallet !== normalizedAuthenticatedWallet) {
      throw new ForbiddenException(
        'Authenticated wallet does not match employer company wallet',
      );
    }

    return normalizedAuthenticatedWallet;
  }

  private async ensureCandidateWalletBelongsToCandidate(
    candidateWallet: string,
  ) {
    const profile = await this.prisma.web3Profile.findFirst({
      where: {
        solanaAddress: candidateWallet,
        developerProfile: {
          candidate: {
            user: { role: UserRole.CANDIDATE },
          },
        },
      },
      select: {
        developerProfile: {
          select: {
            candidate: {
              select: { userId: true },
            },
          },
        },
      },
    });

    if (!profile) {
      throw new BadRequestException(
        'candidateWallet is not linked to a candidate profile',
      );
    }
  }

  private verifiedStoredEscrowAddress(
    job: Awaited<ReturnType<EscrowService['getCompanyJob']>>,
  ) {
    if (!job.escrowId || !job.escrowAddress) {
      throw new BadRequestException('Job post has no escrow PDA recorded');
    }
    if (!job.company.walletAddress) {
      throw new BadRequestException('Employer company has no wallet address');
    }

    const derivedAddress = this.solana.derivePDA(
      job.company.walletAddress,
      job.escrowId,
    );
    if (derivedAddress !== job.escrowAddress) {
      throw new BadRequestException(
        'Stored escrow address does not match derived PDA',
      );
    }

    return derivedAddress;
  }

  private ensureEmployerMatches(
    employerWallet: string | null,
    onChainEmployer: string,
  ) {
    if (!employerWallet || employerWallet !== onChainEmployer) {
      throw new BadRequestException(
        'On-chain employer does not match company wallet',
      );
    }
  }

  private decimalToAtomicUnits(value: { toString(): string }): bigint {
    const decimal = value.toString();
    const match = decimal.match(/^(\d+)(?:\.(\d+))?$/);
    if (!match) {
      throw new BadRequestException('Job amount is invalid');
    }

    const whole = match[1];
    const fraction = match[2] ?? '';
    if (fraction.length > 6) {
      throw new BadRequestException('Job amount has more than 6 decimals');
    }

    const atomicUnits = BigInt(`${whole}${fraction.padEnd(6, '0')}`);
    if (atomicUnits <= 0n || atomicUnits > 18_446_744_073_709_551_615n) {
      throw new BadRequestException('Job amount must fit in u64 token units');
    }

    return atomicUnits;
  }

  private serializeJob<T extends { escrowId: bigint | null }>(job: T) {
    return {
      ...job,
      escrowId: job.escrowId?.toString() ?? null,
    };
  }
}
