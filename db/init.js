const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

// Tournament slugs — every query is scoped by one of these
const RING = 'ring';
const GREENJACKET = 'greenjacket';

function initDb() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, 'golf.sqlite');
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tournament (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_name TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      tee_time TEXT NOT NULL DEFAULT '',
      rules_text TEXT DEFAULT '',
      total_players INTEGER DEFAULT 0,
      status TEXT DEFAULT 'setup',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      section_order INTEGER NOT NULL,
      FOREIGN KEY (tournament_id) REFERENCES tournament(id)
    );

    CREATE TABLE IF NOT EXISTS holes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id INTEGER NOT NULL,
      hole_number INTEGER NOT NULL,
      par INTEGER NOT NULL DEFAULT 4,
      yards INTEGER DEFAULT 0,
      FOREIGN KEY (section_id) REFERENCES sections(id)
    );

    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      player_number INTEGER NOT NULL,
      chinese_name TEXT NOT NULL,
      english_name TEXT NOT NULL,
      handicap INTEGER NOT NULL,
      pin TEXT NOT NULL DEFAULT '0000',
      group_id INTEGER,
      no_show INTEGER DEFAULT 0,
      FOREIGN KEY (tournament_id) REFERENCES tournament(id)
    );

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      group_order INTEGER NOT NULL,
      FOREIGN KEY (tournament_id) REFERENCES tournament(id)
    );

    CREATE TABLE IF NOT EXISTS horse_picks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL UNIQUE,
      picked_player_id INTEGER NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (player_id) REFERENCES players(id),
      FOREIGN KEY (picked_player_id) REFERENCES players(id)
    );

    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL,
      hole_id INTEGER NOT NULL,
      strokes INTEGER NOT NULL,
      entered_at TEXT DEFAULT (datetime('now')),
      UNIQUE(player_id, hole_id),
      FOREIGN KEY (player_id) REFERENCES players(id),
      FOREIGN KEY (hole_id) REFERENCES holes(id)
    );

    CREATE TABLE IF NOT EXISTS champions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      year TEXT NOT NULL,
      course TEXT DEFAULT '',
      champion_name TEXT NOT NULL,
      display_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS champion_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      champion_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      player_name TEXT NOT NULL,
      score TEXT DEFAULT '',
      FOREIGN KEY (champion_id) REFERENCES champions(id)
    );
  `);

  // ---- Safe column migrations (each wrapped so re-runs are no-ops) ----
  const addColumn = (sql) => { try { db.exec(sql); } catch (e) {} };

  addColumn("ALTER TABLE tournament ADD COLUMN brief_rules TEXT DEFAULT ''");
  addColumn("ALTER TABLE sections   ADD COLUMN active INTEGER DEFAULT 1");

  // Multi-tournament support
  addColumn("ALTER TABLE tournament ADD COLUMN slug TEXT DEFAULT ''");
  addColumn("ALTER TABLE tournament ADD COLUMN name TEXT DEFAULT ''");
  // Green Jacket specific
  addColumn("ALTER TABLE tournament ADD COLUMN playoff_winner_id INTEGER");
  addColumn("ALTER TABLE tournament ADD COLUMN show_wildcard INTEGER DEFAULT 1");
  addColumn("ALTER TABLE tournament ADD COLUMN tiebreak_champion TEXT DEFAULT ''");
  addColumn("ALTER TABLE tournament ADD COLUMN tiebreak_others TEXT DEFAULT ''");
  // Hole label — hole_number is INTEGER so it cannot hold "10A"
  addColumn("ALTER TABLE holes ADD COLUMN hole_label TEXT DEFAULT ''");
  // Second tee yardage (men play white, ladies play red)
  addColumn("ALTER TABLE holes ADD COLUMN yards_red INTEGER DEFAULT 0");
  // Player extras
  addColumn("ALTER TABLE players ADD COLUMN wildcard INTEGER DEFAULT 0");
  addColumn("ALTER TABLE players ADD COLUMN tee TEXT DEFAULT 'white'");
  // Champion results kept only a signed to-par string, which says nothing about
  // how the player got there. These are NULL for years typed in by hand.
  addColumn("ALTER TABLE champion_results ADD COLUMN gross INTEGER");
  addColumn("ALTER TABLE champion_results ADD COLUMN handicap INTEGER");
  addColumn("ALTER TABLE champion_results ADD COLUMN net INTEGER");

  // ---- Ensure the Ring Cup tournament exists and is tagged ----
  let ring = db.prepare('SELECT id FROM tournament WHERE slug=?').get(RING);
  if (!ring) {
    // Pre-slug database: adopt the existing (single) row as the Ring Cup
    const legacy = db.prepare("SELECT id FROM tournament WHERE slug IS NULL OR slug='' ORDER BY id LIMIT 1").get();
    if (legacy) {
      db.prepare('UPDATE tournament SET slug=?, name=? WHERE id=?').run(RING, '戒指盃', legacy.id);
      ring = legacy;
    } else {
      const r = db.prepare('INSERT INTO tournament (slug, name, course_name, date, tee_time) VALUES (?,?,?,?,?)')
        .run(RING, '戒指盃', '', '', '');
      ring = { id: Number(r.lastInsertRowid) };
    }
  }

  // ---- Ensure the Green Jacket tournament exists ----
  let gj = db.prepare('SELECT id FROM tournament WHERE slug=?').get(GREENJACKET);
  if (!gj) {
    const r = db.prepare(`
      INSERT INTO tournament (slug, name, course_name, date, tee_time, total_players, status,
                              tiebreak_champion, tiebreak_others)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(GREENJACKET, '綠夾克盃', '再興高爾夫俱樂部', '2026-09-04', '12:00', 15, 'setup',
           JSON.stringify(['pk']), JSON.stringify(['back9', 'hole_countback']));
    gj = { id: Number(r.lastInsertRowid) };
    seedGreenJacketCourse(db, gj.id);
    seedGreenJacketPlayers(db, gj.id);
  }

  seedChampions(db);

  return db;
}

// ---------------------------------------------------------------------------
// Seed data — only ever runs once, when a tournament row is first created
// ---------------------------------------------------------------------------

// 再興高爾夫俱樂部 Par 72. Note: hole 15 is under renovation, 10A stands in for
// it and is the last hole actually played. hole_number drives ordering (1-9 per
// section); hole_label is what players see, so it can hold "10A".
const GJ_COURSE = [
  {
    name: '前九', order: 1,
    holes: [
      { label: '1', par: 4, white: 379, red: 310 },
      { label: '2', par: 4, white: 391, red: 328 },
      { label: '3', par: 3, white: 212, red: 168 },
      { label: '4', par: 5, white: 501, red: 486 },
      { label: '5', par: 5, white: 460, red: 330 },
      { label: '6', par: 4, white: 346, red: 277 },
      { label: '7', par: 4, white: 366, red: 293 },
      { label: '8', par: 3, white: 170, red: 153 },
      { label: '9', par: 5, white: 505, red: 480 },
    ],
  },
  {
    name: '後九', order: 2,
    holes: [
      { label: '10',  par: 4, white: 330, red: 255 },
      { label: '11',  par: 5, white: 561, red: 479 },
      { label: '12',  par: 4, white: 328, red: 287 },
      { label: '13',  par: 3, white: 158, red: 120 },
      { label: '14',  par: 4, white: 393, red: 321 },
      { label: '16',  par: 3, white: 164, red: 118 },
      { label: '17',  par: 5, white: 516, red: 493 },
      { label: '18',  par: 4, white: 417, red: 381 },
      { label: '10A', par: 3, white: 152, red: 133 },
    ],
  },
];

function seedGreenJacketCourse(db, tournamentId) {
  const insSection = db.prepare('INSERT INTO sections (tournament_id, name, section_order, active) VALUES (?,?,?,1)');
  const insHole = db.prepare('INSERT INTO holes (section_id, hole_number, hole_label, par, yards, yards_red) VALUES (?,?,?,?,?,?)');
  for (const sec of GJ_COURSE) {
    const r = insSection.run(tournamentId, sec.name, sec.order);
    const sectionId = Number(r.lastInsertRowid);
    sec.holes.forEach((h, i) => insHole.run(sectionId, i + 1, h.label, h.par, h.white, h.red));
  }
}

// 15 players / 4 groups. Chinese names are blank for now — Albert fills them in
// from the admin panel later; display falls back to the English name.
// Tee defaults to white for everyone; Albert marks the red-tee players himself.
const GJ_GROUPS = [
  { name: '組 1', players: [['Benny', 14], ['JJ', 14], ['Daniel', 16], ['Lola', 19, true]] },
  { name: '組 2', players: [['Eddie', 20], ['Albert', 5], ['Katie', 11, true], ['Debbie', 10, true]] },
  { name: '組 3', players: [['William', 11], ['Lio', 21], ['Jimmy', 13], ['Casper', 24]] },
  { name: '組 4', players: [['Jason', 14], ['Jeff', 26], ['Ian', 14, true]] },
];

function seedGreenJacketPlayers(db, tournamentId) {
  const insGroup = db.prepare('INSERT INTO groups (tournament_id, name, group_order) VALUES (?,?,?)');
  const insPlayer = db.prepare(`
    INSERT INTO players (tournament_id, player_number, chinese_name, english_name,
                         handicap, pin, group_id, wildcard, tee)
    VALUES (?,?,?,?,?,?,?,?,?)
  `);
  let playerNumber = 1;
  GJ_GROUPS.forEach((g, gi) => {
    const r = insGroup.run(tournamentId, g.name, gi + 1);
    const groupId = Number(r.lastInsertRowid);
    for (const [englishName, handicap, wildcard] of g.players) {
      insPlayer.run(tournamentId, playerNumber++, '', englishName, handicap, '0000', groupId, wildcard ? 1 : 0, 'white');
    }
  });
}

// Past champions. The Ring Cup entries were previously hardcoded in
// PickHorsePage.jsx — they move into the database here so the admin can edit them.
const CHAMPIONS = {
  ring: [
    { year: '2022', course: '新豐球場', champion: '林家榮 Jason', results: [
      ['Jason', '+4'], ['Daniel', '+8'], ['Casper', '+8'], ['AD', '+10'], ['Benny', '+10'],
      ['Albert', '+12'], ['Johnny', '+12'], ['William', '+15'], ['Eddie', '+20'],
    ]},
    { year: '2023', course: '楊梅球場', champion: '林褚君 William', results: [
      ['William', '0'], ['Johnny', '+1'], ['Casper', '+4'], ['AD', '+6'], ['Albert', '+7'],
      ['Eddie', '+7'], ['Benny', '+8'], ['Daniel', '+9'], ['Jason', '+16'], ['JJ', 'DQ (No Show)'],
    ]},
    { year: '2024', course: '台北球場', champion: '陳威龍 Daniel', results: [
      ['Daniel', '+1'], ['JJ', '+3'], ['Johnny', '+4'], ['AD', '+8'], ['Benny', '+9'], ['Jimmy', '+9'],
      ['Albert', '+11'], ['William', '+13'], ['Eddie', '+14'], ['Jason', '+18'], ['Jeff', '+18'], ['Casper', '+22'],
    ]},
    { year: '2025', course: '新豐球場', champion: '林褚君 William', results: [
      ['William', '-1'], ['Jimmy', '0'], ['AD', '+1'], ['Johnny', '+2'], ['Albert', '+2'], ['Eddie', '+5'],
      ['Daniel', '+7'], ['Benny', '+8'], ['Casper', '+9'], ['Jeff', '+9'], ['Jason', '+17'],
    ]},
  ],
  greenjacket: [
    { year: '2023', course: '再興高爾夫俱樂部', champion: 'Jimmy', results: [] },
    { year: '2024', course: '再興高爾夫俱樂部', champion: 'Johnny', results: [] },
    { year: '2025', course: '再興高爾夫俱樂部', champion: 'JJ', results: [] },
  ],
};

function seedChampions(db) {
  const insChampion = db.prepare('INSERT INTO champions (slug, year, course, champion_name, display_order) VALUES (?,?,?,?,?)');
  const insResult = db.prepare('INSERT INTO champion_results (champion_id, position, player_name, score) VALUES (?,?,?,?)');
  for (const [slug, entries] of Object.entries(CHAMPIONS)) {
    const already = db.prepare('SELECT id FROM champions WHERE slug=? LIMIT 1').get(slug);
    if (already) continue; // never overwrite what the admin has edited
    entries.forEach((e, i) => {
      const r = insChampion.run(slug, e.year, e.course, e.champion, i + 1);
      const championId = Number(r.lastInsertRowid);
      e.results.forEach(([playerName, score], idx) => insResult.run(championId, idx + 1, playerName, score));
    });
  }
}

module.exports = { initDb, RING, GREENJACKET };
