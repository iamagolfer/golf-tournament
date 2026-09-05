// Side awards: who wins each one, and what happens at the edges.
//   node logic/gjAwards.test.js
//
// Pure logic — no database, no server. Players are built by hand so each award
// has an unambiguous right answer.
const {
  AWARD_TYPES, DEFAULT_AWARDS, sanitizeAwards, parseAwards, computeAwards,
} = require('./gjAwards');

let pass = 0, fail = 0;
const check = (label, cond, detail = '') => {
  if (cond) { pass++; console.log(`   ✓ ${label}`); }
  else { fail++; console.log(`   ✗ ${label}  ${detail}`); }
};
const head = (n, t) => console.log(`\n${'─'.repeat(64)}\n${n}:${t}\n${'─'.repeat(64)}`);

// An 18-hole par-72 course, nine out and nine in
const HOLES = [
  4, 4, 3, 5, 5, 4, 4, 3, 5,
  4, 5, 4, 3, 4, 3, 5, 4, 3,
].map((par, i) => ({ id: i + 1, par, label: String(i + 1) }));

// strokes is an array of 18; rank/name are what the awards are judged with
const player = (id, name, rank, strokes, extra = {}) => {
  const front = strokes.slice(0, 9).reduce((a, b) => a + b, 0);
  const back = strokes.slice(9).reduce((a, b) => a + b, 0);
  return {
    id, rank,
    chinese_name: '', english_name: name, displayName: name,
    strokesInPlayOrder: strokes,
    front9: front, back9: back,
    isComplete: true, isNoShow: false, netScore: 70 + rank, holesPlayed: 18,
    ...extra,
  };
};
// A round that is par everywhere except the offsets given as [holeIndex, delta]
const round = (offsets = []) => {
  const s = HOLES.map(h => h.par);
  offsets.forEach(([i, d]) => { s[i] += d; });
  return s;
};

const names = (list) => list.map(p => p.english_name).sort().join(',');
const awardsOf = (map, id) => (map.get(id) || []).map(a => a.name).sort().join(',');

// ══════════════════════════════════════════════════════════════════
head(1, 'rank_at — 指定名次（Lucky 7）');
{
  const field = Array.from({ length: 12 }, (_, i) => player(i + 1, 'P' + (i + 1), i + 1, round()));
  const won = computeAwards(field, HOLES, [{ type: 'rank_at', name: 'Lucky 7 獎', params: { rank: 7 } }]);
  check('只有第 7 名得獎', names([...won.keys()].map(id => field[id - 1])) === 'P7', [...won.keys()].join(','));
  check('徽章名稱用設定的名字', awardsOf(won, 7) === 'Lucky 7 獎');

  const other = computeAwards(field, HOLES, [{ type: 'rank_at', name: '第 3 名獎', params: { rank: 3 } }]);
  check('名次可以改成別的', [...other.keys()].join(',') === '3');

  const none = computeAwards(field, HOLES, [{ type: 'rank_at', name: 'x', params: { rank: 99 } }]);
  check('沒有那個名次就從缺', none.size === 0);
}

head('1b', 'rank_at — 兩人並列該名次');
{
  const field = [
    player(1, 'A', 1, round()), player(2, 'B', 2, round()),
    player(3, 'C', 3, round()), player(4, 'D', 3, round()),   // 並列第 3
    player(5, 'E', 5, round()),
  ];
  const won = computeAwards(field, HOLES, [{ type: 'rank_at', name: '第三獎', params: { rank: 3 } }]);
  check('並列的兩人都拿到', names([3, 4].map(i => field[i - 1])) === 'C,D' && won.size === 2, String(won.size));
  const skipped = computeAwards(field, HOLES, [{ type: 'rank_at', name: '第四獎', params: { rank: 4 } }]);
  check('被跳過的名次從缺', skipped.size === 0);
}

// ══════════════════════════════════════════════════════════════════
head(2, 'rank_from_last — 倒數名次（BB）');
{
  const field = Array.from({ length: 10 }, (_, i) => player(i + 1, 'P' + (i + 1), i + 1, round()));
  const won = computeAwards(field, HOLES, [{ type: 'rank_from_last', name: 'BB 獎', params: { fromLast: 2 } }]);
  check('倒數第二名得獎', [...won.keys()].join(',') === '9', [...won.keys()].join(','));
  const last = computeAwards(field, HOLES, [{ type: 'rank_from_last', name: '最後獎', params: { fromLast: 1 } }]);
  check('倒數第一也設定得出來', [...last.keys()].join(',') === '10');
}

head('2b', 'rank_from_last — 最後兩人並列');
{
  const field = [
    player(1, 'A', 1, round()), player(2, 'B', 2, round()),
    player(3, 'C', 3, round()), player(4, 'D', 3, round()),   // 並列最後
  ];
  const won = computeAwards(field, HOLES, [{ type: 'rank_from_last', name: 'BB 獎', params: { fromLast: 2 } }]);
  check('倒數第二用「不同的名次」算,不會被並列吃掉', [...won.keys()].join(',') === '2', [...won.keys()].join(','));
}

// ══════════════════════════════════════════════════════════════════
head(3, 'rank_every — 跳號獎');
{
  const field = Array.from({ length: 22 }, (_, i) => player(i + 1, 'P' + (i + 1), i + 1, round()));
  const seven = computeAwards(field, HOLES, [{ type: 'rank_every', name: '跳七獎', params: { step: 7 } }]);
  check('跳七 = 7、14、21 名', [...seven.keys()].sort((a, b) => a - b).join(',') === '7,14,21',
    [...seven.keys()].join(','));
  const five = computeAwards(field, HOLES, [{ type: 'rank_every', name: '跳五獎', params: { step: 5 } }]);
  check('跳五 = 5、10、15、20 名', [...five.keys()].sort((a, b) => a - b).join(',') === '5,10,15,20',
    [...five.keys()].join(','));
}

head('3b', '同一個人拿到兩個獎');
{
  const field = Array.from({ length: 16 }, (_, i) => player(i + 1, 'P' + (i + 1), i + 1, round()));
  const won = computeAwards(field, HOLES, [
    { type: 'rank_at', name: 'Lucky 7 獎', params: { rank: 7 } },
    { type: 'rank_every', name: '跳七獎', params: { step: 7 } },
  ]);
  check('第 7 名同時拿 Lucky 7 和跳七', awardsOf(won, 7) === 'Lucky 7 獎,跳七獎', awardsOf(won, 7));
  check('第 14 名只拿跳七', awardsOf(won, 14) === '跳七獎');
  check('徽章順序照設定', (won.get(7) || []).map(a => a.name).join('>') === 'Lucky 7 獎>跳七獎');
}

// ══════════════════════════════════════════════════════════════════
head(4, 'big_swing — 大坡獎（前後九差距最大,絕對值）');
{
  // par front = 37, par back = 35
  const field = [
    player(1, 'Even', 1, round()),                                    // 差 2
    player(2, 'BackBlowUp', 2, round([[9, 5], [10, 5]])),             // 後九 +10 → 差 8
    player(3, 'FrontBlowUp', 3, round([[0, 6], [1, 6]])),             // 前九 +12 → 差 14
    player(4, 'Mild', 4, round([[2, 2]])),                            // 差 4
  ];
  const won = computeAwards(field, HOLES, [{ type: 'big_swing', name: '大坡獎', params: {} }]);
  check('差距最大的得獎（前九崩也算）', [...won.keys()].join(',') === '3', [...won.keys()].join(','));
  console.log('   前後九差:' + field.map(p => `${p.english_name} ${Math.abs(p.front9 - p.back9)}`).join(' · '));
}

head('4b', 'big_swing — 差距完全相同時比洞質（他說這常發生）');
{
  // Identical swing, reached differently: front +4 for both, back −2 for both,
  // but Eagle got there with one eagle and Birdies with two birdies.
  const field = [
    player(1, 'Eagle', 1, round([[0, 2], [1, 2], [10, -2]])),
    player(2, 'Birdies', 2, round([[0, 2], [1, 2], [9, -1], [11, -1]])),
  ];
  const swings = field.map(p => Math.abs(p.front9 - p.back9));
  console.log(`   前九 ${field[0].front9}/${field[1].front9} · 後九 ${field[0].back9}/${field[1].back9}` +
    ` · 差距 ${swings[0]}/${swings[1]}`);
  check('兩人差距真的相同', swings[0] === swings[1], `${swings[0]} vs ${swings[1]}`);

  const won = computeAwards(field, HOLES, [{ type: 'big_swing', name: '大坡獎', params: {} }]);
  check('老鷹多的贏（不會並列）', [...won.keys()].join(',') === '1' && won.size === 1,
    [...won.keys()].join(','));

  // Same swing and same hole quality all the way down → genuinely inseparable
  const twins = [
    player(1, 'A', 1, round([[0, 2], [1, 2], [10, -2]])),
    player(2, 'B', 2, round([[0, 2], [1, 2], [10, -2]])),
  ];
  const tied = computeAwards(twins, HOLES, [{ type: 'big_swing', name: '大坡獎', params: {} }]);
  check('連洞質都一樣時才並列', tied.size === 2, String(tied.size));
}

// ══════════════════════════════════════════════════════════════════
head(5, 'best_scoring — 最多老鷹小鳥');
{
  const field = [
    player(1, 'ManyBirdies', 1, round([[0, -1], [1, -1], [2, -1], [3, -1]])),  // 4 birdies
    player(2, 'OneEagle', 2, round([[4, -2]])),                                // 1 eagle
    player(3, 'Flat', 3, round()),                                             // nothing
  ];
  const won = computeAwards(field, HOLES, [{ type: 'best_scoring', name: '最多老鷹小鳥獎', params: {} }]);
  check('老鷹贏過再多小鳥', [...won.keys()].join(',') === '2', [...won.keys()].join(','));

  const noEagles = [
    player(1, 'Three', 1, round([[0, -1], [1, -1], [2, -1]])),
    player(2, 'One', 2, round([[3, -1]])),
  ];
  const won2 = computeAwards(noEagles, HOLES, [{ type: 'best_scoring', name: 'x', params: {} }]);
  check('都沒老鷹時比小鳥數', [...won2.keys()].join(',') === '1');

  const flat = [player(1, 'A', 1, round()), player(2, 'B', 2, round())];
  const won3 = computeAwards(flat, HOLES, [{ type: 'best_scoring', name: 'x', params: {} }]);
  check('全場沒人破 Par 就從缺', won3.size === 0);

  const tie = [
    player(1, 'A', 1, round([[0, -1], [1, -1]])),
    player(2, 'B', 2, round([[5, -1], [6, -1]])),
  ];
  const won4 = computeAwards(tie, HOLES, [{ type: 'best_scoring', name: 'x', params: {} }]);
  check('完全同質時兩人並列得獎', won4.size === 2, String(won4.size));
}

// ══════════════════════════════════════════════════════════════════
head(6, '誰有資格得獎');
{
  const field = [
    player(1, 'Winner', 1, round()),
    player(2, 'Absent', null, round(), { isNoShow: true, netScore: null, isComplete: false }),
    player(3, 'Unfinished', 2, round(), { isComplete: false, holesPlayed: 9 }),
    player(4, 'Third', 3, round()),
  ];
  const won = computeAwards(field, HOLES, [
    { type: 'rank_from_last', name: 'BB 獎', params: { fromLast: 1 } },
  ]);
  check('未到與未完賽者不列入,最後一名是完賽者裡的最後', [...won.keys()].join(',') === '4',
    [...won.keys()].join(','));
  check('未到者拿不到任何獎', !won.has(2));
  check('未完賽者拿不到任何獎', !won.has(3));
}

// ══════════════════════════════════════════════════════════════════
head(7, '設定的儲存與清理');
{
  check('預設是 Lucky 7 + BB', DEFAULT_AWARDS.map(a => a.type).join(',') === 'rank_at,rank_from_last');
  check('沒設定過時用預設', parseAwards('').map(a => a.type).join(',') === 'rank_at,rank_from_last');
  check('壞掉的 JSON 也用預設', parseAwards('{{{').length === 2);
  check('空陣列 = 不發獎（不是套預設）', parseAwards('[]').length === 0);

  const clean = sanitizeAwards([
    { type: 'nonsense', name: 'x' },
    { type: 'rank_at', name: '  我的獎  ', params: { rank: '9' } },
    { type: 'rank_every', name: '', params: { step: 999 } },
    { type: 'rank_at', params: { rank: -5 } },
  ]);
  check('未知類型被丟掉', clean.length === 3, String(clean.length));
  check('數字字串會轉成數字', clean[0].params.rank === 9, JSON.stringify(clean[0].params));
  check('名稱去頭尾空白', clean[0].name === '我的獎', `"${clean[0].name}"`);
  check('超出範圍的數字被夾住', clean[1].params.step === 50, String(clean[1].params.step));
  check('名稱空白時用預設名', clean[1].name === AWARD_TYPES.rank_every.defaultName, clean[1].name);
  check('負數被夾到最小值', clean[2].params.rank === 1, String(clean[2].params.rank));
  check('不是陣列就退回 null', sanitizeAwards('nope') === null);
}

// ══════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(64)}`);
console.log(`獎項邏輯:${pass} 通過 / ${fail} 失敗`);
console.log('═'.repeat(64));
process.exit(fail ? 1 : 0);
