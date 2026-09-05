const express = require('express');
const { requireAnyAdmin } = require('../lib/tournamentContext');
const {
  collectCandidates, roundsFor, statsFor, matchesClubPlayer, nameFormsOf, aliasesOf,
  handicapSuggestion,
} = require('../logic/roster');

const STATUSES = ['regular', 'wildcard', 'inactive'];
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const cleanName = (v) => String(v ?? '').trim().slice(0, 40);

// The club roster. Not scoped to a tournament — it is the same people and the
// same handicaps in both, so either admin session may manage it.
module.exports = (db) => {
  const router = express.Router();
  router.use(requireAnyAdmin);

  const listRoster = () => db.prepare(`
    SELECT * FROM club_players
    ORDER BY CASE status WHEN 'regular' THEN 0 WHEN 'wildcard' THEN 1 ELSE 2 END,
             english_name, chinese_name
  `).all();

  router.get('/', (req, res) => {
    const members = listRoster();
    // How many rounds each has played, so the list can show it without opening
    // every player
    const counts = new Map(members.map(m => [m.id, roundsFor(db, m).filter(r => r.archived).length]));
    res.json({
      roster: members.map(m => ({ ...m, roundsPlayed: counts.get(m.id) || 0 })),
    });
  });

  // Everything one player's page shows
  router.get('/:id', (req, res) => {
    const member = db.prepare('SELECT * FROM club_players WHERE id=?').get(req.params.id);
    if (!member) return res.status(404).json({ error: '找不到這位球員' });
    const rounds = roundsFor(db, member);
    res.json({
      player: { ...member, aliasList: aliasesOf(member) },
      rounds,
      stats: statsFor(rounds),
      suggestion: handicapSuggestion(rounds),
      handicapLog: db.prepare(
        'SELECT * FROM handicap_log WHERE club_player_id=? ORDER BY changed_at DESC, id DESC'
      ).all(member.id),
    });
  });

  router.post('/', (req, res) => {
    const chinese_name = cleanName(req.body?.chinese_name);
    const english_name = cleanName(req.body?.english_name);
    if (!chinese_name && !english_name) {
      return res.status(400).json({ error: '請至少填寫中文名或英文名' });
    }
    const handicap = Number(req.body?.handicap);
    if (!Number.isFinite(handicap)) return res.status(400).json({ error: '差點必須是數字' });
    const status = STATUSES.includes(req.body?.status) ? req.body.status : 'regular';
    const tee = req.body?.tee === 'red' ? 'red' : 'white';

    const stamp = now();
    const r = db.prepare(`
      INSERT INTO club_players (chinese_name, english_name, handicap, status, tee, notes, created_at)
      VALUES (?,?,?,?,?,?,?)
    `).run(chinese_name, english_name, Math.round(handicap), status, tee,
      String(req.body?.notes ?? '').trim().slice(0, 500), stamp);
    const id = Number(r.lastInsertRowid);
    db.prepare(`
      INSERT INTO handicap_log (club_player_id, from_handicap, to_handicap, reason, changed_at)
      VALUES (?,?,?,?,?)
    `).run(id, null, Math.round(handicap), '建立球員資料', stamp);
    res.json({ success: true, id });
  });

  // Names, status, tee and notes. Handicap deliberately excluded — it has its
  // own endpoint because it always needs a reason.
  router.put('/:id', (req, res) => {
    const member = db.prepare('SELECT * FROM club_players WHERE id=?').get(req.params.id);
    if (!member) return res.status(404).json({ error: '找不到這位球員' });
    const chinese_name = cleanName(req.body?.chinese_name ?? member.chinese_name);
    const english_name = cleanName(req.body?.english_name ?? member.english_name);
    if (!chinese_name && !english_name) {
      return res.status(400).json({ error: '請至少填寫中文名或英文名' });
    }
    const status = STATUSES.includes(req.body?.status) ? req.body.status : member.status;
    const tee = req.body?.tee === 'red' ? 'red' : (req.body?.tee === 'white' ? 'white' : member.tee);
    db.prepare('UPDATE club_players SET chinese_name=?, english_name=?, status=?, tee=?, notes=? WHERE id=?')
      .run(chinese_name, english_name, status, tee,
        String(req.body?.notes ?? member.notes ?? '').trim().slice(0, 500), member.id);
    res.json({ success: true });
  });

  // Changing a handicap always writes down why. Winning the cup gets you cut,
  // and the club remembers who was cut for what.
  router.put('/:id/handicap', (req, res) => {
    const member = db.prepare('SELECT * FROM club_players WHERE id=?').get(req.params.id);
    if (!member) return res.status(404).json({ error: '找不到這位球員' });
    const handicap = Number(req.body?.handicap);
    if (!Number.isFinite(handicap)) return res.status(400).json({ error: '差點必須是數字' });
    const reason = String(req.body?.reason ?? '').trim();
    if (!reason) return res.status(400).json({ error: '請填寫調整原因' });
    if (Math.round(handicap) === member.handicap) {
      return res.status(400).json({ error: '差點沒有變動' });
    }
    const stamp = now();
    db.prepare('UPDATE club_players SET handicap=? WHERE id=?').run(Math.round(handicap), member.id);
    db.prepare(`
      INSERT INTO handicap_log (club_player_id, from_handicap, to_handicap, reason, changed_at)
      VALUES (?,?,?,?,?)
    `).run(member.id, member.handicap, Math.round(handicap), reason.slice(0, 200), stamp);
    res.json({ success: true, from: member.handicap, to: Math.round(handicap) });
  });

  // Two records, one person — J.J. and 王伯軒 JJ were entered on different days.
  // The absorbed record's name is kept as an alias rather than discarded: the
  // archived years are frozen with whatever name was used back then, and that is
  // the only way those rounds are still found.
  router.post('/:id/merge', (req, res) => {
    const keep = db.prepare('SELECT * FROM club_players WHERE id=?').get(req.params.id);
    const drop = db.prepare('SELECT * FROM club_players WHERE id=?').get(req.body?.fromId);
    if (!keep || !drop) return res.status(404).json({ error: '找不到球員' });
    if (keep.id === drop.id) return res.status(400).json({ error: '不能跟自己合併' });

    const forms = [...nameFormsOf(keep), ...nameFormsOf(drop)];
    const seen = new Set();
    const aliases = [];
    for (const f of forms) {
      const zh = String(f.chinese_name || '').trim();
      const en = String(f.english_name || '').trim();
      if (!zh && !en) continue;
      const key = `${zh}|${en}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      // The kept record's own names live in their columns, not the alias list
      if (zh === (keep.chinese_name || '') && en === (keep.english_name || '')) continue;
      aliases.push({ chinese_name: zh, english_name: en });
    }

    const stamp = now();
    db.prepare('UPDATE club_players SET chinese_name=?, english_name=?, aliases=? WHERE id=?').run(
      keep.chinese_name || drop.chinese_name || '',
      keep.english_name || drop.english_name || '',
      JSON.stringify(aliases),
      keep.id,
    );
    db.prepare('UPDATE players SET club_player_id=? WHERE club_player_id=?').run(keep.id, drop.id);
    db.prepare('UPDATE handicap_log SET club_player_id=? WHERE club_player_id=?').run(keep.id, drop.id);
    db.prepare(`
      INSERT INTO handicap_log (club_player_id, from_handicap, to_handicap, reason, changed_at)
      VALUES (?,?,?,?,?)
    `).run(keep.id, drop.handicap, keep.handicap,
      `合併「${[drop.chinese_name, drop.english_name].filter(Boolean).join(' ')}」的資料`, stamp);
    db.prepare('DELETE FROM club_players WHERE id=?').run(drop.id);

    res.json({ success: true, aliases });
  });

  // Only for a record created by mistake. Someone who has played is kept and
  // marked 已退出 instead, so their rounds keep a name attached.
  router.delete('/:id', (req, res) => {
    const member = db.prepare('SELECT * FROM club_players WHERE id=?').get(req.params.id);
    if (!member) return res.status(404).json({ error: '找不到這位球員' });
    if (roundsFor(db, member).some(r => r.archived)) {
      return res.status(400).json({ error: '這位球員已經有比賽紀錄,請改成「已退出」而不是刪除' });
    }
    db.prepare('DELETE FROM handicap_log WHERE club_player_id=?').run(member.id);
    db.prepare('UPDATE players SET club_player_id=NULL WHERE club_player_id=?').run(member.id);
    db.prepare('DELETE FROM club_players WHERE id=?').run(member.id);
    res.json({ success: true });
  });

  // Seeding the roster from what already exists. Preview first — merging two
  // people into one is not something to discover afterwards.
  router.get('/import/preview', (req, res) => {
    const existing = listRoster();
    const candidates = collectCandidates(db).map(c => ({
      ...c,
      alreadyInRoster: existing.some(m => matchesClubPlayer(c, m)),
    }));
    res.json({ candidates });
  });

  router.post('/import', (req, res) => {
    const wanted = Array.isArray(req.body?.players) ? req.body.players : null;
    if (!wanted) return res.status(400).json({ error: 'Invalid players' });
    const existing = listRoster();
    const stamp = now();
    const insert = db.prepare(`
      INSERT INTO club_players (chinese_name, english_name, handicap, status, tee, notes, created_at)
      VALUES (?,?,?,?,?,?,?)
    `);
    const logIt = db.prepare(`
      INSERT INTO handicap_log (club_player_id, from_handicap, to_handicap, reason, changed_at)
      VALUES (?,?,?,?,?)
    `);

    let added = 0, skipped = 0;
    for (const p of wanted) {
      const chinese_name = cleanName(p.chinese_name);
      const english_name = cleanName(p.english_name);
      if (!chinese_name && !english_name) { skipped++; continue; }
      if (existing.some(m => matchesClubPlayer({ chinese_name, english_name }, m))) { skipped++; continue; }
      const handicap = Number(p.handicap);
      if (!Number.isFinite(handicap)) { skipped++; continue; }
      const status = STATUSES.includes(p.status) ? p.status : (p.wildcard ? 'wildcard' : 'regular');
      const r = insert.run(chinese_name, english_name, Math.round(handicap), status,
        p.tee === 'red' ? 'red' : 'white', '', stamp);
      const id = Number(r.lastInsertRowid);
      logIt.run(id, null, Math.round(handicap), '從既有比賽名單建立', stamp);
      existing.push({ id, chinese_name, english_name });
      added++;
    }

    // Point past and present tournament entries at the people they belong to,
    // so a round can be found by id rather than by name from here on.
    let linked = 0;
    const roster = listRoster();
    for (const entry of db.prepare('SELECT * FROM players WHERE club_player_id IS NULL').all()) {
      const member = roster.find(m => matchesClubPlayer(entry, m));
      if (!member) continue;
      db.prepare('UPDATE players SET club_player_id=? WHERE id=?').run(member.id, entry.id);
      linked++;
    }

    res.json({ success: true, added, skipped, linked });
  });

  return router;
};
