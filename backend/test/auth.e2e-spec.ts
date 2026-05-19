import * as dotenv from 'dotenv';
dotenv.config();

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrivyService } from '../src/modules/auth-employer/privy.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;

  const mockPrivyService = {
    verifyToken: jest.fn().mockResolvedValue({
      privyId: 'test-privy-id',
      email: 'test@example.com',
    }),
    getUser: jest.fn().mockResolvedValue({
      linked_accounts: [
        {
          type: 'wallet',
          address: '0xTEST_WALLET',
        },
      ],
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
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    server = app.getHttpAdapter().getInstance();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    // Cleanup test data
    try {
      await prisma.jobPost.deleteMany();
      await prisma.company.deleteMany();
    } catch (e) {
      console.error('Cleanup failed, tables might not exist yet');
    }
  });

  afterAll(async () => {
    try {
      if (app) {
        await app.close();
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
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

  it('/auth/login (POST) - should create company and return JWT', async () => {
    const response = await request(server)
      .post('/auth/employer/login')
      .set('Authorization', 'Bearer mock-token')
      .send({
        walletAddress: '0x123',
        smartAccountAddress: '0xabc',
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.token).toBeDefined();

    const company = await prisma.company.findUnique({
      where: { privyId: 'test-privy-id' },
    });
    expect(company).toBeDefined();
    expect(company?.walletAddress).toBe('0x123');
  });

  it('/companies/me (GET) - should return company profile with JWT', async () => {
    const loginRes = await request(server)
      .post('/auth/employer/login')
      .set('Authorization', 'Bearer mock-token')
      .send({ walletAddress: '0x123' });

    const token = loginRes.body.data.token;

    const response = await request(server)
      .get('/me/company')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.privyId).toBe('test-privy-id');
  });

  it('/jobs (POST) - should create a job', async () => {
    const loginRes = await request(server)
      .post('/auth/employer/login')
      .set('Authorization', 'Bearer mock-token')
      .send({ walletAddress: '0x123' });

    const token = loginRes.body.data.token;

    const response = await request(server)
      .post('/jobs/draft')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Software Engineer',
        description: 'Testing',
        bonusAmount: 100,
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.title).toBe('Software Engineer');
  });

  it('/analytics/dashboard (GET) - should return stats', async () => {
    const loginRes = await request(server)
      .post('/auth/employer/login')
      .set('Authorization', 'Bearer mock-token')
      .send({ walletAddress: '0x123' });

    const token = loginRes.body.data.token;

    await request(server)
      .post('/jobs/draft')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Analytics Test Job',
        description: 'Created for dashboard assertions',
        bonusAmount: 100,
      })
      .expect(201);

    const response = await request(server)
      .get('/analytics/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.totalJobs).toBeGreaterThan(0);
  });

  it('Protected route should fail without token', async () => {
    await request(server).get('/me/company').expect(401);
  });
});
