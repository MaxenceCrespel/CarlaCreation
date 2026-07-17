const express = require('express');
const db = require('../db');

const router = express.Router();

// Public, read-only view of the weekly schedule and upcoming closures —
// used by the booking page to show hours before availability is fetched.
router.get('/', (req, res) => {
  const openingHours = db
    .prepare('SELECT day_of_week, is_closed, open_time, close_time FROM opening_hours ORDER BY day_of_week')
    .all();
  const today = new Date().toISOString().slice(0, 10);
  const blackoutDates = db
    .prepare('SELECT date, reason FROM blackout_dates WHERE date >= ? ORDER BY date')
    .all(today);
  res.json({ openingHours, blackoutDates });
});

module.exports = router;
