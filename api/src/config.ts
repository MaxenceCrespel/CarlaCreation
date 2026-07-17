import 'dotenv/config';

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

const PORT = Number(process.env.PORT) || 3000;
if (!Number.isInteger(PORT) || PORT <= 0) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // eslint-disable-next-line no-console
  console.error('FATAL: JWT_SECRET is not set. Copy api/.env.example to api/.env and fill it in.');
  process.exit(1);
}
if (isProd && JWT_SECRET.length < 32) {
  // eslint-disable-next-line no-console
  console.error('FATAL: JWT_SECRET is too short for production (32+ characters required). Generate one with: openssl rand -hex 64');
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.error('FATAL: DATABASE_URL is not set. Copy api/.env.example to api/.env and fill it in (Postgres connection string).');
  process.exit(1);
}

const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || `http://localhost:${PORT}`;

// Whether session/CSRF cookies get the `Secure` flag. Deliberately separate
// from NODE_ENV: NODE_ENV controls app behaviour (logging, secret-strength
// checks), while COOKIE_SECURE must match whether TLS is actually
// terminated in front of this process right now. Running in a container
// with NODE_ENV=production but browsing over plain http://localhost is a
// common case where these two need to disagree.
const COOKIE_SECURE = process.env.COOKIE_SECURE !== undefined ? process.env.COOKIE_SECURE === 'true' : isProd;

if (isProd && PUBLIC_ORIGIN.startsWith('http://') && COOKIE_SECURE) {
  // eslint-disable-next-line no-console
  console.warn(
    'WARNING: PUBLIC_ORIGIN uses http:// but COOKIE_SECURE is true — the browser will refuse to store the ' +
      'session/CSRF cookies and login will appear to do nothing. If there is no HTTPS in front of this server ' +
      '(e.g. testing a Docker container locally), set COOKIE_SECURE=false in your .env.',
  );
}

// SMTP is entirely optional. If SMTP_HOST is unset, MailService logs emails
// to the console instead of sending them — the app (and booking flow) works
// fully without any mail server configured; this just gets turned on later.
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || `"Carla Création" <no-reply@carlacreation.example>`;
const MAIL_ENABLED = Boolean(SMTP_HOST);

export const config = {
  NODE_ENV,
  isProd,
  PORT,
  JWT_SECRET: JWT_SECRET as string,
  DATABASE_URL: DATABASE_URL as string,
  PUBLIC_ORIGIN,
  COOKIE_SECURE,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
  MAIL_ENABLED,
};
