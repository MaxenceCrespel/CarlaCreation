#!/usr/bin/env tsx
// End-to-end smoke test against a running instance. Verifies the public
// pages render, the day-by-day hours model (no day is bookable until the
// admin opens it), the booking flow (including double-booking rejection and
// CSRF enforcement), admin manual reservation creation + refusal, and that
// admin routes are properly gated.
//
// Usage: BASE_URL=http://localhost:3000 ADMIN_USERNAME=admin ADMIN_PASSWORD=... npm run smoketest

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

let pass = 0;
let fail = 0;

function ok(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    console.error(`  ✗ ${label} ${detail}`);
  }
}

class CookieJar {
  private cookies = new Map<string, string>();

  store(res: Response): void {
    const setCookie = (res.headers as any).getSetCookie ? (res.headers as any).getSetCookie() : [];
    setCookie.forEach((c: string) => {
      const [pair] = c.split(';');
      const [name, value] = pair.split('=');
      this.cookies.set(name, value);
    });
  }
  header(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
  get(name: string): string | undefined {
    return this.cookies.get(name);
  }
}

async function request(jar: CookieJar, path: string, options: RequestInit = {}) {
  const headers = Object.assign({}, options.headers as Record<string, string>, { Cookie: jar.header() });
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers, redirect: 'manual' });
  jar.store(res);
  let body: any = null;
  try {
    body = await res.clone().json();
  } catch (_) {
    // non-JSON response, fine for page routes
  }
  return { res, body };
}

async function authedRequest(jar: CookieJar, token: string, path: string, method: string, body?: unknown) {
  return request(jar, path, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function main() {
  console.log(`Smoke testing ${BASE_URL}\n`);
  const jar = new CookieJar();

  console.log('Public pages:');
  for (const p of ['/', '/services', '/gallery', '/booking', '/contact', '/admin']) {
    const { res } = await request(jar, p);
    ok(`GET ${p} -> 200`, res.status === 200, `(got ${res.status})`);
  }

  console.log('\nHealth & API:');
  {
    const { res, body } = await request(jar, '/healthz');
    ok('GET /healthz -> ok', res.status === 200 && body?.status === 'ok');
  }
  {
    const { res, body } = await request(jar, '/api/services');
    ok('GET /api/services returns a list', res.status === 200 && Array.isArray(body) && body.length > 0);
  }
  {
    const { res, body } = await request(jar, '/api/gallery');
    ok('GET /api/gallery returns a list', res.status === 200 && Array.isArray(body));
  }
  {
    const { res, body } = await request(jar, '/api/site-config');
    ok('GET /api/site-config returns branding', res.status === 200 && Boolean(body?.siteName));
  }
  {
    const { res, body } = await request(jar, '/api/hours');
    const allClosed = Array.isArray(body?.days) && body.days.every((d: any) => !d.isSet && d.isClosed);
    ok('GET /api/hours: every day closed until admin opens it', res.status === 200 && allClosed);
  }

  console.log('\nCSRF & admin auth:');
  await request(jar, '/api/csrf-token');
  const token = jar.get('csrf_token')!;
  ok('CSRF token issued', Boolean(token));

  {
    const { res } = await request(jar, '/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', email: 'test@example.com', message: 'hello there' }),
    });
    ok('POST without CSRF header -> 403', res.status === 403, `(got ${res.status})`);
  }
  {
    const { res } = await authedRequest(jar, token, '/api/auth/login', 'POST', {
      username: 'nonexistent-user',
      password: 'wrong-password',
    });
    ok('Login with bad credentials -> 401', res.status === 401, `(got ${res.status})`);
  }
  {
    const { res } = await request(jar, '/api/reservations');
    ok('GET /api/reservations without session -> 401', res.status === 401, `(got ${res.status})`);
  }
  {
    const { res } = await request(jar, '/api/admin/gallery');
    ok('GET /api/admin/gallery without session -> 401', res.status === 401, `(got ${res.status})`);
  }
  {
    const { res } = await request(jar, '/api/admin/services');
    ok('GET /api/admin/services without session -> 401', res.status === 401, `(got ${res.status})`);
  }

  if (!ADMIN_PASSWORD) {
    console.log('\nADMIN_PASSWORD not set — skipping admin-authenticated checks (hours, booking, manual reservations).');
    console.log(`\n${pass} passed, ${fail} failed.`);
    process.exit(fail > 0 ? 1 : 0);
  }

  const { res: loginRes } = await authedRequest(jar, token, '/api/auth/login', 'POST', {
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
  });
  ok('Admin login succeeds', loginRes.status === 200, `(got ${loginRes.status})`);

  console.log('\nDay-by-day hours (open → book → reset):');
  const d = new Date();
  d.setDate(d.getDate() + 5);
  const testDate = d.toISOString().slice(0, 10);

  {
    const { res, body } = await request(jar, `/api/reservations/availability?date=${testDate}&serviceIds=1`);
    ok('Unopened day has no slots', res.status === 200 && body?.slots?.length === 0);
  }
  {
    const { res } = await authedRequest(jar, token, `/api/admin/settings/daily-hours/${testDate}`, 'PUT', {
      isClosed: false,
      ranges: [{ openTime: '10:00', closeTime: '16:00' }],
    });
    ok('Admin opens a specific day', res.status === 200, `(got ${res.status})`);
  }

  let bookingSlot: string | null = null;
  {
    const { body } = await request(jar, `/api/reservations/availability?date=${testDate}&serviceIds=1`);
    bookingSlot = body?.slots?.[0] ?? null;
    ok('Opened day now has available slots', Boolean(bookingSlot));
  }

  if (bookingSlot) {
    const payload = {
      serviceId: 1,
      date: testDate,
      startTime: bookingSlot,
      clientName: 'Smoke Test',
      clientEmail: 'smoketest@example.com',
      clientPhone: '0600000000',
      notes: '',
    };
    const { res: res1 } = await authedRequest(jar, token, '/api/reservations', 'POST', payload);
    ok('POST /api/reservations -> 201', res1.status === 201, `(got ${res1.status})`);

    const { res: res2 } = await authedRequest(jar, token, '/api/reservations', 'POST', payload);
    ok('Double-booking the same slot -> 409', res2.status === 409, `(got ${res2.status})`);
  }

  {
    const { res } = await authedRequest(jar, token, `/api/admin/settings/daily-hours/${testDate}`, 'DELETE');
    ok('Admin resets the day back to closed', res.status === 200, `(got ${res.status})`);
  }
  {
    const { body } = await request(jar, `/api/reservations/availability?date=${testDate}&serviceIds=1`);
    ok('Day is closed again after reset', body?.slots?.length === 0);
  }

  console.log('\nMultiple ranges per day (lunch break):');
  const d4 = new Date();
  d4.setDate(d4.getDate() + 8);
  const lunchDate = d4.toISOString().slice(0, 10);

  {
    // Morning range deliberately short (1h): long enough for a 45-min
    // service (id 1) to get a couple of slots, too short for a 120-min one
    // (id 4, Balayage) to fit at all — proving it correctly skips to the
    // afternoon range instead of spilling into the gap.
    const { res } = await authedRequest(jar, token, `/api/admin/settings/daily-hours/${lunchDate}`, 'PUT', {
      isClosed: false,
      ranges: [
        { openTime: '10:00', closeTime: '11:00' },
        { openTime: '16:00', closeTime: '19:00' },
      ],
    });
    ok('Admin opens a day with two ranges (morning + afternoon)', res.status === 200, `(got ${res.status})`);
  }
  {
    const { res } = await authedRequest(jar, token, `/api/admin/settings/daily-hours/${lunchDate}`, 'PUT', {
      isClosed: false,
      ranges: [
        { openTime: '10:00', closeTime: '14:00' },
        { openTime: '13:00', closeTime: '19:00' },
      ],
    });
    ok('Overlapping ranges are rejected -> 400', res.status === 400, `(got ${res.status})`);
  }
  {
    // Restore the valid two-range schedule (the overlap attempt above must
    // not have been persisted).
    await authedRequest(jar, token, `/api/admin/settings/daily-hours/${lunchDate}`, 'PUT', {
      isClosed: false,
      ranges: [
        { openTime: '10:00', closeTime: '11:00' },
        { openTime: '16:00', closeTime: '19:00' },
      ],
    });
  }
  {
    // 45-minute service (service 1): should find slots in both ranges...
    const { body } = await request(jar, `/api/reservations/availability?date=${lunchDate}&serviceIds=1`);
    const slots: string[] = body?.slots ?? [];
    const hasMorning = slots.includes('10:00');
    const hasAfternoon = slots.includes('16:00');
    ok('45-min service gets slots in both the morning and afternoon ranges', hasMorning && hasAfternoon, `(got ${JSON.stringify(slots)})`);
  }
  {
    // ...but never inside the 11:00–16:00 gap, and never a slot that would
    // straddle across it (e.g. starting at 10:45 for a 45-min service would
    // end at 11:30, inside the gap — must not be offered).
    const { body } = await request(jar, `/api/reservations/availability?date=${lunchDate}&serviceIds=1`);
    const slots: string[] = body?.slots ?? [];
    const noneInGap = slots.every((s) => s < '11:00' || s >= '16:00');
    const noStraddling = !slots.includes('10:45') && !slots.includes('10:30');
    ok('No slot falls in, or straddles, the gap between ranges', noneInGap && noStraddling, `(got ${JSON.stringify(slots)})`);
  }
  {
    // A 120-min service (Balayage) can't fit in the 1h morning range at all
    // — it should only ever appear in the 3h afternoon range.
    const { body } = await request(jar, `/api/reservations/availability?date=${lunchDate}&serviceIds=4`);
    const slots: string[] = body?.slots ?? [];
    ok('A service too long for the morning range only appears in the afternoon', slots.length > 0 && slots.every((s) => s >= '16:00'), `(got ${JSON.stringify(slots)})`);
  }

  console.log('\nAdmin manual reservation + refusal:');
  const d2 = new Date();
  d2.setDate(d2.getDate() + 6);
  const manualDate = d2.toISOString().slice(0, 10);
  let manualId: number | null = null;

  {
    const { res, body } = await authedRequest(jar, token, '/api/reservations/manual', 'POST', {
      serviceId: 1,
      clientName: 'Walk In',
      clientEmail: 'walkin@example.com',
      clientPhone: '0600000001',
      date: manualDate,
      startTime: '08:00',
      notes: 'Smoke test walk-in',
    });
    ok('Admin creates a manual reservation on an unopened day', res.status === 201, `(got ${res.status})`);
    manualId = body?.reservation?.guests?.[0]?.id ?? null;
  }
  {
    const { res } = await authedRequest(jar, token, '/api/reservations/manual', 'POST', {
      serviceId: 1,
      clientName: 'Overlap',
      clientEmail: 'overlap@example.com',
      clientPhone: '0600000002',
      date: manualDate,
      startTime: '08:15',
    });
    ok('Overlapping manual reservation -> 409', res.status === 409, `(got ${res.status})`);
  }
  if (manualId) {
    const { res } = await authedRequest(jar, token, `/api/reservations/${manualId}/status`, 'PATCH', { status: 'refused' });
    ok('Admin refuses the reservation', res.status === 200, `(got ${res.status})`);

    const { res: res2 } = await authedRequest(jar, token, '/api/reservations/manual', 'POST', {
      serviceId: 1,
      clientName: 'Now Free',
      clientEmail: 'free@example.com',
      clientPhone: '0600000003',
      date: manualDate,
      startTime: '08:15',
    });
    ok('Refused reservation no longer blocks the slot', res2.status === 201, `(got ${res2.status})`);
  }

  console.log('\nMulti-guest booking (e.g. mother + daughter):');
  const d3 = new Date();
  d3.setDate(d3.getDate() + 7);
  const groupDate = d3.toISOString().slice(0, 10);
  let groupId: string | null = null;

  {
    const { res } = await authedRequest(jar, token, `/api/admin/settings/daily-hours/${groupDate}`, 'PUT', {
      isClosed: false,
      ranges: [{ openTime: '09:00', closeTime: '19:00' }],
    });
    ok('Admin opens the day for the group booking test', res.status === 200);
  }
  {
    const { body } = await request(jar, `/api/reservations/availability?date=${groupDate}&serviceIds=1,7`);
    ok('Combined-duration availability includes early slots', Boolean(body?.slots?.includes('09:00')));
  }
  {
    const { res, body } = await request(jar, `/api/reservations/next-available?serviceIds=1,7`);
    ok('Next-available-slot suggestion finds the opened day', res.status === 200 && body?.date === groupDate && body?.startTime === '09:00', `(got ${JSON.stringify(body)})`);
  }
  {
    const { res, body } = await request(jar, '/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
      body: JSON.stringify({
        serviceId: 1,
        clientName: 'Mother',
        clientEmail: 'mother@example.com',
        clientPhone: '0600000010',
        date: groupDate,
        startTime: '09:00',
        additionalGuests: [{ name: 'Daughter', serviceId: 7 }],
      }),
    });
    ok('Public group booking -> 201 with 2 guests', res.status === 201 && body?.reservation?.guests?.length === 2, `(got ${res.status})`);
    groupId = body?.reservation?.groupId ?? null;
  }
  if (groupId) {
    const { body } = await authedRequest(jar, token, '/api/reservations', 'GET');
    const groupRows = (Array.isArray(body) ? body : []).filter((r: any) => r.group_id === groupId);
    ok('Both guests share the same group_id and are back-to-back', groupRows.length === 2 && groupRows[0].end_time === groupRows[1].start_time);

    const { res: statusRes } = await authedRequest(jar, token, `/api/reservations/group/${groupId}/status`, 'PATCH', { status: 'confirmed' });
    ok('Bulk-confirm the whole group', statusRes.status === 200);

    const { res: delRes } = await authedRequest(jar, token, `/api/reservations/group/${groupId}`, 'DELETE');
    ok('Bulk-delete the whole group', delRes.status === 200);
  }

  console.log('\nReviews (public submission -> pending -> admin moderation -> public average):');
  {
    const { res, body } = await request(jar, '/api/reviews');
    ok('GET /api/reviews returns seeded approved reviews', res.status === 200 && body?.count >= 3 && body?.average !== null);
  }

  let reviewId: number | null = null;
  {
    const { res, body } = await request(jar, '/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
      body: JSON.stringify({ clientName: 'Smoke Reviewer', rating: 4, comment: 'Très bon accueil, personnel à l’écoute.' }),
    });
    ok('Public review submission -> 201', res.status === 201, `(got ${res.status})`);
  }
  {
    const { res, body } = await request(jar, '/api/reviews');
    ok('New review is NOT counted until approved', res.status === 200 && !body.reviews.some((r: any) => r.clientName === 'Smoke Reviewer'));
  }
  {
    // Use a fresh, unauthenticated jar here — `jar` already carries the admin
    // session cookie set up earlier in this script (needed for the checks
    // below), so it can't be reused to prove the route is guarded.
    const { res } = await request(new CookieJar(), '/api/admin/reviews');
    ok('GET /api/admin/reviews without session -> 401', res.status === 401, `(got ${res.status})`);
  }
  {
    const { res, body } = await authedRequest(jar, token, '/api/admin/reviews', 'GET');
    const pending = (Array.isArray(body) ? body : []).find((r: any) => r.clientName === 'Smoke Reviewer');
    ok('Admin sees the pending review', res.status === 200 && Boolean(pending) && pending.status === 'pending');
    reviewId = pending?.id ?? null;
  }
  if (reviewId) {
    const { res, body } = await authedRequest(jar, token, `/api/admin/reviews/${reviewId}/status`, 'PATCH', { status: 'approved' });
    ok('Admin approves the review', res.status === 200 && body?.status === 'approved');

    const { body: summary } = await request(jar, '/api/reviews');
    ok('Approved review now appears publicly', summary.reviews.some((r: any) => r.clientName === 'Smoke Reviewer'));

    const { res: delRes } = await authedRequest(jar, token, `/api/admin/reviews/${reviewId}`, 'DELETE');
    ok('Admin deletes the review', delRes.status === 200);
  }

  console.log(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
