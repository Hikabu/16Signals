import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getCookieValue, resetAfter } from './shared';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as crypto from 'crypto';
import { GithubLinkGuard } from '../src/modules/auth-candidate/guards/github.link.guard';
import { MockGithubGuard } from './shared';

describe('Auth Hijacking Prevention (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let id: string;

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(GithubLinkGuard)
      .useClass(MockGithubGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.enableShutdownHooks();
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.$connect();

    id = crypto.randomBytes(16).toString('hex');
  });

  afterEach(async () => {
    await resetAfter(app);
  });

  it('Prevent Account Linking Hijack via predictable state', async () => {
    // 1. Create a "target" user and login
    const targetUser = {
      email: `target-${Date.now()}@example.com`,
      username: `target-${Date.now()}`,
      password: 'Password123!',
      role: 'CANDIDATE',
    };
    await request(app.getHttpServer())
      .post('/auth/candidate/register')
      .send(targetUser)
      .expect(202);

    //verify
    await prisma.user.update({
      where: { email: targetUser.email },
      data: { isEmailVerified: true },
    });

    // Assume verification is bypassed or handled for the sake of the test environment setup
    // For this test, we just need a JWT for the target user ID.

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/candidate/login')
      .send({
        identifier: targetUser.email,
        password: targetUser.password,
      })
      .expect(200);

    // The account is verified by default in some test setups or we manually update it
    // Let's assume the user is logged in.
    const jwt = getCookieValue(
      loginResponse.headers['set-cookie'],
      'access_token',
    );

    // 2. Attacker attempts to link THEIR social account to TARGET'S user ID
    // using a predictable state if the system allowed it.
    // Our fix uses random state in Redis.

    const maliciousCallbackUrl = `/auth/candidate/github/link/callback?state=${
      loginResponse.body.id || 'target_user_id'
    }`;

    await request(app.getHttpServer())
      .get(maliciousCallbackUrl)
      .set('Authorization', `Bearer ${jwt}`)
      .expect(401);
  });
});
