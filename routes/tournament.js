const express = require('express');

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

module.exports = (db) => {
  const router = express.Router();

  // Public: get all tournament info
  router.get('/', (req, res) => {
    const t = db.prepare('SELECT * FROM tournament ORDER BY id DESC LIMIT 1').get();
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
    const { course_name, date, tee_time, total_players } = req.body;
    const t = db.prepare('SELECT id FROM tournament ORDER BY id DESC LIMIT 1').get();
    db.prepare('UPDATE tournament SET course_name=?, date=?, tee_time=?, total_players=? WHERE id=?')
      .run(course_name, date, tee_time, Number(total_players) || 0, t.id);
    res.json({ success: true });
  });

  // Admin: update rules
  router.put('/rules', requireAdmin, (req, res) => {
    const { rules_text, brief_rules } = req.body;
    const t = db.prepare('SELECT id FROM tournament ORDER BY id DESC LIMIT 1').get();
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
      const t = db.prepare('SELECT id FROM tournament ORDER BY id DESC LIMIT 1').get();
      if (!t) return res.status(400).json({ error: 'No tournament found' });

      const existingSecs = db.prepare('SELECT id FROM sections WHERE tournament_id=?').all(t.id);
      for (const s of existingSecs) {
        db.prepare('DELETE FROM holes WHERE section_id=?').run(s.id);
      }
      db.prepare('DELETE FROM sections WHERE tournament_id=?').run(t.id);

      for (let i = 0; i < sections.length; i++) {
        const sec = sections[i];
        if (!sec.name || !Array.isArray(sec.holes)) continue;
        const active = sec.active === false || sec.active === 0 ? 0 : 1;
        const r = db.prepare('INSERT INTO sections (tournament_id, name, section_order, active) VALUES (?,?,?,?)').run(t.id, sec.name, i + 1, active);
        const sectionId = Number(r.lastInsertRowid); // node:sqlite may return BigInt
        for (const hole of sec.holes) {
          db.prepare('INSERT INTO holes (section_id, hole_number, par, yards) VALUES (?,?,?,?)').run(sectionId, hole.hole_number, hole.par, hole.yards || 0);
        }
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
    const t = db.prepare('SELECT id FROM tournament ORDER BY id DESC LIMIT 1').get();
    db.prepare('UPDATE tournament SET status=? WHERE id=?').run(status, t.id);
    res.json({ success: true });
  });

  // Admin: soft reset — keep setup, clear game data only
  router.delete('/soft-reset', requireAdmin, (req, res) => {
    const t = db.prepare('SELECT id FROM tournament ORDER BY id DESC LIMIT 1').get();
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
    const t = db.prepare('SELECT id FROM tournament ORDER BY id DESC LIMIT 1').get();
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

  return router;
};
