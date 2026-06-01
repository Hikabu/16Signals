/**
 * E2E Test: CV Verification Flow
 *
 * Verifies: POST /api/v2/analysis/cv-verify → CV claim extraction → Light Mode analysis
 * with CV claims → Section B cross-reference populated → GET :jobId (complete)
 *
 * Reference: USER_FLOWS_AND_GOALS_VERIFICATION.md Section 1, Flow 2
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Analysis CV Verify (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.USE_SYNC_PIPELINE = 'true';
    process.env.TRACING_LEVEL = 'summary';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/v2/analysis/cv-verify should return 201 with jobId', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v2/analysis/cv-verify')
      .send({
        githubUsername: 'torvalds',
        cvText:
          'Linus Torvalds\n' +
          'Senior Software Engineer at Linux Foundation (2010–present)\n' +
          'Led kernel development, C, Assembly, Git\n' +
          'Previously: Transmeta Corporation (1997–2003)',
        config: {
          seniority: 'principal',
          role_archetype: 'backend',
        },
      })
      .expect(201);

    expect(res.body).toHaveProperty('jobId');
    expect(res.body.jobId).toMatch(/^cv_verify_/);
    expect(res.body.status).toBe('queued');
  });

  it('CV verification should populate Section B with cross-reference', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v2/analysis/cv-verify')
      .send({
        githubUsername: 'torvalds',
        cvText:
          'Senior Backend Engineer at Acme Corp (2020–2025)\n' +
          'Developed microservices in Node.js and Python\n' +
          'Tech: Docker, Kubernetes, PostgreSQL',
        config: {
          seniority: 'senior',
          role_archetype: 'backend',
        },
      })
      .expect(201);

    const jobId = createRes.body.jobId;

    // Poll until complete
    let result: any = null;
    for (let i = 0; i < 30; i++) {
      const pollRes = await request(app.getHttpServer())
        .get(`/api/v2/analysis/${jobId}`)
        .expect(200);

      if (pollRes.body.status === 'completed') {
        result = pollRes.body;
        break;
      }

      await new Promise((r) => setTimeout(r, 2000));
    }

    expect(result).not.toBeNull();
    expect(result.status).toBe('completed');

    // Section B should be in briefJson
    expect(result.result.briefJson).toBeDefined();
    expect(result.result.briefJson).toHaveProperty('sectionB');

    // EV module should be present
    const evModule = result.result.moduleResults.find(
      (m: any) => m.module_id === 'ev_employment_verification',
    );
    expect(evModule).toBeDefined();
    expect(evModule.confidence).toBeDefined();
  });

  it('POST /api/v2/analysis/cv-verify should return 400 for empty cvText', async () => {
    await request(app.getHttpServer())
      .post('/api/v2/analysis/cv-verify')
      .send({
        githubUsername: 'torvalds',
        cvText: '',
        config: {
          seniority: 'senior',
          role_archetype: 'backend',
        },
      })
      .expect(400);
  });
});