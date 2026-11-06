import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { PLANT_CATALOG, SEED_AGE_DAYS, SEED_STATE } from './catalog.js';
import { initialState } from './sim.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS plants (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  species           TEXT NOT NULL,
  planted_at        TEXT NOT NULL,
  tick_at           TEXT NOT NULL,
  water             REAL NOT NULL,
  health            REAL NOT NULL,
  pests             INTEGER NOT NULL DEFAULT 0,
  flowers           INTEGER NOT NULL DEFAULT 0,
  leaves            INTEGER NOT NULL,
  last_water_at     TEXT,
  last_fertilize_at TEXT,
  seed              INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS care_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  plant_id   TEXT NOT NULL REFERENCES plants (id),
  user_name  TEXT NOT NULL,
  action     TEXT NOT NULL,
  at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_care_log_plant ON care_log (plant_id, id);

CREATE TABLE IF NOT EXISTS audit_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      TEXT NOT NULL,
  who     TEXT NOT NULL,
  action  TEXT NOT NULL,
  target  TEXT NOT NULL
);
`;

const toIso = (ms) => new Date(ms).toISOString();
const toIsoOrNull = (ms) => (ms === null || ms === undefined ? null : toIso(ms));
const toMsOrNull = (iso) => (iso ? Date.parse(iso) : null);

// Chuyển hàng trong bảng sang state (thời gian là epoch ms).
function rowToState(row) {
  return {
    id: row.id,
    name: row.name,
    species: row.species,
    plantedAt: Date.parse(row.planted_at),
    tickAt: Date.parse(row.tick_at),
    water: row.water,
    health: row.health,
    pests: row.pests,
    flowers: row.flowers,
    leaves: row.leaves,
    lastWaterAt: toMsOrNull(row.last_water_at),
    lastFertilizeAt: toMsOrNull(row.last_fertilize_at),
    seed: row.seed,
  };
}

function seedPlants(db, nowMs) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM plants').get().n;
  if (count > 0) return;
  const insert = db.prepare(
    `INSERT INTO plants (id, name, species, planted_at, tick_at, water, health, pests, flowers,
                         leaves, last_water_at, last_fertilize_at, seed)
     VALUES (@id, @name, @species, @planted_at, @tick_at, @water, @health, @pests, @flowers,
             @leaves, NULL, NULL, @seed)`,
  );
  db.transaction(() => {
    for (const plant of PLANT_CATALOG) {
      const state = initialState(plant, nowMs, { ageDays: SEED_AGE_DAYS, ...SEED_STATE });
      insert.run({
        id: state.id,
        name: state.name,
        species: state.species,
        planted_at: toIso(state.plantedAt),
        tick_at: toIso(state.tickAt),
        water: state.water,
        health: state.health,
        pests: state.pests,
        flowers: state.flowers,
        leaves: state.leaves,
        seed: state.seed,
      });
    }
  })();
}

export function openDatabase(dataDir, { nowMs = Date.now() } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'plants.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  seedPlants(db, nowMs);
  return db;
}

// Truy cập dữ liệu. Các hàm đồng bộ, nên gọi bên trong db.transaction() khi cần đọc-tính-ghi nguyên tử.
export function createPlantRepo(db) {
  const selectOne = db.prepare('SELECT * FROM plants WHERE id = ?');
  const updateState = db.prepare(
    `UPDATE plants
        SET tick_at = ?, water = ?, health = ?, pests = ?, flowers = ?, leaves = ?,
            last_water_at = ?, last_fertilize_at = ?
      WHERE id = ?`,
  );
  const insertCareLog = db.prepare('INSERT INTO care_log (plant_id, user_name, action, at) VALUES (?, ?, ?, ?)');
  const insertAudit = db.prepare('INSERT INTO audit_log (at, who, action, target) VALUES (?, ?, ?, ?)');
  const selectRecentLog = db.prepare(
    'SELECT user_name, action, at FROM care_log WHERE plant_id = ? ORDER BY id DESC LIMIT ?',
  );

  return {
    get(id) {
      const row = selectOne.get(id);
      return row ? rowToState(row) : null;
    },

    save(state) {
      updateState.run(
        toIso(state.tickAt),
        state.water,
        state.health,
        state.pests,
        state.flowers,
        state.leaves,
        toIsoOrNull(state.lastWaterAt),
        toIsoOrNull(state.lastFertilizeAt),
        state.id,
      );
    },

    addCareLog({ plantId, userName, action, at }) {
      insertCareLog.run(plantId, userName, action, toIso(at));
    },

    addAudit({ at, who, action, target }) {
      insertAudit.run(toIso(at), who, action, target);
    },

    recentLog(plantId, limit) {
      return selectRecentLog.all(plantId, limit).map((row) => ({
        userName: row.user_name,
        action: row.action,
        at: row.at,
      }));
    },
  };
}
