function calculateRankings(db) {
  const tournament = db.prepare('SELECT * FROM tournament ORDER BY id DESC LIMIT 1').get();
  if (!tournament) return null;

  const players = db.prepare('SELECT * FROM players WHERE tournament_id=? ORDER BY player_number').all(tournament.id);
  const sections = db.prepare('SELECT * FROM sections WHERE tournament_id=? ORDER BY section_order').all(tournament.id);

  const allHoles = [];
  for (const sec of sections) {
    const sh = db.prepare('SELECT * FROM holes WHERE section_id=? ORDER BY hole_number').all(sec.id);
    for (const h of sh) {
      allHoles.push({ ...h, sectionId: sec.id, sectionName: sec.name, sectionOrder: sec.section_order });
    }
  }

  const allScores = db.prepare(`
    SELECT s.* FROM scores s
    JOIN players p ON p.id=s.player_id
    WHERE p.tournament_id=?
  `).all(tournament.id);

  const allPicks = db.prepare(`
    SELECT hp.* FROM horse_picks hp
    JOIN players p ON p.id=hp.player_id
    WHERE p.tournament_id=?
  `).all(tournament.id);

  const N = players.length;
  if (N === 0) return { strokeRankings: [], finalRankings: [], N: 0 };

  // Build per-player stats
  const playerStats = players.map(player => {
    if (player.no_show) {
      return { ...player, isNoShow: true, grossScore: null, netScore: null, holesPlayed: 0, sectionTotals: [], holeAnalysis: [], underParCount: 0, parCount: 0, categoryCounts: {} };
    }

    const playerScores = allScores.filter(s => s.player_id === player.id);

    const holeAnalysis = allHoles.map(hole => {
      const rec = playerScores.find(s => s.hole_id === hole.id);
      const strokes = rec ? rec.strokes : null;
      return {
        holeId: hole.id,
        sectionId: hole.sectionId,
        sectionOrder: hole.sectionOrder,
        par: hole.par,
        strokes,
        relativeToPar: strokes !== null ? strokes - hole.par : null
      };
    });

    const completed = holeAnalysis.filter(h => h.strokes !== null);
    const grossScore = completed.reduce((s, h) => s + h.strokes, 0);
    const holesPlayed = completed.length;
    const netScore = holesPlayed > 0 ? grossScore - player.handicap : null;

    // Section totals — only for sections with all 9 holes entered
    const sectionTotals = sections.map(sec => {
      const secHoles = holeAnalysis.filter(h => h.sectionId === sec.id);
      const secCompleted = secHoles.filter(h => h.strokes !== null);
      const total = secCompleted.reduce((s, h) => s + h.strokes, 0);
      return {
        sectionId: sec.id,
        sectionName: sec.name,
        sectionOrder: sec.section_order,
        total: secCompleted.length === secHoles.length ? total : null,
        holesPlayed: secCompleted.length,
        totalHoles: secHoles.length
      };
    });

    // Score category counts
    const underParCount = completed.filter(h => h.relativeToPar <= -1).length;
    const parCount = completed.filter(h => h.relativeToPar === 0).length;
    const categoryCounts = {};
    for (let i = 1; i <= 12; i++) {
      categoryCounts[i] = completed.filter(h => h.relativeToPar === i).length;
    }

    return {
      ...player,
      isNoShow: false,
      grossScore: holesPlayed > 0 ? grossScore : null,
      netScore,
      holesPlayed,
      holeAnalysis,
      sectionTotals,
      underParCount,
      parCount,
      categoryCounts
    };
  });

  // Split into groups
  const withNet = playerStats.filter(p => !p.isNoShow && p.netScore !== null);
  const noScoreYet = playerStats.filter(p => !p.isNoShow && p.netScore === null);
  const noShows = playerStats.filter(p => p.isNoShow);

  // Sort players with net scores
  const sorted = [...withNet].sort((a, b) => {
    if (a.netScore !== b.netScore) return a.netScore - b.netScore;
    return tiebreak(a, b);
  });

  // Assign ranking points
  const ranked = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (
      j < sorted.length &&
      sorted[j].netScore === sorted[i].netScore &&
      tiebreak(sorted[i], sorted[j]) === 0
    ) j++;

    const rank = i + 1;
    const points = N - rank + 1;
    for (let k = i; k < j; k++) {
      ranked.push({ ...sorted[k], rank, rankingPoints: points });
    }
    i = j;
  }

  // Players without scores yet
  const baseRank = ranked.length + 1;
  for (let k = 0; k < noScoreYet.length; k++) {
    ranked.push({ ...noScoreYet[k], rank: baseRank + k, rankingPoints: 0, scoresPending: true });
  }

  // No-shows
  for (const p of noShows) {
    ranked.push({ ...p, rank: N, rankingPoints: 0 });
  }

  // Build picks map
  const picksMap = {};
  allPicks.forEach(p => { picksMap[p.player_id] = p.picked_player_id; });

  // Calculate combined scores
  const withCombined = ranked.map(player => {
    const pickedPlayerId = picksMap[player.id] || null;
    const pickedPlayer = pickedPlayerId ? ranked.find(p => p.id === pickedPlayerId) : null;
    const horsePoints = pickedPlayer ? (pickedPlayer.rankingPoints || 0) : 0;
    const totalPoints = (player.rankingPoints || 0) + horsePoints;
    return {
      ...player,
      pickedPlayerId,
      pickedPlayerName: pickedPlayer
        ? `${pickedPlayer.chinese_name} ${pickedPlayer.english_name}`
        : null,
      horsePoints,
      totalPoints
    };
  });

  // Sort by total combined points (descending)
  const finalSorted = [...withCombined].sort((a, b) => b.totalPoints - a.totalPoints);

  // Assign final ranks (shared if tied)
  let finalRank = 1;
  for (let idx = 0; idx < finalSorted.length; idx++) {
    if (idx > 0 && finalSorted[idx].totalPoints === finalSorted[idx - 1].totalPoints) {
      finalSorted[idx].finalRank = finalSorted[idx - 1].finalRank;
    } else {
      finalSorted[idx].finalRank = finalRank;
    }
    finalRank++;
  }

  return { strokeRankings: ranked, finalRankings: finalSorted, N };
}

// Returns negative if a is better (higher rank), positive if b is better
function tiebreak(a, b) {
  // TB1: most under-par holes (birdie or better — more is better)
  if (a.underParCount !== b.underParCount) return b.underParCount - a.underParCount;

  // TB2: most pars (more is better)
  if (a.parCount !== b.parCount) return b.parCount - a.parCount;

  // TB3+: fewest bogeys, fewest doubles, fewest triples... up to +12 (fewer is better)
  for (let overPar = 1; overPar <= 12; overPar++) {
    const ac = a.categoryCounts[overPar] || 0;
    const bc = b.categoryCounts[overPar] || 0;
    if (ac !== bc) return ac - bc;
  }

  return 0; // truly tied — share rank
}

module.exports = { calculateRankings };
