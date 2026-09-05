const express = require('express');
const { resolveSlug, requireAdmin, getTournament, GREENJACKET } = require('../lib/tournamentContext');
const { calculateRankings } = require('../logic/rankings');
const { buildGjRankings } = require('../logic/gjRankings');

// A frozen copy of one year's tournament.
//
// The live tables hold a single season at a time — next year's roster import
// deletes this year's scores — so a finished round is snapshotted here in full:
// course, players, groups, every stroke, and the rankings as they stood at the
// moment it was archived. Pages render from the snapshot, never by recomputing,
// so a later change to the ranking rules cannot rewrite history.
const SNAPSHOT_VERSION = 1;

// PINs authenticate horse picking and must not travel with a public snapshot
const stripPin = ({ pin, ...rest }) => rest;

// Archiving is for a year that is over. Refusing anything earlier keeps a
// half-played round out of the history — and, for the Ring Cup, stops the
// snapshot publishing horse picks that are still meant to be secret: the
// rankings route hides them until they are revealed, but this builds from the
// engine directly and would otherwise walk straight past that.
const FINISHED_STATUSES = {
  ring: ['revealed', 'finished'],
  greenjacket: ['finished'],
};

function buildSnapshot(db, req) {
  const slug = resolveSlug(req);
  const t = getTournament(db, req);
  if (!t) throw new Error('找不到賽事');

  const allowed = FINISHED_STATUSES[slug] || ['finished'];
  if (!allowed.includes(t.status)) {
    throw new Error(slug === GREENJACKET
      ? '請先把比賽狀態切成「已結束」再封存'
      : '請先把比賽狀態切成「選馬已公布」或「比賽結束」再封存,否則選馬結果不會被記錄');
  }

  const sections = db.prepare(
    'SELECT * FROM sections WHERE tournament_id=? AND (active IS NULL OR active=1) ORDER BY section_order'
  ).all(t.id);

  const holes = [];
  for (const sec of sections) {
    for (const h of db.prepare('SELECT * FROM holes WHERE section_id=? ORDER BY hole_number').all(sec.id)) {
      holes.push({
        id: h.id,
        label: h.hole_label || String(h.hole_number),
        par: h.par,
        yards: h.yards,
        yards_red: h.yards_red,
        section_id: sec.id,
        section_name: sec.name,
        section_order: sec.section_order,
      });
    }
  }
  if (!holes.length) throw new Error('這個賽事還沒有球場資料');

  const players = db.prepare(
    'SELECT id, player_number, chinese_name, english_name, handicap, group_id, no_show, wildcard, tee FROM players WHERE tournament_id=? ORDER BY player_number'
  ).all(t.id);
  const groups = db.prepare('SELECT id, name, group_order FROM groups WHERE tournament_id=? ORDER BY group_order').all(t.id);

  const scoreRows = db.prepare(
    'SELECT s.player_id, s.hole_id, s.strokes FROM scores s JOIN players p ON p.id=s.player_id WHERE p.tournament_id=?'
  ).all(t.id);
  if (!scoreRows.length) throw new Error('這個賽事還沒有成績');

  const isGj = slug === GREENJACKET;
  const ranked = isGj ? buildGjRankings(db, t.id) : calculateRankings(db, t.id);
  if (!ranked) throw new Error('無法計算排名');

  return {
    version: SNAPSHOT_VERSION,
    slug,
    year: (t.date || '').slice(0, 4) || String(new Date().getFullYear()),
    tournament: {
      name: t.name,
      course_name: t.course_name,
      date: t.date,
      tee_time: t.tee_time,
      status: t.status,
    },
    parTotal: holes.reduce((sum, h) => sum + h.par, 0),
    holes,
    sections: sections.map(s => ({ id: s.id, name: s.name, section_order: s.section_order })),
    groups,
    players,
    scores: scoreRows,
    showWildcard: t.show_wildcard !== 0,
    netRankings: (isGj ? ranked.netRankings : ranked.strokeRankings || []).map(stripPin),
    grossRankings: (ranked.grossRankings || []).map(stripPin),
    finalRankings: isGj ? [] : (ranked.finalRankings || []).map(stripPin),
    championChain: ranked.championChain || null,
    othersChain: ranked.othersChain || null,
    playoffWinnerId: ranked.playoffWinnerId || null,
  };
}

module.exports = (db) => {
  const router = express.Router();

  // Public: which years can be opened, without shipping every snapshot
  router.get('/', (req, res) => {
    const rows = db.prepare(
      'SELECT year, created_at FROM archives WHERE slug=? ORDER BY year DESC'
    ).all(resolveSlug(req));
    res.json({ archives: rows });
  });

  // Public: one frozen year
  router.get('/:year', (req, res) => {
    const row = db.prepare('SELECT * FROM archives WHERE slug=? AND year=?')
      .get(resolveSlug(req), String(req.params.year));
    if (!row) return res.status(404).json({ error: '這一年沒有封存紀錄' });
    let data;
    try {
      data = JSON.parse(row.data);
    } catch (e) {
      return res.status(500).json({ error: '封存資料損毀' });
    }
    res.json({ year: row.year, created_at: row.created_at, ...data });
  });

  // Admin: freeze the tournament as it stands. Re-running replaces that year,
  // which is what you want after fixing a mis-typed score.
  router.post('/from-tournament', requireAdmin, (req, res) => {
    try {
      const snapshot = buildSnapshot(db, req);
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
      db.prepare(`
        INSERT INTO archives (slug, year, created_at, data) VALUES (?,?,?,?)
        ON CONFLICT(slug, year) DO UPDATE SET created_at=excluded.created_at, data=excluded.data
      `).run(snapshot.slug, snapshot.year, now, JSON.stringify(snapshot));
      res.json({
        success: true,
        year: snapshot.year,
        created_at: now,
        players: snapshot.players.length,
        holes: snapshot.holes.length,
        scores: snapshot.scores.length,
      });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.delete('/:year', requireAdmin, (req, res) => {
    const r = db.prepare('DELETE FROM archives WHERE slug=? AND year=?')
      .run(resolveSlug(req), String(req.params.year));
    if (!r.changes) return res.status(404).json({ error: '這一年沒有封存紀錄' });
    res.json({ success: true });
  });

  return router;
};
