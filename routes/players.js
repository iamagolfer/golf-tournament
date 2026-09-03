const express = require('express');
const { getTournament, requireAdmin } = require('../lib/tournamentContext');


module.exports = (db) => {
  const router = express.Router();

  // Public: get players (no PINs)
  router.get('/', (req, res) => {
    const t = getTournament(db, req);
    if (!t) return res.json({ players: [], groups: [], picks: [] });
    const players = db.prepare('SELECT id, tournament_id, player_number, chinese_name, english_name, handicap, group_id, no_show, wildcard, tee FROM players WHERE tournament_id=? ORDER BY player_number').all(t.id);
    const groups = db.prepare('SELECT * FROM groups WHERE tournament_id=? ORDER BY group_order').all(t.id);
    let picks = [];
    if (t.status === 'revealed' || t.status === 'finished') {
      picks = db.prepare('SELECT hp.player_id, hp.picked_player_id, hp.updated_at FROM horse_picks hp JOIN players p ON p.id=hp.player_id WHERE p.tournament_id=?').all(t.id);
    } else if (t.status !== 'playing') {
      // setup/picking: only expose that a pick exists, not who was picked
      picks = db.prepare('SELECT hp.player_id, hp.updated_at FROM horse_picks hp JOIN players p ON p.id=hp.player_id WHERE p.tournament_id=?').all(t.id);
    }
    res.json({ players, groups, picks });
  });

  // Admin: get players with PINs
  router.get('/with-pins', requireAdmin, (req, res) => {
    const t = getTournament(db, req);
    if (!t) return res.json({ players: [] });
    const players = db.prepare('SELECT * FROM players WHERE tournament_id=? ORDER BY player_number').all(t.id);
    res.json({ players });
  });

  // Admin: save full player list
  router.put('/', requireAdmin, (req, res) => {
    const { players } = req.body;
    const t = getTournament(db, req);

    if (t.total_players > 0 && players.length !== t.total_players) {
      return res.status(400).json({
        error: `人數不符！已設定 ${t.total_players} 名，但輸入了 ${players.length} 名。\nPlayer count mismatch: set ${t.total_players}, got ${players.length}.`
      });
    }

    db.prepare('DELETE FROM scores WHERE player_id IN (SELECT id FROM players WHERE tournament_id=?)').run(t.id);
    db.prepare('DELETE FROM horse_picks WHERE player_id IN (SELECT id FROM players WHERE tournament_id=?)').run(t.id);
    db.prepare('DELETE FROM players WHERE tournament_id=?').run(t.id);

    const stmt = db.prepare('INSERT INTO players (tournament_id, player_number, chinese_name, english_name, handicap, pin, wildcard, tee) VALUES (?,?,?,?,?,?,?,?)');
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const pin = p.pin || String(1000 + Math.floor(Math.random() * 9000));
      stmt.run(t.id, i + 1, (p.chinese_name || '').trim(), (p.english_name || '').trim(), Number(p.handicap), pin, p.wildcard ? 1 : 0, p.tee === 'red' ? 'red' : 'white');
    }
    res.json({ success: true });
  });

  // Admin: add one player, leaving everyone else's scores and groups alone
  // (setup phase only). The bulk PUT above replaces the whole roster and wipes
  // every score with it, which is far too blunt when one more person turns up.
  router.post('/', requireAdmin, (req, res) => {
    const t = getTournament(db, req);
    if (!t) return res.status(400).json({ error: 'No tournament' });
    if (t.status !== 'setup') {
      return res.status(400).json({ error: '只能在賽前設定階段新增球員\nCan only add players during setup' });
    }

    const zh = String(req.body?.chinese_name || '').trim();
    const en = String(req.body?.english_name || '').trim();
    if (!zh && !en) {
      return res.status(400).json({ error: '請至少填寫中文名或英文名\nA name is required' });
    }
    const handicap = Number(req.body?.handicap);
    if (!Number.isFinite(handicap)) {
      return res.status(400).json({ error: '差點必須是數字\nHandicap must be a number' });
    }

    const maxNo = db.prepare('SELECT MAX(player_number) AS n FROM players WHERE tournament_id=?').get(t.id);
    const playerNumber = (maxNo?.n || 0) + 1;
    const pin = /^\d{4}$/.test(String(req.body?.pin || ''))
      ? String(req.body.pin)
      : String(1000 + Math.floor(Math.random() * 9000));

    const info = db.prepare(
      'INSERT INTO players (tournament_id, player_number, chinese_name, english_name, handicap, pin, wildcard, tee) VALUES (?,?,?,?,?,?,?,?)'
    ).run(t.id, playerNumber, zh, en, handicap, pin, req.body?.wildcard ? 1 : 0,
      req.body?.tee === 'red' ? 'red' : 'white');

    db.prepare('UPDATE tournament SET total_players = total_players + 1 WHERE id=?').run(t.id);
    res.json({ success: true, id: info.lastInsertRowid, player_number: playerNumber });
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

  // Admin: delete a single player (setup phase only)
  router.delete('/:id', requireAdmin, (req, res) => {
    const t = getTournament(db, req);
    if (!t) return res.status(400).json({ error: 'No tournament' });
    if (t.status !== 'setup') return res.status(400).json({ error: '只能在賽前設定階段刪除球員\nCan only delete players during setup' });

    db.prepare('DELETE FROM scores WHERE player_id=?').run(req.params.id);
    db.prepare('DELETE FROM horse_picks WHERE player_id=?').run(req.params.id);
    db.prepare('DELETE FROM horse_picks WHERE picked_player_id=?').run(req.params.id);
    db.prepare('DELETE FROM players WHERE id=?').run(req.params.id);
    db.prepare('UPDATE tournament SET total_players = total_players - 1 WHERE id=?').run(t.id);

    const remaining = db.prepare('SELECT id FROM players WHERE tournament_id=? ORDER BY player_number').all(t.id);
    for (let i = 0; i < remaining.length; i++) {
      db.prepare('UPDATE players SET player_number=? WHERE id=?').run(i + 1, remaining[i].id);
    }
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
    const t = getTournament(db, req);

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

  // Admin: batch pick (4 modes)
  router.post('/batch-self-pick', requireAdmin, (req, res) => {
    try {
      const { mode = 'self' } = req.body;
      const t = getTournament(db, req);
      if (!t) return res.status(400).json({ error: '尚未建立賽事' });
      if (t.status === 'playing' || t.status === 'revealed' || t.status === 'finished') {
        return res.status(400).json({ error: '比賽已開始，無法更改選馬！\nGame has started, picks are locked!' });
      }
      const players = db.prepare('SELECT id, chinese_name, english_name FROM players WHERE tournament_id=? ORDER BY player_number').all(t.id);
      if (!players.length) return res.status(400).json({ error: '尚未建立球員名單' });

      let assignments;
      let extraInfo = {};
      if (mode === 'self') {
        assignments = players.map(p => ({ playerId: p.id, pickedId: p.id }));
      } else if (mode === 'same-random') {
        const target = players[Math.floor(Math.random() * players.length)];
        assignments = players.map(p => ({ playerId: p.id, pickedId: target.id }));
        extraInfo = { targetName: `${target.chinese_name} ${target.english_name}` };
      } else if (mode === 'next') {
        assignments = players.map((p, i) => ({ playerId: p.id, pickedId: players[(i + 1) % players.length].id }));
      } else if (mode === 'random') {
        assignments = players.map(p => ({ playerId: p.id, pickedId: players[Math.floor(Math.random() * players.length)].id }));
      } else {
        return res.status(400).json({ error: 'Invalid mode' });
      }

      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
      for (const { playerId, pickedId } of assignments) {
        const existing = db.prepare('SELECT id FROM horse_picks WHERE player_id=?').get(playerId);
        if (existing) {
          db.prepare('UPDATE horse_picks SET picked_player_id=?, updated_at=? WHERE player_id=?').run(pickedId, now, playerId);
        } else {
          db.prepare('INSERT INTO horse_picks (player_id, picked_player_id) VALUES (?,?)').run(playerId, pickedId);
        }
      }
      res.json({ success: true, count: assignments.length, ...extraInfo });
    } catch (err) {
      console.error('batch-self-pick error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Public: reveal own current pick (requires PIN, works in any status)
  router.post('/reveal-my-pick', (req, res) => {
    try {
      const { playerId, pin } = req.body;
      const player = db.prepare('SELECT * FROM players WHERE id=?').get(playerId);
      if (!player) return res.status(404).json({ error: '找不到此球員 / Player not found' });
      if (String(player.pin) !== String(pin)) return res.status(401).json({ error: 'PIN 碼錯誤！Wrong PIN!' });

      const pick = db.prepare('SELECT picked_player_id FROM horse_picks WHERE player_id=?').get(playerId);
      if (!pick) return res.status(404).json({ error: '尚未選馬 / No pick found' });

      const horse = db.prepare('SELECT chinese_name, english_name FROM players WHERE id=?').get(pick.picked_player_id);
      if (!horse) return res.status(404).json({ error: '找不到選馬球員 / Horse player not found' });

      res.json({ pickedPlayer: horse });
    } catch (err) {
      console.error('reveal-my-pick error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Public: pick horse (requires PIN)
  router.post('/pick-horse', (req, res) => {
    try {
      const { playerId, pin, pickedPlayerId } = req.body;
      const t = getTournament(db, req);

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

  // Admin: edit a single player without touching scores or group assignment
  router.put('/:id/details', requireAdmin, (req, res) => {
    const { chinese_name, english_name, handicap, wildcard, tee } = req.body;
    const t = getTournament(db, req);
    const existing = db.prepare('SELECT id FROM players WHERE id=? AND tournament_id=?').get(req.params.id, t.id);
    if (!existing) return res.status(404).json({ error: 'Player not found' });
    if (!english_name && !chinese_name) return res.status(400).json({ error: '姓名不可全空' });
    db.prepare('UPDATE players SET chinese_name=?, english_name=?, handicap=?, wildcard=?, tee=? WHERE id=?')
      .run((chinese_name || '').trim(), (english_name || '').trim(), Number(handicap) || 0,
           wildcard ? 1 : 0, tee === 'red' ? 'red' : 'white', existing.id);
    res.json({ success: true });
  });

  return router;
};
