const express = require('express');
const { body, param, validationResult } = require('express-validator');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { verifyCsrfToken } = require('../middleware/csrf');
const { isValidDateString } = require('../utils/slots');

const router = express.Router();

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

router.use(requireAdmin);

// --- Weekly opening hours ---

router.get('/opening-hours', (req, res) => {
  const rows = db.prepare('SELECT day_of_week, is_closed, open_time, close_time FROM opening_hours ORDER BY day_of_week').all();
  res.json(rows);
});

router.put(
  '/opening-hours/:day',
  verifyCsrfToken,
  [
    param('day').isInt({ min: 0, max: 6 }),
    body('isClosed').isBoolean().withMessage('Valeur invalide.'),
    body('openTime').optional({ nullable: true }).custom((v) => v === null || TIME_RE.test(v)).withMessage('Heure d\'ouverture invalide.'),
    body('closeTime').optional({ nullable: true }).custom((v) => v === null || TIME_RE.test(v)).withMessage('Heure de fermeture invalide.'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const day = Number(req.params.day);
    const isClosed = Boolean(req.body.isClosed);
    const openTime = isClosed ? null : req.body.openTime || null;
    const closeTime = isClosed ? null : req.body.closeTime || null;

    if (!isClosed) {
      if (!openTime || !closeTime) {
        return res.status(400).json({ error: 'Heures d\'ouverture et de fermeture requises.' });
      }
      if (openTime >= closeTime) {
        return res.status(400).json({ error: "L'heure de fermeture doit être après l'heure d'ouverture." });
      }
    }

    db.prepare('UPDATE opening_hours SET is_closed = ?, open_time = ?, close_time = ? WHERE day_of_week = ?').run(
      isClosed ? 1 : 0,
      openTime,
      closeTime,
      day
    );
    res.json({ success: true });
  }
);

// --- Blackout dates (holidays, exceptional closures) ---

router.get('/blackout-dates', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const rows = db.prepare('SELECT date, reason FROM blackout_dates WHERE date >= ? ORDER BY date').all(today);
  res.json(rows);
});

router.post(
  '/blackout-dates',
  verifyCsrfToken,
  [
    body('date').custom((v) => isValidDateString(v)).withMessage('Date invalide.'),
    body('reason').optional({ checkFalsy: true }).trim().isLength({ max: 200 }).withMessage('Motif trop long.'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }
    try {
      db.prepare('INSERT INTO blackout_dates (date, reason) VALUES (?, ?)').run(req.body.date, req.body.reason || '');
      res.status(201).json({ success: true });
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
        return res.status(409).json({ error: 'Cette date est déjà fermée.' });
      }
      throw err;
    }
  }
);

router.delete('/blackout-dates/:date', verifyCsrfToken, [param('date').custom((v) => isValidDateString(v))], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Date invalide.' });
  }
  const result = db.prepare('DELETE FROM blackout_dates WHERE date = ?').run(req.params.date);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Date introuvable.' });
  }
  res.json({ success: true });
});

module.exports = router;
