const express = require('express');
const { RING, GREENJACKET, SLUGS } = require('../lib/tournamentContext');

// Admin credentials per tournament. Signing in to one grants nothing on the
// other — benny can run the Green Jacket without touching the Ring Cup.
const ACCOUNTS = {
  [RING]: [
    { username: 'admin', password: 'iam1976' },
  ],
  [GREENJACKET]: [
    { username: 'admin', password: 'iam1976' },
    { username: 'benny', password: 'benny' },
  ],
};

module.exports = (db) => {
  const router = express.Router();

  // scope is optional — omitting it means the Ring Cup, so the existing
  // Ring Cup login page keeps working unchanged.
  router.post('/login', (req, res) => {
    const { username, password, scope } = req.body;
    const slug = SLUGS.includes(scope) ? scope : RING;

    const matched = ACCOUNTS[slug].some(a => a.username === username && a.password === password);
    if (!matched) {
      return res.status(401).json({ error: '帳號或密碼錯誤 / Wrong credentials' });
    }

    req.session.admin = { ...(req.session.admin || {}), [slug]: true };
    res.json({ success: true, scope: slug });
  });

  // Logging out of one tournament leaves the other session intact.
  router.post('/logout', (req, res) => {
    const { scope } = req.body || {};
    if (SLUGS.includes(scope) && req.session.admin) {
      delete req.session.admin[scope];
      return res.json({ success: true });
    }
    req.session.destroy(() => res.json({ success: true }));
  });

  router.get('/check', (req, res) => {
    const admin = req.session.admin || {};
    res.json({
      isAdmin: !!admin[RING],          // legacy field — Ring Cup client reads this
      ring: !!admin[RING],
      greenjacket: !!admin[GREENJACKET],
    });
  });

  return router;
};
