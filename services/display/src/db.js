import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { BOARD_IDS, MAX_STROKES_PER_BOARD, TV_IDS } from './config.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tvs (
  id          TEXT PRIMARY KEY,
  on_air      INTEGER NOT NULL DEFAULT 0,
  channel     INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS boards (
  id       TEXT PRIMARY KEY,
  version  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS strokes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id    TEXT NOT NULL,
  user_name   TEXT NOT NULL,
  color       TEXT NOT NULL,
  width       INTEGER NOT NULL,
  points      TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_strokes_board ON strokes (board_id, id);

-- Chỉ ghi ai làm gì, lúc nào. Không ghi toạ độ nét vào audit.
CREATE TABLE IF NOT EXISTS audit_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      TEXT NOT NULL,
  who     TEXT NOT NULL,
  action  TEXT NOT NULL,
  target  TEXT NOT NULL
);
`;

// Tạo dòng mặc định cho tivi và bảng nếu chưa có. Không ghi đè dữ liệu đã có.
function seed(db) {
  const now = new Date().toISOString();
  db.transaction(() => {
    const insertTv = db.prepare(
      'INSERT OR IGNORE INTO tvs (id, on_air, channel, updated_at, updated_by) VALUES (?, 0, 1, ?, ?)',
    );
    for (const id of TV_IDS) insertTv.run(id, now, '');
    const insertBoard = db.prepare('INSERT OR IGNORE INTO boards (id, version) VALUES (?, 0)');
    for (const id of BOARD_IDS) insertBoard.run(id);
  })();
}

export function openDatabase(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'display.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  seed(db);
  return db;
}

// Ghi audit trong cùng transaction với thao tác nghiệp vụ.
export function writeAudit(db, user, action, target) {
  db.prepare('INSERT INTO audit_log (at, who, action, target) VALUES (?, ?, ?, ?)').run(
    new Date().toISOString(),
    user.email || user.id,
    action,
    target,
  );
}

function tvStateFromRow(row) {
  return {
    on: row.on_air === 1,
    channel: row.channel,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

// Dạng dùng trong sự kiện 'tv' và phản hồi POST /tv/:tvId.
export function readTv(db, tvId) {
  const row = db
    .prepare('SELECT id, on_air, channel, updated_at, updated_by FROM tvs WHERE id = ?')
    .get(tvId);
  if (!row) return null;
  return { tvId: row.id, ...tvStateFromRow(row) };
}

// Dạng dùng trong trạng thái đầy đủ: { tv_lobby: {on, channel, updatedAt, updatedBy}, ... }.
export function readTvStates(db) {
  const out = {};
  for (const id of TV_IDS) {
    const row = db
      .prepare('SELECT id, on_air, channel, updated_at, updated_by FROM tvs WHERE id = ?')
      .get(id);
    if (row) out[id] = tvStateFromRow(row);
  }
  return out;
}

export function readBoardVersion(db, boardId) {
  const row = db.prepare('SELECT version FROM boards WHERE id = ?').get(boardId);
  return row ? row.version : 0;
}

export function countStrokes(db, boardId) {
  return db.prepare('SELECT COUNT(*) AS n FROM strokes WHERE board_id = ?').get(boardId).n;
}

// Đọc nét theo thứ tự vẽ, tối đa MAX_STROKES_PER_BOARD nét.
export function readStrokes(db, boardId) {
  return db
    .prepare(
      'SELECT id, color, width, points, user_name, created_at FROM strokes WHERE board_id = ? ORDER BY id ASC LIMIT ?',
    )
    .all(boardId, MAX_STROKES_PER_BOARD)
    .map((row) => ({
      id: row.id,
      color: row.color,
      width: row.width,
      points: JSON.parse(row.points),
      userName: row.user_name,
      createdAt: row.created_at,
    }));
}
