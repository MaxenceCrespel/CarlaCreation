import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, getCsrfToken, loginAsAdmin } from './test-utils';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const describeIfAdmin = ADMIN_PASSWORD ? describe : describe.skip;

describe('Reviews (public submission -> pending -> admin moderation -> public average)', () => {
  let app: INestApplication;
  let publicAgent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    app = await createTestApp();
    publicAgent = request.agent(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the seeded approved reviews with a non-null average', async () => {
    const res = await request(app.getHttpServer()).get('/api/reviews').expect(200);
    expect(res.body.count).toBeGreaterThanOrEqual(3);
    expect(res.body.average).not.toBeNull();
  });

  it('a newly submitted review is not publicly visible until approved', async () => {
    const token = await getCsrfToken(publicAgent);
    await publicAgent
      .post('/api/reviews')
      .set('x-csrf-token', token)
      .send({ clientName: 'Integration Reviewer', rating: 4, comment: 'Un test bien pratique, personnel sympathique.' })
      .expect(201);

    const res = await request(app.getHttpServer()).get('/api/reviews').expect(200);
    expect(res.body.reviews.some((r: { clientName: string }) => r.clientName === 'Integration Reviewer')).toBe(false);
  });

  describeIfAdmin('admin moderation', () => {
    let adminAgent: ReturnType<typeof request.agent>;
    let reviewId: number;

    beforeAll(async () => {
      adminAgent = request.agent(app.getHttpServer());
      await loginAsAdmin(adminAgent, ADMIN_USERNAME, ADMIN_PASSWORD);
    });

    it('is rejected without a session', async () => {
      await request(app.getHttpServer()).get('/api/admin/reviews').expect(401);
    });

    it('shows the pending review to the admin', async () => {
      const res = await adminAgent.get('/api/admin/reviews').expect(200);
      const pending = res.body.find((r: { clientName: string }) => r.clientName === 'Integration Reviewer');
      expect(pending).toBeTruthy();
      expect(pending.status).toBe('pending');
      reviewId = pending.id;
    });

    it('approves the review, which then appears publicly', async () => {
      const token = await getCsrfToken(adminAgent);
      await adminAgent.patch(`/api/admin/reviews/${reviewId}/status`).set('x-csrf-token', token).send({ status: 'approved' }).expect(200);

      const res = await request(app.getHttpServer()).get('/api/reviews').expect(200);
      expect(res.body.reviews.some((r: { clientName: string }) => r.clientName === 'Integration Reviewer')).toBe(true);
    });

    it('deletes the review', async () => {
      const token = await getCsrfToken(adminAgent);
      await adminAgent.delete(`/api/admin/reviews/${reviewId}`).set('x-csrf-token', token).expect(200);
    });
  });
});
