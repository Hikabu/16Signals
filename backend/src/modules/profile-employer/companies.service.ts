import { ConflictException, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterEmployerWaitlistDto } from './dto/register-employer-waitlist.dto';

@Injectable()
export class CompaniesService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('email') private readonly emailQueue: Queue,
  ) {}

  async findOne(id: string) {
    return this.prisma.company.findUnique({
      where: { id },
      include: {
        _count: {
          select: { jobPosts: true },
        },
      },
    });
  }

  // ─── Employer Waitlist ────────────────────────────────────────────────────

  async getEmployerWaitlistStatus(email: string): Promise<{ registered: boolean }> {
    if (!email) return { registered: false };
    const existing = await this.prisma.employerWaitlist.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    return { registered: !!existing };
  }

  async registerEmployerWaitlist(dto: RegisterEmployerWaitlistDto) {
    const email = dto.email.toLowerCase().trim();

    const existing = await this.prisma.employerWaitlist.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException(
        'This email is already registered on the employer waitlist.',
      );
    }

    await this.prisma.employerWaitlist.create({
      data: {
        email,
        companyName: dto.companyName,
        website: dto.website,
        rolesHiring: dto.rolesHiring ?? [],
        otherRolesText: dto.otherRolesText,
        usesGithub: dto.usesGithub ?? false,
        evalTools: dto.evalTools,
        needsOtherRoleTools: dto.needsOtherRoleTools ?? false,
        companyTypes: dto.companyTypes ?? [],
        teamSize: dto.teamSize,
        socialLinks: dto.socialLinks,
      },
    });

    await this.emailQueue.add('send', {
      to: email,
      subject: "You're on the list — 16Signals employer marketplace",
      html: this.buildEmployerWaitlistEmail(email, dto.companyName),
    });

    return {
      message:
        "You're on the list! We'll reach out as soon as employer access opens.",
    };
  }

  // ─── Email template ───────────────────────────────────────────────────────

  private buildEmployerWaitlistEmail(
    email: string,
    companyName: string,
  ): string {
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
    .divider { border: none; border-top: 1px solid #1e1e2e; margin: 28px 0; }
    .footer { color: #475569; font-size: 12px; text-align: center; margin-top: 28px; }
    .highlight { color: #2aa198; font-weight: 600; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="badge">✓ You're on the list</div>
      <h1>Welcome to 16Signals, <span class="highlight">${companyName}</span></h1>
      <p>We're building the fairest hiring experience in tech — where engineers are evaluated on real contribution signals, not resumes.</p>
      <p>We'll reach out personally as soon as employer access opens. In the meantime, our team may be in touch to learn more about your hiring needs.</p>
      <hr class="divider" />
      <p style="font-size:13px;">16Signals scores developers on GitHub activity, Web3 contributions, and verifiable peer vouches. Employers get a ranked shortlist matched to role requirements — no resume stacks, no bias.</p>
    </div>
    <div class="footer">16Signals · You received this because ${email} requested early employer access. · <a href="#" style="color:#475569;">Unsubscribe</a></div>
  </div>
</body>
</html>`;
  }
}
