const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');

function requireAdmin(req, res, next) {
  const token = req.cookies && req.cookies.admin_session;
  if (!token) {
    return res.status(401).json({ error: 'Authentification requise.' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.admin = { id: payload.sub, username: payload.username };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session invalide ou expirée.' });
  }
}

module.exports = { requireAdmin, JWT_SECRET };
