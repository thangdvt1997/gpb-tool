import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tickets (
  id              TEXT PRIMARY KEY,
  category        TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  priority        TEXT NOT NULL,
  status          TEXT NOT NULL,
  requester_id    TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS incidents (
  id            TEXT PRIMARY KEY,
  severity      TEXT NOT NULL CHECK (severity IN ('P1', 'P2')),
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL,
  started_at    TEXT NOT NULL,
  created_by_id TEXT NOT NULL,
  created_by    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents (status, started_at);

CREATE TABLE IF NOT EXISTS bookings (
  id              TEXT PRIMARY KEY,
  room_id         TEXT NOT NULL,
  start_at        TEXT NOT NULL,
  end_at          TEXT NOT NULL,
  title           TEXT NOT NULL,
  booked_by_id    TEXT NOT NULL,
  booked_by_email TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  CHECK (end_at > start_at)
);
CREATE INDEX IF NOT EXISTS idx_bookings_room_time ON bookings (room_id, start_at, end_at);

CREATE TABLE IF NOT EXISTS kudos (
  seq          INTEGER PRIMARY KEY AUTOINCREMENT,
  id           TEXT NOT NULL UNIQUE,
  from_user_id TEXT NOT NULL,
  from_name    TEXT NOT NULL,
  to_name      TEXT NOT NULL,
  message      TEXT NOT NULL,
  day_vn       TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_kudos_user_day ON kudos (from_user_id, day_vn);

CREATE TABLE IF NOT EXISTS checkins (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT '',
  day        TEXT NOT NULL,
  at         TEXT NOT NULL,
  gate       TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_checkins_user_day ON checkins (user_id, day);

CREATE TABLE IF NOT EXISTS audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  at           TEXT NOT NULL,
  who          TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  action       TEXT NOT NULL,
  target       TEXT NOT NULL,
  payload_hash TEXT NOT NULL
);
`;

export function openDatabase(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'it.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

// Ghi audit trong cùng transaction với thao tác nghiệp vụ. Chỉ lưu hash của payload, không lưu nội dung.
export function writeAudit(db, user, { action, target, payload }) {
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  db.prepare('INSERT INTO audit_log (at, who, user_id, action, target, payload_hash) VALUES (?, ?, ?, ?, ?, ?)').run(
    new Date().toISOString(),
    user.email || user.id,
    user.id,
    action,
    target,
    payloadHash,
  );
}
