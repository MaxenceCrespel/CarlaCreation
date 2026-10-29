import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, getCsrfToken, loginAsAdmin } from './test-utils';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const describeIfAdmin = ADMIN_PASSWORD ? describe : describe.skip;

// A 1×1 PNG, enough to go through multer's type check.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

describeIfAdmin('Messaging (client account <-> salon)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let clientAgent: ReturnType<typeof request.agent>;
  let otherAgent: ReturnType<typeof request.agent>;
  let adminAgent: ReturnType<typeof request.agent>;
  let clientId: number;
  let photoMessageId: number;
  const stamp = Date.now();

  async function createVerifiedClient(email: string, name: string): Promise<number> {
    const [row] = await dataSource.query(
      `INSERT INTO clients (name, first_name, last_name, normalized_name, email, phone, password_hash, email_verified_at)
       VALUES ($1, $2, $3, lower($1), $4, '0600000000', $5, now()) RETURNING id`,
      [name, name.split(' ')[0], name.split(' ')[1] ?? '', email, bcrypt.hashSync('Motdepasse123!', 4)],
    );
    return row.id;
  }

  async function loginClient(agent: ReturnType<typeof request.agent>, email: string) {
    const token = await getCsrfToken(agent);
    await agent.post('/api/client-auth/login').set('x-csrf-token', token).send({ email, password: 'Motdepasse123!' }).expect(200);
  }

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    clientId = await createVerifiedClient(`lea-${stamp}@exemple.fr`, 'Léa Testeuse');
    await createVerifiedClient(`autre-${stamp}@exemple.fr`, 'Autre Cliente');
    clientAgent = request.agent(app.getHttpServer());
    otherAgent = request.agent(app.getHttpServer());
    adminAgent = request.agent(app.getHttpServer());
    await loginClient(clientAgent, `lea-${stamp}@exemple.fr`);
    await loginClient(otherAgent, `autre-${stamp}@exemple.fr`);
    await loginAsAdmin(adminAgent, ADMIN_USERNAME, ADMIN_PASSWORD);
  });

  afterAll(async () => {
    await dataSource.query(`DELETE FROM clients WHERE email LIKE $1`, [`%-${stamp}@exemple.fr`]);
    await app.close();
  });

  it('requires a client session', async () => {
    await request(app.getHttpServer()).get('/api/client-messages').expect(401);
  });

  it('a client sends a text message and a photo; the admin sees one unread conversation', async () => {
    const token = await getCsrfToken(clientAgent);
    await clientAgent.post('/api/client-messages').set('x-csrf-token', token).field('body', 'Bonjour Carla !').expect(201);
    const photoRes = await clientAgent
      .post('/api/client-messages')
      .set('x-csrf-token', token)
      .attach('photo', PNG, { filename: 'inspi.png', contentType: 'image/png' })
      .expect(201);
    photoMessageId = photoRes.body.id;
    expect(photoRes.body.hasPhoto).toBe(true);

    const list = await adminAgent.get('/api/admin/conversations').expect(200);
    const conv = list.body.find((c: { clientId: number }) => c.clientId === clientId);
    expect(conv).toMatchObject({ name: 'Léa Testeuse', unread: 2, hasAccount: true, lastMessage: 'Photo' });
  });

  it('refuses an empty message', async () => {
    const token = await getCsrfToken(clientAgent);
    await clientAgent.post('/api/client-messages').set('x-csrf-token', token).field('body', '   ').expect(400);
  });

  it('photos are private: owner and admin only, never as a static file', async () => {
    await clientAgent.get(`/api/client-messages/photo/${photoMessageId}`).expect(200);
    await adminAgent.get(`/api/admin/conversations/photo/${photoMessageId}`).expect(200);
    await otherAgent.get(`/api/client-messages/photo/${photoMessageId}`).expect(404);
  });

  it('the admin reads and replies; the client sees the reply as unread, then reads it', async () => {
    const token = await getCsrfToken(adminAgent);
    await adminAgent.post(`/api/admin/conversations/${clientId}/read`).set('x-csrf-token', token).expect(200);
    await adminAgent.post(`/api/admin/conversations/${clientId}`).set('x-csrf-token', token).field('body', 'Avec plaisir !').expect(201);

    const conv = await adminAgent.get(`/api/admin/conversations/${clientId}`).expect(200);
    expect(conv.body.messages.map((m: { sender: string }) => m.sender)).toEqual(['client', 'client', 'admin']);
    expect(conv.body.messages[0].readAt).not.toBeNull();

    const unread = await clientAgent.get('/api/client-messages/unread-count').expect(200);
    expect(unread.body.count).toBe(1);
    const clientToken = await getCsrfToken(clientAgent);
    await clientAgent.post('/api/client-messages/read').set('x-csrf-token', clientToken).expect(200);
    const after = await clientAgent.get('/api/client-messages/unread-count').expect(200);
    expect(after.body.count).toBe(0);
  });

  it('another client never sees this conversation', async () => {
    const res = await otherAgent.get('/api/client-messages').expect(200);
    expect(res.body).toEqual([]);
  });

  it('the conversation is part of the client data export', async () => {
    const res = await clientAgent.get('/api/client-auth/me/export').expect(200);
    expect(res.body.messages).toHaveLength(3);
  });
});
