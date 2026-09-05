// Green Jacket game-day rehearsal — ranking logic.
//   node logic/gjRehearsal.test.js
//
// Walks every situation that can plausibly happen during a round and checks the
// ranking engine handles it. Uses a throwaway copy of the database, so it never
// touches real data.
//
// Nothing here is tied to a particular roster or course. Players, handicaps,
// hole count, pars and section layout are all read from the database, and the
// test rounds are generated to fit whoever is entered — so this still works next
// year with a different field, and after hole 15 reopens.
const fs = require('fs');
const path = require('path');

const TEST_DB = path.join(__dirname, '..', 'db', 'golf.rehearsal.sqlite');
fs.copyFileSync(path.join(__dirname, '..', 'db', 'golf.sqlite'), TEST_DB);
process.env.DB_PATH = TEST_DB;

const { initDb } = require('../db/init');
const { buildGjRankings } = require('./gjRankings');

const db = initDb();

// Refuse to run if DB_PATH did not take effect — a mis-set path silently falls
// back to the real database, and this test rewrites every score it finds.
const inUse = db.prepare('PRAGMA database_list').all().find(r => r.name === 'main').file;
if (path.resolve(inUse) !== path.resolve(TEST_DB)) {
  console.error('ABORT: not running against the throwaway copy. In use:', inUse);
  process.exit(1);
}

const gj = db.prepare("SELECT * FROM tournament WHERE slug='greenjacket'").get();
if (!gj) { console.error('ABORT: no greenjacket tournament in the database'); process.exit(1); }

const sections = db.prepare(
  'SELECT * FROM sections WHERE tournament_id=? AND (active IS NULL OR active=1) ORDER BY section_order'
).all(gj.id);
const holes = [];
for (const sec of sections) {
  for (const h of db.prepare('SELECT * FROM holes WHERE section_id=? ORDER BY hole_number').all(sec.id)) {
    holes.push({ ...h, sectionId: sec.id, label: h.hole_label || String(h.hole_number) });
  }
}
const players = db.prepare('SELECT * FROM players WHERE tournament_id=? ORDER BY player_number').all(gj.id);

const PARS = holes.map(h => h.par);
const PAR_TOTAL = PARS.reduce((a, b) => a + b, 0);
const FIRST_SEC = sections.length ? sections[0].id : null;
const LAST_SEC = sections.length ? sections[sections.length - 1].id : null;
const frontIdx = holes.map((h, i) => h.sectionId === FIRST_SEC ? i : -1).filter(i => i >= 0);
const backIdx = holes.map((h, i) => h.sectionId === LAST_SEC ? i : -1).filter(i => i >= 0);

if (!holes.length || !players.length) {
  console.error('ABORT: the tournament has no course or no players set up yet');
  process.exit(1);
}

// ── helpers ───────────────────────────────────────────────────────

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const insScore = db.prepare('INSERT INTO scores (player_id, hole_id, strokes, entered_at) VALUES (?,?,?,?)');
const clearScores = () =>
  db.prepare('DELETE FROM scores WHERE player_id IN (SELECT id FROM players WHERE tournament_id=?)').run(gj.id);
const setChains = (champion, others) =>
  db.prepare('UPDATE tournament SET tiebreak_champion=?, tiebreak_others=? WHERE id=?')
    .run(JSON.stringify(champion), JSON.stringify(others), gj.id);
const setPlayoff = (id) => db.prepare('UPDATE tournament SET playoff_winner_id=? WHERE id=?').run(id, gj.id);
const setNoShow = (player, v) => db.prepare('UPDATE players SET no_show=? WHERE id=?').run(v, player.id);

// Give a player a round. `strokes` may contain nulls for holes not yet entered.
const setRound = (player, strokes) =>
  strokes.forEach((s, i) => { if (s !== null && s !== undefined) insScore.run(player.id, holes[i].id, s, now()); });

// Adjust a slice of pars until it sums to `target`, keeping every hole playable.
function fitTo(indices, target) {
  const out = indices.map(i => PARS[i]);
  let delta = target - out.reduce((a, b) => a + b, 0);
  for (let i = 0; delta > 0; i = (i + 1) % out.length) { if (out[i] < 20) { out[i]++; delta--; } }
  for (let i = 0; delta < 0; i = (i + 1) % out.length) { if (out[i] > 2) { out[i]--; delta++; } }
  return out;
}
// A full round totalling `gross`
function roundOf(gross) {
  const arr = new Array(holes.length);
  fitTo(holes.map((_, i) => i), gross).forEach((v, i) => { arr[i] = v; });
  return arr;
}
// A full round whose first section totals `front` and last section totals `back`
function roundSplit(front, back) {
  const arr = roundOf(PAR_TOTAL);
  fitTo(frontIdx, front).forEach((v, k) => { arr[frontIdx[k]] = v; });
  fitTo(backIdx, back).forEach((v, k) => { arr[backIdx[k]] = v; });
  return arr;
}
const grossFor = (player, net) => net + player.handicap;

const reset = () => {
  clearScores();
  setPlayoff(null);
  setChains(['pk'], ['back9', 'hole_countback']);
  players.forEach(p => db.prepare('UPDATE players SET no_show=0 WHERE id=?').run(p.id));
};
// Park everyone not under test well down the field
const fillRest = (except, startNet = 95) =>
  players.filter(p => !except.includes(p)).forEach((p, i) => setRound(p, roundOf(grossFor(p, startNet + i))));

let pass = 0, fail = 0, skipped = 0;
const check = (label, cond, detail = '') => {
  if (cond) { pass++; console.log(`   ✓ ${label}`); }
  else { fail++; console.log(`   ✗ ${label}  ${detail}`); }
};
const skip = (label, why) => { skipped++; console.log(`   – ${label}(略過:${why})`); };
const head = (n, t) => console.log(`\n${'─'.repeat(66)}\n情境 ${n}:${t}\n${'─'.repeat(66)}`);
const name = (p) => p.chinese_name || p.english_name;
const badges = (p) => {
  if (p.awaitingPlayoff) return `⛳ 待${p.playoffLabel || '延長賽'}`;
  return [p.tiebreakLost ? `↑輸 ${p.tiebreakLost}` : '', p.tiebreakWon ? `↓勝 ${p.tiebreakWon}` : '']
    .filter(Boolean).join('  ');
};
const row = (p) => {
  const rank = p.rank === null || p.rank === undefined ? ' –' : String(p.rank).padStart(2);
  const state = p.isNoShow ? ' [未到]' : p.scoresPending ? ' [無成績]' : p.inProgress ? ` [打完${p.holesPlayed}洞]` : '';
  return `   #${rank} ${String(name(p)).padEnd(10)} 差${String(p.handicap).padStart(3)}` +
    ` 總${String(p.grossScore ?? '–').padStart(4)} 淨${String(p.netScore ?? '–').padStart(4)}` +
    ` 後九${String(p.back9 ?? '–').padStart(4)}  ${badges(p)}${state}`;
};
const dump = (r, n) => r.netRankings.slice(0, n ?? 999).forEach(p => console.log(row(p)));
const rank = () => buildGjRankings(db, gj.id);
// Which awards a player holds is checked by type, so renaming one in the admin
// panel does not break the test
const has = (p, type) => (p?.awards || []).some(a => a.type === type);

// Two players with different handicaps, and two with the same — needed by a
// couple of scenarios, and absent in some fields.
const distinctHcp = (() => {
  for (const a of players) for (const b of players) if (a !== b && a.handicap < b.handicap) return [a, b];
  return null;
})();
const sameHcp = (() => {
  for (const a of players) for (const b of players) if (a !== b && a.handicap === b.handicap) return [a, b];
  return null;
})();

console.log('綠夾克盃 彩排 — 排名邏輯');
console.log(`資料庫:${inUse}(可拋棄副本 ✓)`);
console.log(`球場:${holes.length} 洞 · Par ${PAR_TOTAL} · 洞序 ${holes.map(h => h.label).join(' → ')}`);
console.log(`分區:${sections.map(s => s.name).join(' / ')}(後九以「${sections[sections.length - 1]?.name}」計算)`);
console.log(`選手:${players.length} 位 — ${players.map(p => `${name(p)}(${p.handicap})`).join(', ')}`);

// ══════════════════════════════════════════════════════════════════
head(1, '正常比賽 — 全部打完,淨桿都不同');
reset();
players.forEach((p, i) => setRound(p, roundOf(grossFor(p, 70 + i * 2))));
let r = rank();
dump(r, 4); console.log('   ...');
check(`${players.length} 位都有名次`, r.netRankings.filter(p => p.rank).length === players.length);
check('名次連續且不重複',
  JSON.stringify(r.netRankings.map(p => p.rank)) === JSON.stringify(players.map((_, i) => i + 1)));
check('沒有並列', r.netRankings.every(p => !p.sharedRank));
check('淨桿由低到高', r.netRankings.every((p, i, a) => i === 0 || a[i - 1].netScore <= p.netScore));
check('不需要 PK', r.awaitingPlayoff === false);

// ══════════════════════════════════════════════════════════════════
head(2, '冠軍同淨桿 → 預設規則停下等果嶺 PK');
reset();
const [c1, c2] = players;
setRound(c1, roundOf(grossFor(c1, 72)));
setRound(c2, roundOf(grossFor(c2, 72)));
fillRest([c1, c2]);
r = rank();
dump(r, 3);
check('awaitingPlayoff = true', r.awaitingPlayoff === true);
check('兩人並列第 1', r.netRankings[0].rank === 1 && r.netRankings[1].rank === 1);
check('顯示「⛳ 待果嶺 PK」', r.netRankings.slice(0, 2).every(p => p.playoffLabel === '果嶺 PK'));
check('第 3 名照常排', r.netRankings[2].rank === 3);

head('2b', '後台指定 PK 勝出者 → 勝負標示');
setPlayoff(c1.id);
r = rank();
dump(r, 2);
check('勝出者單獨第 1', r.netRankings[0].id === c1.id && r.netRankings[0].rank === 1 && !r.netRankings[0].sharedRank);
check('勝者標「↓勝 果嶺 PK」', r.netRankings[0].tiebreakWon === '果嶺 PK');
check('敗者第 2 標「↑輸 果嶺 PK」',
  r.netRankings[1].rank === 2 && r.netRankings[1].tiebreakLost === '果嶺 PK');
check('不再等待 PK', r.awaitingPlayoff === false);

head('2c', '按錯 → 清除勝出者,回到並列');
setPlayoff(null);
r = rank();
check('回到並列待 PK', r.awaitingPlayoff === true && r.netRankings[0].rank === 1 && r.netRankings[1].rank === 1);

// ══════════════════════════════════════════════════════════════════
head(3, '三人並列冠軍 → PK 只選出一位,另兩位仍並列第 2');
if (players.length < 4) skip('三人並列冠軍', '選手不足 4 位');
else {
  reset();
  const trio = players.slice(0, 3);
  trio.forEach(p => setRound(p, roundOf(grossFor(p, 72))));
  fillRest(trio);
  r = rank();
  check('三人並列第 1 待 PK', r.netRankings.slice(0, 3).every(p => p.rank === 1 && p.awaitingPlayoff));
  setPlayoff(trio[2].id);
  r = rank();
  dump(r, 4);
  check('指定的人拿第 1', r.netRankings[0].id === trio[2].id && r.netRankings[0].rank === 1);
  check('另兩位並列第 2', r.netRankings[1].rank === 2 && r.netRankings[2].rank === 2);
  check('輸的兩位都有「↑輸 果嶺 PK」標示',
    r.netRankings[1].tiebreakLost === '果嶺 PK' && r.netRankings[2].tiebreakLost === '果嶺 PK',
    `${r.netRankings[1].tiebreakLost} / ${r.netRankings[2].tiebreakLost}`);
  check('下一位是第 4 名', r.netRankings[3].rank === 4);
}

// ══════════════════════════════════════════════════════════════════
head(4, '多人同淨桿爭第 2 → 後九總桿分勝負(非冠軍不走 PK)');
if (players.length < 5) skip('多人爭第 2', '選手不足 5 位');
else {
  reset();
  const leader = players[0];
  const tied = players.slice(1, 5);
  setRound(leader, roundOf(grossFor(leader, 65)));
  const parBack = backIdx.reduce((s, i) => s + PARS[i], 0);
  tied.forEach((p, i) => {
    const gross = grossFor(p, 72);
    setRound(p, roundSplit(gross - (parBack + i), parBack + i));   // back nine 逐一多 1 桿
  });
  fillRest([leader, ...tied]);
  r = rank();
  dump(r, 6);
  const four = r.netRankings.slice(1, 5);
  check('四人淨桿相同', new Set(four.map(p => p.netScore)).size === 1, four.map(p => p.netScore).join(','));
  check('後九低的排前面', four.every((p, i, a) => i === 0 || a[i - 1].back9 <= p.back9), four.map(p => p.back9).join(','));
  check('分出名次 2,3,4,5', JSON.stringify(four.map(p => p.rank)) === JSON.stringify([2, 3, 4, 5]));
  check('非冠軍同分不需 PK', r.awaitingPlayoff === false);
  check('中間名次同時顯示 ↑輸 與 ↓勝',
    !!four[1].tiebreakLost && !!four[1].tiebreakWon,
    `${four[1].tiebreakLost} / ${four[1].tiebreakWon}`);
  check('第一位只有 ↓勝', !four[0].tiebreakLost && !!four[0].tiebreakWon);
  check('最後一位只有 ↑輸', !!four[3].tiebreakLost && !four[3].tiebreakWon);
}

// ══════════════════════════════════════════════════════════════════
head(5, `後九也同分 → 逐洞倒數(最後一洞 ${holes[holes.length - 1].label} 往前比)`);
if (players.length < 3) skip('逐洞倒數', '選手不足 3 位');
else {
  reset();
  const [a, b] = players;
  const parBack = backIdx.reduce((s, i) => s + PARS[i], 0);
  const ra = roundSplit(grossFor(a, 72) - parBack, parBack);
  const rb = roundSplit(grossFor(b, 72) - parBack, parBack);
  const last = holes.length - 1, earlier = backIdx[0];
  rb[last] += 1; rb[earlier] -= 1;            // same back-nine total, worse last hole
  setRound(a, ra); setRound(b, rb);
  fillRest([a, b]);
  setChains(['back9', 'hole_countback'], ['back9', 'hole_countback']);   // no PK, so countback decides #1 too
  r = rank();
  dump(r, 3);
  check('後九總桿相同', r.netRankings[0].back9 === r.netRankings[1].back9,
    `${r.netRankings[0].back9} vs ${r.netRankings[1].back9}`);
  check('最後一洞較低者勝', r.netRankings[0].id === a.id);
  check('判定依據為「逐洞倒數」', r.netRankings[0].tiebreakWon === '逐洞倒數', r.netRankings[0].tiebreakWon);
}

// ══════════════════════════════════════════════════════════════════
head(6, '兩人每一洞桿數完全相同 → 所有規則都分不出 → 並列');
if (!sameHcp) skip('完全同分', '沒有兩位選手差點相同,不可能發生');
else {
  reset();
  const [a, b] = sameHcp;
  setChains(['back9', 'hole_countback'], ['back9', 'hole_countback']);
  const same = roundOf(grossFor(a, 72));
  setRound(a, same); setRound(b, same);
  fillRest([a, b]);
  r = rank();
  dump(r, 3);
  check('兩人並列(不當機)', r.netRankings[0].rank === 1 && r.netRankings[1].rank === 1);
  check('標記 sharedRank', r.netRankings[0].sharedRank === true);
  check('下一位是第 3 名', r.netRankings[2].rank === 3);
  console.log(`   註:${name(a)} 與 ${name(b)} 差點都是 ${a.handicap},連「差點」保底也分不出來 — 只能果嶺 PK`);
}

// ══════════════════════════════════════════════════════════════════
head(7, '比賽進行中 — 有人打完全場、有人只打了一半');
reset();
const halfway = Math.floor(holes.length / 2);
const [f1, f2, h1, h2] = players;
setRound(f1, roundOf(grossFor(f1, 72)));
setRound(f2, roundOf(grossFor(f2, 81)));
setRound(h1, roundOf(grossFor(h1, 72)).slice(0, halfway));   // 半場淨桿看起來很低
setRound(h2, roundOf(grossFor(h2, 76)).slice(0, halfway));
r = rank();
dump(r, 6);
const done = r.netRankings.filter(p => p.isComplete && p.netScore !== null);
const mid = r.netRankings.filter(p => p.inProgress);
check('完賽者全部排在未完賽者前面',
  Math.max(...done.map(p => p.rank)) < Math.min(...mid.map(p => p.rank)));
check(`未完賽者標示打完 ${halfway} 洞`, mid.every(p => p.holesPlayed === halfway));
check('打一半的低淨桿仍排在完賽者後', mid[0].netScore < done[done.length - 1].netScore);
check('還沒輸入成績的人排最後',
  r.netRankings.filter(p => p.scoresPending).length === players.length - 4);

head('7b', '未完賽的兩人同淨桿 → 不套用 countback,直接並列');
reset();
const [g1, g2] = players;
const halfRound = roundOf(grossFor(g1, 72)).slice(0, halfway);
setRound(g1, halfRound);
setRound(g2, roundOf(grossFor(g2, 72)).slice(0, halfway));
r = rank();
const two = r.netRankings.filter(p => p.inProgress);
dump(r, 2);
check('兩人同淨桿並列', two[0].rank === two[1].rank, `${two[0].rank} vs ${two[1].rank}`);
check('未完賽不套用 countback', two.every(p => !p.tiebreakWon && !p.tiebreakLost));

// ══════════════════════════════════════════════════════════════════
head(8, '漏輸入一洞 — 當天最常發生的狀況');
reset();
const [k1, k2] = players;
setRound(k1, roundOf(grossFor(k1, 75)));
const missing = roundOf(grossFor(k2, 67));
missing[Math.floor(holes.length / 3)] = null;      // 中間漏一洞
setRound(k2, missing);
r = rank();
dump(r, 2);
const gap = r.netRankings.find(p => p.id === k2.id);
check('少一洞 = 未完賽', gap.isComplete === false && gap.holesPlayed === holes.length - 1);
check('即使淨桿較低仍排在完賽者之後', gap.rank > r.netRankings.find(p => p.id === k1.id).rank);
check('仍顯示暫時淨桿', gap.netScore !== null);

// ══════════════════════════════════════════════════════════════════
head(9, '完全沒有成績(比賽剛開始)');
reset();
r = rank();
check('不當機', !!r);
check('全部標示等待成績', r.netRankings.filter(p => p.scoresPending).length === players.length);
check('總桿排名也正常', Array.isArray(r.grossRankings) && r.grossRankings.length === players.length);
check('不需要 PK', r.awaitingPlayoff === false);

// ══════════════════════════════════════════════════════════════════
head(10, '有人臨時沒到(no_show)');
reset();
const absent = players[players.length - 1];
setNoShow(absent, 1);
players.filter(p => p !== absent).forEach((p, i) => setRound(p, roundOf(grossFor(p, 72 + i))));
r = rank();
console.log(row(r.netRankings[r.netRankings.length - 1]));
const ab = r.netRankings.find(p => p.id === absent.id);
check('未到者 rank = null', ab.rank === null);
check('未到者排在名單最後', r.netRankings[r.netRankings.length - 1].id === absent.id);
check('參賽人數 N 扣掉未到者', r.N === players.length - 1, `N=${r.N}`);
check('其他人名次連續',
  JSON.stringify(r.netRankings.filter(p => p.rank).map(p => p.rank)) ===
  JSON.stringify(players.slice(0, -1).map((_, i) => i + 1)));
setNoShow(absent, 0);

// ══════════════════════════════════════════════════════════════════
head(11, '比賽中途改判定規則 → 排名立刻重算(逐洞倒數 vs USGA 會選出不同人)');
if (players.length < 3 || backIdx.length < 7) skip('規則切換', '選手或後九洞數不足');
else {
  reset();
  const leader = players[0];
  const [x, y] = distinctHcp && distinctHcp[0] !== leader && distinctHcp[1] !== leader
    ? distinctHcp : [players[1], players[2]];
  setRound(leader, roundOf(grossFor(leader, 65)));
  const parBack = backIdx.reduce((s, i) => s + PARS[i], 0);
  const rx = roundSplit(grossFor(x, 72) - parBack, parBack);
  const ry = roundSplit(grossFor(y, 72) - parBack, parBack);
  // y: worse on the very last hole, better inside the last six, level over the
  // back nine — so countback picks x while the USGA chain picks y.
  const last = holes.length - 1;
  ry[last] += 1;
  ry[last - 1] -= 1; ry[last - 2] -= 1;
  ry[backIdx[0]] += 1;
  setRound(x, rx); setRound(y, ry);
  fillRest([leader, x, y]);

  setChains(['pk'], ['back9', 'hole_countback']);
  r = rank();
  let [a2, b2] = r.netRankings.slice(1, 3);
  console.log(`   逐洞倒數 → 第 2 名 ${name(a2)}(${a2.tiebreakWon})`);
  check('兩人淨桿相同', a2.netScore === b2.netScore, `${a2.netScore} vs ${b2.netScore}`);
  check('後九總桿也相同', a2.back9 === b2.back9, `${a2.back9} vs ${b2.back9}`);
  check('逐洞倒數 → 最後一洞較低者勝',
    a2.id === x.id && a2.tiebreakWon === '逐洞倒數', `${name(a2)}/${a2.tiebreakWon}`);

  setChains(['pk'], ['back9', 'last6', 'last3', 'last1']);
  r = rank();
  [a2, b2] = r.netRankings.slice(1, 3);
  console.log(`   USGA 標準 → 第 2 名 ${name(a2)}(${a2.tiebreakWon})`);
  check('切換規則後仍分得出名次', a2.rank === 2 && b2.rank === 3);
  check('USGA → 後六洞較低者勝(換規則真的會換人)',
    a2.id === y.id && a2.tiebreakWon === '後六洞總桿', `${name(a2)}/${a2.tiebreakWon}`);
}

head('11b', '冠軍規則改成「差點低的贏 / 差點高的贏」→ 不必 PK');
if (!distinctHcp) skip('差點判定', '所有選手差點相同');
else {
  reset();
  const [low, high] = distinctHcp;
  setRound(low, roundOf(grossFor(low, 72)));
  setRound(high, roundOf(grossFor(high, 72)));
  fillRest([low, high]);
  check('預設規則下本來是要 PK 的', rank().awaitingPlayoff === true);
  setChains(['hcp_low'], ['back9', 'hole_countback']);
  r = rank();
  dump(r, 2);
  check(`差點低的 ${name(low)} 拿冠軍`, r.netRankings[0].id === low.id && r.netRankings[0].rank === 1);
  check('標示「差點低」', r.netRankings[0].tiebreakWon === '差點低', r.netRankings[0].tiebreakWon);
  check('不再等 PK', r.awaitingPlayoff === false);
  setChains(['hcp_high'], ['back9', 'hole_countback']);
  r = rank();
  check(`改成差點高 → ${name(high)} 拿冠軍`,
    r.netRankings[0].id === high.id && r.netRankings[0].tiebreakWon === '差點高',
    `${name(r.netRankings[0])}/${r.netRankings[0].tiebreakWon}`);
}

// ══════════════════════════════════════════════════════════════════
head('11c', 'Lucky 7 獎 / BB 獎 — 只在淨桿,全部人打完 18 洞才出現');
if (players.length < 8) skip('Lucky 7 / BB', '選手不足 8 位,排不出第 7 名');
else {
  reset();
  const setStatus = (s) => db.prepare('UPDATE tournament SET status=? WHERE id=?').run(s, gj.id);
  setStatus('playing');
  const full = players.map((p, i) => roundOf(grossFor(p, 70 + i * 2)));

  // Mid-round the board is upside down — fewest holes played sits top — so
  // nothing may show yet.
  players.forEach((p, i) => setRound(p, full[i].slice(0, holes.length - 3)));
  r = rank();
  check('大家都還沒打完 → 獎項不顯示',
    r.awardsVisible === false && r.netRankings.every(p => !p.awards));

  // The first player holes out but the rest are still on the course
  clearScores();
  players.forEach((p, i) => setRound(p, i === 0 ? full[i] : full[i].slice(0, holes.length - 4)));
  r = rank();
  check('只有第一個人打完 → 還是不顯示',
    r.awardsVisible === false && r.netRankings.every(p => !p.awards));

  // Everyone in but one, who still has a single hole to enter
  clearScores();
  players.forEach((p, i) => setRound(p, i === players.length - 1 ? full[i].slice(0, holes.length - 1) : full[i]));
  r = rank();
  check('剩最後一人的最後一洞 → 還是不顯示', r.awardsVisible === false);

  // Full field in, awards settle on the final order
  clearScores();
  players.forEach((p, i) => setRound(p, full[i]));
  r = rank();
  check('最後一洞填完 → 獎項出現', r.awardsVisible === true);
  const lucky = r.netRankings.filter(p => has(p, 'rank_at'));
  const bb = r.netRankings.filter(p => has(p, 'rank_from_last'));
  dump(r, players.length);
  check('Lucky 7 獎給第 7 名', lucky.length === 1 && lucky[0].rank === 7,
    lucky.map(p => `${name(p)}#${p.rank}`).join(','));
  check('BB 獎給倒數第二名', bb.length === 1 && bb[0].rank === players.length - 1,
    bb.map(p => `${name(p)}#${p.rank}`).join(','));
  check('最後一名沒有 BB 獎',
    !has(r.netRankings.find(p => p.rank === players.length), 'rank_from_last'));
  check('總桿排名不帶獎項', r.grossRankings.every(p => !p.awards));

  // A correction after the fact moves the award to whoever now holds 7th
  const wasSeventh = r.netRankings.find(p => p.rank === 7);
  db.prepare('DELETE FROM scores WHERE player_id=?').run(wasSeventh.id);
  setRound(players.find(p => p.id === wasSeventh.id), roundOf(grossFor(wasSeventh, 60)));
  r = rank();
  const nowLucky = r.netRankings.find(p => has(p, 'rank_at'));
  check('改成績後 Lucky 7 跟著換人', nowLucky && nowLucky.id !== wasSeventh.id,
    `現在是 ${name(nowLucky || {})}`);
  check('Lucky 7 永遠掛在當下的第 7 名身上', nowLucky?.rank === 7, `rank=${nowLucky?.rank}`);
  check('原本的第 7 名衝到前段後就沒有獎',
    !has(r.netRankings.find(p => p.id === wasSeventh.id), 'rank_at'));

  // A tie at sixth pushes the next player to eighth — nobody is seventh
  if (!sameHcp) skip('同分跳過第 7 名', '沒有兩位選手差點相同,排不出無法拆解的並列');
  else {
    clearScores();
    const [t1, t2] = sameHcp;
    const rest = players.filter(p => p !== t1 && p !== t2);
    rest.forEach((p, i) => setRound(p, roundOf(grossFor(p, i < 5 ? 70 + i * 2 : 82 + i))));
    const twin = roundOf(grossFor(t1, 80));      // identical rounds, identical handicap
    setRound(t1, twin);
    setRound(t2, roundOf(grossFor(t2, 80)));
    r = rank();
    const rankList = r.netRankings.filter(p => p.rank).map(p => p.rank);
    check('兩人並列第 6,名次直接跳到第 8',
      rankList.filter(x => x === 6).length === 2 && !rankList.includes(7), rankList.join(','));
    check('沒有第 7 名時,Lucky 7 就從缺',
      r.netRankings.every(p => !has(p, 'rank_at')));
  }

  // No-shows never take an award
  clearScores();
  setStatus('finished');
  const out = players[players.length - 1];
  setNoShow(out, 1);
  players.filter(p => p !== out).forEach((p, i) => setRound(p, roundOf(grossFor(p, 70 + i * 2))));
  r = rank();
  const bb2 = r.netRankings.filter(p => has(p, 'rank_from_last'));
  check('未到者不會拿 BB 獎', bb2.every(p => !p.isNoShow) && bb2.length === 1,
    bb2.map(p => name(p)).join(','));
  check('BB 獎給實際下場的倒數第二名', bb2[0].rank === players.length - 2,
    `#${bb2[0]?.rank} / 共 ${players.length - 1} 位下場`);
  setNoShow(out, 0);
  setStatus('setup');
}

// ══════════════════════════════════════════════════════════════════
head(12, '總桿排名(不看差點)— 含同總桿並列');
if (players.length < 4) skip('總桿排名', '選手不足 4 位');
else {
  reset();
  const [p1, p2, p3, p4] = players;
  setRound(p1, roundOf(86)); setRound(p2, roundOf(86));
  setRound(p3, roundOf(90)); setRound(p4, roundOf(84));
  r = rank();
  r.grossRankings.filter(p => p.grossScore !== null).slice(0, 4).forEach(p =>
    console.log(`   #${String(p.grossRank).padStart(2)} ${String(name(p)).padEnd(10)} 總桿 ${p.grossScore}`));
  check('總桿最低者第 1', r.grossRankings[0].grossScore === 84 && r.grossRankings[0].grossRank === 1);
  check('同總桿並列第 2', r.grossRankings[1].grossRank === 2 && r.grossRankings[2].grossRank === 2);
  check('下一位是第 4', r.grossRankings[3].grossRank === 4);
}

// ══════════════════════════════════════════════════════════════════
head(13, '極端桿數(一桿進洞 / 20 桿)');
reset();
const wild = roundOf(PAR_TOTAL);
wild[0] = 1; wild[1] = 20;
setRound(players[0], wild);
setRound(players[1], roundOf(grossFor(players[1], 95)));
r = rank();
const w = r.netRankings.find(p => p.id === players[0].id);
check('極端桿數照算', w.grossScore === PAR_TOTAL - PARS[0] + 1 - PARS[1] + 20, `gross=${w.grossScore}`);
check('淨桿 = 總桿 − 差點', w.netScore === w.grossScore - players[0].handicap);

// ══════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(66)}`);
console.log(`排名邏輯彩排:${pass} 通過 / ${fail} 失敗${skipped ? ` / ${skipped} 略過` : ''}`);
console.log('═'.repeat(66));

db.close();
fs.unlinkSync(TEST_DB);
console.log('可拋棄資料庫已刪除 ✓');
process.exit(fail ? 1 : 0);
