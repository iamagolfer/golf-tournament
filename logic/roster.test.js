// Club roster: identity matching, handicap history, and the rule that changing a
// handicap never rewrites a round already played.
//   node logic/roster.test.js
//
// Seeds the throwaway database with the 2026 archives so there is real history
// to match against, then drives the API the way the admin pages do.
// Club roster against the real 2026 data: does it find the right people?
const fs = require('fs'), { spawn } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DB = path.join(ROOT, 'db', 'golf.rostertest.sqlite'), PORT = 3700 + Math.floor(Math.random() * 90), BASE = 'http://localhost:' + PORT;
fs.copyFileSync(path.join(ROOT, 'db', 'golf.sqlite'), DB);
const srv = spawn(process.execPath, [path.join(ROOT, 'server.js')],
  { cwd: ROOT, env: { ...process.env, DB_PATH: DB, PORT: String(PORT), SESSION_SECRET: 't' }, stdio: 'ignore' });
let pass = 0, fail = 0;
const ck = (l, c, d = '') => { c ? (pass++, console.log('   ✓ ' + l)) : (fail++, console.log('   ✗ ' + l + '  ' + d)); };
const H = (s) => console.log('\n' + '─'.repeat(60) + '\n' + s + '\n' + '─'.repeat(60));
const mk = () => {
  let cookie = '';
  return async (m, p, b) => {
    const r = await fetch(BASE + p, {
      method: m, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: b === undefined ? undefined : JSON.stringify(b),
    });
    const s = r.headers.get('set-cookie'); if (s) cookie = s.split(';')[0];
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { _raw: t.slice(0, 150) }; }
    return { status: r.status, body: j };
  };
};

(async () => {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/tournament')).ok) break; } catch {} await new Promise(r => setTimeout(r, 250)); }
  const admin = mk(), gjAdmin = mk(), guest = mk();

  // Seed both archives so the roster has real history to work from
  const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'db', 'archives', 'greenjacket-2026.json'), 'utf8'));
  const seedRing = JSON.parse(fs.readFileSync(path.join(ROOT, 'db', 'archives', 'ring-2026.json'), 'utf8'));
  const { DatabaseSync } = require('node:sqlite');
  const raw = new DatabaseSync(DB);
  const stamp = '2026-09-05 00:00:00';
  for (const [slug, snap] of [['greenjacket', seed], ['ring', seedRing]]) {
    raw.prepare(`INSERT INTO archives (slug, year, created_at, data) VALUES (?,?,?,?)
      ON CONFLICT(slug, year) DO UPDATE SET data=excluded.data`)
      .run(slug, '2026', stamp, JSON.stringify(snap));
  }
  raw.close();

  H('A:權限');
  let r = await guest('GET', '/api/roster');
  ck('未登入看不到球隊名單', r.status === 401 || r.status === 403, 'status=' + r.status);
  await admin('POST', '/api/auth/login', { username: 'admin', password: 'iam1976' });
  r = await admin('GET', '/api/roster');
  ck('戒指盃管理員可以看', r.status === 200);
  await gjAdmin('POST', '/api/auth/login', { username: 'benny', password: 'benny', scope: 'greenjacket' });
  r = await gjAdmin('GET', '/api/roster');
  ck('綠夾克管理員也可以看（名單是跨賽事的）', r.status === 200);

  H('B:從既有資料找出「人」');
  r = await admin('GET', '/api/roster/import/preview');
  const cands = r.body.candidates || [];
  console.log('   找到 ' + cands.length + ' 位:');
  cands.forEach(c => console.log('      ' + [c.chinese_name, c.english_name].filter(Boolean).join(' ') +
    ' 差點 ' + c.handicap + (c.wildcard ? ' [外卡]' : '') + '  ← ' + c.sources.join(' / ')));
  const keyOf = (c) => (c.english_name || '').toLowerCase() || (c.chinese_name || '');
  ck('沒有人被拆成兩筆', new Set(cands.map(keyOf)).size === cands.length,
    String(cands.length - new Set(cands.map(keyOf)).size) + ' 筆重複');
  const archivedNames = new Set([...seed.players, ...seedRing.players]
    .map(p => (p.english_name || p.chinese_name || '').toLowerCase()));
  ck('封存裡的每個人都被找出來', [...archivedNames].every(n => cands.some(c => keyOf(c) === n)),
    [...archivedNames].filter(n => !cands.some(c => keyOf(c) === n)).join(','));
  ck('名單上沒下場的人也在（例如報名了沒打）', cands.length >= archivedNames.size,
    `${cands.length} vs ${archivedNames.size}`);

  const william = cands.find(c => c.english_name === 'William');
  ck('同一個人在兩場被併成一筆', william && william.sources.length >= 2,
    JSON.stringify(william?.sources));
  ck('綠夾克缺的中文名由戒指盃補上', william?.chinese_name === '林楮君', william?.chinese_name);
  const katie = cands.find(c => c.english_name === 'Katie');
  ck('只打過綠夾克的人也找得到', !!katie, cands.map(c => c.english_name).join(','));
  const leon = cands.find(c => c.english_name === 'Leon');
  ck('只打過戒指盃的人也找得到', !!leon && leon.chinese_name === '洪豪聰', JSON.stringify(leon));

  H('C:建立名單');
  r = await admin('POST', '/api/roster/import', { players: cands });
  ck('匯入成功', r.status === 200, JSON.stringify(r.body));
  ck('全部建立', r.body.added === cands.length, `added=${r.body.added}`);
  ck('比賽名單接回球員（club_player_id）', r.body.linked > 0, `linked=${r.body.linked}`);
  r = await admin('GET', '/api/roster');
  const roster = r.body.roster;
  ck('名單有 ' + cands.length + ' 位', roster.length === cands.length, String(roster.length));
  ck('每位都算得出參賽場次', roster.every(m => Number.isFinite(m.roundsPlayed)));
  console.log('   ' + roster.map(m => (m.chinese_name || m.english_name) + ':' + m.roundsPlayed + '場').join(' · '));

  r = await admin('POST', '/api/roster/import', { players: cands });
  ck('重複匯入不會產生分身', r.body.added === 0 && r.body.skipped === cands.length,
    JSON.stringify(r.body));

  H('D:球員頁 — 打過兩場的人');
  const w = roster.find(m => m.english_name === 'William');
  r = await admin('GET', '/api/roster/' + w.id);
  const d = r.body;
  ck('讀得到球員頁', r.status === 200);
  ck('兩場都列出來', d.rounds.filter(x => x.archived).length === 2,
    d.rounds.map(x => x.tournamentName + ' ' + x.year).join(' / '));
  const gjRound = d.rounds.find(x => x.slug === 'greenjacket');
  ck('有逐洞成績', Array.isArray(gjRound.strokes) && gjRound.strokes.length === 18,
    String(gjRound.strokes?.length));
  ck('有那場的差點', Number.isFinite(gjRound.handicap), String(gjRound.handicap));
  ck('有分組與同組的人', !!gjRound.groupName && gjRound.groupMates.length > 0,
    gjRound.groupName + ':' + (gjRound.groupMates || []).join('、'));
  ck('戒指盃那場有選馬', !!d.rounds.find(x => x.slug === 'ring')?.pickedPlayerName,
    d.rounds.find(x => x.slug === 'ring')?.pickedPlayerName);
  console.log('   ' + (w.chinese_name || w.english_name) + ' 統計:' + JSON.stringify(d.stats));
  ck('統計算得出來', d.stats.played === 2 && d.stats.bestNet !== null, JSON.stringify(d.stats));

  H('E:差點調整一定要有原因');
  r = await admin('PUT', `/api/roster/${w.id}/handicap`, { handicap: 9 });
  ck('沒填原因被擋', r.status === 400, 'status=' + r.status);
  r = await admin('PUT', `/api/roster/${w.id}/handicap`, { handicap: w.handicap, reason: 'x' });
  ck('差點沒變也被擋', r.status === 400, 'status=' + r.status);
  r = await admin('PUT', `/api/roster/${w.id}/handicap`, { handicap: 9, reason: '2026 綠夾克冠軍,調降 2 桿' });
  ck('填了原因就能改', r.status === 200 && r.body.to === 9, JSON.stringify(r.body));
  r = await admin('GET', '/api/roster/' + w.id);
  ck('目前差點已更新', r.body.player.handicap === 9, String(r.body.player.handicap));
  ck('異動紀錄留下來了', r.body.handicapLog.length === 2, String(r.body.handicapLog.length));
  ck('紀錄含原因與前後值',
    r.body.handicapLog[0].reason.includes('冠軍') && r.body.handicapLog[0].from_handicap === 11 &&
    r.body.handicapLog[0].to_handicap === 9, JSON.stringify(r.body.handicapLog[0]));
  console.log('   ' + r.body.handicapLog.map(l =>
    `${l.changed_at} ${l.from_handicap ?? '—'}→${l.to_handicap}（${l.reason}）`).join('\n   '));

  H('F:改差點不能動到已經打完的比賽');
  const gjAfter = r.body.rounds.find(x => x.slug === 'greenjacket');
  ck('2026 那場還是用當時的差點 11', gjAfter.handicap === 11, String(gjAfter.handicap));
  ck('2026 那場的淨桿沒變', gjAfter.netScore === gjRound.netScore,
    `${gjAfter.netScore} vs ${gjRound.netScore}`);
  const live = (await guest('GET', '/api/rankings?t=greenjacket')).body;
  const stillEleven = live.netRankings.find(p => p.english_name === 'William');
  ck('當期比賽名單的差點也沒被改', stillEleven.handicap === 11, String(stillEleven.handicap));

  H('G:狀態與刪除');
  r = await admin('PUT', `/api/roster/${w.id}`, { status: 'inactive' });
  ck('可以標成已退出', r.status === 200 &&
    (await admin('GET', '/api/roster/' + w.id)).body.player.status === 'inactive');
  r = await admin('DELETE', '/api/roster/' + w.id);
  ck('有比賽紀錄的人不准刪除', r.status === 400, r.body.error);
  r = await admin('POST', '/api/roster', { english_name: '打錯了', handicap: 20 });
  const junkId = r.body.id;
  r = await admin('DELETE', '/api/roster/' + junkId);
  ck('沒紀錄的可以刪掉', r.status === 200);
  r = await admin('POST', '/api/roster', { handicap: 10 });
  ck('沒名字不能新增', r.status === 400);
  r = await admin('POST', '/api/roster', { english_name: 'NoHcp' });
  ck('沒差點不能新增', r.status === 400);

  H('H:同一個人被打成兩筆 — 合併');
  // The Green Jacket wrote J.J., the Ring Cup 王伯軒 JJ
  r = await admin('POST', '/api/roster', { english_name: 'J.J.', handicap: 14, status: 'wildcard' });
  const dupId = r.body.id;
  ck('建立了重複的一筆', r.status === 200 && !!dupId);
  const jj = (await admin('GET', '/api/roster')).body.roster.find(m => m.chinese_name === '王伯軒');
  ck('找得到本尊 王伯軒 JJ', !!jj);
  const beforeMerge = (await admin('GET', '/api/roster/' + jj.id)).body;
  r = await admin('POST', `/api/roster/${jj.id}/merge`, { fromId: dupId });
  ck('合併成功', r.status === 200, JSON.stringify(r.body));
  const merged = (await admin('GET', '/api/roster/' + jj.id)).body;
  ck('別名留下來了', (merged.player.aliasList || []).some(a => a.english_name === 'J.J.'),
    JSON.stringify(merged.player.aliasList));
  ck('比賽紀錄沒有減少', merged.rounds.length === beforeMerge.rounds.length,
    `${merged.rounds.length} vs ${beforeMerge.rounds.length}`);
  ck('重複那筆被刪掉', (await admin('GET', '/api/roster/' + dupId)).status === 404);
  ck('合併留下一筆異動紀錄', merged.handicapLog.some(l => l.reason.includes('合併')),
    JSON.stringify(merged.handicapLog[0]));
  r = await admin('POST', `/api/roster/${jj.id}/merge`, { fromId: jj.id });
  ck('不能跟自己合併', r.status === 400, 'status=' + r.status);

  H('J:新賽事從球隊名單加入');
  const gjAdmin2 = mk();
  await gjAdmin2('POST', '/api/auth/login', { username: 'admin', password: 'iam1976', scope: 'greenjacket' });
  await gjAdmin2('PUT', '/api/tournament/status?t=greenjacket', { status: 'setup' });
  // Empty the tournament's list one by one — the bulk PUT refuses a count that
  // does not match total_players, and deleting is the safe path anyway
  for (const p of (await admin('GET', '/api/players?t=greenjacket')).body.players) {
    await gjAdmin2('DELETE', `/api/players/${p.id}?t=greenjacket`);
  }
  ck('（前置）比賽名單已清空',
    (await admin('GET', '/api/players?t=greenjacket')).body.players.length === 0);
  const rosterNow = (await admin('GET', '/api/roster')).body.roster;
  const picks = rosterNow.slice(0, 4);
  r = await gjAdmin2('POST', '/api/players/from-roster?t=greenjacket',
    { clubPlayerIds: picks.map(m => m.id) });
  ck('加入成功', r.status === 200 && r.body.added.length === picks.length,
    JSON.stringify(r.body).slice(0, 160));
  let entered = (await admin('GET', '/api/players?t=greenjacket')).body.players;
  ck('比賽名單就是勾選的人', entered.length === picks.length, String(entered.length));
  ck('差點帶入球隊名單的值',
    picks.every(m => entered.some(p => p.handicap === m.handicap &&
      (p.english_name || p.chinese_name) === (m.english_name || m.chinese_name))));
  ck('編號從 1 開始連號',
    JSON.stringify(entered.map(p => p.player_number).sort((a, b) => a - b)) ===
    JSON.stringify(picks.map((_, i) => i + 1)));
  ck('外卡狀態跟著帶過來',
    entered.filter(p => p.wildcard).length === picks.filter(m => m.status === 'wildcard').length);
  ck('接回球隊名單（club_player_id）', entered.every(p => !!p.club_player_id));

  r = await gjAdmin2('POST', '/api/players/from-roster?t=greenjacket',
    { clubPlayerIds: picks.map(m => m.id) });
  ck('重複加入會被略過,不會有分身', r.body.added.length === 0 && r.body.skipped.length === picks.length,
    JSON.stringify(r.body).slice(0, 120));

  // A tournament handicap is that round's own
  const one = entered[0];
  await gjAdmin2('PUT', `/api/players/${one.id}/details?t=greenjacket`,
    { ...one, handicap: one.handicap + 5 });
  const club = (await admin('GET', '/api/roster/' + one.club_player_id)).body.player;
  ck('在比賽裡改差點不會動到球隊名單', club.handicap === one.handicap,
    `${club.handicap} vs ${one.handicap}`);
  entered = (await admin('GET', '/api/players?t=greenjacket')).body.players;
  ck('比賽裡的差點確實改了',
    entered.find(p => p.id === one.id).handicap === one.handicap + 5);

  await gjAdmin2('PUT', '/api/tournament/status?t=greenjacket', { status: 'playing' });
  r = await gjAdmin2('POST', '/api/players/from-roster?t=greenjacket', { clubPlayerIds: [rosterNow[5].id] });
  ck('比賽開始後不能再加入', r.status === 400, 'status=' + r.status);

  H('I:J.J. 這種寫法在建立名單時就會被視為同一人');
  const { identityKey } = require('./roster');
  ck('J.J. 與 JJ 視為同一個人',
    identityKey({ english_name: 'J.J.' }) === identityKey({ english_name: 'JJ' }),
    identityKey({ english_name: 'J.J.' }) + ' vs ' + identityKey({ english_name: 'JJ' }));
  ck('大小寫與空白也一樣',
    identityKey({ english_name: ' j j ' }) === identityKey({ english_name: 'JJ' }));
  ck('不同的人還是分開',
    identityKey({ english_name: 'Jason' }) !== identityKey({ english_name: 'JJ' }));

  console.log('\n' + pass + ' 通過 / ' + fail + ' 失敗');
  srv.kill();
  for (let i = 0; i < 20 && fs.existsSync(DB); i++) { try { fs.unlinkSync(DB); } catch { await new Promise(r => setTimeout(r, 250)); } }
  console.log(fs.existsSync(DB) ? '⚠ 殘留' : '測試資料庫已刪除 ✓');
  process.exit(fail ? 1 : 0);
})();
