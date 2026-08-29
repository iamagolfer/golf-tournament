// Resolves which tournament a request is talking about, and guards admin access
// per tournament. Requests without a ?t= parameter fall back to the Ring Cup, so
// every pre-existing Ring Cup client keeps working untouched.

const { RING, GREENJACKET } = require('../db/init');

const SLUGS = [RING, GREENJACKET];

function resolveSlug(req) {
  const raw = (req.query && req.query.t) || (req.body && req.body.t) || '';
  const slug = String(raw);
  return SLUGS.includes(slug) ? slug : RING;
}

function getTournament(db, req) {
  return db.prepare('SELECT * FROM tournament WHERE slug=?').get(resolveSlug(req));
}

// Admin sessions are per tournament: signing in to the Ring Cup grants nothing
// on the Green Jacket, and vice versa. Both can be held at once.
function requireAdmin(req, res, next) {
  const slug = resolveSlug(req);
  if (!req.session.admin || !req.session.admin[slug]) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = { RING, GREENJACKET, SLUGS, resolveSlug, getTournament, requireAdmin };
