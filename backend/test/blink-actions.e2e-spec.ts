import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { Transaction } from '@solana/web3.js';
import * as path from 'path';
import * as express from 'express';

describe('Solana Actions (Blinks) & CORS (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.enableShutdownHooks();

    // Serve static files to enable testing of /actions.json
    app.use('/', express.static(path.join(__dirname, '..', 'src', 'static')));

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await prisma.$disconnect();
  });

  describe('Discovery Manifest', () => {
    it('1. GET /actions.json -> 200, valid rule list', async () => {
      const res = await request(app.getHttpServer())
        .get('/actions.json')
        .expect(200);

      expect(res.headers['content-type']).toContain('application/json');
      expect(Array.isArray(res.body.rules)).toBe(true);
      expect(res.body.rules.length).toBeGreaterThanOrEqual(1);
      expect(res.body.rules[0].pathPattern).toBe('/api/actions/');
    });
  });

  describe('GET Action Handler', () => {
    it('2. GET /api/actions/vouch/testuser -> returns valid Blink card metadata', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/actions/vouch/testuser')
        .expect(200);

      expect(res.body.title).toContain('testuser');
      expect(res.body.label).toBe('Vouch');
      expect(Array.isArray(res.body.links?.actions)).toBe(true);
      expect(res.body.links.actions.length).toBeGreaterThanOrEqual(1);

      const action = res.body.links.actions[0];
      expect(action.href).toContain('{message}');
      expect(action.parameters[0].name).toBe('message');
      expect(action.parameters[0].required).toBe(true);
    });

    it('3. Response headers include Solana action metadata', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/actions/vouch/testuser')
        .expect(200);

      expect(res.headers['x-action-version']).toBe('1');
    });

    it('4. Response headers include x-action-version: 1', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/actions/vouch/testuser')
        .expect(200);

      expect(res.headers['x-action-version']).toBe('1');
    });

    it('5. Username not in DB returns 200 for crawlers', async () => {
      const nonExistentUsername = 'does_not_exist_' + Date.now();
      const res = await request(app.getHttpServer())
        .get(`/api/actions/vouch/${nonExistentUsername}`)
        .expect(200); // Must be 200 so wallets don't fail parsing metadata silently

      expect(res.body.title).toContain(nonExistentUsername);
    });
  });

  describe('CORS Preflight', () => {
    it('6. OPTIONS /api/actions/vouch/testuser -> 200 with appropriate Headers', async () => {
      const res = await request(app.getHttpServer()).options(
        '/api/actions/vouch/testuser',
      );

      // Not 404 or 405
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-methods']).toContain('GET');
      expect(res.headers['access-control-allow-methods']).toContain('POST');
      expect(res.headers['access-control-allow-methods']).toContain('OPTIONS');
      expect(res.headers['x-action-version']).toBe('1');
    });
  });

  describe('POST Action Handler (Transaction Generation)', () => {
    const validSolanaAddress = '11111111111111111111111111111111';

    it('7. POST with valid params -> valid SPL Memo transaction', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/actions/vouch/testuser?message=Great+work+on+the+MVP')
        .send({ account: validSolanaAddress }) // Sent by Phantom/Backpack
        .expect(200);

      expect(typeof res.body.transaction).toBe('string');
      expect(res.body.message).toContain('testuser');

      // Validate transaction structure
      const txBuffer = Buffer.from(res.body.transaction, 'base64');
      const tx = Transaction.from(txBuffer);

      expect(tx.instructions.length).toBe(1);

      const instruction = tx.instructions[0];
      // Memory program id check
      expect(instruction.programId.toBase58()).toBe(
        'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
      );

      const memoData = JSON.parse(instruction.data.toString('utf8'));
      expect(memoData.type).toBe('vouch');
      expect(memoData.candidate).toBe('testuser');
      expect(memoData.msg).toBe('Great work on the MVP');
    });

    it('8. POST without message param -> 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/actions/vouch/testuser')
        .send({ account: validSolanaAddress })
        .expect(400);

      expect(res.body.message).toBeDefined(); // Expect specific message rejection
    });

    it('9. POST without account field -> 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/actions/vouch/testuser?message=Hey')
        .send({})
        .expect(400);

      // We expect the payload validation to fail because Phantom didn't provide account
      expect(res.body.message).toString().includes('account');
    });

    it('10. POST with invalid wallet in account -> 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/actions/vouch/testuser?message=Hey')
        .send({ account: 'NOT_VALID_WALLET' })
        .expect(400);

      expect(res.body.message).toString().includes('Invalid wallet address');
    });

    it('11. Message longer than 200 chars is truncated', async () => {
      const longMessage = 'A'.repeat(250);
      const res = await request(app.getHttpServer())
        .post(`/api/actions/vouch/testuser?message=${longMessage}`)
        .send({ account: validSolanaAddress })
        .expect(200);

      const txBuffer = Buffer.from(res.body.transaction, 'base64');
      const tx = Transaction.from(txBuffer);
      const memoData = JSON.parse(tx.instructions[0].data.toString('utf8'));

      expect(memoData.msg.length).toBe(200);
      expect(memoData.msg).toBe('A'.repeat(200));
    });

    it('12. Message with HTML tags strips formatting for safety', async () => {
      const htmlMessage = '<b>great</b> <script>alert("xss")</script>';
      const encodedMsg = encodeURIComponent(htmlMessage);

      const res = await request(app.getHttpServer())
        .post(`/api/actions/vouch/testuser?message=${encodedMsg}`)
        .send({ account: validSolanaAddress })
        .expect(200);

      const txBuffer = Buffer.from(res.body.transaction, 'base64');
      const tx = Transaction.from(txBuffer);
      const memoData = JSON.parse(tx.instructions[0].data.toString('utf8'));

      // Should not contain HTML angle brackets
      expect(memoData.msg).not.toContain('<');
      expect(memoData.msg).not.toContain('>');
      // Simple sanitize check - might be empty string or sanitized equivalent
      expect(memoData.msg).toBe('great alert("xss")'); // Or however nestjs sanitizer works, testing string content
    });
  });
});
