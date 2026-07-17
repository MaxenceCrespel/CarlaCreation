const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { body, param, validationResult } = require('express-validator');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { verifyCsrfToken } = require('../middleware/csrf');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = ALLOWED_MIME_TYPES[file.mimetype];
    // Server-generated random filename: never trust the client-supplied name.
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES[file.mimetype]) {
      return cb(new Error('Format non supporté. Utilisez JPEG, PNG ou WebP.'));
    }
    cb(null, true);
  },
});

function handleUpload(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Image trop volumineuse (5 Mo max).' : 'Échec du téléversement.' });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}

// All routes below require an authenticated admin session + CSRF token.
router.use(requireAdmin);

router.get('/', (req, res) => {
  const items = db.prepare('SELECT id, url, alt_text, sort_order, is_upload FROM gallery ORDER BY sort_order ASC, id ASC').all();
  res.json(items);
});

router.post('/', verifyCsrfToken, handleUpload, [body('altText').trim().isLength({ min: 2, max: 150 }).withMessage('Légende invalide (2 à 150 caractères).')], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: errors.array()[0].msg });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'Aucune image reçue.' });
  }

  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM gallery').get().m;
  const url = `uploads/${req.file.filename}`;
  const result = db
    .prepare('INSERT INTO gallery (url, alt_text, sort_order, is_upload) VALUES (?, ?, ?, 1)')
    .run(url, req.body.altText, maxOrder + 1);

  res.status(201).json({ id: result.lastInsertRowid, url, alt_text: req.body.altText, sort_order: maxOrder + 1, is_upload: 1 });
});

router.patch(
  '/:id',
  verifyCsrfToken,
  [
    param('id').isInt({ min: 1 }),
    body('altText').optional().trim().isLength({ min: 2, max: 150 }).withMessage('Légende invalide.'),
    body('sortOrder').optional().isInt({ min: 0, max: 10000 }).withMessage('Ordre invalide.'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const item = db.prepare('SELECT id FROM gallery WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Photo introuvable.' });

    if (req.body.altText !== undefined) {
      db.prepare('UPDATE gallery SET alt_text = ? WHERE id = ?').run(req.body.altText, req.params.id);
    }
    if (req.body.sortOrder !== undefined) {
      db.prepare('UPDATE gallery SET sort_order = ? WHERE id = ?').run(req.body.sortOrder, req.params.id);
    }
    res.json({ success: true });
  }
);

router.delete('/:id', verifyCsrfToken, [param('id').isInt({ min: 1 })], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Requête invalide.' });
  }

  const item = db.prepare('SELECT * FROM gallery WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Photo introuvable.' });

  db.prepare('DELETE FROM gallery WHERE id = ?').run(req.params.id);

  if (item.is_upload) {
    const filePath = path.join(UPLOAD_DIR, path.basename(item.url));
    fs.unlink(filePath, () => {}); // best-effort cleanup, ignore errors
  }

  res.json({ success: true });
});

module.exports = router;
