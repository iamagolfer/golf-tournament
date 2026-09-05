const express = require('express');
const { resolveSlug, requireAdmin, getTournament, GREENJACKET } = require('../lib/tournamentContext');
const { calculateRankings } = require('../logic/rankings');
const { buildGjRankings } = require('../logic/gjRankings');

// Scores are recorded the way the history has always shown them: net strokes
// relative to par, signed. A player who never turned up is marked, not scored.
function formatScore(netToPar) {
  if (netToPar === null || netToPar === undefined) return '';
  if (netToPar === 0) return '0';
  return netToPar > 0 ? `+${netToPar}` : String(netToPar);
}

function fullName(p) {
  return [p.chinese_name, p.english_name].filter(Boolean).join(' ').trim();
}

// Past champions, per tournament. Kept in the database rather than hardcoded in
// a page component so the organiser can add each year's winner himself.
module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const slug = resolveSlug(req);
    const champions = db.prepare(
      'SELECT * FROM champions WHERE slug=? ORDER BY display_order, year'
    ).all(slug);
    const results = db.prepare(`
      SELECT cr.* FROM champion_results cr
      JOIN champions c ON c.id=cr.champion_id
      WHERE c.slug=? ORDER BY cr.position
    `).all(slug);
    res.json({
      champions: champions.map(c => ({
        ...c,
        results: results.filter(r => r.champion_id === c.id),
      })),
    });
  });

  // Build a champions entry straight from the tournament that was just played,
  // so the organiser never has to retype a full leaderboard.
  router.get('/preview-from-tournament', requireAdmin, (req, res) => {
    try {
      res.json(buildFromTournament(db, req));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/from-tournament', requireAdmin, (req, res) => {
    try {
      const slug = resolveSlug(req);
      const preview = buildFromTournament(db, req);

      const existing = db.prepare('SELECT id FROM champions WHERE slug=? AND year=?').get(slug, preview.year);
      if (existing && !req.body.overwrite) {
        return res.status(409).json({ error: `${preview.year} 年已有紀錄`, year: preview.year });
      }
      if (existing) {
        db.prepare('DELETE FROM champion_results WHERE champion_id=?').run(existing.id);
        db.prepare('DELETE FROM champions WHERE id=?').run(existing.id);
      }

      const max = db.prepare('SELECT MAX(display_order) m FROM champions WHERE slug=?').get(slug);
      const r = db.prepare(
        'INSERT INTO champions (slug, year, course, champion_name, display_order) VALUES (?,?,?,?,?)'
      ).run(slug, preview.year, preview.course, preview.champion_name, (max?.m || 0) + 1);
      saveResults(db, Number(r.lastInsertRowid), preview.results);
      res.json({ success: true, id: Number(r.lastInsertRowid), ...preview });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/', requireAdmin, (req, res) => {
    const { year, course, champion_name, results } = req.body;
    if (!year || !champion_name) return res.status(400).json({ error: '年份與冠軍必填' });
    const slug = resolveSlug(req);
    const max = db.prepare('SELECT MAX(display_order) m FROM champions WHERE slug=?').get(slug);
    const r = db.prepare(
      'INSERT INTO champions (slug, year, course, champion_name, display_order) VALUES (?,?,?,?,?)'
    ).run(slug, String(year), course || '', champion_name, (max?.m || 0) + 1);
    saveResults(db, Number(r.lastInsertRowid), results);
    res.json({ success: true, id: Number(r.lastInsertRowid) });
  });

  router.put('/:id', requireAdmin, (req, res) => {
    const { year, course, champion_name, results } = req.body;
    const slug = resolveSlug(req);
    const existing = db.prepare('SELECT id FROM champions WHERE id=? AND slug=?').get(req.params.id, slug);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    db.prepare('UPDATE champions SET year=?, course=?, champion_name=? WHERE id=?')
      .run(String(year), course || '', champion_name, existing.id);
    db.prepare('DELETE FROM champion_results WHERE champion_id=?').run(existing.id);
    saveResults(db, existing.id, results);
    res.json({ success: true });
  });

  router.delete('/:id', requireAdmin, (req, res) => {
    const slug = resolveSlug(req);
    const existing = db.prepare('SELECT id FROM champions WHERE id=? AND slug=?').get(req.params.id, slug);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM champion_results WHERE champion_id=?').run(existing.id);
    db.prepare('DELETE FROM champions WHERE id=?').run(existing.id);
    res.json({ success: true });
  });

  return router;
};

// Turns a finished tournament into the shape the champions table stores.
function buildFromTournament(db, req) {
  const slug = resolveSlug(req);
  const t = getTournament(db, req);
  if (!t) throw new Error('找不到賽事');

  // Par for the holes actually in play
  const parTotal = db.prepare(`
    SELECT COALESCE(SUM(h.par), 0) p FROM holes h
    JOIN sections s ON s.id = h.section_id
    WHERE s.tournament_id=? AND (s.active IS NULL OR s.active=1)
  `).get(t.id).p;

  const ranked = slug === GREENJACKET
    ? (buildGjRankings(db, t.id)?.netRankings || [])
    : (calculateRankings(db, t.id)?.strokeRankings || []);

  if (!ranked.length) throw new Error('這個賽事還沒有成績');
  const scored = ranked.filter(p => !p.isNoShow && p.netScore !== null && p.netScore !== undefined);
  if (!scored.length) throw new Error('這個賽事還沒有成績');

  const played = (p) => !p.isNoShow && p.netScore !== null && p.netScore !== undefined;
  const results = ranked.map(p => ({
    player_name: fullName(p),
    score: p.isNoShow ? 'DQ (No Show)'
         : !played(p) ? '未完成'
         : formatScore(p.netScore - parTotal),
    // Kept alongside the to-par figure so the history shows how the score was
    // reached, not just the headline number
    gross: played(p) ? p.grossScore : null,
    handicap: played(p) ? p.handicap : null,
    net: played(p) ? p.netScore : null,
  }));

  const winner = scored[0];
  return {
    year: (t.date || '').slice(0, 4) || String(new Date().getFullYear()),
    course: t.course_name || '',
    champion_name: fullName(winner),
    parTotal,
    results,
  };
}

function saveResults(db, championId, results) {
  if (!Array.isArray(results)) return;
  const ins = db.prepare(
    'INSERT INTO champion_results (champion_id, position, player_name, score, gross, handicap, net) VALUES (?,?,?,?,?,?,?)'
  );
  const num = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
  results
    .filter(r => r && r.player_name)
    .forEach((r, i) => ins.run(championId, i + 1, r.player_name, r.score || '',
      num(r.gross), num(r.handicap), num(r.net)));
}
