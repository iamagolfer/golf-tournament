const express = require('express');
const { getTournament, requireAdmin } = require('../lib/tournamentContext');
const { TIEBREAK_RULES } = require('../logic/gjRankings');


module.exports = (db) => {
  const router = express.Router();

  // Public: get all tournament info
  router.get('/', (req, res) => {
    const t = getTournament(db, req);
    if (!t) return res.json({ tournament: null, sections: [], holes: [] });
    const sections = db.prepare('SELECT * FROM sections WHERE tournament_id=? ORDER BY section_order').all(t.id);
    const holes = [];
    for (const sec of sections) {
      const sh = db.prepare('SELECT * FROM holes WHERE section_id=? ORDER BY hole_number').all(sec.id);
      holes.push(...sh.map(h => ({ ...h, sectionName: sec.name, sectionOrder: sec.section_order })));
    }
    res.json({ tournament: t, sections, holes });
  });

  // Admin: update basic info
  router.put('/info', requireAdmin, (req, res) => {
    const { course_name, date, tee_time, total_players, name } = req.body;
    const t = getTournament(db, req);
    db.prepare('UPDATE tournament SET course_name=?, date=?, tee_time=?, total_players=?, name=COALESCE(?, name) WHERE id=?')
      .run(course_name, date, tee_time, Number(total_players) || 0, name ?? null, t.id);
    res.json({ success: true });
  });

  // Admin: update rules
  router.put('/rules', requireAdmin, (req, res) => {
    const { rules_text, brief_rules } = req.body;
    const t = getTournament(db, req);
    db.prepare('UPDATE tournament SET rules_text=?, brief_rules=? WHERE id=?').run(rules_text, brief_rules, t.id);
    res.json({ success: true });
  });

  // Admin: update course sections and holes
  router.put('/course', requireAdmin, (req, res) => {
    try {
      const { sections } = req.body;
      if (!sections || !Array.isArray(sections)) {
        return res.status(400).json({ error: 'Invalid sections data' });
      }
      const t = getTournament(db, req);
      if (!t) return res.status(400).json({ error: 'No tournament found' });

      // Reconcile in place rather than wiping and re-inserting. Scores are keyed
      // on hole_id, so recreating holes would orphan every score already entered
      // — which matters when the course is edited after a round has been played.
      const existingSecs = db.prepare('SELECT * FROM sections WHERE tournament_id=? ORDER BY section_order').all(t.id);
      const dropHole = (holeId) => {
        db.prepare('DELETE FROM scores WHERE hole_id=?').run(holeId);
        db.prepare('DELETE FROM holes WHERE id=?').run(holeId);
      };

      const wanted = sections.filter(sec => sec.name && Array.isArray(sec.holes));

      for (let i = 0; i < wanted.length; i++) {
        const sec = wanted[i];
        const active = sec.active === false || sec.active === 0 ? 0 : 1;

        let sectionId;
        if (existingSecs[i]) {
          sectionId = existingSecs[i].id;
          db.prepare('UPDATE sections SET name=?, section_order=?, active=? WHERE id=?')
            .run(sec.name, i + 1, active, sectionId);
        } else {
          const r = db.prepare('INSERT INTO sections (tournament_id, name, section_order, active) VALUES (?,?,?,?)')
            .run(t.id, sec.name, i + 1, active);
          sectionId = Number(r.lastInsertRowid); // node:sqlite may return BigInt
        }

        const existingHoles = db.prepare('SELECT * FROM holes WHERE section_id=? ORDER BY hole_number').all(sectionId);
        sec.holes.forEach((hole, hi) => {
          const values = [hi + 1, hole.hole_label || '', hole.par, hole.yards || 0, hole.yards_red || 0];
          if (existingHoles[hi]) {
            db.prepare('UPDATE holes SET hole_number=?, hole_label=?, par=?, yards=?, yards_red=? WHERE id=?')
              .run(...values, existingHoles[hi].id);
          } else {
            db.prepare('INSERT INTO holes (section_id, hole_number, hole_label, par, yards, yards_red) VALUES (?,?,?,?,?,?)')
              .run(sectionId, ...values);
          }
        });
        existingHoles.slice(sec.holes.length).forEach(h => dropHole(h.id));
      }

      // Sections the admin removed
      for (const stale of existingSecs.slice(wanted.length)) {
        db.prepare('SELECT id FROM holes WHERE section_id=?').all(stale.id).forEach(h => dropHole(h.id));
        db.prepare('DELETE FROM sections WHERE id=?').run(stale.id);
      }

      res.json({ success: true });
    } catch (err) {
      console.error('Course save error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: toggle a section's active status (quick, no re-save of holes needed)
  router.put('/sections/:id/active', requireAdmin, (req, res) => {
    const { active } = req.body;
    db.prepare('UPDATE sections SET active=? WHERE id=?').run(active ? 1 : 0, req.params.id);
    res.json({ success: true });
  });

  // Admin: change tournament status
  router.put('/status', requireAdmin, (req, res) => {
    const { status } = req.body;
    const valid = ['setup', 'picking', 'playing', 'revealed', 'finished'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const t = getTournament(db, req);
    db.prepare('UPDATE tournament SET status=? WHERE id=?').run(status, t.id);
    res.json({ success: true });
  });

  // Admin: soft reset — keep setup, clear game data only
  router.delete('/soft-reset', requireAdmin, (req, res) => {
    const t = getTournament(db, req);
    if (!t) return res.json({ success: true });
    // Clear scores, picks, groups; reset no_show and group assignment on players; reset status
    db.prepare('DELETE FROM scores WHERE player_id IN (SELECT id FROM players WHERE tournament_id=?)').run(t.id);
    db.prepare('DELETE FROM horse_picks WHERE player_id IN (SELECT id FROM players WHERE tournament_id=?)').run(t.id);
    db.prepare('DELETE FROM groups WHERE tournament_id=?').run(t.id);
    db.prepare('UPDATE players SET group_id=NULL, no_show=0 WHERE tournament_id=?').run(t.id);
    db.prepare("UPDATE tournament SET status='setup' WHERE id=?").run(t.id);
    res.json({ success: true });
  });

  // Admin: reset entire tournament data
  router.delete('/reset', requireAdmin, (req, res) => {
    const t = getTournament(db, req);
    if (!t) return res.json({ success: true });
    db.prepare('DELETE FROM scores WHERE player_id IN (SELECT id FROM players WHERE tournament_id=?)').run(t.id);
    db.prepare('DELETE FROM horse_picks WHERE player_id IN (SELECT id FROM players WHERE tournament_id=?)').run(t.id);
    db.prepare('DELETE FROM players WHERE tournament_id=?').run(t.id);
    const secs = db.prepare('SELECT id FROM sections WHERE tournament_id=?').all(t.id);
    for (const s of secs) db.prepare('DELETE FROM holes WHERE section_id=?').run(s.id);
    db.prepare('DELETE FROM sections WHERE tournament_id=?').run(t.id);
    db.prepare('DELETE FROM groups WHERE tournament_id=?').run(t.id);
    db.prepare("UPDATE tournament SET course_name='', date='', tee_time='', rules_text='', total_players=0, status='setup' WHERE id=?").run(t.id);
    res.json({ success: true });
  });

  // ---- Green Jacket only ----

  // Admin records who won the sudden-death putting playoff
  router.put('/playoff-winner', requireAdmin, (req, res) => {
    const { playerId } = req.body;
    const t = getTournament(db, req);
    if (!t) return res.status(400).json({ error: 'No tournament found' });
    if (playerId) {
      const p = db.prepare('SELECT id FROM players WHERE id=? AND tournament_id=?').get(playerId, t.id);
      if (!p) return res.status(400).json({ error: 'Player not in this tournament' });
    }
    db.prepare('UPDATE tournament SET playoff_winner_id=? WHERE id=?').run(playerId || null, t.id);
    res.json({ success: true });
  });

  // Admin sets the tiebreaker priority order (champion chain and everyone else)
  router.put('/tiebreak', requireAdmin, (req, res) => {
    const { champion, others } = req.body;
    const clean = (chain) => {
      if (!Array.isArray(chain)) return null;
      const seen = new Set();
      const out = [];
      for (const id of chain) {
        if (!TIEBREAK_RULES[id] || seen.has(id)) continue;
        // Lower-handicap and higher-handicap contradict each other
        if (id === 'hcp_high' && seen.has('hcp_low')) continue;
        if (id === 'hcp_low' && seen.has('hcp_high')) continue;
        seen.add(id);
        out.push(id);
      }
      return out;
    };
    const c = clean(champion), o = clean(others);
    if (!c || !o) return res.status(400).json({ error: 'Invalid tiebreak chain' });
    const t = getTournament(db, req);
    db.prepare('UPDATE tournament SET tiebreak_champion=?, tiebreak_others=? WHERE id=?')
      .run(JSON.stringify(c), JSON.stringify(o), t.id);
    res.json({ success: true, champion: c, others: o });
  });

  // Admin toggles whether the wildcard badge is visible on public pages
  router.put('/wildcard-visibility', requireAdmin, (req, res) => {
    const t = getTournament(db, req);
    db.prepare('UPDATE tournament SET show_wildcard=? WHERE id=?').run(req.body.show ? 1 : 0, t.id);
    res.json({ success: true });
  });

  return router;
};
