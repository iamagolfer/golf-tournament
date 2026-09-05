// Archived years must survive everything a new season does to the live tables.
//   node logic/gjArchive.test.js
//
// 再興 is under renovation, so the course changes from year to year: 10A stands
// in for 15 today, a par can be re-rated, a hole can drop out entirely. Editing
// the course rewrites the same hole rows in place and deletes the scores of any
// hole removed — so the question this answers is whether setting up next year
// can damage the record of a year already archived, and whether the new season
// runs correctly on the changed course.
//
// Starts its own server against a throwaway copy of the database and deletes it
// when finished. Nothing here is tied to a roster or a hole count.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TEST_DB = path.join(ROOT, 'db', 'golf.archivetest.sqlite');
const PORT = 3800 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}`;

let pass = 0, fail = 0;
const check = (label, cond, detail = '') => {
  if (cond) { pass++; console.log(`   ✓ ${label}`); }
  else { fail++; console.log(`   ✗ ${label}  ${detail}`); }
};
const head = (n, t) => console.log(`\n${'─'.repeat(64)}\n${n}:${t}\n${'─'.repeat(64)}`);

function client() {
  let cookie = '';
  return async (method, p, body) => {
    let res;
    try {
      res = await fetch(BASE + p, {
        method,
        headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      return { status: 0, error: e.cause?.code || e.message, body: {} };
    }
    const setC = res.headers.get('set-cookie');
    if (setC) cookie = setC.split(';')[0];
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 150) }; }
    return { status: res.status, body: json };
  };
}

async function main() {
  const admin = client(), guest = client();
  await admin('POST', '/api/auth/login', { username: 'admin', password: 'iam1976', scope: 'greenjacket' });

  const tour = async () => (await guest('GET', '/api/tournament?t=greenjacket')).body;
  const players = async () => (await guest('GET', '/api/players?t=greenjacket')).body.players || [];
  // Give the whole field a round on whatever course is currently set
  const playRound = async (holes, offset = 4) => {
    for (const [i, p] of (await players()).entries()) {
      const strokes = holes.map(h => h.par);
      let over = offset + i;
      for (let k = 0; over > 0; k = (k + 1) % strokes.length) { strokes[k]++; over--; }
      await guest('POST', '/api/scores/batch?t=greenjacket', {
        playerId: p.id, scores: holes.map((h, k) => ({ holeId: h.id, strokes: strokes[k] })),
      });
    }
  };
  const coursePayload = (t) => t.sections.map(s => ({
    name: s.name,
    active: true,
    holes: t.holes.filter(h => h.section_id === s.id)
      .map(h => ({ hole_label: h.hole_label, par: h.par, yards: h.yards, yards_red: h.yards_red })),
  }));

  // ── Play and archive a season ───────────────────────────────────
  await admin('PUT', '/api/tournament/status?t=greenjacket', { status: 'setup' });
  let t = await tour();
  if (!t.holes?.length || !(await players()).length) {
    console.error('ABORT: the Green Jacket has no course or no players set up');
    fail++; return;
  }
  await playRound(t.holes);
  await admin('PUT', '/api/tournament/status?t=greenjacket', { status: 'finished' });

  let r = await admin('POST', '/api/archives/from-tournament?t=greenjacket', {});
  const YEAR = r.body.year;
  check('封存完賽的年度', r.status === 200, JSON.stringify(r.body).slice(0, 120));
  const before = (await guest('GET', `/api/archives/${YEAR}?t=greenjacket`)).body;
  const lastLabel = before.holes[before.holes.length - 1].label;
  console.log(`\n   已封存 ${YEAR}:${before.holes.length} 洞 · Par ${before.parTotal} · 最後一洞 ${lastLabel}`);
  console.log(`   冠軍 ${before.netRankings[0].displayName} 淨桿 ${before.netRankings[0].netScore}`);

  // ── A: the course is re-rated and a hole renamed ────────────────
  head('A', '明年球場整修完 — 最後一洞改名、某洞 Par 改掉');
  const payload = coursePayload(t);
  const backNine = payload[payload.length - 1].holes;
  backNine[backNine.length - 1].hole_label = '15';          // 10A goes back to 15
  const parFour = payload[0].holes.findIndex(h => h.par === 4);
  if (parFour >= 0) payload[0].holes[parFour].par = 5;      // a hole is re-rated
  r = await admin('PUT', '/api/tournament/course?t=greenjacket', { sections: payload });
  check('球場更新成功', r.status === 200, JSON.stringify(r.body));

  t = await tour();
  check('新球場最後一洞已改名', t.holes[t.holes.length - 1].hole_label === '15',
    t.holes[t.holes.length - 1].hole_label);
  check('新球場 Par 已改變', t.holes.reduce((a, h) => a + h.par, 0) !== before.parTotal);

  const after = (await guest('GET', `/api/archives/${YEAR}?t=greenjacket`)).body;
  check(`封存的最後一洞仍是 ${lastLabel}`, after.holes[after.holes.length - 1].label === lastLabel,
    after.holes[after.holes.length - 1].label);
  check('封存的總 Par 沒被改動', after.parTotal === before.parTotal, `${after.parTotal} vs ${before.parTotal}`);
  check('封存的每洞 Par 完全相同',
    JSON.stringify(after.holes.map(h => h.par)) === JSON.stringify(before.holes.map(h => h.par)));
  check('封存的洞名完全相同',
    JSON.stringify(after.holes.map(h => h.label)) === JSON.stringify(before.holes.map(h => h.label)));
  check('封存的冠軍與淨桿沒變',
    after.netRankings[0].displayName === before.netRankings[0].displayName &&
    after.netRankings[0].netScore === before.netRankings[0].netScore);
  check('封存的逐洞成績沒變',
    JSON.stringify(after.netRankings.map(p => p.strokesInPlayOrder)) ===
    JSON.stringify(before.netRankings.map(p => p.strokesInPlayOrder)));

  // ── B: a hole drops out of the course entirely ──────────────────
  head('B', '某洞整修不打 — 球場少一洞（會連帶刪掉該洞的成績）');
  const shorter = coursePayload(await tour());
  shorter[shorter.length - 1].holes.pop();
  r = await admin('PUT', '/api/tournament/course?t=greenjacket', { sections: shorter });
  check('球場改成少一洞', r.status === 200);
  t = await tour();
  check(`球場剩 ${before.holes.length - 1} 洞`, t.holes.length === before.holes.length - 1, String(t.holes.length));
  const stillThere = (await guest('GET', `/api/archives/${YEAR}?t=greenjacket`)).body;
  check(`封存仍是完整 ${before.holes.length} 洞`, stillThere.holes.length === before.holes.length,
    String(stillThere.holes.length));
  check('封存的逐洞成績筆數沒少',
    stillThere.netRankings[0].strokesInPlayOrder.length === before.holes.length);
  check('封存的冠軍還是同一人',
    stillThere.netRankings[0].displayName === before.netRankings[0].displayName);

  // ── C: the new season runs on the changed course ────────────────
  head('C', '新球季在改過的球場上照常運作');
  await admin('PUT', '/api/tournament/status?t=greenjacket', { status: 'setup' });
  const roster = await players();
  await admin('PUT', '/api/players?t=greenjacket', {
    players: roster.map((p, i) => ({ chinese_name: '', english_name: 'P' + (i + 1), handicap: 10 + i })),
  });
  t = await tour();
  await playRound(t.holes, 3);
  r = await guest('GET', '/api/rankings?t=greenjacket');
  const n = (await players()).length;
  check('新球季排得出完整名次', r.status === 200 && r.body.netRankings.filter(p => p.rank).length === n,
    String(r.body.netRankings.filter(p => p.rank).length));
  check('新球季的 Par 用新的球場資料',
    r.body.parTotal === t.holes.reduce((a, h) => a + h.par, 0),
    `${r.body.parTotal} vs ${t.holes.reduce((a, h) => a + h.par, 0)}`);
  check('新球季每人以新洞數完賽',
    r.body.netRankings.filter(p => p.netScore !== null).every(p => p.holesPlayed === t.holes.length));
  check('逐洞倒數改用新的最後一洞',
    r.body.holes[r.body.holes.length - 1].label === t.holes[t.holes.length - 1].hole_label,
    `${r.body.holes[r.body.holes.length - 1].label} vs ${t.holes[t.holes.length - 1].hole_label}`);

  // ── D: two years, two different courses ─────────────────────────
  head('D', '兩個年度各自保有自己那年的球場與名單');
  await admin('PUT', '/api/tournament/status?t=greenjacket', { status: 'finished' });
  await admin('PUT', '/api/tournament/info?t=greenjacket', {
    course_name: t.tournament.course_name,
    date: `${Number(YEAR) + 1}-09-04`,
    tee_time: t.tournament.tee_time,
    total_players: n,
  });
  r = await admin('POST', '/api/archives/from-tournament?t=greenjacket', {});
  check('封存第二個年度', r.status === 200 && r.body.year === String(Number(YEAR) + 1),
    JSON.stringify(r.body).slice(0, 120));
  const list = (await guest('GET', '/api/archives?t=greenjacket')).body.archives || [];
  check('兩個年度都在清單裡', list.length === 2, list.map(a => a.year).join(','));

  const y1 = (await guest('GET', `/api/archives/${YEAR}?t=greenjacket`)).body;
  const y2 = (await guest('GET', `/api/archives/${Number(YEAR) + 1}?t=greenjacket`)).body;
  check(`${YEAR} 的球場沒有被第二年覆蓋`,
    y1.holes.length === before.holes.length && y1.holes[y1.holes.length - 1].label === lastLabel);
  check(`${Number(YEAR) + 1} 用的是改過的球場`, y2.holes.length === before.holes.length - 1,
    String(y2.holes.length));
  check('兩年的 Par 各自正確', y1.parTotal !== y2.parTotal, `${y1.parTotal} / ${y2.parTotal}`);
  check('兩年的選手名單各自獨立',
    y1.players[0].english_name !== y2.players[0].english_name,
    `${y1.players[0].english_name} / ${y2.players[0].english_name}`);
  console.log(`\n   ${YEAR}:${y1.holes.map(h => h.label).join(',')}  Par ${y1.parTotal}`);
  console.log(`   ${Number(YEAR) + 1}:${y2.holes.map(h => h.label).join(',')}  Par ${y2.parTotal}`);
}

(async () => {
  fs.copyFileSync(path.join(ROOT, 'db', 'golf.sqlite'), TEST_DB);
  console.log('綠夾克盃 — 封存 vs 球場異動');
  console.log(`資料庫:${TEST_DB}(可拋棄副本 ✓)\n伺服器:${BASE}`);

  const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, DB_PATH: TEST_DB, PORT: String(PORT), SESSION_SECRET: 'archivetest' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = [];
  server.stdout.on('data', d => log.push(String(d)));
  server.stderr.on('data', d => log.push(String(d)));

  try {
    const started = Date.now();
    while (Date.now() - started < 20000) {
      if (server.exitCode !== null) throw new Error(`server exited (code ${server.exitCode})`);
      try { if ((await fetch(`${BASE}/api/tournament`)).ok) break; } catch {}
      await new Promise(r => setTimeout(r, 250));
    }
    await main();
  } catch (err) {
    fail++;
    console.error('\n執行中斷:', err.message);
    if (log.length) console.error('伺服器輸出:\n' + log.join('').slice(-1200));
  } finally {
    server.kill();
    console.log(`\n${'═'.repeat(64)}`);
    console.log(`封存 vs 球場異動:${pass} 通過 / ${fail} 失敗`);
    console.log('═'.repeat(64));
    for (let i = 0; i < 20 && fs.existsSync(TEST_DB); i++) {
      try { fs.unlinkSync(TEST_DB); } catch { await new Promise(r => setTimeout(r, 250)); }
    }
    console.log(fs.existsSync(TEST_DB) ? `⚠ 請手動刪除 ${TEST_DB}` : '可拋棄資料庫已刪除 ✓');
    process.exit(fail ? 1 : 0);
  }
})();
