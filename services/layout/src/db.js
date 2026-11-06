import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS items (
  id        TEXT PRIMARY KEY,
  x         REAL NOT NULL,
  z         REAL NOT NULL,
  rotation  INTEGER NOT NULL,
  moved_by  TEXT NOT NULL,
  moved_at  TEXT NOT NULL,
  version   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  who     TEXT NOT NULL,
  action  TEXT NOT NULL,
  target  TEXT NOT NULL,
  at      TEXT NOT NULL
);
`;

export function openDatabase(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'layout.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  return db;
}

// Mọi thao tác ghi chạy trong db.transaction() đồng bộ, nên hai yêu cầu không xen vào nhau giữa lúc kiểm tra và ghi.
export function createStore(db) {
  const selectItems = db.prepare('SELECT id, x, z, rotation, moved_by, moved_at FROM items');
  const upsertItem = db.prepare(`
    INSERT INTO items (id, x, z, rotation, moved_by, moved_at, version)
    VALUES (@id, @x, @z, @rotation, @movedBy, @movedAt, @version)
    ON CONFLICT(id) DO UPDATE SET
      x = excluded.x,
      z = excluded.z,
      rotation = excluded.rotation,
      moved_by = excluded.moved_by,
      moved_at = excluded.moved_at,
      version = excluded.version
  `);
  const deleteOne = db.prepare('DELETE FROM items WHERE id = ?');
  const deleteAll = db.prepare('DELETE FROM items');
  const insertAudit = db.prepare('INSERT INTO audit (who, action, target, at) VALUES (?, ?, ?, ?)');
  const readVersionStmt = db.prepare("SELECT value FROM meta WHERE key = 'version'");
  const writeVersionStmt = db.prepare(`
    INSERT INTO meta (key, value) VALUES ('version', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  function readVersion() {
    const row = readVersionStmt.get();
    return row ? Number(row.value) : 0;
  }

  function readItems() {
    const items = {};
    for (const row of selectItems.all()) {
      items[row.id] = {
        x: row.x,
        z: row.z,
        rotation: row.rotation,
        movedBy: row.moved_by,
        movedAt: row.moved_at,
      };
    }
    return items;
  }

  function snapshot() {
    return { items: readItems(), version: readVersion() };
  }

  // input: { id, x, z, rotation, movedBy, who, check }. check(items) trả { ok }.
  // Chỉ ghi và tăng version khi kiểm tra đạt. Lần di chuyển được ghi audit.
  const moveTx = db.transaction((input) => {
    const verdict = input.check(readItems());
    if (!verdict.ok) return { ok: false, reason: verdict.reason };

    const version = readVersion() + 1;
    const movedAt = new Date().toISOString();
    upsertItem.run({
      id: input.id,
      x: input.x,
      z: input.z,
      rotation: input.rotation,
      movedBy: input.movedBy,
      movedAt,
      version,
    });
    writeVersionStmt.run(String(version));
    insertAudit.run(input.who, 'move', input.id, movedAt);

    return {
      ok: true,
      version,
      item: {
        id: input.id,
        x: input.x,
        z: input.z,
        rotation: input.rotation,
        movedBy: input.movedBy,
        movedAt,
      },
    };
  });

  // input: { id?, who }. Không có id thì xoá toàn bộ bản ghi di chuyển. Mỗi lần gọi đều ghi audit.
  // Chỉ tăng version khi thật sự có bản ghi bị xoá.
  const resetTx = db.transaction((input) => {
    const at = new Date().toISOString();
    const isAll = input.id === undefined;
    const changes = isAll ? deleteAll.run().changes : deleteOne.run(input.id).changes;
    insertAudit.run(input.who, 'reset', isAll ? '*' : input.id, at);

    if (changes === 0) return { changed: false, version: readVersion() };
    const version = readVersion() + 1;
    writeVersionStmt.run(String(version));
    return { changed: true, version };
  });

  return {
    snapshot,
    move: (input) => moveTx(input),
    reset: (input) => resetTx(input),
    close: () => db.close(),
  };
}
