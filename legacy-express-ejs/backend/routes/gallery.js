const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const items = db
    .prepare('SELECT id, url, alt_text FROM gallery ORDER BY sort_order ASC, id ASC')
    .all();
  res.json(items);
});

module.exports = router;
