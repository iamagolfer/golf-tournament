const express = require('express');

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function nowStr() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

module.exports = (db) => {
  const router = express.Router();

  // Public: get all scores
  router.get('/', (req, res) => {
    const t = db.prepare('SELECT id FROM tournament ORDER BY id DESC LIMIT 1').get();
    if (!t) return res.json({ scores: [] });
    const scores = db.prepare(`
      SELECT s.player_id, s.hole_id, s.strokes, s.entered_at
      FROM scores s
      JOIN players p ON p.id = s.player_id
      WHERE p.tournament_id = ?
    `).all(t.id);
    res.json({ scores });
  });

  // Public: save scores for a player (batch)
  router.post('/batch', (req, res) => {
    const { playerId, scores } = req.body;
    if (!playerId || !Array.isArray(scores)) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    db.exec('BEGIN');
    try {
      const ts = nowStr();
      for (const { holeId, strokes } of scores) {
        const s = Number(strokes);
        if (!holeId || isNaN(s) || s < 1 || s > 20) continue;
        const existing = db.prepare('SELECT id FROM scores WHERE player_id=? AND hole_id=?').get(playerId, holeId);
        if (existing) {
          db.prepare('UPDATE scores SET strokes=?, entered_at=? WHERE player_id=? AND hole_id=?').run(s, ts, playerId, holeId);
        } else {
          db.prepare('INSERT INTO scores (player_id, hole_id, strokes, entered_at) VALUES (?,?,?,?)').run(playerId, holeId, s, ts);
        }
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('score batch error:', e);
      return res.status(500).json({ error: e.message });
    }
    res.json({ success: true });
  });

  // Admin: override a single score
  router.put('/:playerId/:holeId', requireAdmin, (req, res) => {
    try {
      const { strokes } = req.body;
      const s = Number(strokes);
      if (isNaN(s) || s < 1 || s > 20) return res.status(400).json({ error: 'Invalid strokes (1-20)' });
      const { playerId, holeId } = req.params;
      const ts = nowStr();
      const existing = db.prepare('SELECT id FROM scores WHERE player_id=? AND hole_id=?').get(playerId, holeId);
      if (existing) {
        db.prepare('UPDATE scores SET strokes=?, entered_at=? WHERE player_id=? AND hole_id=?').run(s, ts, playerId, holeId);
      } else {
        db.prepare('INSERT INTO scores (player_id, hole_id, strokes, entered_at) VALUES (?,?,?,?)').run(playerId, holeId, s, ts);
      }
      res.json({ success: true });
    } catch (err) {
      console.error('score override error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: delete a score
  router.delete('/:playerId/:holeId', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM scores WHERE player_id=? AND hole_id=?').run(req.params.playerId, req.params.holeId);
    res.json({ success: true });
  });

  return router;
};
