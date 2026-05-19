import { execSync } from 'child_process';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './../src/app.module';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import * as crypto from 'crypto';
import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { getQueueToken } from '@nestjs/bullmq';
import cookieParser from 'cookie-parser';

export const getCookieValue = (
  setCookie: string[] | string | undefined,
  name: string,
) => {
  const cookies = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  const cookie = cookies.find((value) => value.startsWith(`${name}=`));
  return cookie?.split(';')[0].slice(name.length + 1);
};

export const resetBefore = async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app: INestApplication<App> = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.enableShutdownHooks();

  try {
    await app.init();

    const prisma: PrismaService = app.get(PrismaService);
    await prisma.$connect();
    await resetDatabase(prisma);
    const id = crypto.randomBytes(16).toString('hex');
    const shortId = crypto
      .createHash('md5')
      .update(id)
      .digest('hex')
      .slice(0, 8);

    return {
      app,
      prisma,
      id,
      shortId,
    };
  } catch (err) {
    await resetAfter(app);
    throw err;
  }
};

const resetDatabase = async (prisma: PrismaService) => {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "users" CASCADE;`);
      return;
    } catch (err) {
      if (attempt === maxAttempts || !isTransientDatabaseResetError(err)) {
        throw err;
      }

      await new Promise((resolve) => setTimeout(resolve, attempt * 100));
    }
  }
};

const isTransientDatabaseResetError = (err: unknown) => {
  if (!err || typeof err !== 'object') return false;

  const error = err as { code?: string; message?: string };
  return (
    error.code === '40P01' ||
    error.code === '55P03' ||
    error.message?.includes('deadlock detected') ||
    error.message?.includes('could not obtain lock')
  );
};

export const resetAfter = async (app: INestApplication<App>) => {
  if (!app) return;

  const prisma = app.get(PrismaService);
  try {
    await prisma.$disconnect();
  } catch (err) {
    console.error('Error disconnecting Prisma:', err);
  }

  await closeQueues(app);

  const redis = app.get('REDIS', { strict: false });
  try {
    if (redis && typeof redis.quit === 'function') {
      await redis.quit();
    } else if (redis && typeof redis.disconnect === 'function') {
      await redis.disconnect();
    }
  } catch (err) {
    console.error('Error quitting Redis:', err);
  }

  try {
    await app.close();
    await new Promise((resolve) => setTimeout(resolve, 500));
  } catch (err) {
    console.error('Error closing app:', err);
  }
};

const closeQueues = async (app: INestApplication<App>) => {
  const queueTokens = [
    getQueueToken('github-sync'),
    getQueueToken('signal-compute'),
    getQueueToken('email'),
  ];

  await Promise.all(
    queueTokens.map(async (token) => {
      let queue: unknown;
      try {
        queue = app.get(token, { strict: false });
      } catch {
        return;
      }

      try {
        if (
          queue &&
          typeof (queue as { close?: unknown }).close === 'function'
        ) {
          await (queue as { close: () => Promise<void> | void }).close();
        } else if (
          queue &&
          typeof (queue as { disconnect?: unknown }).disconnect === 'function'
        ) {
          await (
            queue as { disconnect: () => Promise<void> | void }
          ).disconnect();
        }
      } catch (err) {
        console.error(`Error closing queue ${String(token)}:`, err);
      }
    }),
  );
};

@Injectable()
export class MockGithubGuard {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();

    // simulate JWT user (VERY IMPORTANT)
    req.authUser = {
      id: 'test-user-id',
      isEmailVerified: true,
    };

    // simulate GitHub user
    req.user = {
      githubId: 'mock-id',
      email: 'mock@example.com',
    };

    return true;
  }
}

export const resetBeforeNoThrottle = async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [
      ThrottlerModule.forRoot({
        throttlers: [], // 🚨 disables it completely
      }),
      AppModule,
    ],
  }).compile();
  // const moduleFixture = await Test.createTestingModule({
  //   imports: [AppModule],
  // })
  //   .overrideProvider(APP_GUARD)
  //   .useValue({ canActivate: () => true })
  //   .compile();

  const app = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.enableShutdownHooks();
  await app.init();

  return { app };
};
