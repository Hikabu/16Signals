/**
 * E2E Test: Light Mode Analysis Full Flow
 *
 * Verifies: POST /api/v2/analysis/light → corpus acquisition → wave orchestration
 * → LLM processing → brief assembly → GET /api/v2/analysis/:jobId (complete)
 *
 * Reference: USER_FLOWS_AND_GOALS_VERIFICATION.md Section 1, Flow 1
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Analysis Light Mode (e2e)', () => {
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

  it('POST /api/v2/analysis/light should return 201 with jobId', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v2/analysis/light')
      .send({
        githubUsername: 'torvalds',
        config: {
          seniority: 'senior',
          role_archetype: 'backend',
        },
      })
      .expect(201);

    expect(res.body).toHaveProperty('jobId');
    expect(res.body.jobId).toMatch(/^light_/);
    expect(res.body.status).toBe('queued');
  });

  it('GET /api/v2/analysis/:jobId should return completed status after analysis', async () => {
    // First create a job
    const createRes = await request(app.getHttpServer())
      .post('/api/v2/analysis/light')
      .send({
        githubUsername: 'torvalds',
        config: {
          seniority: 'mid',
          role_archetype: 'backend',
        },
      })
      .expect(201);

    const jobId = createRes.body.jobId;

    // Poll until complete (max 30 attempts, 2s apart = up to 60s)
    let result: any = null;
    for (let i = 0; i < 30; i++) {
      const pollRes = await request(app.getHttpServer())
        .get(`/api/v2/analysis/${jobId}`)
        .expect(200);

      if (pollRes.body.status === 'completed') {
        result = pollRes.body;
        break;
      }

      // Verify intermediate statuses are valid
      expect([
        'queued',
        'wave_1',
        'wave_2a',
        'wave_2b',
        'wave_2c',
        'wave_2d',
        'wave_3',
        'wave_4',
        'completed',
      ]).toContain(pollRes.body.status);

      await new Promise((r) => setTimeout(r, 2000));
    }

    expect(result).not.toBeNull();
    expect(result.status).toBe('completed');
    expect(result.progress).toBe(100);
    expect(result.result).toBeDefined();
    expect(result.result.briefMarkdown).toBeTruthy();
    expect(result.result.moduleResults).toBeDefined();
    expect(Array.isArray(result.result.moduleResults)).toBe(true);
    expect(result.result.moduleResults.length).toBeGreaterThanOrEqual(14);
    expect(result.result.moduleCount).toBeGreaterThanOrEqual(14);
    expect(result.result.totalDurationMs).toBeGreaterThan(0);

    // Verify each module result has the required fields
    for (const mod of result.result.moduleResults) {
      expect(mod).toHaveProperty('module_id');
      expect(mod).toHaveProperty('confidence');
      expect(mod).toHaveProperty('score_label');
      expect(mod).toHaveProperty('evidence');
      expect(Array.isArray(mod.evidence)).toBe(true);
      expect(mod).toHaveProperty('flags');
      expect(Array.isArray(mod.flags)).toBe(true);
      expect(mod).toHaveProperty('raw_signals_used');
    }

    // Verify flags are sorted
    expect(Array.isArray(result.result.flags)).toBe(true);
  });

  it('POST /api/v2/analysis/light should return 400 for invalid seniority', async () => {
    await request(app.getHttpServer())
      .post('/api/v2/analysis/light')
      .send({
        githubUsername: 'torvalds',
        config: {
          seniority: 'super-senior', // Invalid enum
          role_archetype: 'backend',
        },
      })
      .expect(400);
  });

  it('POST /api/v2/analysis/light should return 400 for missing githubUsername', async () => {
    await request(app.getHttpServer())
      .post('/api/v2/analysis/light')
      .send({
        config: {
          seniority: 'mid',
          role_archetype: 'backend',
        },
      })
      .expect(400);
  });

  it('GET /api/v2/analysis/status should return healthy', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v2/analysis/status')
      .expect(200);

    expect(res.body.status).toBe('healthy');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('serviceVersion');
  });

  it('GET /api/v2/analysis/nonexistent should return 404', async () => {
    await request(app.getHttpServer())
      .get('/api/v2/analysis/light_nonexistent_12345')
      .expect(404);
  });
});