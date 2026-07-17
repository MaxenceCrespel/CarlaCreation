require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

const PORT = Number(process.env.PORT) || 3000;
if (!Number.isInteger(PORT) || PORT <= 0) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Copy backend/.env.example to backend/.env and fill it in.');
  process.exit(1);
}
if (isProd && JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET is too short for production (32+ characters required). Generate one with: openssl rand -hex 64');
  process.exit(1);
}

const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || `http://localhost:${PORT}`;

// Whether session/CSRF cookies get the `Secure` flag (browsers refuse to
// store a Secure cookie unless the page was loaded over HTTPS). This
// defaults to `isProd`, but is deliberately a separate setting: NODE_ENV
// controls app behaviour (logging, error verbosity, secret-strength
// checks), while COOKIE_SECURE must match whether TLS is actually
// terminated in front of this process right now. Running `docker compose`
// with NODE_ENV=production but browsing over plain http://localhost is a
// common case where these two need to disagree — set COOKIE_SECURE=false
// explicitly for that, otherwise login will silently fail (the browser
// drops the cookie instead of erroring).
const COOKIE_SECURE = process.env.COOKIE_SECURE !== undefined ? process.env.COOKIE_SECURE === 'true' : isProd;

if (isProd && PUBLIC_ORIGIN.startsWith('http://') && COOKIE_SECURE) {
  console.warn(
    'WARNING: PUBLIC_ORIGIN uses http:// but COOKIE_SECURE is true — the browser will refuse to store the ' +
      'session/CSRF cookies and login will appear to do nothing. If there is no HTTPS in front of this server ' +
      '(e.g. testing a Docker container locally), set COOKIE_SECURE=false in your .env.'
  );
}

module.exports = {
  NODE_ENV,
  isProd,
  PORT,
  JWT_SECRET,
  PUBLIC_ORIGIN,
  COOKIE_SECURE,
};
