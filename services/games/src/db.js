import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

// Không lưu email hay token. Chỉ lưu user_id và tên hiển thị lấy từ auth.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS caro_rooms (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('waiting', 'playing', 'finished')),
  x_id        TEXT,
  x_name      TEXT,
  o_id        TEXT,
  o_name      TEXT,
  board       TEXT NOT NULL,
  turn        TEXT CHECK (turn IN ('x', 'o')),
  winner      TEXT CHECK (winner IN ('x', 'o', 'draw')),
  move_count  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_caro_rooms_status ON caro_rooms (status, created_at);

CREATE TABLE IF NOT EXISTS caro_results (
  room_id     TEXT PRIMARY KEY REFERENCES caro_rooms (id),
  x_user      TEXT NOT NULL,
  o_user      TEXT NOT NULL,
  winner      TEXT NOT NULL CHECK (winner IN ('x', 'o', 'draw')),
  finished_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quiz_rounds (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  question_ids TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('open', 'finished', 'abandoned')),
  created_at   TEXT NOT NULL,
  finished_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_quiz_rounds_user ON quiz_rounds (user_id, status);

CREATE TABLE IF NOT EXISTS quiz_answers (
  round_id    TEXT NOT NULL REFERENCES quiz_rounds (id),
  question_id INTEGER NOT NULL,
  choice      INTEGER NOT NULL,
  correct     INTEGER NOT NULL CHECK (correct IN (0, 1)),
  answered_at TEXT NOT NULL,
  PRIMARY KEY (round_id, question_id)
);

CREATE TABLE IF NOT EXISTS scores (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  user_name  TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('caro', 'quiz')),
  points     INTEGER NOT NULL CHECK (points >= 0),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scores_kind_user ON scores (kind, user_id);

-- Thi đấu có đồng thuận. Không lưu tên người chơi. updated_at là mốc hoạt động cuối để tự kết thúc trận bỏ dở.
CREATE TABLE IF NOT EXISTS duels (
  id              TEXT PRIMARY KEY,
  mode            TEXT NOT NULL CHECK (mode IN ('fight', 'dance')),
  status          TEXT NOT NULL CHECK (status IN ('invited', 'active', 'finished', 'expired', 'cancelled')),
  inviter_id      TEXT NOT NULL,
  invitee_id      TEXT NOT NULL CHECK (invitee_id <> inviter_id),
  created_at      TEXT NOT NULL,
  accepted_at     TEXT,
  ended_at        TEXT,
  winner_id       TEXT,
  hp_inviter      INTEGER,
  hp_invitee      INTEGER,
  down_user_id    TEXT,
  down_until      TEXT,
  last_hit_by     TEXT,
  last_hit_power  INTEGER,
  last_hit_damage INTEGER,
  last_hit_at     TEXT,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_duels_inviter ON duels (inviter_id, status);
CREATE INDEX IF NOT EXISTS idx_duels_invitee ON duels (invitee_id, status);
`;

export function openDatabase(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'games.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}
