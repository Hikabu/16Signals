import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { ZodValidationPipe } from 'nestjs-zod';
import cookieParser from 'cookie-parser';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';
import * as fs from 'fs';
import * as path from 'path';
import * as multer from 'multer';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger:
      process.env.NODE_ENV === 'production'
        ? ['log', 'error', 'warn']
        : ['log', 'error', 'warn', 'debug'],
  });

  app.set('trust proxy', 1);
  app.enableShutdownHooks();
  app.use(cookieParser());
  app.use(helmet());

  const corsOrigins = (
    process.env.CORS_ORIGINS ||
    process.env.FRONTEND_URL ||
    ''
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : ['http://localhost:3001'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
    new ZodValidationPipe(),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('a16zero Employer API')
    .setDescription(
      'Backend MVP for Employer platform features and Account Abstraction auth verification.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-internal-key',
        in: 'header',
        description: 'Internal API key',
      },
      'internal-api-key',
    )
    .build();

 if (process.env.NODE_ENV !== 'production') {
  const document = SwaggerModule.createDocument(app, config);
  const cleanedDocument = cleanupOpenApiDoc(document);

  SwaggerModule.setup('api/docs', app, cleanedDocument, {
    swaggerOptions: {
      requestSnippetsEnabled: true,
    },
  });

  // EXPORT OPENAPI.JSON
  const outputPath = path.resolve(process.cwd(), 'openapi.json');

  fs.writeFileSync(
    outputPath,
    JSON.stringify(cleanedDocument, null, 2),
  );

  logger.log(`OpenAPI spec exported to ${outputPath}`);
}

  const port = process.env.PORT || 8080;
  await app.listen(port, '0.0.0.0');

  logger.log(`Application is listening on port ${port}`);
  if (process.env.NODE_ENV !== 'production') {
    logger.log(`Swagger documentation enabled at /api/docs`);
  }
}

bootstrap().catch((err) => {
  logger.error('Application failed to start', err);
  process.exit(1);
});
