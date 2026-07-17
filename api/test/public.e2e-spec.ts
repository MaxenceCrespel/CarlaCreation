import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './test-utils';

// This suite checks a date far in the future that no other integration
// spec touches (they each use their own offsets — see reservations.e2e-spec.ts)
// so the "closed by default" assertion below can't be broken by test order.
const UNTOUCHED_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 300);
  return d.toISOString().slice(0, 10);
})();

// The built React app (client/dist) itself — SPA fallback routing for pages
// like /services, /booking, /admin — is exercised by the Cypress E2E suite
// against the real docker-compose-booted server (client/cypress/e2e), not
// here: @nestjs/serve-static's static/fallback middleware doesn't reliably
// engage under Test.createTestingModule()'s in-memory app (no .listen()),
// and re-testing static file serving isn't really "API integration" scope
// anyway.
describe('Public pages & read-only API', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /healthz reports ok', async () => {
    const res = await request(app.getHttpServer()).get('/healthz').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /api/services returns the seeded list', async () => {
    const res = await request(app.getHttpServer()).get('/api/services').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('GET /api/gallery returns a list', async () => {
    const res = await request(app.getHttpServer()).get('/api/gallery').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/site-config returns branding', async () => {
    const res = await request(app.getHttpServer()).get('/api/site-config').expect(200);
    expect(res.body.siteName).toBeTruthy();
  });

  it('a date nobody has opened is closed by default', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/reservations/availability?date=${UNTOUCHED_DATE}&serviceIds=1`)
      .expect(200);
    expect(res.body.slots).toEqual([]);
  });
});
