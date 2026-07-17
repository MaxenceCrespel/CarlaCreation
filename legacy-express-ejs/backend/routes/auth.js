const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { COOKIE_SECURE } = require('../config');
const { verifyCsrfToken } = require('../middleware/csrf');
const { requireAdmin, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// Strict rate limiting on login to slow down credential brute-forcing.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
});

router.post(
  '/login',
  loginLimiter,
  verifyCsrfToken,
  [
    body('username').trim().isLength({ min: 1, max: 100 }),
    body('password').isLength({ min: 1, max: 200 }),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Identifiants invalides.' });
    }

    const { username, password } = req.body;
    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);

    // Always run bcrypt.compare (even against a dummy hash) to avoid timing
    // leaks that would reveal whether a username exists.
    const hash = admin ? admin.password_hash : '$2a$12$invalidsaltinvalidsaltinuseonly000000000000000000000';
    const valid = bcrypt.compareSync(password, hash);

    if (!admin || !valid) {
      return res.status(401).json({ error: 'Identifiants invalides.' });
    }

    const token = jwt.sign({ sub: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '8h' });

    res.cookie('admin_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: COOKIE_SECURE,
      maxAge: 8 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({ success: true, username: admin.username });
  }
);

router.post('/logout', verifyCsrfToken, (req, res) => {
  res.clearCookie('admin_session', { path: '/' });
  res.json({ success: true });
});

router.get('/me', requireAdmin, (req, res) => {
  res.json({ username: req.admin.username });
});

module.exports = router;
