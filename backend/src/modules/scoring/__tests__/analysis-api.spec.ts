import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import supertest from 'supertest';
import { AppModule } from '../../../app.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

jest.mock('@privy-io/node', () => ({
  PrivyClient: jest.fn(() => ({})),
}));

describe('AnalysisController (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let signalQueueMock: any;
  let internalKey: string;

  beforeAll(async () => {
    process.env.INTERNAL_API_KEY ??= 'test-internal-key';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getQueueToken('signal-compute'))
      .useValue({
        add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
        getJob: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.enableShutdownHooks();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    signalQueueMock = app.get(getQueueToken('signal-compute'));
    internalKey = app.get(ConfigService).getOrThrow<string>('INTERNAL_API_KEY');
  });

  afterEach(async () => {
    // Clean up all jobs to prevent cross-test contamination
    await prisma.analysisJob.deleteMany({});
    // Cleanup users created in tests - cascading delete should handle profiles/candidates
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: { contains: '_test@example.com' } },
          { username: { contains: 'torvalds_test' } },
        ],
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  describe('POST /api/analysis/recompute', () => {
    it('should fail without internal key', async () => {
      const response = await supertest(app.getHttpServer())
        .post('/api/analysis/recompute')
        .send({ githubUsername: 'torvalds' });

      expect(response.status).toBe(403);
    });

    it('should enqueue a job for a valid profile', async () => {
      const ts = Date.now();
      const username = `torvalds_test_${ts}`;
      const email = `torvalds_${ts}_test@example.com`;

      // 1. Create a dummy user/profile
      const user = await prisma.user.create({
        data: {
          username,
          email,
        },
      });
      const candidate = await prisma.candidate.create({
        data: { userId: user.id },
      });
      const devProfile = await prisma.developerProfile.create({
        data: { candidateId: candidate.id },
      });
      await prisma.githubProfile.create({
        data: {
          developerProfileId: devProfile.id,
          githubUsername: username, // Use dynamic username
          githubUserId: `id_${ts}`,
          encryptedToken: 'v1:mock:mock:mock',
        },
      });

      // 2. Clear previous calls
      jest.clearAllMocks();

      // 3. Trigger recompute
      const response = await supertest(app.getHttpServer())
        .post('/api/analysis/recompute')
        .set('x-internal-key', internalKey)
        .send({ userId: user.id }); // Use dynamic user.id

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('jobId', expect.any(String));
      expect(signalQueueMock.add).toHaveBeenCalledWith(
        'analyze',
        expect.objectContaining({
          jobId: expect.any(String),
          githubUsername: username,
        }),
        undefined,
      );
    });

    it('should return 400 for empty body', async () => {
      const response = await supertest(app.getHttpServer())
        .post('/api/analysis/recompute')
        .set('x-internal-key', internalKey)
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/analysis/:jobId/result', () => {
    it('should return 404 if job not found in queue', async () => {
      signalQueueMock.getJob.mockResolvedValue(null);

      const response = await supertest(app.getHttpServer()).get(
        '/api/analysis/job-999/result',
      );

      expect(response.status).toBe(404);
    });

    it('should return pending status with progress object parsing', async () => {
      const job = await prisma.analysisJob.create({
        data: { status: 'processing', input: {} },
      });

      const response = await supertest(app.getHttpServer()).get(
        `/api/analysis/${job.id}/result`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'pending',
        progress: 0,
      });
    });

    it('should return completed status with returnvalue', async () => {
      const mockResult = { summary: 'Passes integration' };
      const job = await prisma.analysisJob.create({
        data: { status: 'completed', result: mockResult, input: {} },
      });

      const response = await supertest(app.getHttpServer()).get(
        `/api/analysis/${job.id}/result`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'completed',
        progress: 100,
        result: mockResult,
      });
    });
  });
});
