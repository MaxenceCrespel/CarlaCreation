import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, getCsrfToken } from './test-utils';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

describe('CSRF & admin auth', () => {
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    app = await createTestApp();
    agent = request.agent(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  it('issues a CSRF cookie on first contact', async () => {
    const token = await getCsrfToken(agent);
    expect(token).toBeTruthy();
  });

  it('rejects a state-changing request without the CSRF header', async () => {
    await agent
      .post('/api/contact')
      .send({ name: 'Test', email: 'test@example.com', message: 'hello there' })
      .expect(403);
  });

  it('rejects login with bad credentials', async () => {
    const token = await getCsrfToken(agent);
    await agent.post('/api/auth/login').set('x-csrf-token', token).send({ username: 'nobody', password: 'wrong' }).expect(401);
  });

  it.each(['/api/reservations', '/api/admin/gallery', '/api/admin/services', '/api/admin/reviews'])(
    'GET %s without a session -> 401',
    async (path) => {
      await request(app.getHttpServer()).get(path).expect(401);
    },
  );

  (ADMIN_PASSWORD ? it : it.skip)('logs the admin in with valid credentials', async () => {
    const token = await getCsrfToken(agent);
    const res = await agent
      .post('/api/auth/login')
      .set('x-csrf-token', token)
      .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD })
      .expect(200);
    expect(res.body.username).toBe(ADMIN_USERNAME);

    await agent.get('/api/admin/services').expect(200);
  });
});
