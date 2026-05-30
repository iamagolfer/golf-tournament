const express = require('express');

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

module.exports = (db) => {
  const router = express.Router();

  // Public: get players (no PINs)
  router.get('/', (req, res) => {
    const t = db.prepare('SELECT * FROM tournament ORDER BY id DESC LIMIT 1').get();
    if (!t) return res.json({ players: [], groups: [], picks: [] });
    const players = db.prepare('SELECT id, tournament_id, player_number, chinese_name, english_name, handicap, group_id, no_show FROM players WHERE tournament_id=? ORDER BY player_number').all(t.id);
    const groups = db.prepare('SELECT * FROM groups WHERE tournament_id=? ORDER BY group_order').all(t.id);
    const picks = db.prepare('SELECT hp.player_id, hp.picked_player_id, hp.updated_at FROM horse_picks hp JOIN players p ON p.id=hp.player_id WHERE p.tournament_id=?').all(t.id);
    res.json({ players, groups, picks });
  });

  // Admin: get players with PINs
  router.get('/with-pins', requireAdmin, (req, res) => {
    const t = db.prepare('SELECT * FROM tournament ORDER BY id DESC LIMIT 1').get();
    if (!t) return res.json({ players: [] });
    const players = db.prepare('SELECT * FROM players WHERE tournament_id=? ORDER BY player_number').all(t.id);
    res.json({ players });
  });

  // Admin: save full player list
  router.put('/', requireAdmin, (req, res) => {
    const { players } = req.body;
    const t = db.prepare('SELECT * FROM tournament ORDER BY id DESC LIMIT 1').get();

    if (t.total_players > 0 && players.length !== t.total_players) {
      return res.status(400).json({
        error: `人數不符！已設定 ${t.total_players} 名，但輸入了 ${players.length} 名。\nPlayer count mismatch: set ${t.total_players}, got ${players.length}.`
      });
    }

    db.prepare('DELETE FROM scores WHERE player_id IN (SELECT id FROM players WHERE tournament_id=?)').run(t.id);
    db.prepare('DELETE FROM horse_picks WHERE player_id IN (SELECT id FROM players WHERE tournament_id=?)').run(t.id);
    db.prepare('DELETE FROM players WHERE tournament_id=?').run(t.id);

    const stmt = db.prepare('INSERT INTO players (tournament_id, player_number, chinese_name, english_name, handicap, pin) VALUES (?,?,?,?,?,?)');
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const pin = p.pin || String(1000 + Math.floor(Math.random() * 9000));
      stmt.run(t.id, i + 1, p.chinese_name.trim(), p.english_name.trim(), Number(p.handicap), pin);
    }
    res.json({ success: true });
  });

  // Admin: update a single player's PIN
  router.put('/:id/pin', requireAdmin, (req, res) => {
    const { pin } = req.body;
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be 4 digits' });
    }
    db.prepare('UPDATE players SET pin=? WHERE id=?').run(pin, req.params.id);
    res.json({ success: true });
  });

  // Admin: mark no-show
  router.put('/:id/noshow', requireAdmin, (req, res) => {
    const { no_show } = req.body;
    db.prepare('UPDATE players SET no_show=? WHERE id=?').run(no_show ? 1 : 0, req.params.id);
    res.json({ success: true });
  });

  // Admin: save groups
  router.put('/groups', requireAdmin, (req, res) => {
    const { groups } = req.body;
    const t = db.prepare('SELECT id FROM tournament ORDER BY id DESC LIMIT 1').get();

    db.prepare('DELETE FROM groups WHERE tournament_id=?').run(t.id);
    db.prepare('UPDATE players SET group_id=NULL WHERE tournament_id=?').run(t.id);

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const r = db.prepare('INSERT INTO groups (tournament_id, name, group_order) VALUES (?,?,?)').run(t.id, g.name, i + 1);
      const groupId = Number(r.lastInsertRowid); // node:sqlite may return BigInt
      for (const pid of g.playerIds) {
        db.prepare('UPDATE players SET group_id=? WHERE id=?').run(groupId, pid);
      }
    }
    res.json({ success: true });
  });

  // Public: pick horse (requires PIN)
  router.post('/pick-horse', (req, res) => {
    try {
      const { playerId, pin, pickedPlayerId } = req.body;
      const t = db.prepare('SELECT * FROM tournament ORDER BY id DESC LIMIT 1').get();

      if (t.status === 'playing' || t.status === 'revealed' || t.status === 'finished') {
        return res.status(400).json({ error: '比賽已開始，無法更改選馬！\nGame has started, picks are locked!' });
      }

      const player = db.prepare('SELECT * FROM players WHERE id=?').get(playerId);
      if (!player) return res.status(404).json({ error: '找不到此球員 / Player not found' });
      if (String(player.pin) !== String(pin)) return res.status(401).json({ error: 'PIN 碼錯誤！Wrong PIN!' });

      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const existing = db.prepare('SELECT id FROM horse_picks WHERE player_id=?').get(playerId);
      if (existing) {
        db.prepare('UPDATE horse_picks SET picked_player_id=?, updated_at=? WHERE player_id=?').run(pickedPlayerId, now, playerId);
      } else {
        db.prepare('INSERT INTO horse_picks (player_id, picked_player_id) VALUES (?,?)').run(playerId, pickedPlayerId);
      }
      res.json({ success: true });
    } catch (err) {
      console.error('pick-horse error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
