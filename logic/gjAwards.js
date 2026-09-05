// Side awards for the Green Jacket, chosen by the organiser each year.
//
// These are the fun prizes handed out alongside the net title, and which ones
// run changes from season to season — so they are configuration, not code. The
// admin turns each on, sets its number and renames it; this file only knows how
// to decide who wins.
//
// Every award is judged on players who finished the round. A no-show, or anyone
// with holes still missing, is never a winner.

const HOLE_QUALITY = [
  { key: 'albatross', label: '信天翁', test: (rel) => rel <= -3 },
  { key: 'eagle',     label: '老鷹',   test: (rel) => rel === -2 },
  { key: 'birdie',    label: '小鳥',   test: (rel) => rel === -1 },
  { key: 'par',       label: 'Par',    test: (rel) => rel === 0 },
  { key: 'bogey',     label: '柏忌',   test: (rel) => rel === 1 },
];

// Higher is better for every key here, which is what bestBy expects
const countGetters = (keys) => keys.map(k => (p) => p.quality[k] || 0);

// All players tied at the top once the chain has been applied
function bestBy(players, getters) {
  const compare = (a, b) => {
    for (const get of getters) {
      const d = get(a) - get(b);
      if (d !== 0) return d;          // higher wins
    }
    return 0;
  };
  let best = [];
  for (const p of players) {
    if (!best.length) { best = [p]; continue; }
    const c = compare(p, best[0]);
    if (c > 0) best = [p];
    else if (c === 0) best.push(p);
  }
  return best;
}

const AWARD_TYPES = {
  rank_at: {
    label: '名次獎',
    hint: '指定名次的人得獎,例如第 7 名的 Lucky 7',
    defaultName: 'Lucky 7 獎',
    emoji: '🍀',
    params: [{ key: 'rank', label: '第幾名', default: 7, min: 1, max: 99 }],
    pick: (players, { rank }) => players.filter(p => p.rank === rank),
  },

  rank_from_last: {
    label: '倒數名次獎',
    hint: '從最後一名往回數,例如倒數第 2 名的 BB 獎',
    defaultName: 'BB 獎',
    emoji: '🎱',
    params: [{ key: 'fromLast', label: '倒數第幾名', default: 2, min: 1, max: 99 }],
    pick: (players, { fromLast }) => {
      // Counted on distinct ranks, so a tie at the bottom does not swallow the award
      const ranks = [...new Set(players.map(p => p.rank))].sort((a, b) => a - b);
      const target = ranks[ranks.length - fromLast];
      return target === undefined ? [] : players.filter(p => p.rank === target);
    },
  },

  rank_every: {
    label: '跳號獎',
    hint: '每隔幾名發一次,例如間隔 7 就是第 7、14、21… 名',
    defaultName: '跳七獎',
    emoji: '🎯',
    params: [{ key: 'step', label: '每隔幾名', default: 7, min: 2, max: 50 }],
    pick: (players, { step }) => players.filter(p => p.rank % step === 0),
  },

  big_swing: {
    label: '大坡獎',
    hint: '前九與後九總桿差距最大(不分方向)。同分時比信天翁→老鷹→小鳥→Par→柏忌,多者勝',
    defaultName: '大坡獎',
    emoji: '⛰️',
    params: [],
    pick: (players) => {
      const eligible = players.filter(p => p.swing !== null);
      if (!eligible.length) return [];
      return bestBy(eligible, [
        (p) => p.swing,
        ...countGetters(['albatross', 'eagle', 'birdie', 'par', 'bogey']),
      ]);
    },
  },

  best_scoring: {
    label: '最多老鷹小鳥獎',
    hint: '比信天翁數 → 老鷹數 → 小鳥數,多者勝',
    defaultName: '最多老鷹小鳥獎',
    emoji: '🦅',
    params: [],
    pick: (players) => {
      const withOne = players.filter(p =>
        (p.quality.albatross + p.quality.eagle + p.quality.birdie) > 0);
      if (!withOne.length) return [];      // nobody broke par — award goes unclaimed
      return bestBy(withOne, countGetters(['albatross', 'eagle', 'birdie']));
    },
  },
};

// What a Green Jacket runs when the organiser has not chosen anything — the two
// awards handed out in 2026, so an untouched tournament behaves as it did.
const DEFAULT_AWARDS = [
  { type: 'rank_at', name: 'Lucky 7 獎', params: { rank: 7 } },
  { type: 'rank_from_last', name: 'BB 獎', params: { fromLast: 2 } },
];

// Trusts nothing: unknown types are dropped, numbers are clamped to their range,
// names are trimmed to something that fits on a badge.
function sanitizeAwards(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const entry of raw.slice(0, 12)) {
    const spec = AWARD_TYPES[entry?.type];
    if (!spec) continue;
    const params = {};
    for (const p of spec.params) {
      const n = Math.round(Number(entry.params?.[p.key]));
      params[p.key] = Number.isFinite(n) ? Math.min(p.max, Math.max(p.min, n)) : p.default;
    }
    const name = String(entry.name ?? '').trim().slice(0, 20) || spec.defaultName;
    out.push({ type: entry.type, name, params });
  }
  return out;
}

function parseAwards(rawJson) {
  try {
    const parsed = JSON.parse(rawJson);
    const clean = sanitizeAwards(parsed);
    if (clean) return clean;            // an empty array means "no awards", and is respected
  } catch (e) { /* fall through */ }
  return DEFAULT_AWARDS;
}

// Per-player figures the awards are judged on
function statsFor(player, holes) {
  const quality = Object.fromEntries(HOLE_QUALITY.map(q => [q.key, 0]));
  const strokes = player.strokesInPlayOrder || [];
  holes.forEach((h, i) => {
    const s = strokes[i];
    if (s === null || s === undefined) return;
    const rel = s - h.par;
    for (const q of HOLE_QUALITY) if (q.test(rel)) { quality[q.key]++; break; }
  });
  const swing = (player.front9 === null || player.front9 === undefined ||
                 player.back9 === null || player.back9 === undefined)
    ? null
    : Math.abs(player.front9 - player.back9);
  return { quality, swing };
}

// Returns a Map of player id → [{ type, name, emoji }], in the order configured
function computeAwards(netRankings, holes, config) {
  const winners = new Map();
  const eligible = netRankings
    .filter(p => !p.isNoShow && p.isComplete && p.netScore !== null && p.rank !== null && p.rank !== undefined)
    .map(p => ({ ...p, ...statsFor(p, holes) }));
  if (!eligible.length) return winners;

  for (const award of config) {
    const spec = AWARD_TYPES[award.type];
    if (!spec) continue;
    let won = [];
    try {
      won = spec.pick(eligible, award.params || {}) || [];
    } catch (e) {
      won = [];
    }
    for (const p of won) {
      if (!winners.has(p.id)) winners.set(p.id, []);
      winners.get(p.id).push({ type: award.type, name: award.name, emoji: spec.emoji });
    }
  }
  return winners;
}

module.exports = {
  AWARD_TYPES,
  DEFAULT_AWARDS,
  HOLE_QUALITY,
  sanitizeAwards,
  parseAwards,
  computeAwards,
  statsFor,
};
