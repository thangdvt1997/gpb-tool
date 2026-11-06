import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  starts_at       TEXT NOT NULL,
  ends_at         TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  created_by_id   TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_events_status_ends ON events (status, ends_at);

CREATE TABLE IF NOT EXISTS programs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id          TEXT NOT NULL REFERENCES events (id),
  performer_name    TEXT NOT NULL,
  performer_user_id TEXT NOT NULL,
  title             TEXT NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN ('singing', 'dance', 'poem', 'game', 'other')),
  duration_min      INTEGER NOT NULL CHECK (duration_min BETWEEN 1 AND 30),
  created_at        TEXT NOT NULL,
  UNIQUE (event_id, performer_user_id),
  UNIQUE (event_id, id)
);

CREATE TABLE IF NOT EXISTS votes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id      TEXT NOT NULL REFERENCES events (id),
  program_id    INTEGER NOT NULL,
  voter_user_id TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  UNIQUE (event_id, voter_user_id),
  FOREIGN KEY (event_id, program_id) REFERENCES programs (event_id, id)
);
CREATE INDEX IF NOT EXISTS idx_votes_program ON votes (program_id);

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

// Hình dạng sự kiện theo hợp đồng API. Thời gian lưu dạng ISO UTC nên so sánh chuỗi là đúng thứ tự.
export const EVENT_SELECT = `
  SELECT e.id, e.title, e.description, e.starts_at AS startsAt, e.ends_at AS endsAt, e.status,
         (SELECT COUNT(*) FROM programs p WHERE p.event_id = e.id) AS programCount
  FROM events e`;

export function openDatabase(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'events.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

export function findEvent(db, id) {
  return db.prepare(`${EVENT_SELECT} WHERE e.id = ?`).get(id);
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
