// Test thuần cho src/persist/core.ts. Chạy: node --test src/persist/__tests__/core.test.mjs
// Cần Node 22.18+ hoặc 24 (tự bỏ kiểu TypeScript). Không cần npm, tsc, vite.
// validate look thật (src/fashion/rules.ts) import không đuôi .ts nên không nạp được trong node; ở đây dùng
// validator giả lập hợp đồng LookValidator. Kiểm tra look thật cần chạy trong trình duyệt/vite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SNAPSHOT_FORMAT,
  SNAPSHOT_SCHEMA_VERSION,
  assetIdFromSha,
  casDecide,
  createAutosaveScheduler,
  createMemoryStore,
  detectSchemaVersion,
  findMissingAssets,
  migrateSnapshot,
  parseStoredSnapshot,
  resolveRestorePosition,
  stripTransientObjects,
  utf8Bytes,
  validateSnapshot,
} from '../core.ts';

const lookValidator = (input) => ({
  look: { version: 1, ...(input && typeof input === 'object' ? input : {}) },
  warnings: input && typeof input === 'object' ? [] : [{ path: '', message: 'look rỗng' }],
});

const sha = 'ab'.repeat(32);
const base = () => ({
  format: SNAPSHOT_FORMAT,
  schemaVersion: SNAPSHOT_SCHEMA_VERSION,
  sceneId: 'office-l-it7',
  revision: 3,
  savedAt: 1700000000000,
  writerId: 'tab-1',
  assets: [{ id: assetIdFromSha(sha), kind: 'tattoo-image', mime: 'image/png', bytes: 100, sha256: sha }],
  character: { look: { body: { height: 175 }, tattoos: [{ uid: 't1' }] }, position: { x: -4, z: 3, yaw: 1 } },
  layout: { overrides: { desk_A1: { x: 1, z: 2, rotation: 90 } } },
  objects: { door_1: { open: true, heldBy: 'u1', _anim: 3 }, curtain_2: { open: true } },
  settings: { interact: { highlight: false, keyHints: true } },
});

test('validate: bản hợp lệ giữ đủ trường quan trọng', () => {
  const r = validateSnapshot(base(), lookValidator);
  assert.equal(r.ok, true);
  assert.equal(r.snapshot.revision, 3);
  assert.equal(r.snapshot.character.look.body.height, 175);
  assert.deepEqual(r.snapshot.layout.overrides.desk_A1, { x: 1, z: 2, rotation: 90 });
  assert.deepEqual(r.snapshot.objects.door_1, { open: true });
  assert.deepEqual(r.snapshot.objects.curtain_2, { open: true });
  assert.equal(r.snapshot.settings.interact.highlight, false);
  assert.equal(r.snapshot.assets.length, 1);
});

test('validate: bỏ khóa tạm thời (heldBy, _anim) và ghi cảnh báo', () => {
  const r = validateSnapshot(base(), lookValidator);
  assert.ok(r.warnings.some((w) => w.code === 'object_transient' && w.path === 'objects.door_1.heldBy'));
  assert.ok(r.warnings.some((w) => w.code === 'object_transient' && w.path === 'objects.door_1._anim'));
});

test('validate: từ chối cấu trúc gốc sai', () => {
  assert.equal(validateSnapshot(null, lookValidator).ok, false);
  assert.equal(validateSnapshot('x', lookValidator).ok, false);
  assert.equal(validateSnapshot({ ...base(), format: 'khac' }, lookValidator).ok, false);
  assert.equal(validateSnapshot({ ...base(), revision: -1 }, lookValidator).ok, false);
  assert.equal(validateSnapshot({ ...base(), revision: 1.5 }, lookValidator).ok, false);
  assert.equal(validateSnapshot({ ...base(), sceneId: '../x' }, lookValidator).ok, false);
  assert.equal(validateSnapshot({ ...base(), character: {} }, lookValidator).ok, false);
});

test('validate: phần con sai bị bỏ, phần còn lại giữ nguyên', () => {
  const s = base();
  s.layout.overrides.bad = { x: 'a', z: 0, rotation: 45 };
  s.assets.push({ id: 'blob:http://x', kind: 'tattoo-image', mime: 'image/png', bytes: 1, sha256: sha });
  s.assets.push({ ...s.assets[0] });
  s.character.position = { x: NaN, z: 0 };
  s.settings.interact.obj = { a: 1 };
  const r = validateSnapshot(s, lookValidator);
  assert.equal(r.ok, true);
  assert.equal(r.snapshot.layout.overrides.bad, undefined);
  assert.ok(r.snapshot.layout.overrides.desk_A1);
  assert.equal(r.snapshot.assets.length, 1);
  assert.equal(r.snapshot.character.position, null);
  assert.equal(r.snapshot.settings.interact.obj, undefined);
  const codes = r.warnings.map((w) => w.code);
  for (const c of ['layout_invalid', 'asset_invalid', 'asset_duplicate', 'position_invalid', 'setting_invalid']) assert.ok(codes.includes(c), c);
});

test('validate: JSON sai ở lớp đọc trả lỗi rõ, không ném', () => {
  const r = parseStoredSnapshot('{hỏng', { sceneId: 'office-l-it7', now: 1 }, lookValidator);
  assert.equal(r.ok, false);
});

test('migrate: schema 0 (tệp look đơn lẻ) lên schema hiện tại', () => {
  const legacy = { format: 'gpb-character-look', version: 1, look: { body: { height: 160 } } };
  assert.equal(detectSchemaVersion(legacy), 0);
  const m = migrateSnapshot(legacy, { sceneId: 'office-l-it7', now: 42 });
  assert.equal(m.ok, true);
  assert.equal(m.fromVersion, 0);
  assert.equal(m.migrated, true);
  assert.equal(m.value.schemaVersion, SNAPSHOT_SCHEMA_VERSION);
  const p = parseStoredSnapshot(legacy, { sceneId: 'office-l-it7', now: 42 }, lookValidator);
  assert.equal(p.ok, true);
  assert.equal(p.snapshot.character.look.body.height, 160);
  assert.equal(p.snapshot.savedAt, 42);
  // Không sửa đầu vào (bản gốc dùng làm backup pre-migration).
  assert.deepEqual(legacy, { format: 'gpb-character-look', version: 1, look: { body: { height: 160 } } });
});

test('migrate: CharacterLook trần cũng là schema 0', () => {
  const p = parseStoredSnapshot({ body: { height: 170 }, outfit: {} }, { sceneId: 'office-l-it7', now: 1 }, lookValidator);
  assert.equal(p.ok, true);
  assert.equal(p.fromVersion, 0);
});

test('migrate: từ chối bản quá mới với thông báo rõ', () => {
  const m = migrateSnapshot({ ...base(), schemaVersion: SNAPSHOT_SCHEMA_VERSION + 1 }, { sceneId: 'office-l-it7', now: 1 });
  assert.equal(m.ok, false);
  assert.equal(m.code, 'too_new');
  assert.match(m.error, /mới hơn/);
});

test('migrate: định dạng lạ bị từ chối', () => {
  assert.equal(migrateSnapshot({ foo: 1 }, { sceneId: 'a', now: 1 }).code, 'unknown_format');
  assert.equal(migrateSnapshot([], { sceneId: 'a', now: 1 }).ok, false);
});

test('migrate: bản hiện tại không đổi', () => {
  const m = migrateSnapshot(base(), { sceneId: 'office-l-it7', now: 1 });
  assert.equal(m.ok, true);
  assert.equal(m.migrated, false);
});

test('CAS: quy tắc quyết định', () => {
  assert.deepEqual(casDecide(null, null), { ok: true, nextRevision: 1 });
  assert.deepEqual(casDecide(3, 3), { ok: true, nextRevision: 4 });
  assert.deepEqual(casDecide(4, 3), { ok: false, storedRevision: 4 });
  assert.deepEqual(casDecide(3, null), { ok: false, storedRevision: 3 });
  assert.deepEqual(casDecide(null, 2), { ok: false, storedRevision: 0 });
});

test('CAS: hai tab ghi đồng thời, tab chậm bị từ chối, bản mới không bị ghi đè', async () => {
  const store = createMemoryStore();
  const snap = validateSnapshot(base(), lookValidator).snapshot;
  const first = await store.write({ ...snap, writerId: 'tab-a' }, null, []);
  assert.deepEqual(first, { ok: true, revision: 1 });
  // Cả hai tab đều đã thấy revision 1.
  const a = await store.write({ ...snap, writerId: 'tab-a' }, 1, []);
  const b = await store.write({ ...snap, writerId: 'tab-b' }, 1, []);
  assert.equal(a.ok, true);
  assert.equal(a.revision, 2);
  assert.equal(b.ok, false);
  assert.equal(b.code, 'conflict');
  assert.equal(b.storedRevision, 2);
  const cur = await store.read(snap.sceneId);
  assert.equal(cur.raw.writerId, 'tab-a');
  assert.equal(cur.raw.revision, 2);
  const prev = await store.readBackup(snap.sceneId, 'previous');
  assert.equal(prev.raw.revision, 1);
});

test('CAS: lỗi quota không làm đổi bản đang lưu', async () => {
  let fail = false;
  const store = createMemoryStore({ failWith: () => (fail ? { ok: false, code: 'quota', error: 'đầy' } : null) });
  const snap = validateSnapshot(base(), lookValidator).snapshot;
  await store.write(snap, null, []);
  fail = true;
  const r = await store.write({ ...snap, writerId: 'tab-x' }, 1, []);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'quota');
  const cur = await store.read(snap.sceneId);
  assert.equal(cur.raw.revision, 1);
  assert.equal(cur.raw.writerId, 'tab-1');
});

function fakeTimers() {
  let t = 0;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => t,
    setTimer: (fn, ms) => {
      const id = ++seq;
      timers.set(id, { fn, at: t + ms });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    advance(ms) {
      t += ms;
      for (const [id, x] of [...timers.entries()].sort((p, q) => p[1].at - q[1].at)) {
        if (x.at <= t) {
          timers.delete(id);
          x.fn();
        }
      }
    },
    count: () => timers.size,
  };
}

const tick = () => new Promise((r) => setImmediate(r));

test('debounce: nhiều thay đổi liên tiếp gộp thành một lượt lưu', async () => {
  const tm = fakeTimers();
  let runs = 0;
  const s = createAutosaveScheduler(async () => void runs++, tm, { delayMs: 1000, maxWaitMs: 5000 });
  s.touch();
  tm.advance(500);
  s.touch();
  tm.advance(500);
  s.touch();
  tm.advance(999);
  assert.equal(runs, 0);
  tm.advance(1);
  await tick();
  assert.equal(runs, 1);
});

test('debounce: maxWait buộc lưu dù thay đổi liên tục', async () => {
  const tm = fakeTimers();
  let runs = 0;
  const s = createAutosaveScheduler(async () => void runs++, tm, { delayMs: 1000, maxWaitMs: 3000 });
  for (let i = 0; i < 10; i++) {
    s.touch();
    tm.advance(400);
  }
  await tick();
  assert.ok(runs >= 1, `runs=${runs}`);
});

test('hàng đợi: không chạy song song, thay đổi trong lúc lưu gộp thành đúng một lượt sau', async () => {
  const tm = fakeTimers();
  let active = 0;
  let maxActive = 0;
  let runs = 0;
  const gates = [];
  const s = createAutosaveScheduler(
    () =>
      new Promise((resolve) => {
        active++;
        runs++;
        maxActive = Math.max(maxActive, active);
        gates.push(() => {
          active--;
          resolve();
        });
      }),
    tm,
    { delayMs: 10, maxWaitMs: 100 },
  );
  const p1 = s.flush();
  const p2 = s.flush();
  const p3 = s.flush();
  assert.equal(runs, 1);
  assert.equal(s.pending, true);
  gates.shift()();
  await p1;
  await tick();
  assert.equal(runs, 2);
  gates.shift()();
  await Promise.all([p2, p3]);
  assert.equal(runs, 2);
  assert.equal(maxActive, 1);
});

test('hàng đợi: lỗi của một lượt không làm kẹt lượt sau', async () => {
  const tm = fakeTimers();
  let runs = 0;
  const s = createAutosaveScheduler(
    async () => {
      runs++;
      if (runs === 1) throw new Error('ghi lỗi');
    },
    tm,
    { delayMs: 10, maxWaitMs: 100 },
  );
  await s.flush();
  await s.flush();
  assert.equal(runs, 2);
  assert.equal(s.running, false);
});

test('vị trí: trong L và trống thì giữ; ngoài L hoặc trúng collider thì về spawn', () => {
  const env = {
    isInside: (x, z) => x >= -10 && x <= 10 && z >= -10 && z <= 10,
    colliders: [{ minX: 0, maxX: 2, minZ: 0, maxZ: 2 }],
    radius: 0.35,
    spawn: { x: -4, z: 3, yaw: Math.PI },
  };
  assert.deepEqual(resolveRestorePosition({ x: 5, z: 5, yaw: 1 }, env), { position: { x: 5, z: 5, yaw: 1 }, moved: false, reason: null });
  assert.equal(resolveRestorePosition({ x: 50, z: 0, yaw: 0 }, env).moved, true);
  assert.equal(resolveRestorePosition({ x: 2.2, z: 1, yaw: 0 }, env).moved, true);
  assert.deepEqual(resolveRestorePosition(null, env).position, env.spawn);
});

test('asset thiếu: liệt kê, không sửa snapshot', () => {
  const snap = validateSnapshot(base(), lookValidator).snapshot;
  const before = JSON.stringify(snap);
  assert.deepEqual(findMissingAssets(snap, new Set()), [snap.assets[0].id]);
  assert.deepEqual(findMissingAssets(snap, new Set([snap.assets[0].id])), []);
  assert.equal(JSON.stringify(snap), before);
});

test('tiện ích: stripTransient và utf8Bytes', () => {
  assert.deepEqual(stripTransientObjects({ a: { occupiedBy: 'x' } }), {});
  assert.deepEqual(stripTransientObjects({ a: { open: { nested: 1 } } }), {});
  assert.equal(utf8Bytes('abc'), 3);
  assert.equal(utf8Bytes('ệ'), 3);
  assert.equal(utf8Bytes('😀'), 4);
});
