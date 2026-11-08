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

CREATE TABLE IF NOT EXISTS props (
  id        TEXT PRIMARY KEY,
  kind      TEXT NOT NULL,
  x         REAL NOT NULL,
  z         REAL NOT NULL,
  rotation  INTEGER NOT NULL,
  door      INTEGER NOT NULL DEFAULT 0,
  moved_by  TEXT NOT NULL,
  moved_at  TEXT NOT NULL
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

  const selectProps = db.prepare('SELECT id, kind, x, z, rotation, door, moved_by, moved_at FROM props');
  const upsertProp = db.prepare(`
    INSERT INTO props (id, kind, x, z, rotation, door, moved_by, moved_at)
    VALUES (@id, @kind, @x, @z, @rotation, @door, @movedBy, @movedAt)
    ON CONFLICT(id) DO UPDATE SET
      kind = excluded.kind, x = excluded.x, z = excluded.z, rotation = excluded.rotation,
      door = excluded.door, moved_by = excluded.moved_by, moved_at = excluded.moved_at
  `);
  const deleteProp = db.prepare('DELETE FROM props WHERE id = ?');

  function readProps() {
    const props = {};
    for (const row of selectProps.all()) {
      props[row.id] = {
        kind: row.kind,
        x: row.x,
        z: row.z,
        rotation: row.rotation,
        door: row.door === 1,
        movedBy: row.moved_by,
        movedAt: row.moved_at,
      };
    }
    return props;
  }

  function snapshot() {
    return { items: readItems(), props: readProps(), version: readVersion() };
  }

  const samePose = (a, b) => a && b && a.x === b.x && a.z === b.z && a.rotation === b.rotation;
  const sameProp = (a, b) => samePose(a, b) && a.kind === b.kind && !!a.door === !!b.door;

  // input: { who, movedBy, apply(items, props) }. apply trả { ok, items, props, ... } (trạng thái cuối) hoặc { ok: false, ... }.
  // Một giao dịch SQLite: ghi mọi thay đổi vật gốc và vật thêm, tăng version đúng một lần; không ok thì không ghi gì.
  const batchTx = db.transaction((input) => {
    const items0 = readItems();
    const props0 = readProps();
    const verdict = input.apply(items0, props0);
    if (!verdict.ok) return verdict;

    const at = new Date().toISOString();
    let changed = 0;
    for (const id of Object.keys(items0)) {
      if (!Object.hasOwn(verdict.items, id)) {
        deleteOne.run(id);
        changed++;
      }
    }
    const version = readVersion() + 1;
    for (const [id, p] of Object.entries(verdict.items)) {
      if (samePose(items0[id], p)) continue;
      upsertItem.run({ id, x: p.x, z: p.z, rotation: p.rotation, movedBy: input.movedBy, movedAt: at, version });
      changed++;
    }
    for (const id of Object.keys(props0)) {
      if (!Object.hasOwn(verdict.props, id)) {
        deleteProp.run(id);
        changed++;
      }
    }
    for (const [id, p] of Object.entries(verdict.props)) {
      if (sameProp(props0[id], p)) continue;
      upsertProp.run({ id, kind: p.kind, x: p.x, z: p.z, rotation: p.rotation, door: p.door ? 1 : 0, movedBy: input.movedBy, movedAt: at });
      changed++;
    }
    if (changed === 0) return { ok: true, changed: false, version: version - 1 };
    writeVersionStmt.run(String(version));
    insertAudit.run(input.who, 'batch', `${changed} thay đổi`, at);
    return { ok: true, changed: true, version };
  });

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
    batch: (input) => batchTx(input),
    close: () => db.close(),
  };
}
