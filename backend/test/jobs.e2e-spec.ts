import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrivyService } from '../src/modules/auth-employer/privy.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RoleType, Seniority, JobStatus } from '@prisma/client';

describe('Jobs Filtering E2E', () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;
  let appJwt: string;

  const mockPrivyIdentity = {
    privyId: 'did:privy:jobs-tester',
    email: 'tester@example.com',
  };
  const mockPrivyService = {
    verifyToken: jest.fn().mockResolvedValue(mockPrivyIdentity),
    getUser: jest.fn().mockResolvedValue({
      linked_accounts: [{ type: 'wallet', address: '0xJOBS_TESTER' }],
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrivyService)
      .useValue(mockPrivyService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.enableShutdownHooks();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    server = app.getHttpAdapter().getInstance();
    prisma = moduleFixture.get<PrismaService>(PrismaService);

    // Get JWT
    const loginRes = await request(server)
      .post('/auth/employer/login')
      .set('Authorization', 'Bearer debugtoken')
      .send({ walletAddress: '0xJOBS_TESTER' });
    appJwt = loginRes.body.data.token;

    // Seed jobs
    await prisma.jobPost.deleteMany();
    await prisma.company.deleteMany();

    const company = await prisma.company.create({
      data: {
        name: 'Test Co',
        country: 'US',
        privyId: mockPrivyIdentity.privyId,
        walletAddress: '0xJOBS_TESTER',
      },
    });

    await prisma.jobPost.createMany({
      data: [
        {
          companyId: company.id,
          title: 'Senior Backend Engineer',
          description: 'Looking for NestJS expert',
          roleType: RoleType.BACKEND,
          seniorityLevel: Seniority.SENIOR,
          status: JobStatus.ACTIVE,
          bonusAmount: 1000,
          publishedAt: new Date(),
          isWeb3Role: true,
        },
        {
          companyId: company.id,
          title: 'Junior Frontend Developer',
          description: 'React position',
          roleType: RoleType.FRONTEND,
          seniorityLevel: Seniority.JUNIOR,
          status: JobStatus.ACTIVE,
          bonusAmount: 500,
          publishedAt: new Date(),
          isWeb3Role: false,
        },
        {
          companyId: company.id,
          title: 'Fullstack Wizard',
          description: 'Node and React',
          roleType: RoleType.FULLSTACK,
          seniorityLevel: Seniority.MID,
          status: JobStatus.ACTIVE,
          bonusAmount: 800,
          publishedAt: new Date(),
          isWeb3Role: true,
        },
      ],
    });
  });

  afterAll(async () => {
    try {
      await app.close();
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (err) {
      console.error('Error closing app:', err);
    }
    try {
      if (prisma) {
        await prisma.$disconnect();
      }
    } catch (err) {
      console.error('Error disconnecting Prisma:', err);
    }
  });

  it('GET /jobs should return all active jobs', async () => {
    const res = await request(server).get('/jobs');
    expect(res.status).toBe(200);
    expect(res.body.data.jobs.length).toBe(3);
  });

  it('GET /jobs?search=NestJS should filter by search', async () => {
    const res = await request(server).get('/jobs?search=NestJS');
    expect(res.status).toBe(200);
    expect(res.body.data.jobs.length).toBe(1);
    expect(res.body.data.jobs[0].title).toContain('Senior Backend');
  });

  it('GET /jobs?roleType=BACKEND should filter by roleType', async () => {
    const res = await request(server).get('/jobs?roleType=BACKEND');
    expect(res.status).toBe(200);
    expect(res.body.data.jobs.length).toBe(1);
    expect(res.body.data.jobs[0].roleType).toBe(RoleType.BACKEND);
  });

  it('GET /jobs?roleType=backend (lowercase) should filter by roleType due to transform', async () => {
    const res = await request(server).get('/jobs?roleType=backend');
    expect(res.status).toBe(200);
    expect(res.body.data.jobs.length).toBe(1);
    expect(res.body.data.jobs[0].roleType).toBe(RoleType.BACKEND);
  });

  it('GET /jobs?seniority=SENIOR should filter by seniority', async () => {
    const res = await request(server).get('/jobs?seniority=SENIOR');
    expect(res.status).toBe(200);
    expect(res.body.data.jobs.length).toBe(1);
    expect(res.body.data.jobs[0].seniorityLevel).toBe(Seniority.SENIOR);
  });

  it('GET /jobs?isWeb3=true should filter by isWeb3', async () => {
    const res = await request(server).get('/jobs?isWeb3=true');
    expect(res.status).toBe(200);
    expect(res.body.data.jobs.length).toBe(2);
  });

  it('GET /jobs?isWeb3=false should filter by isWeb3', async () => {
    const res = await request(server).get('/jobs?isWeb3=false');
    expect(res.status).toBe(200);
    expect(res.body.data.jobs.length).toBe(1);
    expect(res.body.data.jobs[0].isWeb3Role).toBe(false);
  });

  it('GET /jobs should support pagination', async () => {
    const res = await request(server).get('/jobs?limit=1&page=2');
    expect(res.status).toBe(200);
    expect(res.body.data.jobs.length).toBe(1);
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.page).toBe(2);
    expect(res.body.data.limit).toBe(1);
  });
});
