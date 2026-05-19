import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrivyService } from '../src/modules/auth-employer/privy.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('APP E2E', () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;

  const mockPrivyIdentity = {
    privyId: 'did:privy:test-user',
    email: 'test-company@example.com',
  };
  const mockPrivyProfile = {
    linked_accounts: [
      {
        type: 'wallet',
        address: '0xTEST_WALLET',
      },
    ],
  };
  const mockPrivyService = {
    verifyToken: jest.fn().mockResolvedValue(mockPrivyIdentity),
    getUser: jest.fn().mockResolvedValue(mockPrivyProfile),
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
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    server = app.getHttpAdapter().getInstance();
    prisma = moduleFixture.get<PrismaService>(PrismaService);

    try {
      await prisma.jobPost.deleteMany();
      await prisma.company.deleteMany();
    } catch (error) {
      // Allow the suite to run even if the local test database has not been migrated yet.
    }
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

  it('GET /health should return ok', async () => {
    const res = await request(server).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('POST /auth/login should fail without token', async () => {
    const res = await request(server)
      .post('/auth/employer/login')
      .send({ walletAddress: '0x123' });
    expect(res.status).toBe(401);
  });

  it('POST /auth/login should authenticate from Privy token claims when walletAddress is missing', async () => {
    const res = await request(server)
      .post('/auth/employer/login')
      .set('Authorization', 'Bearer debugtoken')
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.data.token).toBeDefined();
  });

  let appJwt: string;

  it('POST /auth/login should return app JWT', async () => {
    const res = await request(server)
      .post('/auth/employer/login')
      .set('Authorization', 'Bearer debugtoken')
      .send({
        walletAddress: '0x123',
        smartAccountAddress: '0xabc',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.token).toBeDefined();
    appJwt = res.body.data.token;
  });

  it('GET /companies/me should reject without JWT', async () => {
    const res = await request(server).get('/me/company');
    expect(res.status).toBe(401);
  });

  it('GET /companies/me should return company', async () => {
    const res = await request(server)
      .get('/me/company')
      .set('Authorization', `Bearer ${appJwt}`);
    expect(res.status).toBe(200);
    expect(res.body.data.walletAddress).toBe(
      '0x123456789abcdef0123456789abcdef012345678',
    );
  });

  let jobId: string;

  it('POST /jobs/draft should create job', async () => {
    const res = await request(server)
      .post('/jobs/draft')
      .set('Authorization', `Bearer ${appJwt}`)
      .send({
        title: 'NestJS Engineer',
        description: 'Test job',
        bonusAmount: 100,
        location: 'Remote',
        employmentType: 'Full-time',
        currency: 'USD',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('DRAFT');
    jobId = res.body.data.id;
  });

  it('GET /jobs/me should list jobs', async () => {
    const res = await request(server)
      .get('/jobs/me')
      .set('Authorization', `Bearer ${appJwt}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('POST /jobs/:id/publish should activate job', async () => {
    const res = await request(server)
      .post(`/jobs/${jobId}/publish`)
      .set('Authorization', `Bearer ${appJwt}`);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('ACTIVE');
  });

  it('GET /jobs should list public jobs', async () => {
    const res = await request(server).get('/jobs');
    expect(res.status).toBe(200);
    const jobs = Array.isArray(res.body.data)
      ? res.body.data
      : res.body.data.jobs;
    expect(jobs.length).toBeGreaterThan(0);
  });

  it('POST /jobs/:id/close should close job', async () => {
    const res = await request(server)
      .post(`/jobs/${jobId}/close`)
      .set('Authorization', `Bearer ${appJwt}`);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('CLOSED');
  });
});
