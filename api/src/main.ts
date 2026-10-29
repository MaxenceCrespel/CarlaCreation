import 'reflect-metadata';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import compression from 'compression';
import { seoMetaMiddleware } from './common/seo-meta';
import cookieParser from 'cookie-parser';
import type { Request, Response } from 'express';
import { AppModule } from './app.module';
import { config } from './config';
import { issueCsrfToken } from './common/csrf';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: config.isProd ? ['error', 'warn', 'log'] : ['error', 'warn', 'log', 'debug'],
    // Keeps the exact raw bytes of every request body available as
    // `req.rawBody`, alongside the normal JSON-parsed body everywhere else
    // — needed only by the Stripe webhook, whose signature check hashes
    // the raw bytes Stripe actually sent (see webhook.controller.ts).
    rawBody: true,
  });

  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
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
  // gzip/deflate for the JSON, HTML, CSS and JS responses (images are already compressed).
  app.use(compression());
  // Per-route <title>/description/canonical for crawlers that don't run the SPA's JavaScript.
  app.use(seoMetaMiddleware(path.join(__dirname, '..', '..', 'client', 'dist')));
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
  // Upload file names are unique (timestamp + random), a given URL never changes.
  const staticMaxAge = config.isProd ? '1y' : 0;
  // Photos sent in client conversations are private: never served as static
  // files (only through the guarded /api/client-messages and
  // /api/admin/conversations photo routes). Registered before the static
  // handler so it wins.
  app.use('/uploads/messages', (_req: Request, res: Response) => res.status(404).end());
  app.useStaticAssets(uploadsDir, { prefix: '/uploads', maxAge: staticMaxAge, immutable: config.isProd });

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
