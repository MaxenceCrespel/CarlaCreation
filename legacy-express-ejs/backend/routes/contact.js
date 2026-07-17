const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { verifyCsrfToken } = require('../middleware/csrf');

const router = express.Router();

router.post(
  '/',
  verifyCsrfToken,
  [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Nom invalide.'),
    body('email').trim().isEmail().withMessage('Email invalide.').normalizeEmail(),
    body('message').trim().isLength({ min: 5, max: 2000 }).withMessage('Message trop court.'),
    // Honeypot field: must stay empty. Bots that auto-fill every field get silently rejected.
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

    const { name, email, message } = req.body;
    db.prepare('INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)').run(
      name,
      email,
      message
    );
    res.status(201).json({ success: true });
  }
);

module.exports = router;
