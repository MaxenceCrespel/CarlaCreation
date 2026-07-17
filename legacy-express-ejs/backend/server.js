const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const siteConfig = require('./siteConfig');
const db = require('./db');
const { issueCsrfToken } = require('./middleware/csrf');
const reservationsRouter = require('./routes/reservations');
const servicesRouter = require('./routes/services');
const galleryRouter = require('./routes/gallery');
const contactRouter = require('./routes/contact');
const authRouter = require('./routes/auth');
const adminGalleryRouter = require('./routes/adminGallery');
const adminSettingsRouter = require('./routes/adminSettings');
const hoursRouter = require('./routes/hours');

const app = express();

// Trust the first proxy hop (needed for correct client IPs / rate limiting
// behind a reverse proxy such as Nginx, Caddy, or a cloud load balancer).
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: config.isProd ? [] : null,
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  })
);
app.use(helmet.hsts({ maxAge: 63072000, includeSubDomains: true, preload: true }));

app.use(
  cors({
    origin: config.PUBLIC_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  })
);

app.use(morgan(config.isProd ? 'combined' : 'dev'));
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(cookieParser());

// Liveness/readiness probe for process managers, Docker, and load balancers.
// Deliberately unauthenticated and excluded from rate limiting.
app.get('/healthz', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok', uptime: process.uptime() });
  } catch (err) {
    res.status(503).json({ status: 'error' });
  }
});

// Global rate limit as a baseline defence against abuse/flooding.
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Tighter limit specifically on booking/contact creation to deter spam.
const writeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes. Merci de réessayer plus tard.' },
});
app.use('/api/reservations', (req, res, next) => (req.method === 'POST' ? writeLimiter(req, res, next) : next()));
app.use('/api/contact', writeLimiter);

app.use(issueCsrfToken);

app.get('/api/csrf-token', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/services', servicesRouter);
app.use('/api/gallery', galleryRouter);
app.use('/api/reservations', reservationsRouter);
app.use('/api/contact', contactRouter);
app.use('/api/auth', authRouter);
app.use('/api/admin/gallery', adminGalleryRouter);
app.use('/api/admin/settings', adminSettingsRouter);
app.use('/api/hours', hoursRouter);

// View engine for the server-rendered, multi-page public site.
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

function renderPage(view, activeKey, extra = {}) {
  return (req, res) => {
    res.render(view, { ...siteConfig, activeKey, ...extra });
  };
}

app.get('/', renderPage('index', 'home'));
app.get('/services', renderPage('services', 'services'));
app.get('/gallery', renderPage('gallery', 'gallery'));
app.get('/booking', renderPage('booking', 'booking'));
app.get('/contact', renderPage('contact', 'contact'));

// Static assets (css/js/images) and uploaded gallery photos.
const frontendDir = path.join(__dirname, '..', 'frontend');
const staticMaxAge = config.isProd ? '1d' : 0;
app.use(express.static(frontendDir, { maxAge: staticMaxAge }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: staticMaxAge }));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(frontendDir, 'admin.html'));
});

// 404 for unmatched API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Ressource introuvable.' });
});

app.use((req, res) => {
  res.status(404).render('404', { ...siteConfig, activeKey: null });
});

// Centralized error handler — never leak stack traces to clients.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur.' });
});

const server = app.listen(config.PORT, () => {
  console.log(`${siteConfig.siteName} website running at ${config.PUBLIC_ORIGIN} (env: ${config.NODE_ENV})`);
});

// Graceful shutdown: stop accepting new connections, let in-flight requests
// finish, close the DB handle cleanly, then exit. Matters for zero-downtime
// deploys and for process managers (Docker, PM2, systemd) that send SIGTERM.
function shutdown(signal) {
  console.log(`${signal} received, shutting down gracefully…`);
  server.close(() => {
    db.close();
    console.log('Shutdown complete.');
    process.exit(0);
  });
  // Force-exit if graceful shutdown hangs (e.g. a stuck connection).
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = server;
