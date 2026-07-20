import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, getCsrfToken, loginAsAdmin } from './test-utils';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const describeIfAdmin = ADMIN_PASSWORD ? describe : describe.skip;

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Each scenario below gets its own reserved date offset so the file can run
// standalone or alongside the other integration specs without colliding —
// same convention scripts/smoketest.ts already uses.
const DAY_CYCLE_DATE = dateOffset(105);
const MULTI_RANGE_DATE = dateOffset(106);
const MANUAL_RESERVATION_DATE = dateOffset(107);
const GROUP_BOOKING_DATE = dateOffset(108);
const TRAVEL_BUFFER_DATE = dateOffset(109);

describeIfAdmin('Reservations (day-by-day hours, multi-range, manual, group)', () => {
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    app = await createTestApp();
    agent = request.agent(app.getHttpServer());
    await loginAsAdmin(agent, ADMIN_USERNAME, ADMIN_PASSWORD);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Open a day, book it, double-booking is rejected, reset closes it again', () => {
    it('has no slots before the day is opened', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/reservations/availability?date=${DAY_CYCLE_DATE}&serviceIds=1`)
        .expect(200);
      expect(res.body.slots).toEqual([]);
    });

    it('admin opens the day', async () => {
      const token = await getCsrfToken(agent);
      await agent
        .put(`/api/admin/settings/daily-hours/${DAY_CYCLE_DATE}`)
        .set('x-csrf-token', token)
        .send({ isClosed: false, ranges: [{ openTime: '10:00', closeTime: '16:00' }] })
        .expect(200);
    });

    it('now has available slots', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/reservations/availability?date=${DAY_CYCLE_DATE}&serviceIds=1`)
        .expect(200);
      expect(res.body.slots.length).toBeGreaterThan(0);
    });

    let bookedSlot: string;
    it('books the first available slot', async () => {
      const availability = await request(app.getHttpServer())
        .get(`/api/reservations/availability?date=${DAY_CYCLE_DATE}&serviceIds=1`)
        .expect(200);
      bookedSlot = availability.body.slots[0];

      const token = await getCsrfToken(agent);
      const res = await agent
        .post('/api/reservations')
        .set('x-csrf-token', token)
        .send({
          serviceId: 1,
          date: DAY_CYCLE_DATE,
          startTime: bookedSlot,
          clientName: 'Integration Test',
          clientEmail: 'integration@example.com',
          clientPhone: '0600000000',
        })
        .expect(201);
      expect(res.body.reservation.guests).toHaveLength(1);
    });

    it('rejects a double-booking of the same slot', async () => {
      const token = await getCsrfToken(agent);
      await agent
        .post('/api/reservations')
        .set('x-csrf-token', token)
        .send({
          serviceId: 1,
          date: DAY_CYCLE_DATE,
          startTime: bookedSlot,
          clientName: 'Someone Else',
          clientEmail: 'other@example.com',
          clientPhone: '0600000001',
        })
        .expect(409);
    });

    it('admin resets the day back to closed', async () => {
      const token = await getCsrfToken(agent);
      await agent.delete(`/api/admin/settings/daily-hours/${DAY_CYCLE_DATE}`).set('x-csrf-token', token).expect(200);

      const res = await request(app.getHttpServer())
        .get(`/api/reservations/availability?date=${DAY_CYCLE_DATE}&serviceIds=1`)
        .expect(200);
      expect(res.body.slots).toEqual([]);
    });
  });

  describe('Multiple ranges per day (lunch break)', () => {
    it('opens the day with a morning and an afternoon range', async () => {
      const token = await getCsrfToken(agent);
      await agent
        .put(`/api/admin/settings/daily-hours/${MULTI_RANGE_DATE}`)
        .set('x-csrf-token', token)
        .send({
          isClosed: false,
          ranges: [
            { openTime: '10:00', closeTime: '11:00' },
            { openTime: '16:00', closeTime: '19:00' },
          ],
        })
        .expect(200);
    });

    it('rejects overlapping ranges', async () => {
      const token = await getCsrfToken(agent);
      await agent
        .put(`/api/admin/settings/daily-hours/${MULTI_RANGE_DATE}`)
        .set('x-csrf-token', token)
        .send({
          isClosed: false,
          ranges: [
            { openTime: '10:00', closeTime: '14:00' },
            { openTime: '13:00', closeTime: '19:00' },
          ],
        })
        .expect(400);
    });

    it('a service too long for the morning range only appears in the afternoon', async () => {
      // service id 4 = Balayage, 120 minutes — doesn't fit the 60-minute morning range.
      const res = await request(app.getHttpServer())
        .get(`/api/reservations/availability?date=${MULTI_RANGE_DATE}&serviceIds=4`)
        .expect(200);
      expect(res.body.slots.every((s: string) => s >= '16:00')).toBe(true);
      expect(res.body.slots.length).toBeGreaterThan(0);
    });
  });

  describe('Admin manual reservation + refusal', () => {
    it('creates a manual reservation on an unopened day', async () => {
      const token = await getCsrfToken(agent);
      const res = await agent
        .post('/api/reservations/manual')
        .set('x-csrf-token', token)
        .send({
          serviceId: 1,
          date: MANUAL_RESERVATION_DATE,
          startTime: '09:00',
          clientName: 'Walk In',
          clientEmail: 'walkin@example.com',
          clientPhone: '0600000002',
          notes: 'Integration test walk-in',
        })
        .expect(201);
      expect(res.body.reservation.groupId).toBeTruthy();
    });

    it('rejects an overlapping manual reservation', async () => {
      const token = await getCsrfToken(agent);
      await agent
        .post('/api/reservations/manual')
        .set('x-csrf-token', token)
        .send({
          serviceId: 1,
          date: MANUAL_RESERVATION_DATE,
          startTime: '09:15',
          clientName: 'Overlap',
          clientEmail: 'overlap@example.com',
          clientPhone: '0600000003',
        })
        .expect(409);
    });
  });

  describe('Multi-guest booking (mother + daughter)', () => {
    let groupId: string;

    it('opens the day for the group booking', async () => {
      const token = await getCsrfToken(agent);
      await agent
        .put(`/api/admin/settings/daily-hours/${GROUP_BOOKING_DATE}`)
        .set('x-csrf-token', token)
        .send({ isClosed: false, ranges: [{ openTime: '09:00', closeTime: '18:00' }] })
        .expect(200);
    });

    it('books two guests back-to-back in one request', async () => {
      const token = await getCsrfToken(agent);
      const res = await agent
        .post('/api/reservations')
        .set('x-csrf-token', token)
        .send({
          serviceId: 1,
          clientName: 'Mother',
          clientEmail: 'mother@example.com',
          clientPhone: '0600000010',
          date: GROUP_BOOKING_DATE,
          startTime: '09:00',
          additionalGuests: [{ name: 'Daughter', serviceId: 7 }],
        })
        .expect(201);

      expect(res.body.reservation.guests).toHaveLength(2);
      expect(res.body.reservation.guests[0].endTime).toBe(res.body.reservation.guests[1].startTime);
      groupId = res.body.reservation.groupId;
    });

    it('bulk-confirms the whole group', async () => {
      const token = await getCsrfToken(agent);
      await agent.patch(`/api/reservations/group/${groupId}/status`).set('x-csrf-token', token).send({ status: 'confirmed' }).expect(200);
    });

    it('bulk-deletes the whole group', async () => {
      const token = await getCsrfToken(agent);
      await agent.delete(`/api/reservations/group/${groupId}`).set('x-csrf-token', token).expect(200);
    });
  });

  // Regression coverage for a real bug: `?atClientHome=...` arrives as a
  // query STRING, and NestJS's global ValidationPipe (enableImplicitConversion)
  // coerces any non-empty string — including the literal "false" — to
  // boolean `true` before a naive `@Transform` can tell the difference. A
  // unit test on the service layer alone (already-parsed booleans) can't
  // catch this; it only shows up over real HTTP with real query strings.
  describe('À-domicile travel buffer (query string parsing + day-boundary clipping)', () => {
    it('opens a 09:00–19:00 day', async () => {
      const token = await getCsrfToken(agent);
      await agent
        .put(`/api/admin/settings/daily-hours/${TRAVEL_BUFFER_DATE}`)
        .set('x-csrf-token', token)
        .send({ isClosed: false, ranges: [{ openTime: '09:00', closeTime: '19:00' }] })
        .expect(200);
    });

    it('atClientHome=true blocks the first 30 minutes of the day (travel buffer default is 30min)', async () => {
      // service id 7 = Manucure Classique, 30 minutes.
      const res = await request(app.getHttpServer())
        .get(`/api/reservations/availability?date=${TRAVEL_BUFFER_DATE}&serviceIds=7&atClientHome=true`)
        .expect(200);
      expect(res.body.slots).not.toContain('09:00');
      expect(res.body.slots).not.toContain('09:15');
      expect(res.body.slots).toContain('09:30');
    });

    it('atClientHome=false (explicit string) still allows 09:00 — the exact bug that was found', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/reservations/availability?date=${TRAVEL_BUFFER_DATE}&serviceIds=7&atClientHome=false`)
        .expect(200);
      expect(res.body.slots).toContain('09:00');
    });

    it('omitting atClientHome defaults to studio (09:00 available)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/reservations/availability?date=${TRAVEL_BUFFER_DATE}&serviceIds=7`)
        .expect(200);
      expect(res.body.slots).toContain('09:00');
    });

    it('a confirmed home visit is rejected without an address', async () => {
      const token = await getCsrfToken(agent);
      await agent
        .post('/api/reservations/manual')
        .set('x-csrf-token', token)
        .send({
          serviceId: 7,
          date: TRAVEL_BUFFER_DATE,
          startTime: '11:00',
          clientName: 'No Address',
          clientEmail: 'noaddress@example.com',
          clientPhone: '0600000020',
          status: 'confirmed',
          atClientHome: true,
        })
        .expect(400);
    });

    it('books a home visit with an address, and it shows up with its location on the public/admin lookups', async () => {
      const token = await getCsrfToken(agent);
      const res = await agent
        .post('/api/reservations/manual')
        .set('x-csrf-token', token)
        .send({
          serviceId: 7,
          date: TRAVEL_BUFFER_DATE,
          startTime: '11:00',
          clientName: 'Home Visit',
          clientEmail: 'homevisit@example.com',
          clientPhone: '0600000021',
          status: 'confirmed',
          atClientHome: true,
          clientAddress: '5 rue de Test, 59000 Lille',
        })
        .expect(201);
      expect(res.body.reservation.atClientHome).toBe(true);
      expect(res.body.reservation.clientAddress).toBe('5 rue de Test, 59000 Lille');

      const lookup = await request(app.getHttpServer())
        .get(`/api/reservations/lookup/${res.body.reservation.groupId}`)
        .expect(200);
      expect(lookup.body.atClientHome).toBe(true);
      expect(lookup.body.clientAddress).toBe('5 rue de Test, 59000 Lille');
    });
  });
});
