import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { INestApplicationContext } from '@nestjs/common';
import { WorkerModule } from './queues/worker.module';
import { getQueueToken } from '@nestjs/bullmq';

const logger = new Logger('Worker');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger:
      process.env.NODE_ENV === 'production'
        ? ['log', 'error', 'warn']
        : ['log', 'error', 'warn', 'debug'],
  });

//ONLY TESTING    
await debug_closeOpenJobs(app);
  app.enableShutdownHooks();
  registerShutdown(app);
  logger.log('Worker is running');
}

async function debug_closeOpenJobs(app: INestApplicationContext){
  console.log("KILLING IT");
     const queue = app.get(getQueueToken('analysis'));

  await queue.obliterate({
    force: true,
  });

  console.log("finished queue!!!!!1");

}

function registerShutdown(app: INestApplicationContext) {
  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}; shutting down worker`);
    await app.close();
    process.exit(0);
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection', err);
  process.exitCode = 1;
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err);
  process.exit(1);
});

bootstrap().catch((err) => {
  logger.error('Worker failed to start', err);
  process.exit(1);
});
