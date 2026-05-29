const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

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
  `);

  // Add brief_rules column if not yet present (safe migration)
  try { db.exec("ALTER TABLE tournament ADD COLUMN brief_rules TEXT DEFAULT ''"); } catch(e) {}

  // Ensure at least one tournament row exists
  const existing = db.prepare('SELECT id FROM tournament LIMIT 1').get();
  if (!existing) {
    db.prepare('INSERT INTO tournament (course_name, date, tee_time) VALUES (?,?,?)').run('', '', '');
  }

  return db;
}

module.exports = { initDb };
