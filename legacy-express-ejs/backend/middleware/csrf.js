const crypto = require('crypto');
const { COOKIE_SECURE } = require('../config');

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';

// Double-submit cookie CSRF protection: a readable (non-httpOnly) cookie holds
// a random token; the frontend must echo it back in a custom header on every
// state-changing request. A cross-site page cannot read the cookie (browser
// same-origin policy) nor set a custom header on a simple form post, so it
// cannot forge a valid pair.
function issueCsrfToken(req, res, next) {
  if (!req.cookies || !req.cookies[CSRF_COOKIE]) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      sameSite: 'strict',
      secure: COOKIE_SECURE,
      path: '/',
    });
  }
  next();
}

function verifyCsrfToken(req, res, next) {
  const cookieToken = req.cookies && req.cookies[CSRF_COOKIE];
  const headerToken = req.get(CSRF_HEADER);

  if (
    !cookieToken ||
    !headerToken ||
    cookieToken.length !== headerToken.length ||
    !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))
  ) {
    return res.status(403).json({ error: 'Jeton de sécurité invalide. Rechargez la page et réessayez.' });
  }
  next();
}

module.exports = { issueCsrfToken, verifyCsrfToken, CSRF_COOKIE, CSRF_HEADER };
