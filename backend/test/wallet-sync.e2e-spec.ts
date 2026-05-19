import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import Redis from 'ioredis';
import { JwtService } from '@nestjs/jwt';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { Keypair } from '@solana/web3.js';
import { SolanaAdapterService } from '../src/modules/scoring/web3-adapter/solana-adapter.service';

describe('Wallet Sync (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let jwtService: JwtService;
  let testUser: any;
  let authToken: string;

  const solanaMock = {
    fetchProgramsByAuthority: jest.fn().mockResolvedValue([]),

    fetchOnChainData: jest.fn().mockResolvedValue({
      ecosystem: 'solana',
      ecosystemPRs: 0,
      deployedPrograms: [],
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SolanaAdapterService)
      .useValue(solanaMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.enableShutdownHooks();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    redis = moduleFixture.get<Redis>('REDIS');
    jwtService = moduleFixture.get<JwtService>(JwtService);

    // Clean up
    await prisma.web3Profile.deleteMany({});
    await prisma.githubProfile.deleteMany({});
    await prisma.developerProfile.deleteMany({});
    await prisma.candidate.deleteMany({});
    await prisma.user.deleteMany({ where: { email: 'test@example.com' } });

    // Create test user
    testUser = await prisma.user.create({
      data: {
        email: 'test@example.com',
        role: 'CANDIDATE',
        isEmailVerified: true,
      },
    });

    // Create Candidate and DevProfile (required by linkWallet)
    const candidate = await prisma.candidate.create({
      data: {
        userId: testUser.id,
        careerPath: 1,
      },
    });

    const devProfile = await prisma.developerProfile.create({
      data: {
        candidateId: candidate.id,
      },
    });
    testUser.candidate = { ...candidate, devProfile };

    authToken = jwtService.sign(
      {
        sub: testUser.id,
        role: 'CANDIDATE',
        isEmailVerified: true,
      },
      { secret: process.env.JWT_ACCESS_SECRET },
    );
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
    try {
      if (redis) {
        await redis.quit();
      }
    } catch (err) {
      console.error('Error quitting Redis:', err);
    }
  });

  describe('GET /sync/wallet/challenge', () => {
    it('should return 401 if not authenticated', async () => {
      await request(app.getHttpServer())
        .get('/sync/wallet/challenge')
        .expect(401);
    });

    it('should return a challenge for authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .get('/sync/wallet/challenge')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.challenge).toBeDefined();
      expect(response.body.challenge).toContain(`link-wallet:${testUser.id}:`);

      const stored = await redis.get(`wallet-challenge:${testUser.id}`);
      expect(stored).toBe(response.body.challenge);
    });

    it('should overwrite old challenge on second call', async () => {
      const res1 = await request(app.getHttpServer())
        .get('/sync/wallet/challenge')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const challenge1 = res1.body.challenge;

      const res2 = await request(app.getHttpServer())
        .get('/sync/wallet/challenge')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const challenge2 = res2.body.challenge;
      expect(challenge1).not.toBe(challenge2);

      const stored = await redis.get(`wallet-challenge:${testUser.id}`);
      expect(stored).toBe(challenge2);
    });
  });

  describe('POST /sync/wallet', () => {
    const keypair = Keypair.generate();
    const walletAddress = keypair.publicKey.toBase58();

    it('should return 401 if not authenticated', async () => {
      await request(app.getHttpServer())
        .post('/sync/wallet')
        .send({ walletAddress: 'abc', signature: 'xyz' })
        .expect(401);
    });

    it('should return 400 when signed message is missing', async () => {
      await redis.del(`wallet-challenge:${testUser.id}`);

      await request(app.getHttpServer())
        .post('/sync/wallet')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          walletAddress,
          signature: bs58.encode(Buffer.from('sig')),
        })
        .expect(400);
    });

    it('should return 401 if signature is invalid', async () => {
      const challenge = `link-wallet:${testUser.id}:${Date.now()}:bad`;
      await redis.set(`wallet-challenge:${testUser.id}`, challenge, 'EX', 300);

      const wrongSig = bs58.encode(
        nacl.sign.detached(Buffer.from('wrong'), keypair.secretKey),
      );

      await request(app.getHttpServer())
        .post('/sync/wallet')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          walletAddress,
          signature: wrongSig,
          message: challenge,
        })
        .expect(401);
    });

    it('should link wallet with valid signature', async () => {
      const resChallenge = await request(app.getHttpServer())
        .get('/sync/wallet/challenge')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const challenge = resChallenge.body.challenge;
      const signature = bs58.encode(
        nacl.sign.detached(Buffer.from(challenge), keypair.secretKey),
      );

      const response = await request(app.getHttpServer())
        .post('/sync/wallet')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          walletAddress,
          signature,
          message: challenge,
        })
        .expect(201);

      expect(response.body.linked).toBe(true);
      expect(response.body.solanaAddress).toBe(walletAddress);

      // Verify DB
      const profile = await prisma.web3Profile.findUnique({
        where: { developerProfileId: testUser.candidate.devProfile.id },
      });
      expect(profile?.solanaAddress).toBe(walletAddress);
    });
  });

  describe('Regression: POST /sync/github', () => {
    it('should NOT return scorecard data and NOT trigger analysis job row', async () => {
      // Pre-link github to avoid GITHUB_NOT_CONNECTED
      const candidate = await prisma.candidate.findUnique({
        where: { userId: testUser.id },
        include: { devProfile: true },
      });
      await prisma.githubProfile.create({
        data: {
          developerProfileId: candidate!.devProfile!.id,
          githubUsername: 'test-user',
          githubUserId: '12345',
          encryptedToken: 'v1:fake',
          scopes: [],
        },
      });

      const beforeJobsCount = await prisma.analysisJob.count();

      const response = await request(app.getHttpServer())
        .post('/sync/github')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      // Rule 12: Exact shape
      expect(response.body).toEqual({
        synced: true,
        githubUsername: 'test-user',
      });

      // Rule 10: No scorecard fields
      expect(response.body.capabilities).toBeUndefined();
      expect(response.body.scorecard).toBeUndefined();

      // Rule 11: No new AnalysisJob row
      const afterJobsCount = await prisma.analysisJob.count();
      expect(afterJobsCount).toBe(beforeJobsCount);
    });
  });
});
