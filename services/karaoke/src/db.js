import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS scores (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  user_name   TEXT NOT NULL,
  song_id     TEXT NOT NULL,
  score       INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  accuracy    REAL NOT NULL CHECK (accuracy BETWEEN 0 AND 1),
  duration_ms INTEGER NOT NULL CHECK (duration_ms BETWEEN 0 AND 600000),
  created_at  TEXT NOT NULL,
  suspicious  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_scores_user_created ON scores (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_scores_song_score ON scores (song_id, score);
`;

// CREATE TABLE IF NOT EXISTS không thêm cột vào bảng đã có từ phiên bản cũ, nên phải kiểm tra và ALTER.
function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function openDatabase(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'karaoke.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  ensureColumn(db, 'scores', 'suspicious', 'INTEGER NOT NULL DEFAULT 0');
  return db;
}
