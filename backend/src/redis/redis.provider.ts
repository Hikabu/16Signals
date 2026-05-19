import Redis from 'ioredis';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type StoredValue = {
  value: string;
  expiresAt?: number;
};

class InMemoryRedis {
  private readonly store = new Map<string, StoredValue>();

  private purgeExpired(key: string) {
    const item = this.store.get(key);
    if (item?.expiresAt && item.expiresAt <= Date.now()) {
      this.store.delete(key);
    }
  }

  get(key: string) {
    this.purgeExpired(key);
    return this.store.get(key)?.value ?? null;
  }

  set(key: string, value: string, mode?: string, ttlSeconds?: number) {
    const expiresAt =
      mode === 'EX' && ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  incr(key: string) {
    const current = Number(this.get(key) ?? 0) + 1;
    this.set(key, String(current));
    return current;
  }

  expire(key: string, ttlSeconds: number) {
    const item = this.store.get(key);
    if (!item) return 0;
    item.expiresAt = Date.now() + ttlSeconds * 1000;
    return 1;
  }

  del(key: string) {
    return this.store.delete(key) ? 1 : 0;
  }

  eval(
    _script: string,
    _numKeys: number,
    key: string,
    expectedValue?: string,
    nextValue?: string,
    ttlSeconds?: string | number,
  ) {
    if (expectedValue !== undefined && nextValue !== undefined) {
      const current = this.get(key);
      if (!current) return -1;
      if (current !== expectedValue) {
        this.del(key);
        return 0;
      }
      this.set(key, nextValue, 'EX', Number(ttlSeconds));
      return 1;
    }

    const value = this.get(key);
    if (value) {
      this.del(key);
    }
    return value;
  }

  exists(key: string) {
    this.purgeExpired(key);
    return this.store.has(key) ? 1 : 0;
  }

  keys(pattern: string) {
    const prefix = pattern.endsWith('*') ? pattern.slice(0, -1) : pattern;
    return [...this.store.keys()].filter((key) => {
      this.purgeExpired(key);
      return key.startsWith(prefix);
    });
  }

  ttl(key: string) {
    this.purgeExpired(key);
    const item = this.store.get(key);
    if (!item) return -2;
    if (!item.expiresAt) return -1;
    return Math.max(0, Math.ceil((item.expiresAt - Date.now()) / 1000));
  }

  flushall() {
    this.store.clear();
    return 'OK';
  }

  ping() {
    return 'PONG';
  }

  quit() {
    return 'OK';
  }

  disconnect() {
    return undefined;
  }
}

const logger = new Logger('Redis');
const STARTUP_TIMEOUT_MS = 15000;
const MAX_RETRY_DELAY_MS = 2000;

const withStartupTimeout = async <T>(operation: Promise<T>) => {
  let timeout: NodeJS.Timeout;
  const startupTimeout = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(
        new Error(
          `Redis startup timed out after ${STARTUP_TIMEOUT_MS}ms. Check REDIS_URL and network connectivity.`,
        ),
      );
    }, STARTUP_TIMEOUT_MS);
    timeout.unref();
  });

  try {
    return await Promise.race([operation, startupTimeout]);
  } finally {
    clearTimeout(timeout!);
  }
};

export const RedisProvider = {
  provide: 'REDIS',
  inject: [ConfigService],
  useFactory: async (config: ConfigService) => {
    if (
      process.env.NODE_ENV === 'test' &&
      process.env.REDIS_INTEGRATION !== 'true'
    ) {
      return new InMemoryRedis();
    }

    const redisUrl = config.get<string>('REDIS_URL');
    if (!redisUrl) {
      throw new Error('REDIS_URL is required to start Redis-backed services.');
    }

    const redis = new Redis(redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: null,
      retryStrategy(times) {
        const delay = Math.min(times * 250, MAX_RETRY_DELAY_MS);
        logger.warn(`Redis reconnect attempt ${times}; retrying in ${delay}ms`);
        return delay;
      },
    });

    redis.on('error', (err) => {
      logger.warn(`Redis connection error: ${err.message}`);
    });

    redis.on('ready', () => {
      logger.log('Redis connected');
    });

    try {
      await withStartupTimeout(redis.connect());
      await withStartupTimeout(redis.ping());
    } catch (err) {
      redis.disconnect();
      const message =
        err instanceof Error ? err.message : 'Unknown Redis error';
      throw new Error(`Failed to connect to Redis using REDIS_URL: ${message}`);
    }

    return redis;
  },
};
