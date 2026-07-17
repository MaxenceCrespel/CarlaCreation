#!/usr/bin/env node
// End-to-end smoke test against a running instance. Verifies the public
// pages render, the booking flow works (including double-booking rejection
// and CSRF enforcement), and admin routes are properly gated — the same
// checks that were run by hand while building this app, now repeatable.
//
// Usage: BASE_URL=http://localhost:3000 node scripts/smoketest.js

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

let pass = 0;
let fail = 0;

function ok(label, condition, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    console.error(`  ✗ ${label} ${detail}`);
  }
}

function getCookie(jar, name) {
  const entry = jar.find((c) => c.startsWith(`${name}=`));
  if (!entry) return null;
  return entry.split(';')[0].split('=')[1];
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }
  store(res) {
    const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    setCookie.forEach((c) => {
      const [pair] = c.split(';');
      const [name, value] = pair.split('=');
      this.cookies.set(name, value);
    });
  }
  header() {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
  get(name) {
    return this.cookies.get(name);
  }
}

async function request(jar, path, options = {}) {
  const headers = Object.assign({}, options.headers, { Cookie: jar.header() });
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers, redirect: 'manual' });
  jar.store(res);
  let body = null;
  try {
    body = await res.clone().json();
  } catch (_) {
    // non-JSON response, fine for page routes
  }
  return { res, body };
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
    ok('GET /healthz -> ok', res.status === 200 && body && body.status === 'ok');
  }
  {
    const { res, body } = await request(jar, '/api/services');
    ok('GET /api/services returns a list', res.status === 200 && Array.isArray(body) && body.length > 0);
  }
  {
    const { res, body } = await request(jar, '/api/gallery');
    ok('GET /api/gallery returns a list', res.status === 200 && Array.isArray(body));
  }

  console.log('\nCSRF & booking flow:');
  await request(jar, '/api/csrf-token');
  const token = jar.get('csrf_token');
  ok('CSRF token issued', Boolean(token));

  {
    // Without the CSRF header, a state-changing request must be rejected.
    const { res } = await request(jar, '/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', email: 'test@example.com', message: 'hello there', website: '' }),
    });
    ok('POST without CSRF header -> 403', res.status === 403, `(got ${res.status})`);
  }

  let bookingDate = null;
  let bookingSlot = null;
  {
    // Find the next open day within two weeks to book a real slot.
    for (let i = 1; i <= 14 && !bookingSlot; i += 1) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const { body } = await request(jar, `/api/reservations/availability?date=${dateStr}&serviceId=1`);
      if (body && body.slots && body.slots.length) {
        bookingDate = dateStr;
        [bookingSlot] = body.slots;
      }
    }
    ok('Found an available booking slot within 14 days', Boolean(bookingSlot));
  }

  if (bookingSlot) {
    const payload = {
      serviceId: 1,
      date: bookingDate,
      startTime: bookingSlot,
      clientName: 'Smoke Test',
      clientEmail: 'smoketest@example.com',
      clientPhone: '0600000000',
      notes: '',
      website: '',
    };
    const { res: res1 } = await request(jar, '/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
      body: JSON.stringify(payload),
    });
    ok('POST /api/reservations -> 201', res1.status === 201, `(got ${res1.status})`);

    const { res: res2 } = await request(jar, '/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
      body: JSON.stringify(payload),
    });
    ok('Double-booking the same slot -> 409', res2.status === 409, `(got ${res2.status})`);
  }

  console.log('\nAdmin access control:');
  {
    const { res } = await request(jar, '/api/reservations');
    ok('GET /api/reservations without session -> 401', res.status === 401, `(got ${res.status})`);
  }
  {
    const { res } = await request(jar, '/api/admin/gallery');
    ok('GET /api/admin/gallery without session -> 401', res.status === 401, `(got ${res.status})`);
  }
  {
    const { res } = await request(jar, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
      body: JSON.stringify({ username: 'nonexistent-user', password: 'wrong-password' }),
    });
    ok('Login with bad credentials -> 401', res.status === 401, `(got ${res.status})`);
  }

  console.log(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
