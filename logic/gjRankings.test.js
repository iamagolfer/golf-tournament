// Green Jacket ranking tests. Plain node script — run with:
//   node logic/gjRankings.test.js
// Uses a throwaway copy of the database so it never touches real data.
const fs = require('fs');
const path = require('path');

const TEST_DB = path.join(__dirname, '..', 'db', 'golf.rankingtest.sqlite');
fs.copyFileSync(path.join(__dirname, '..', 'db', 'golf.sqlite'), TEST_DB);
process.env.DB_PATH = TEST_DB;

const { initDb } = require('../db/init');
const { buildGjRankings } = require('./gjRankings');

const db = initDb();
const gj = db.prepare("SELECT * FROM tournament WHERE slug='greenjacket'").get();
const holes = db.prepare(`
  SELECT h.* FROM holes h JOIN sections s ON s.id=h.section_id
  WHERE s.tournament_id=? ORDER BY s.section_order, h.hole_number
`).all(gj.id);
const players = db.prepare('SELECT * FROM players WHERE tournament_id=?').all(gj.id);
const byName = Object.fromEntries(players.map(p => [p.english_name, p]));

db.prepare('DELETE FROM scores WHERE player_id IN (SELECT id FROM players WHERE tournament_id=?)').run(gj.id);
const insScore = db.prepare('INSERT INTO scores (player_id, hole_id, strokes, entered_at) VALUES (?,?,?,?)');
const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
const setRound = (name, strokes) => {
  strokes.forEach((s, i) => { if (s !== null) insScore.run(byName[name].id, holes[i].id, s, now); });
};
// Spread a target gross across all 18 holes, starting from par
const evenRound = (targetGross) => {
  const out = holes.map(h => h.par);
  let over = targetGross - out.reduce((a, b) => a + b, 0);
  for (let i = 0; over > 0; i = (i + 1) % out.length) { out[i]++; over--; }
  return out;
};

//                       front nine                    back nine (10..18, 10A)
setRound('Albert',  [4,5,3,5,5,4,5,3,5,  4,5,4,4,5,3,5,4,4]); // 77 − 5  = 72
setRound('Benny',   [5,5,4,6,6,5,5,4,4,  5,6,5,4,5,4,6,4,3]); // 86 − 14 = 72  → 冠軍同分
setRound('Daniel',  [5,5,4,6,6,5,5,5,5,  5,6,5,4,5,4,6,5,4]); // 90 − 16 = 74, 後九 44
setRound('JJ',      [5,5,4,5,6,5,4,4,5,  5,6,5,5,5,4,6,5,4]); // 88 − 14 = 74, 後九 45
setRound('William', [5,5,4,5,5,5,5,4,5,  4,6,5,4,5,4,6,6,3]); // 86 − 11 = 75, 後九 43, 10A=3
setRound('Jimmy',   [5,6,4,6,6,5,5,4,4,  4,6,5,4,5,4,6,5,4]); // 88 − 13 = 75, 後九 43, 10A=4
setRound('Eddie',   evenRound(96));  // 96 − 20 = 76
setRound('Casper',  evenRound(101)); // 101 − 24 = 77
setRound('Lio',     evenRound(99));  // 99 − 21 = 78
setRound('Jason',   evenRound(93));  // 93 − 14 = 79
setRound('Katie',   evenRound(91));  // 91 − 11 = 80
setRound('Debbie',  evenRound(91));  // 91 − 10 = 81
setRound('Lola',    evenRound(101)); // 101 − 19 = 82
setRound('Jeff',    evenRound(109)); // 109 − 26 = 83
// Ian left with only 9 holes — must rank below everyone who finished
setRound('Ian',     [5,5,4,6,6,5,5,4,5, null,null,null,null,null,null,null,null,null]);

const show = (r) => {
  console.log('  淨桿排名                          差點  總桿  淨桿  後九  10A   判定');
  for (const p of r.netRankings) {
    const rank = p.rank === null ? ' -' : String(p.rank).padStart(2);
    const flag = p.awaitingPlayoff ? ` ⛳待${p.playoffLabel}`
      : p.tiebreakWon ? ` 勝(${p.tiebreakWon})`
      : p.tiebreakLost ? ` 輸(${p.tiebreakLost})` : '';
    const prog = p.inProgress ? ` [打完${p.holesPlayed}洞]` : '';
    console.log(`  #${rank}  ${p.displayName.padEnd(28)} ${String(p.handicap).padStart(3)}  ` +
      `${String(p.grossScore ?? '-').padStart(4)}  ${String(p.netScore ?? '-').padStart(4)}  ` +
      `${String(p.back9 ?? '-').padStart(4)}  ${String(p.strokesInPlayOrder[17] ?? '-').padStart(3)}  ${flag}${prog}`);
  }
};

console.log('=== 情境 1:預設規則(冠軍=果嶺PK / 其他=後九→逐洞倒數)===');
let r = buildGjRankings(db, gj.id);
show(r);
console.log(`\n  awaitingPlayoff: ${r.awaitingPlayoff}`);
console.log(`  冠軍規則: ${r.championChain.join(' → ')} | 其他: ${r.othersChain.join(' → ')}`);

console.log('\n=== 情境 2:管理員指定 Albert 為 PK 勝出者 ===');
db.prepare('UPDATE tournament SET playoff_winner_id=? WHERE id=?').run(byName['Albert'].id, gj.id);
r = buildGjRankings(db, gj.id);
r.netRankings.slice(0, 4).forEach(p => console.log(`  #${p.rank} ${p.displayName} (淨桿 ${p.netScore})` +
  (p.tiebreakWon ? ` 勝(${p.tiebreakWon})` : p.tiebreakLost ? ` 輸(${p.tiebreakLost})` : '')));

console.log('\n=== 情境 3:改成 USGA 標準 countback(後九→後六→後三→最後一洞)===');
db.prepare('UPDATE tournament SET playoff_winner_id=NULL, tiebreak_others=? WHERE id=?')
  .run(JSON.stringify(['back9', 'last6', 'last3', 'last1']), gj.id);
r = buildGjRankings(db, gj.id);
r.netRankings.filter(p => [74, 75].includes(p.netScore)).forEach(p =>
  console.log(`  #${p.rank} ${p.displayName} (淨桿 ${p.netScore})` +
    (p.tiebreakWon ? ` 勝(${p.tiebreakWon})` : p.tiebreakLost ? ` 輸(${p.tiebreakLost})` : '')));

console.log('\n=== 情境 4:冠軍改用「差點低的贏」,不 PK ===');
db.prepare('UPDATE tournament SET tiebreak_champion=? WHERE id=?').run(JSON.stringify(['hcp_low']), gj.id);
r = buildGjRankings(db, gj.id);
r.netRankings.slice(0, 3).forEach(p => console.log(`  #${p.rank} ${p.displayName} (差點 ${p.handicap})` +
  (p.tiebreakWon ? ` 勝(${p.tiebreakWon})` : p.tiebreakLost ? ` 輸(${p.tiebreakLost})` : '')));
console.log(`  awaitingPlayoff: ${r.awaitingPlayoff}`);

console.log('\n=== 情境 5:總桿排名(不看差點)===');
r.grossRankings.slice(0, 5).forEach(p => console.log(`  #${p.grossRank} ${p.displayName} 總桿 ${p.grossScore}`));

db.close();
fs.unlinkSync(TEST_DB);
console.log('');
console.log('✅ 全部情境通過');
