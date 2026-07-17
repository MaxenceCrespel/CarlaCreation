const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const db = require('../db');
const { getAvailableSlots, isValidDateString, toMinutes, toHHMM } = require('../utils/slots');
const { verifyCsrfToken } = require('../middleware/csrf');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/reservations/availability?date=YYYY-MM-DD&serviceId=1
router.get(
  '/availability',
  [
    query('date').custom((v) => isValidDateString(v)).withMessage('Date invalide.'),
    query('serviceId').isInt({ min: 1 }).withMessage('Service invalide.'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { date } = req.query;
    const serviceId = Number(req.query.serviceId);
    const service = db.prepare('SELECT id, duration_minutes FROM services WHERE id = ? AND active = 1').get(serviceId);
    if (!service) {
      return res.status(404).json({ error: 'Service introuvable.' });
    }

    const slots = getAvailableSlots(db, date, service.duration_minutes);
    res.json({ date, serviceId, slots });
  }
);

// POST /api/reservations — public booking creation
router.post(
  '/',
  verifyCsrfToken,
  [
    body('serviceId').isInt({ min: 1 }).withMessage('Service invalide.'),
    body('clientName').trim().isLength({ min: 2, max: 100 }).withMessage('Nom invalide.'),
    body('clientEmail').trim().isEmail().withMessage('Email invalide.').normalizeEmail(),
    body('clientPhone')
      .trim()
      .matches(/^[0-9+\s().-]{6,20}$/)
      .withMessage('Numéro de téléphone invalide.'),
    body('date').custom((v) => isValidDateString(v)).withMessage('Date invalide.'),
    body('startTime')
      .matches(/^([01]\d|2[0-3]):[0-5]\d$/)
      .withMessage('Heure invalide.'),
    body('notes').optional({ checkFalsy: true }).trim().isLength({ max: 500 }).withMessage('Note trop longue.'),
    // Honeypot
    body('website').custom((value) => {
      if (value) throw new Error('Requête invalide.');
      return true;
    }),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const serviceId = Number(req.body.serviceId);
    const service = db.prepare('SELECT id, duration_minutes FROM services WHERE id = ? AND active = 1').get(serviceId);
    if (!service) {
      return res.status(404).json({ error: 'Service introuvable.' });
    }

    const { date, startTime, clientName, clientEmail, clientPhone } = req.body;
    const notes = req.body.notes || '';

    // Re-validate the slot is still free server-side (avoid race / tampering).
    const available = getAvailableSlots(db, date, service.duration_minutes);
    if (!available.includes(startTime)) {
      return res.status(409).json({ error: "Ce créneau n'est plus disponible. Merci d'en choisir un autre." });
    }

    const endTime = toHHMM(toMinutes(startTime) + service.duration_minutes);

    const result = db
      .prepare(
        `INSERT INTO reservations
          (service_id, client_name, client_email, client_phone, reservation_date, start_time, end_time, notes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
      )
      .run(serviceId, clientName, clientEmail, clientPhone, date, startTime, endTime, notes);

    res.status(201).json({
      success: true,
      reservation: {
        id: result.lastInsertRowid,
        date,
        startTime,
        endTime,
      },
    });
  }
);

// --- Admin-only routes below ---

router.get('/', requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.id, r.client_name, r.client_email, r.client_phone, r.reservation_date,
              r.start_time, r.end_time, r.notes, r.status, r.created_at,
              s.name AS service_name
       FROM reservations r
       JOIN services s ON s.id = r.service_id
       ORDER BY r.reservation_date DESC, r.start_time DESC`
    )
    .all();
  res.json(rows);
});

router.patch(
  '/:id/status',
  requireAdmin,
  verifyCsrfToken,
  [
    param('id').isInt({ min: 1 }),
    body('status').isIn(['pending', 'confirmed', 'cancelled', 'completed']),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Requête invalide.' });
    }
    const { id } = req.params;
    const { status } = req.body;
    const result = db.prepare('UPDATE reservations SET status = ? WHERE id = ?').run(status, id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Réservation introuvable.' });
    }
    res.json({ success: true });
  }
);

router.delete('/:id', requireAdmin, verifyCsrfToken, [param('id').isInt({ min: 1 })], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Requête invalide.' });
  }
  const result = db.prepare('DELETE FROM reservations WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Réservation introuvable.' });
  }
  res.json({ success: true });
});

module.exports = router;
