import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { issueCsrfToken } from '../src/common/csrf';

// Mirrors the essential parts of src/main.ts's bootstrap (cookie parsing,
// CSRF cookie issuance, global validation) — everything the app's actual
// request-handling behaviour depends on — without the network-listening
// bits (helmet/CORS don't matter for a supertest client talking directly
// to the in-process HTTP server, no browser involved).
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();

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

  await app.init();
  return app;
}

function extractCookie(res: request.Response, name: string): string | undefined {
  const setCookie = (res.headers['set-cookie'] as unknown as string[]) || [];
  const line = setCookie.find((c) => c.startsWith(`${name}=`));
  return line?.split(';')[0].split('=')[1];
}

// issueCsrfToken (src/common/csrf.ts) only sets the cookie once per agent —
// once it's already present, later requests don't get a fresh Set-Cookie
// header. Cache the token per agent so every call is safe to make, whether
// it's the first request on this agent or the hundredth.
const csrfTokenCache = new WeakMap<object, string>();

// Fetches a CSRF token onto the given agent's cookie jar and returns its
// value, to be echoed back in the `x-csrf-token` header on state-changing
// requests — the double-submit-cookie pattern implemented in src/common/csrf.ts.
export async function getCsrfToken(agent: ReturnType<typeof request.agent>): Promise<string> {
  const cached = csrfTokenCache.get(agent);
  if (cached) return cached;

  const res = await agent.get('/api/csrf-token');
  const token = extractCookie(res, 'csrf_token');
  if (!token) throw new Error('Cookie "csrf_token" was not set on the response.');

  csrfTokenCache.set(agent, token);
  return token;
}

// Logs an agent in as admin (fetching a CSRF token first) — the agent's
// cookie jar ends up holding both `csrf_token` and `admin_session`.
export async function loginAsAdmin(
  agent: ReturnType<typeof request.agent>,
  username: string,
  password: string,
): Promise<void> {
  const token = await getCsrfToken(agent);
  const res = await agent.post('/api/auth/login').set('x-csrf-token', token).send({ username, password });
  if (res.status !== 200) {
    throw new Error(`Admin login failed in test setup: ${res.status} ${JSON.stringify(res.body)}`);
  }
}
