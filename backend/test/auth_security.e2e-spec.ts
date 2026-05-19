import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  getCookieValue,
  resetBefore,
  resetAfter,
  resetBeforeNoThrottle,
} from './shared';
import { AuthCandidateService } from '../src/modules/auth-candidate/auth.candidate.service';

describe('Auth Security (e2e)', () => {
  let app: INestApplication;
  let testId: string;

  beforeEach(async () => {
    const setup = await resetBefore();
    app = setup.app;
    testId = setup.id;
  });

  afterEach(async () => {
    await resetAfter(app);
  });

  describe('Rate Limiting', () => {
    it('should trigger internal rate limit on login after 5 failures', async () => {
      const setup = await resetBeforeNoThrottle();
      try {
        const email = `fail-${testId}@example.com`;

        let res;
        for (let i = 0; i < 6; i++) {
          res = await request(setup.app.getHttpServer())
            .post('/auth/candidate/login')
            .send({ identifier: email, password: 'wrong-password' });
          if (i < 5) {
            expect(res.status).toBe(401);
            expect(res.body.message).toContain('Invalid credentials');
          }
        }

        expect(res.status).toBe(401);
        expect(res.body.message).toContain('Too many login attempts');
      } finally {
        await resetAfter(setup.app);
      }
    });

    it('should allow registration under the configured high test throttle', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/auth/candidate/register')
          .send({
            email: `spam-${i}-${testId}@example.com`,
            password: 'StrongPassword123!',
            role: 'CANDIDATE',
          })
          .expect(202);
      }

      const res = await request(app.getHttpServer())
        .post('/auth/candidate/register')
        .send({
          email: `spam-final-${testId}@example.com`,
          password: 'StrongPassword123!',
          role: 'CANDIDATE',
        });

      expect(res.status).toBe(202);
    });
  });

  describe('Session Hijack & Reuse', () => {
    it('should revoke all sessions on refresh token reuse', async () => {
      const email = `hijack-${testId}@example.com`;
      await request(app.getHttpServer())
        .post('/auth/candidate/register')
        .send({ email, password: 'StrongPassword123!', role: 'CANDIDATE' })
        .expect(202);

      const authService = app.get(AuthCandidateService);

      const prisma = authService.prisma;
      await prisma.user.update({
        where: { email },
        data: { isEmailVerified: true } as any,
      });

      // 1. First login
      const res1 = await request(app.getHttpServer())
        .post('/auth/candidate/login')
        .send({ identifier: email, password: 'StrongPassword123!' })
        .expect(200);
      const rt1 = getCookieValue(res1.headers['set-cookie'], 'refresh_token');
      expect(rt1).toBeDefined();

      // 2. Refresh tokens (RT1 is used, RT2 is issued)
      const res2 = await request(app.getHttpServer())
        .post('/auth/candidate/refresh')
        .set('Cookie', [`refresh_token=${rt1}`])
        .expect(200);
      const rt2 = getCookieValue(res2.headers['set-cookie'], 'refresh_token');
      expect(rt2).toBeDefined();

      // // 3. Attempt to reuse RT1 (Simulated attacker!)
      const res3 = await request(app.getHttpServer())
        .post('/auth/candidate/refresh')
        .set('Cookie', [`refresh_token=${rt1}`]);

      expect(res3.status).toBe(401);

      // // 4. RT2 should now also be invalid because of reuse detection
      const res4 = await request(app.getHttpServer())
        .post('/auth/candidate/refresh')
        .set('Cookie', [`refresh_token=${rt2}`]);

      expect(res4.status).toBe(401);
    });
  });
});
