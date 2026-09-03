// Green Jacket ranking engine — pure net stroke play.
//
// Deliberately separate from logic/rankings.js (the Ring Cup engine): no horse
// picks, no ranking points, and a tiebreaker chain the admin configures at
// runtime rather than one hardcoded here.
//
// Nothing about the course is hardcoded. Hole order, "back nine", "last three"
// and the hole-by-hole countback are all derived from the holes stored in the
// database, so when hole 15 reopens and 10A goes away the rules still hold.

const TIEBREAK_RULES = {
  pk:             { label: '果嶺 PK',      manual: true },
  hcp_low:        { label: '差點低',       compare: (a, b) => a.handicap - b.handicap },
  hcp_high:       { label: '差點高',       compare: (a, b) => b.handicap - a.handicap },
  back9:          { label: '後九總桿',     compare: (a, b) => diff(a.back9, b.back9) },
  front9:         { label: '前九總桿',     compare: (a, b) => diff(a.front9, b.front9) },
  last6:          { label: '後六洞總桿',   compare: (a, b) => diff(a.last6, b.last6) },
  last3:          { label: '後三洞總桿',   compare: (a, b) => diff(a.last3, b.last3) },
  last1:          { label: '最後一洞',     compare: (a, b) => diff(a.last1, b.last1) },
  hole_countback: { label: '逐洞倒數',     compare: holeCountback },
};

const DEFAULT_CHAMPION_CHAIN = ['pk'];
const DEFAULT_OTHERS_CHAIN = ['back9', 'hole_countback'];

// Side awards on the net leaderboard: Lucky 7 for seventh place, BB for second
// to last. They stay hidden until every player has holed out.
//
// Mid-round they would be worse than useless: net score is strokes so far minus
// the full handicap, so whoever has played fewest holes sits top, and BB would
// land on the group furthest along. Countback is also skipped for unfinished
// rounds, so ties — and a missing seventh place — are common until the cards are
// in. Once everyone is done the order is final and countback separates them.
const LUCKY_SEVEN_RANK = 7;

// null means "no score", which can never win a comparison
function diff(a, b) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

// Walks holes from the last one played backwards. With hole 15 closed the order
// is 10A, 18, 17, 16, 14 ... 1 — that comes from the data, not from this code.
function holeCountback(a, b) {
  for (let i = a.strokesInPlayOrder.length - 1; i >= 0; i--) {
    const d = diff(a.strokesInPlayOrder[i], b.strokesInPlayOrder[i]);
    if (d !== 0) return d;
  }
  return 0;
}

function parseChain(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) {
      const valid = parsed.filter(id => TIEBREAK_RULES[id]);
      if (valid.length) return valid;
    }
  } catch (e) { /* fall through */ }
  return fallback;
}

// Applies a chain to two tied players.
// Returns { order, reason } where order < 0 means a ranks above b, and
// order === null means the chain stopped at a manual rule (green playoff).
function applyChain(chain, a, b, bothComplete) {
  for (const id of chain) {
    const rule = TIEBREAK_RULES[id];
    if (!rule) continue;
    if (rule.manual) return { order: null, reason: rule.label };
    // Countback on a half-finished round compares nothing meaningful
    if (!bothComplete) continue;
    const order = rule.compare(a, b);
    if (order !== 0) return { order, reason: rule.label };
  }
  return { order: 0, reason: null };
}

function calculateGjRankings(db, tournamentId) {
  const tournament = tournamentId
    ? db.prepare('SELECT * FROM tournament WHERE id=?').get(tournamentId)
    : db.prepare("SELECT * FROM tournament WHERE slug='greenjacket'").get();
  if (!tournament) return null;

  const players = db.prepare('SELECT * FROM players WHERE tournament_id=? ORDER BY player_number').all(tournament.id);
  const sections = db.prepare(
    'SELECT * FROM sections WHERE tournament_id=? AND (active IS NULL OR active=1) ORDER BY section_order'
  ).all(tournament.id);

  // Holes in the order they are actually played
  const holesInPlayOrder = [];
  for (const sec of sections) {
    const secHoles = db.prepare('SELECT * FROM holes WHERE section_id=? ORDER BY hole_number').all(sec.id);
    for (const h of secHoles) {
      holesInPlayOrder.push({
        ...h,
        label: h.hole_label || String(h.hole_number),
        sectionId: sec.id,
        sectionName: sec.name,
        sectionOrder: sec.section_order,
      });
    }
  }
  const totalHoles = holesInPlayOrder.length;
  const parTotal = holesInPlayOrder.reduce((s, h) => s + h.par, 0);

  const firstSectionId = sections.length ? sections[0].id : null;
  const lastSectionId = sections.length ? sections[sections.length - 1].id : null;

  const allScores = db.prepare(`
    SELECT s.* FROM scores s JOIN players p ON p.id=s.player_id WHERE p.tournament_id=?
  `).all(tournament.id);

  const championChain = parseChain(tournament.tiebreak_champion, DEFAULT_CHAMPION_CHAIN);
  const othersChain = parseChain(tournament.tiebreak_others, DEFAULT_OTHERS_CHAIN);

  const stats = players.map(player => {
    const mine = allScores.filter(s => s.player_id === player.id);
    const byHole = new Map(mine.map(s => [s.hole_id, s.strokes]));

    const strokesInPlayOrder = holesInPlayOrder.map(h => byHole.has(h.id) ? byHole.get(h.id) : null);
    const played = strokesInPlayOrder.filter(v => v !== null);
    const holesPlayed = played.length;
    const grossScore = played.reduce((a, b) => a + b, 0);

    const sumWhere = (predicate) => {
      const vals = holesInPlayOrder.map((h, i) => predicate(h, i) ? strokesInPlayOrder[i] : null).filter(v => v !== null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
    };
    const sumLast = (n) => {
      const slice = strokesInPlayOrder.slice(-n);
      return slice.every(v => v !== null) ? slice.reduce((a, b) => a + b, 0) : null;
    };

    const parPlayed = holesInPlayOrder.reduce((s, h, i) => strokesInPlayOrder[i] !== null ? s + h.par : s, 0);

    return {
      ...player,
      displayName: player.chinese_name || player.english_name,
      isNoShow: !!player.no_show,
      strokesInPlayOrder,
      holesPlayed,
      totalHoles,
      isComplete: holesPlayed === totalHoles && totalHoles > 0,
      grossScore: holesPlayed > 0 ? grossScore : null,
      netScore: holesPlayed > 0 ? grossScore - player.handicap : null,
      toPar: holesPlayed > 0 ? grossScore - parPlayed : null,
      front9: sumWhere(h => h.sectionId === firstSectionId),
      back9:  sumWhere(h => h.sectionId === lastSectionId),
      last6:  sumLast(6),
      last3:  sumLast(3),
      last1:  sumLast(1),
    };
  });

  return { tournament, holesInPlayOrder, parTotal, stats, championChain, othersChain };
}

// Ranks one bucket of players that all share a completion state.
// The champion group (rank 1) uses its own chain — typically just the green
// playoff, which the engine cannot resolve on its own.
function rankBucket(bucket, { championChain, othersChain, playoffWinnerId, startRank }) {
  const out = [];
  let i = 0;
  let nextRank = startRank;

  while (i < bucket.length) {
    let j = i + 1;
    while (j < bucket.length && bucket[j].netScore === bucket[i].netScore) j++;
    let group = bucket.slice(i, j);
    const chain = nextRank === 1 ? championChain : othersChain;

    if (group.length === 1) {
      out.push({ ...group[0], rank: nextRank });
      nextRank += 1;
      i = j;
      continue;
    }

    // A manual rule (green playoff) stops the chain: the tie stands until the
    // admin records who won on the putting green.
    let awaitingPlayoff = false;
    let playoffLabel = null;
    group = [...group].sort((a, b) => {
      const r = applyChain(chain, a, b, a.isComplete && b.isComplete);
      if (r.order === null) { awaitingPlayoff = true; playoffLabel = r.reason; return 0; }
      return r.order;
    });

    // If the playoff has been decided, the winner takes the top slot outright.
    if (awaitingPlayoff && playoffWinnerId) {
      const wi = group.findIndex(p => p.id === playoffWinnerId);
      if (wi >= 0) {
        const winner = group[wi];
        group = [winner, ...group.slice(0, wi), ...group.slice(wi + 1)];
        out.push({ ...winner, rank: nextRank, tiebreakWon: playoffLabel });
        nextRank += 1;
        // Everyone left in the group lost the playoff to that winner, so they
        // each carry the "lost" label even when they stay tied with each other.
        group = group.slice(1).map(p => ({ ...p, tiebreakLost: p.tiebreakLost || playoffLabel }));
        awaitingPlayoff = false;
        if (group.length === 1) {
          out.push({ ...group[0], rank: nextRank, tiebreakLost: playoffLabel });
          nextRank += 1;
          i = j;
          continue;
        }
      }
    }

    // Assign ranks inside the group, sharing only where nothing separated them
    let k = 0;
    while (k < group.length) {
      let m = k + 1;
      const reasons = [];
      while (m < group.length) {
        const r = applyChain(chain, group[m - 1], group[m], group[m - 1].isComplete && group[m].isComplete);
        if (r.order === null || r.order === 0) { reasons.push(r.reason); m++; }
        else break;
      }
      const shared = group.slice(k, m);
      const rank = nextRank;
      for (const p of shared) {
        out.push({
          ...p,
          rank,
          sharedRank: shared.length > 1,
          awaitingPlayoff: awaitingPlayoff && shared.length > 1,
          playoffLabel: awaitingPlayoff && shared.length > 1 ? playoffLabel : null,
        });
      }
      nextRank += shared.length;
      k = m;
    }
    i = j;
  }

  // Label who beat whom, and on which criterion — same idea as the Ring Cup badges
  for (let n = 0; n < out.length - 1; n++) {
    const a = out[n], b = out[n + 1];
    if (a.netScore === null || a.netScore !== b.netScore || a.rank === b.rank) continue;
    const chain = a.rank === 1 ? championChain : othersChain;
    const r = applyChain(chain, a, b, a.isComplete && b.isComplete);
    if (r.order !== null && r.order !== 0 && r.reason) {
      out[n] = { ...a, tiebreakWon: a.tiebreakWon || r.reason };
      out[n + 1] = { ...b, tiebreakLost: b.tiebreakLost || r.reason };
    }
  }

  return { ranked: out, nextRank };
}

// Full result set for the Green Jacket: net rankings (the competition) plus
// gross rankings (traditional stroke play, shown on its own tab).
function buildGjRankings(db, tournamentId) {
  const base = calculateGjRankings(db, tournamentId);
  if (!base) return null;
  const { tournament, stats, championChain, othersChain, holesInPlayOrder, parTotal } = base;

  const noShows = stats.filter(p => p.isNoShow);
  const active = stats.filter(p => !p.isNoShow);
  const scored = active.filter(p => p.netScore !== null);
  const unscored = active.filter(p => p.netScore === null);

  // Finished rounds rank above rounds still in progress, so a player who has
  // only played nine holes never appears to be beating a player who played all 18.
  const byNet = (a, b) => a.netScore - b.netScore;
  const complete = scored.filter(p => p.isComplete).sort(byNet);
  const partial  = scored.filter(p => !p.isComplete).sort(byNet);

  const opts = {
    championChain,
    othersChain,
    playoffWinnerId: tournament.playoff_winner_id || null,
    startRank: 1,
  };
  const completeRanked = rankBucket(complete, opts);
  const partialRanked = rankBucket(partial, { ...opts, championChain: othersChain, startRank: completeRanked.nextRank });

  const netRankings = [
    ...completeRanked.ranked,
    ...partialRanked.ranked.map(p => ({ ...p, inProgress: true })),
    ...unscored.map((p, i) => ({ ...p, rank: partialRanked.nextRank + i, scoresPending: true })),
    ...noShows.map(p => ({ ...p, rank: null, isNoShow: true })),
  ];

  // Gross rankings — raw strokes, no handicap, ties simply share a rank
  const grossSorted = [...scored].sort((a, b) => {
    if (a.isComplete !== b.isComplete) return a.isComplete ? -1 : 1;
    return a.grossScore - b.grossScore;
  });
  const grossRankings = [];
  let gi = 0;
  while (gi < grossSorted.length) {
    let gj = gi + 1;
    while (gj < grossSorted.length &&
           grossSorted[gj].grossScore === grossSorted[gi].grossScore &&
           grossSorted[gj].isComplete === grossSorted[gi].isComplete) gj++;
    for (let k = gi; k < gj; k++) {
      grossRankings.push({ ...grossSorted[k], grossRank: gi + 1, inProgress: !grossSorted[k].isComplete });
    }
    gi = gj;
  }
  grossRankings.push(...unscored.map((p, i) => ({ ...p, grossRank: grossRankings.length + i + 1, scoresPending: true })));
  grossRankings.push(...noShows.map(p => ({ ...p, grossRank: null, isNoShow: true })));

  const awaitingPlayoff = netRankings.some(p => p.awaitingPlayoff);

  // Lucky 7 / BB, on the net leaderboard only. Second to last is the next
  // distinct rank above the last one, so a tie at the bottom hands the award to
  // everyone sharing that rank rather than to nobody.
  const awardsVisible = tournament.status === 'finished' ||
    (active.length > 0 && active.every(p => p.isComplete));
  let netWithAwards = netRankings;
  if (awardsVisible) {
    const placed = netRankings.filter(p => !p.isNoShow && p.netScore !== null && p.rank !== null && p.rank !== undefined);
    const ranks = [...new Set(placed.map(p => p.rank))].sort((a, b) => a - b);
    const secondLastRank = ranks.length >= 2 ? ranks[ranks.length - 2] : null;
    netWithAwards = netRankings.map(p => {
      if (p.isNoShow || p.netScore === null || p.rank === null || p.rank === undefined) return p;
      const awards = [];
      if (p.rank === LUCKY_SEVEN_RANK) awards.push('lucky7');
      if (secondLastRank !== null && p.rank === secondLastRank) awards.push('bb');
      return awards.length ? { ...p, awards } : p;
    });
  }

  return {
    tournament,
    holes: holesInPlayOrder,
    parTotal,
    netRankings: netWithAwards,
    awardsVisible,
    grossRankings,
    championChain,
    othersChain,
    awaitingPlayoff,
    playoffWinnerId: tournament.playoff_winner_id || null,
    N: active.length,
  };
}

module.exports = {
  calculateGjRankings,
  buildGjRankings,
  TIEBREAK_RULES,
  DEFAULT_CHAMPION_CHAIN,
  DEFAULT_OTHERS_CHAIN,
  applyChain,
  parseChain,
};
