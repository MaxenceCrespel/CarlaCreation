const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const services = db
    .prepare('SELECT id, name, description, category, duration_minutes, price_cents FROM services WHERE active = 1 ORDER BY category, id')
    .all();
  res.json(services);
});

module.exports = router;
