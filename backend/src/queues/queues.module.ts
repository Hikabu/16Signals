import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const MAX_REDIS_RETRY_DELAY_MS = 2000;

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');
        if (!redisUrl) {
          throw new Error('REDIS_URL is required to start queues.');
        }

        return {
          connection: new Redis(redisUrl, {
            lazyConnect: true,
            enableOfflineQueue: false,
            maxRetriesPerRequest: null,
            retryStrategy(times: number) {
              return Math.min(times * 250, MAX_REDIS_RETRY_DELAY_MS);
            },
          }),
          defaultJobOptions: {
            removeOnComplete: 100,
            removeOnFail: 500,
            attempts: 1,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: 'github-sync' },
      { name: 'signal-compute' },
      { name: 'email' },
      { name: 'analysis' },
    ),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
