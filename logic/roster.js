// The club roster: one record per person, across both tournaments.
//
// Identity is the hard part here. A player used to exist only inside a single
// tournament, and the two tournaments were filled in differently — the Ring Cup
// carries 林楮君 William, the Green Jacket just William. Matching on the full
// name finds nothing; matching on the English name finds everyone who plays both.
// So that is the key, with the Chinese name as a fallback for anyone who has no
// English name at all.
//
// Past rounds live in frozen archive snapshots that were written before this
// table existed and cannot be rewritten, so their players carry no club id.
// They are matched by name too.

// Punctuation and spacing are dropped, so J.J. and JJ are the same person —
// they were typed by different people on different days.
const norm = (s) => String(s || '').toLowerCase().replace(/[\s.,_'’-]/g, '');

// The key two records of the same person will share
function identityKey(player) {
  const en = norm(player.english_name);
  if (en) return 'en:' + en;
  const zh = norm(player.chinese_name);
  return zh ? 'zh:' + zh : '';
}

const displayName = (p) =>
  [p.chinese_name, p.english_name].filter(Boolean).join(' ').trim() || '(未命名)';

// Names this member has also been entered under. Merging two records keeps the
// absorbed one's name here, because archived snapshots are frozen with whatever
// name was used that year and can never be corrected.
function aliasesOf(member) {
  try {
    const parsed = JSON.parse(member?.aliases || '');
    return Array.isArray(parsed) ? parsed.filter(a => a && (a.chinese_name || a.english_name)) : [];
  } catch (e) {
    return [];
  }
}

const nameFormsOf = (member) => [
  { chinese_name: member.chinese_name, english_name: member.english_name },
  ...aliasesOf(member),
];

function matchesNameForm(row, form) {
  const rowEn = norm(row.english_name), formEn = norm(form.english_name);
  if (rowEn && formEn) return rowEn === formEn;
  const rowZh = norm(row.chinese_name), formZh = norm(form.chinese_name);
  return !!rowZh && rowZh === formZh;
}

// Does this archived or live player row refer to that club member?
function matchesClubPlayer(row, member) {
  return nameFormsOf(member).some(form => matchesNameForm(row, form));
}

// Gathers every distinct person out of the live tournaments and the archives,
// newest handicap winning, so the roster can be seeded from what already exists.
function collectCandidates(db) {
  const seen = new Map();
  const add = (row, source, when) => {
    const key = identityKey(row);
    if (!key) return;
    if (!seen.has(key)) {
      seen.set(key, {
        key,
        chinese_name: row.chinese_name || '',
        english_name: row.english_name || '',
        handicap: row.handicap,
        wildcard: !!row.wildcard,
        tee: row.tee || 'white',
        sources: [],
        latest: when || '',
      });
    }
    const person = seen.get(key);
    // Fill in a name the other tournament had and this one did not
    if (!person.chinese_name && row.chinese_name) person.chinese_name = row.chinese_name;
    if (!person.english_name && row.english_name) person.english_name = row.english_name;
    // The most recent appearance decides the handicap and status
    if ((when || '') >= (person.latest || '')) {
      person.latest = when || person.latest;
      if (Number.isFinite(row.handicap)) person.handicap = row.handicap;
      if (row.tee) person.tee = row.tee;
      person.wildcard = !!row.wildcard;
    }
    if (!person.sources.includes(source)) person.sources.push(source);
  };

  for (const t of db.prepare('SELECT * FROM tournament').all()) {
    const when = t.date || '';
    const label = `${t.name || t.slug}（目前名單）`;
    for (const p of db.prepare('SELECT * FROM players WHERE tournament_id=?').all(t.id)) {
      add(p, label, when);
    }
  }

  for (const a of db.prepare('SELECT * FROM archives ORDER BY year').all()) {
    let snap;
    try { snap = JSON.parse(a.data); } catch (e) { continue; }
    const when = snap.tournament?.date || `${a.year}-01-01`;
    const label = `${snap.tournament?.name || a.slug} ${a.year}`;
    for (const p of snap.players || []) add(p, label, when);
  }

  return [...seen.values()].sort((a, b) =>
    displayName(a).localeCompare(displayName(b), 'zh-Hant'));
}

// Every round a club member has played, most recent first. Live tournaments and
// archived years both contribute; an archived year wins when it covers the same
// tournament and date, because it is the finished record.
function roundsFor(db, member) {
  const rounds = [];

  for (const a of db.prepare('SELECT * FROM archives ORDER BY year DESC').all()) {
    let snap;
    try { snap = JSON.parse(a.data); } catch (e) { continue; }
    const entry = (snap.netRankings || []).find(p => matchesClubPlayer(p, member));
    if (!entry) continue;
    const group = (snap.groups || []).find(g => g.id === entry.group_id);
    const mates = (snap.players || [])
      .filter(p => p.group_id === entry.group_id && !matchesClubPlayer(p, member))
      .map(displayName);
    const final = (snap.finalRankings || []).find(p => matchesClubPlayer(p, member));
    rounds.push({
      slug: a.slug,
      year: a.year,
      archived: true,
      tournamentName: snap.tournament?.name || a.slug,
      date: snap.tournament?.date || '',
      course: snap.tournament?.course_name || '',
      parTotal: snap.parTotal,
      holes: (snap.holes || []).map(h => ({ label: h.label, par: h.par })),
      strokes: entry.strokesInPlayOrder
        || (snap.holes || []).map(h => {
          const s = (snap.scores || []).find(x => x.player_id === entry.id && x.hole_id === h.id);
          return s ? s.strokes : null;
        }),
      handicap: entry.handicap,
      grossScore: entry.grossScore,
      netScore: entry.netScore,
      rank: entry.rank,
      isNoShow: !!entry.isNoShow,
      wildcard: !!entry.wildcard,
      groupName: group?.name || '',
      groupMates: mates,
      awards: entry.awards || [],
      totalPoints: final?.totalPoints ?? null,
      pickedPlayerName: final?.pickedPlayerName || null,
    });
  }

  // The season currently being set up or played, which has no archive yet
  for (const t of db.prepare('SELECT * FROM tournament').all()) {
    const already = rounds.some(r => r.slug === t.slug && r.year === (t.date || '').slice(0, 4));
    if (already) continue;
    const entry = db.prepare(`
      SELECT * FROM players WHERE tournament_id=? AND (club_player_id=? OR club_player_id IS NULL)
    `).all(t.id).find(p => (p.club_player_id === member.id) || matchesClubPlayer(p, member));
    if (!entry) continue;
    const scoreRows = db.prepare('SELECT hole_id, strokes FROM scores WHERE player_id=?').all(entry.id);
    if (!scoreRows.length && !entry.no_show) continue;   // entered but has not played yet
    rounds.push({
      slug: t.slug,
      year: (t.date || '').slice(0, 4),
      archived: false,
      tournamentName: t.name || t.slug,
      date: t.date || '',
      course: t.course_name || '',
      handicap: entry.handicap,
      holesEntered: scoreRows.length,
      grossScore: scoreRows.reduce((sum, s) => sum + s.strokes, 0) || null,
      isNoShow: !!entry.no_show,
      wildcard: !!entry.wildcard,
      inProgress: true,
    });
  }

  return rounds.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

// Headline figures for a player's page. Only finished, archived rounds count —
// a round still being played would move every number on every refresh.
function statsFor(rounds) {
  const done = rounds.filter(r => r.archived && !r.isNoShow && r.netScore !== null && r.netScore !== undefined);
  if (!done.length) {
    return { played: 0, wins: 0, bestNet: null, bestGross: null, avgToPar: null, birdies: 0, eagles: 0 };
  }
  let birdies = 0, eagles = 0;
  let toParSum = 0, toParCount = 0;
  for (const r of done) {
    (r.strokes || []).forEach((s, i) => {
      const par = r.holes?.[i]?.par;
      if (s === null || s === undefined || !par) return;
      const rel = s - par;
      if (rel <= -2) eagles++;
      else if (rel === -1) birdies++;
    });
    if (Number.isFinite(r.netScore) && Number.isFinite(r.parTotal)) {
      toParSum += r.netScore - r.parTotal;
      toParCount++;
    }
  }
  return {
    played: done.length,
    wins: done.filter(r => r.rank === 1).length,
    bestNet: Math.min(...done.map(r => r.netScore)),
    bestGross: Math.min(...done.map(r => r.grossScore)),
    avgToPar: toParCount ? Math.round((toParSum / toParCount) * 10) / 10 : null,
    birdies,
    eagles,
  };
}

module.exports = {
  identityKey, displayName, matchesClubPlayer, aliasesOf, nameFormsOf,
  collectCandidates, roundsFor, statsFor,
};
