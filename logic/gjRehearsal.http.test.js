// Green Jacket game-day rehearsal — end to end over HTTP.
//   node logic/gjRehearsal.http.test.js
//
// Starts a real server on a spare port against a throwaway copy of the database,
// then drives it exactly as game day does: players' phones posting scores with no
// login, the admin phone signing in and running the tournament, and several
// phones hitting the same endpoints at the same time. Kills the server and
// deletes the copy when it finishes.
//
// Like gjRehearsal.test.js, nothing is tied to a particular roster or course.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TEST_DB = path.join(ROOT, 'db', 'golf.httprehearsal.sqlite');
const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}`;

let pass = 0, fail = 0, skipped = 0;
const check = (label, cond, detail = '') => {
  if (cond) { pass++; console.log(`   ✓ ${label}`); }
  else { fail++; console.log(`   ✗ ${label}  ${detail}`); }
};
const skip = (label, why) => { skipped++; console.log(`   – ${label}(略過:${why})`); };
const head = (n, t) => console.log(`\n${'─'.repeat(66)}\n${n}:${t}\n${'─'.repeat(66)}`);

// Each client keeps its own cookie, so admin sessions and player phones stay separate
function phone(label) {
  let cookie = '';
  const req = async (method, p, body) => {
    let res;
    try {
      res = await fetch(BASE + p, {
        method,
        headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      // A dropped connection is a result to report, not a reason to abandon the run
      return { status: 0, error: e.cause?.code || e.message, body: {} };
    }
    const setC = res.headers.get('set-cookie');
    if (setC) cookie = setC.split(';')[0];
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 60) }; }
    return { status: res.status, body: json };
  };
  return {
    label,
    get: (p) => req('GET', p), post: (p, b) => req('POST', p, b),
    put: (p, b) => req('PUT', p, b), del: (p) => req('DELETE', p),
  };
}

async function waitForServer(proc, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (proc.exitCode !== null) throw new Error(`server exited early (code ${proc.exitCode})`);
    try {
      const res = await fetch(`${BASE}/api/tournament`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('server did not come up in time');
}

async function main() {
  const gjAdmin = phone('gj-admin');
  const benny = phone('benny');
  const ringAdmin = phone('ring-admin');
  const guest = phone('guest');

  // ════════════════════════════════════════════════════════════════
  head('A', '伺服器啟動 & 公開頁面');
  let r = await guest.get('/api/tournament?t=greenjacket');
  check('GET /api/tournament?t=greenjacket', r.status === 200 && r.body.tournament?.slug === 'greenjacket');
  const tournament = r.body.tournament;
  const holes = r.body.holes || [];
  const PARS = holes.map(h => h.par);
  const PAR_TOTAL = PARS.reduce((a, b) => a + b, 0);
  check(`球場資料載入(${holes.length} 洞 · Par ${PAR_TOTAL})`, holes.length > 0);
  console.log(`   洞序:${holes.map(h => h.hole_label || h.hole_number).join(' → ')}`);

  for (const p of ['/greenjacket', '/greenjacket/scores', '/greenjacket/rankings']) {
    r = await guest.get(p);
    check(`公開頁 ${p} 可開啟`, r.status === 200);
  }

  r = await guest.get('/api/players?t=greenjacket');
  const players = r.body.players || [];
  check(`選手名單(${players.length} 位)`, players.length > 0);
  console.log(`   選手:${players.map(p => `${p.chinese_name || p.english_name}(${p.handicap})`).join(', ')}`);
  if (!players.length || !holes.length) { console.error('球場或名單尚未建立,無法繼續'); return; }

  const fitTo = (target) => {
    const out = [...PARS];
    let d = target - PAR_TOTAL;
    for (let i = 0; d > 0; i = (i + 1) % out.length) { if (out[i] < 20) { out[i]++; d--; } }
    for (let i = 0; d < 0; i = (i + 1) % out.length) { if (out[i] > 2) { out[i]--; d++; } }
    return out;
  };
  const roundForNet = (player, net) => fitTo(net + player.handicap);
  const postRound = (client, player, strokes) => client.post('/api/scores/batch?t=greenjacket', {
    playerId: player.id,
    scores: holes.map((h, i) => ({ holeId: h.id, strokes: strokes[i] })).filter(s => s.strokes != null),
  });
  const scoreCount = async () => ((await guest.get('/api/scores?t=greenjacket')).body.scores || []).length;
  const clearAll = async () => {
    for (const p of players) {
      await gjAdmin.post('/api/scores/batch?t=greenjacket', {
        playerId: p.id, scores: holes.map(h => ({ holeId: h.id, strokes: 0 })),
      });
    }
  };

  // ════════════════════════════════════════════════════════════════
  head('B', '登入 — 兩組帳號、密碼錯誤、與戒指盃隔離');
  r = await gjAdmin.post('/api/auth/login', { username: 'admin', password: 'iam1976', scope: 'greenjacket' });
  check('admin 可登入綠夾克', r.status === 200 && r.body.success);
  r = await benny.post('/api/auth/login', { username: 'benny', password: 'benny', scope: 'greenjacket' });
  check('benny 可登入綠夾克', r.status === 200 && r.body.success);
  r = await phone('x').post('/api/auth/login', { username: 'admin', password: 'wrong', scope: 'greenjacket' });
  check('密碼錯誤被擋(401)', r.status === 401);
  r = await phone('y').post('/api/auth/login', { username: 'benny', password: 'benny', scope: 'ring' });
  check('benny 進不了戒指盃(401)', r.status === 401);

  await ringAdmin.post('/api/auth/login', { username: 'admin', password: 'iam1976' });
  r = await ringAdmin.get('/api/auth/check');
  check('戒指盃 session 不含綠夾克權限', r.body.ring === true && r.body.greenjacket === false);
  r = await ringAdmin.put('/api/tournament/status?t=greenjacket', { status: 'finished' });
  check('戒指盃管理員改不了綠夾克', r.status === 401 || r.status === 403, `status=${r.status}`);
  r = await gjAdmin.get('/api/auth/check');
  check('綠夾克 session 不含戒指盃權限', r.body.greenjacket === true && r.body.ring === false);

  // ════════════════════════════════════════════════════════════════
  head('C', '開賽 — 管理員用手機把狀態切成「比賽中」');
  r = await gjAdmin.put('/api/tournament/status?t=greenjacket', { status: 'playing' });
  check('切換狀態 playing', r.status === 200);
  check('公開頁看得到 playing',
    (await guest.get('/api/tournament?t=greenjacket')).body.tournament.status === 'playing');

  // ════════════════════════════════════════════════════════════════
  head('D', '全部選手同時用手機輸入成績(併發)');
  await clearAll();
  // Every player's phone submits its full round at the same moment
  const phones = players.map(p => phone(`phone-${p.player_number}`));
  const results = await Promise.all(players.map((p, i) =>
    postRound(phones[i], p, roundForNet(p, 72 + i))));
  check(`${players.length} 支手機同時送出都成功`, results.every(x => x.status === 200),
    results.filter(x => x.status !== 200).map(x => x.status).join(','));
  check('成績筆數正確,沒有重複或遺漏',
    (await scoreCount()) === players.length * holes.length,
    `${await scoreCount()} / ${players.length * holes.length}`);

  head('D2', '一洞一洞輸入(真實手機用法)— 每洞全場同時送出');
  await clearAll();
  // The real pattern: a group finishes a hole and everyone enters it at once,
  // hole after hole — one wave of players.length writes per hole.
  const rounds = players.map((p, i) => roundForNet(p, 72 + i));
  const waveResults = [];
  for (const [hi, h] of holes.entries()) {
    waveResults.push(...await Promise.all(players.map((p, i) =>
      phones[i].post('/api/scores/batch?t=greenjacket', {
        playerId: p.id, scores: [{ holeId: h.id, strokes: rounds[i][hi] }],
      }))));
  }
  const bad = waveResults.filter(x => x.status !== 200);
  check(`逐洞併發 ${waveResults.length} 次寫入全部成功`, bad.length === 0,
    bad.slice(0, 3).map(x => x.error || x.status).join(', '));
  const finalCount = await scoreCount();
  check('最終筆數正確', finalCount === players.length * holes.length,
    `${finalCount} / ${players.length * holes.length}`);

  head('D3', '兩支手機同時改同一位選手的同一洞');
  const target = players[0], h0 = holes[0];
  const [w1, w2] = await Promise.all([
    phones[0].post('/api/scores/batch?t=greenjacket', { playerId: target.id, scores: [{ holeId: h0.id, strokes: 7 }] }),
    phone('other').post('/api/scores/batch?t=greenjacket', { playerId: target.id, scores: [{ holeId: h0.id, strokes: 4 }] }),
  ]);
  check('兩次寫入都不報錯', w1.status === 200 && w2.status === 200);
  const dupes = ((await guest.get('/api/scores?t=greenjacket')).body.scores || [])
    .filter(s => s.player_id === target.id && s.hole_id === h0.id);
  check('同一洞只留一筆(不會變兩筆)', dupes.length === 1, `${dupes.length} 筆`);
  check('留下的是其中一次的桿數', [4, 7].includes(dupes[0].strokes), `strokes=${dupes[0].strokes}`);

  head('D4', '大家同時重新整理排名頁');
  const reads = await Promise.all(Array.from({ length: 20 }, () => guest.get('/api/rankings?t=greenjacket')));
  check('20 次同時讀取排名都成功', reads.every(x => x.status === 200));
  check('每次回傳的人數一致',
    new Set(reads.map(x => (x.body.netRankings || []).length)).size === 1);

  head('D5', '選手輸入成績的同時,管理員在後台操作');
  const [writes, adminAct] = await Promise.all([
    Promise.all(players.slice(0, Math.min(5, players.length)).map((p, i) =>
      postRound(phones[i], p, roundForNet(p, 80 + i)))),
    gjAdmin.put('/api/tournament/wildcard-visibility?t=greenjacket', { show: true }),
  ]);
  check('同時寫入與後台操作互不影響',
    writes.every(x => x.status === 200) && adminAct.status === 200);

  // ════════════════════════════════════════════════════════════════
  head('E', '即時排名 — 冠軍同分時停下等果嶺 PK');
  await clearAll();
  const [c1, c2] = players;
  await postRound(phones[0], c1, roundForNet(c1, 72));
  await postRound(phones[1], c2, roundForNet(c2, 72));
  for (const [i, p] of players.slice(2).entries()) await postRound(phones[i + 2], p, roundForNet(p, 90 + i));
  r = await guest.get('/api/rankings?t=greenjacket');
  check('GET /api/rankings 公開可讀', r.status === 200);
  let net = r.body.netRankings || [];
  check(`回傳 ${players.length} 位`, net.length === players.length);
  check('冠軍同分 → awaitingPlayoff', r.body.awaitingPlayoff === true);
  check('兩人並列第 1', net[0].rank === 1 && net[1].rank === 1);
  console.log(`   並列冠軍:${net[0].displayName} / ${net[1].displayName}(淨桿 ${net[0].netScore})`);

  head('E2', '後台記錄果嶺 PK 勝出者');
  r = await guest.put('/api/tournament/playoff-winner?t=greenjacket', { playerId: c1.id });
  check('未登入不能指定勝出者', r.status === 401 || r.status === 403, `status=${r.status}`);
  r = await benny.put('/api/tournament/playoff-winner?t=greenjacket', { playerId: c1.id });
  check('benny 可以指定勝出者', r.status === 200);
  net = (await guest.get('/api/rankings?t=greenjacket')).body.netRankings;
  check('勝出者單獨第 1', net[0].id === c1.id && net[0].rank === 1 && !net[0].sharedRank);
  check('勝者標「勝 果嶺 PK」', net[0].tiebreakWon === '果嶺 PK');
  check('敗者第 2 標「輸 果嶺 PK」', net[1].rank === 2 && net[1].tiebreakLost === '果嶺 PK');
  r = await gjAdmin.put('/api/tournament/playoff-winner?t=greenjacket', { playerId: null });
  check('可以清除勝出者回到並列',
    r.status === 200 && (await guest.get('/api/rankings?t=greenjacket')).body.awaitingPlayoff === true);
  await gjAdmin.put('/api/tournament/playoff-winner?t=greenjacket', { playerId: c1.id });

  // ════════════════════════════════════════════════════════════════
  head('F', '改成績 / 刪成績(打錯要救得回來)');
  const fixMe = players[1], hole1 = holes[0];
  const original = roundForNet(fixMe, 72)[0];
  r = await phones[1].post('/api/scores/batch?t=greenjacket', {
    playerId: fixMe.id, scores: [{ holeId: hole1.id, strokes: 9 }],
  });
  check('改單洞成績', r.status === 200);
  let scores = (await guest.get('/api/scores?t=greenjacket')).body.scores;
  check('新桿數已寫入',
    scores.find(s => s.player_id === fixMe.id && s.hole_id === hole1.id)?.strokes === 9);
  r = await phones[1].post('/api/scores/batch?t=greenjacket', {
    playerId: fixMe.id, scores: [{ holeId: hole1.id, strokes: 0 }],
  });
  check('清空欄位 = 刪除該洞成績', r.status === 200);
  scores = (await guest.get('/api/scores?t=greenjacket')).body.scores;
  check('該洞成績確實消失', !scores.find(s => s.player_id === fixMe.id && s.hole_id === hole1.id));
  let after = (await guest.get('/api/rankings?t=greenjacket')).body.netRankings.find(p => p.id === fixMe.id);
  check('該選手變成未完賽', after.holesPlayed === holes.length - 1 && after.isComplete === false);
  await phones[1].post('/api/scores/batch?t=greenjacket', {
    playerId: fixMe.id, scores: [{ holeId: hole1.id, strokes: original }],
  });
  after = (await guest.get('/api/rankings?t=greenjacket')).body.netRankings.find(p => p.id === fixMe.id);
  check('補回成績後恢復完賽', after.isComplete === true);

  head('F2', '無效成績要被擋掉');
  await phones[1].post('/api/scores/batch?t=greenjacket', {
    playerId: fixMe.id, scores: [{ holeId: hole1.id, strokes: 25 }],
  });
  scores = (await guest.get('/api/scores?t=greenjacket')).body.scores;
  check('25 桿不會被寫入',
    scores.find(s => s.player_id === fixMe.id && s.hole_id === hole1.id)?.strokes !== 25);
  r = await guest.post('/api/scores/batch?t=greenjacket', {
    playerId: 999999, scores: [{ holeId: hole1.id, strokes: 4 }],
  });
  check('不存在的選手不會產生成績',
    !((await guest.get('/api/scores?t=greenjacket')).body.scores || []).some(s => s.player_id === 999999));

  // ════════════════════════════════════════════════════════════════
  head('G', '後台改同分判定規則');
  r = await gjAdmin.put('/api/tournament/tiebreak?t=greenjacket', {
    champion: ['pk'], others: ['back9', 'last6', 'last3', 'last1'],
  });
  check('可設定 USGA 標準鏈',
    r.status === 200 && r.body.others.join(',') === 'back9,last6,last3,last1', JSON.stringify(r.body));
  r = await gjAdmin.put('/api/tournament/tiebreak?t=greenjacket', {
    champion: ['hcp_low', 'hcp_high'], others: ['back9', 'back9', 'hole_countback'],
  });
  check('差點高/低互斥 → 只留一個',
    r.body.champion.length === 1 && r.body.champion[0] === 'hcp_low', JSON.stringify(r.body.champion));
  check('重複規則被去除', r.body.others.join(',') === 'back9,hole_countback', JSON.stringify(r.body.others));
  r = await gjAdmin.put('/api/tournament/tiebreak?t=greenjacket', { champion: 'nonsense', others: [] });
  check('亂送資料被擋(400)', r.status === 400, `status=${r.status}`);
  r = await guest.put('/api/tournament/tiebreak?t=greenjacket', { champion: ['pk'], others: ['back9'] });
  check('未登入不能改規則', r.status === 401 || r.status === 403);
  await gjAdmin.put('/api/tournament/tiebreak?t=greenjacket', {
    champion: ['pk'], others: ['back9', 'hole_countback'],
  });

  // ════════════════════════════════════════════════════════════════
  head('H', '外卡開關 & 結束比賽');
  r = await gjAdmin.put('/api/tournament/wildcard-visibility?t=greenjacket', { show: false });
  check('可關閉外卡標示',
    r.status === 200 &&
    (await guest.get('/api/tournament?t=greenjacket')).body.tournament.show_wildcard === 0);
  await gjAdmin.put('/api/tournament/wildcard-visibility?t=greenjacket', { show: true });
  r = await gjAdmin.put('/api/tournament/status?t=greenjacket', { status: 'finished' });
  check('切到「已結束」', r.status === 200);
  r = await guest.get('/api/rankings?t=greenjacket');
  check('結束後排名仍可讀', r.status === 200 && r.body.netRankings.length === players.length);
  check('冠軍已產生', r.body.netRankings[0].rank === 1 && !r.body.netRankings[0].sharedRank);
  console.log(`   🏆 冠軍:${r.body.netRankings[0].displayName} 淨桿 ${r.body.netRankings[0].netScore}`);

  // ════════════════════════════════════════════════════════════════
  head('I', '戒指盃完全沒被影響');
  r = await guest.get('/api/tournament');
  check('不帶 ?t= 預設回戒指盃', r.body.tournament?.slug === 'ring', r.body.tournament?.slug);
  check('不是綠夾克的資料', r.body.tournament?.name !== tournament.name);
  r = await guest.get('/api/rankings');
  check('戒指盃排名 API 正常', r.status === 200 && Array.isArray(r.body.strokeRankings));
  check('戒指盃仍有最終排名(選馬)欄位', 'finalRankings' in r.body);
  r = await ringAdmin.put('/api/tournament/status', { status: 'setup' });
  check('戒指盃管理員仍能操作自己的比賽', r.status === 200);
}

// ── run it ────────────────────────────────────────────────────────
(async () => {
  fs.copyFileSync(path.join(ROOT, 'db', 'golf.sqlite'), TEST_DB);
  console.log('綠夾克盃 彩排 — HTTP 端對端');
  console.log(`資料庫:${TEST_DB}(可拋棄副本 ✓)`);
  console.log(`伺服器:${BASE}\n`);

  const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, DB_PATH: TEST_DB, PORT: String(PORT), SESSION_SECRET: 'rehearsal' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const serverLog = [];
  server.stdout.on('data', d => serverLog.push(String(d)));
  server.stderr.on('data', d => serverLog.push(String(d)));

  try {
    await waitForServer(server);
    await main();
  } catch (err) {
    fail++;
    console.error('\n執行中斷:', err.message);
    if (serverLog.length) console.error('伺服器輸出:\n' + serverLog.join('').slice(-1500));
  } finally {
    server.kill();
    console.log(`\n${'═'.repeat(66)}`);
    console.log(`HTTP 端對端彩排:${pass} 通過 / ${fail} 失敗${skipped ? ` / ${skipped} 略過` : ''}`);
    console.log('═'.repeat(66));
    // The server needs a moment to let go of the file on Windows
    for (let i = 0; i < 20 && fs.existsSync(TEST_DB); i++) {
      try { fs.unlinkSync(TEST_DB); } catch { await new Promise(r => setTimeout(r, 250)); }
    }
    console.log(fs.existsSync(TEST_DB) ? `⚠ 請手動刪除 ${TEST_DB}` : '可拋棄資料庫已刪除 ✓');
    process.exit(fail ? 1 : 0);
  }
})();
