import 'reflect-metadata';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { config } from './config';
import { issueCsrfToken } from './common/csrf';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: config.isProd ? ['error', 'warn', 'log'] : ['error', 'warn', 'log', 'debug'],
  });

  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: config.isProd ? [] : null,
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(helmet.hsts({ maxAge: 63072000, includeSubDomains: true, preload: true }));

  app.enableCors({
    origin: config.PUBLIC_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  app.use(cookieParser());
  app.use(issueCsrfToken);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Uploaded photos (the React build itself is served by ServeStaticModule,
  // configured in AppModule — it also handles the SPA fallback correctly).
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  const staticMaxAge = config.isProd ? '1d' : 0;
  app.useStaticAssets(uploadsDir, { prefix: '/uploads', maxAge: staticMaxAge });

  await app.listen(config.PORT);

  // eslint-disable-next-line no-console
  console.log(`Carla Création API running at ${config.PUBLIC_ORIGIN} (env: ${config.NODE_ENV})`);

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`${signal} received, shutting down gracefully…`);
    // app.close() triggers TypeOrmModule's own shutdown hook, which closes
    // the Postgres pool — nothing to close manually here.
    await app.close();
    // eslint-disable-next-line no-console
    console.log('Shutdown complete.');
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap();
