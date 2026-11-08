import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { DatabaseSync } from 'node:sqlite';
import { createStore } from '../src/db.js';
import { MAX_BATCH_OPS, applyBatch, insideOffice } from '../src/extras.js';
import { footprintOf } from '../src/geometry.js';
import { MOVABLE_IDS } from '../src/movable.js';
import { createSseHub } from '../src/sse.js';

// Mô hình nhỏ: các vật di chuyển được to 1x1x1 đặt xa nhau; một vật cố định và một lõi thang máy.
function makeModel() {
  const objects = new Map();
  const defaults = {};
  MOVABLE_IDS.forEach((id, i) => {
    objects.set(id, { id, kind: 'x', size: [1, 1, 1], position: [-26 + (i % 6) * 3, 0.5, -12 + Math.floor(i / 6) * 3] });
    defaults[id] = { x: -26 + (i % 6) * 3, z: -12 + Math.floor(i / 6) * 3, rotation: 0 };
  });
  const fixedObj = { id: 'wall_fixed', kind: 'wall', size: [2, 2, 2], position: [-20, 1, 10] };
  const lift = { id: 'core_lift1', kind: 'core', size: [2, 3, 2], position: [-19, 1.5, 0] };
  objects.set(fixedObj.id, fixedObj);
  objects.set(lift.id, lift);
  return {
    objects,
    defaults,
    fixed: [
      { id: fixedObj.id, rect: footprintOf({ x: -20, z: 10, rotation: 0, size: fixedObj.size }) },
      { id: lift.id, rect: footprintOf({ x: -19, z: 0, rotation: 0, size: lift.size }) },
    ],
    cores: [{ id: lift.id, x: -19, z: 0 }],
  };
}

const put = (id, kind, x, z, extra = {}) => ({ op: 'put', id, kind, x, z, rotation: 0, ...extra });
// Điểm giữa nhánh dọc bên trái của chữ L, xa vật cố định và lõi.
const FREE = { x: -24, z: 6 };

test('applyBatch: thêm, sửa, xóa vật thêm và di chuyển vật gốc trong một lô', () => {
  const model = makeModel();
  const first = applyBatch(model, {}, {}, [put('p_aaaa1', 'table', FREE.x, FREE.z), put('p_aaaa2', 'wall2', FREE.x, FREE.z + 3, { door: true })]);
  assert.equal(first.ok, true);
  assert.equal(first.props.p_aaaa2.door, true);
  const second = applyBatch(model, first.items, first.props, [
    { op: 'remove', id: 'p_aaaa1' },
    { op: 'move', id: 'plant_north', x: -26, z: 0, rotation: 90 },
  ]);
  assert.equal(second.ok, true);
  assert.deepEqual(Object.keys(second.props), ['p_aaaa2']);
  assert.equal(second.items.plant_north.rotation, 90);
  assert.deepEqual(Object.keys(first.items), [], 'không sửa đối số');
});

test('applyBatch: kiểm trạng thái cuối, thứ tự thao tác không gây xung đột giả', () => {
  const model = makeModel();
  const a = MOVABLE_IDS[0];
  const b = MOVABLE_IDS[1];
  const da = model.defaults[a];
  // b đi vào chỗ của a, a đi chỗ khác: lô theo thứ tự "b trước" vẫn hợp lệ.
  const r = applyBatch(model, {}, {}, [
    { op: 'move', id: b, x: da.x, z: da.z, rotation: 0 },
    { op: 'move', id: a, x: da.x, z: 2, rotation: 0 },
  ]);
  assert.equal(r.ok, true);
});

test('applyBatch: một phần lỗi thì cả lô bị từ chối (409) kèm id lỗi', () => {
  const model = makeModel();
  const r = applyBatch(model, {}, {}, [put('p_good1', 'chair', FREE.x, FREE.z), put('p_bad01', 'chair', -19, 0)]); // trong vùng cấm thang máy
  assert.equal(r.ok, false);
  assert.equal(r.status, 409);
  assert.equal(r.id, 'p_bad01');
});

test('applyBatch: ngoài chữ L, đè vật cố định, hai vật thêm chồng nhau đều bị từ chối; hai tường được nối', () => {
  const model = makeModel();
  assert.equal(insideOffice({ minX: -1, maxX: 1, minZ: -14, maxZ: -13 }), false); // trên khu ngoài L
  assert.equal(applyBatch(model, {}, {}, [put('p_out01', 'chair', 20, -10)]).status, 409);
  assert.equal(applyBatch(model, {}, {}, [put('p_fix01', 'chair', -20, 10)]).status, 409);
  const two = applyBatch(model, {}, {}, [put('p_ovl01', 'table', FREE.x, FREE.z), put('p_ovl02', 'chair', FREE.x + 0.3, FREE.z)]);
  assert.equal(two.status, 409);
  const walls = applyBatch(model, {}, {}, [put('p_wl001', 'wall4', FREE.x, FREE.z), put('p_wl002', 'wall4', FREE.x, FREE.z + 0.1, { rotation: 90 })]);
  assert.equal(walls.ok, true);
});

test('applyBatch: dữ liệu sai bị 400/403/404', () => {
  const model = makeModel();
  assert.equal(applyBatch(model, {}, {}, []).status, 400);
  assert.equal(applyBatch(model, {}, {}, new Array(MAX_BATCH_OPS + 1).fill({ op: 'reset', id: 'pantry' })).status, 400);
  assert.equal(applyBatch(model, {}, {}, [put('xx', 'chair', 0, 0)]).status, 400);
  assert.equal(applyBatch(model, {}, {}, [put('p_kind1', 'sofa', 0, 0)]).status, 400);
  assert.equal(applyBatch(model, {}, {}, [{ op: 'move', id: 'desk_A1', x: 0, z: 0, rotation: 0 }]).status, 403);
  assert.equal(applyBatch(model, {}, {}, [{ op: 'move', id: 'wall_fixed', x: 0, z: 0, rotation: 0 }]).status, 404);
  assert.equal(applyBatch(model, {}, {}, [{ op: 'remove', id: 'p_nope01' }]).status, 404);
  assert.equal(applyBatch(model, {}, {}, [{ op: 'move', id: 'pantry', x: NaN, z: 0, rotation: 0 }]).status, 400);
  assert.equal(applyBatch(model, {}, {}, [{ op: 'move', id: 'pantry', x: 0, z: 0, rotation: 45 }]).status, 400);
  assert.equal(applyBatch(model, {}, {}, [{ op: 'dance', id: 'pantry' }]).status, 400);
});

test('applyBatch: vật gốc không được dọn vào sát vật thêm', () => {
  const model = makeModel();
  const base = applyBatch(model, {}, {}, [put('p_near01', 'cabinet', FREE.x, FREE.z)]);
  const r = applyBatch(model, base.items, base.props, [{ op: 'move', id: 'pantry', x: FREE.x + 1, z: FREE.z, rotation: 0 }]);
  assert.equal(r.status, 409);
});

// Bộ chuyển node:sqlite (có sẵn trong Node >= 22.5) sang giao diện better-sqlite3 mà db.js dùng,
// để test chạy được cả khi addon native của better-sqlite3 không khớp phiên bản Node của máy test.
const SCHEMA = fs.readFileSync(new URL('../src/db.js', import.meta.url), 'utf8').match(/const SCHEMA = `([\s\S]*?)`;/)[1];
function openTestDb(dir) {
  const d = new DatabaseSync(path.join(dir, 'layout.db'));
  d.exec(SCHEMA);
  return {
    exec: (sql) => d.exec(sql),
    prepare: (sql) => {
      const st = d.prepare(sql);
      return { run: (...a) => st.run(...a), get: (...a) => st.get(...a), all: (...a) => st.all(...a) };
    },
    transaction: (fn) => (...a) => {
      d.exec('BEGIN');
      try {
        const r = fn(...a);
        d.exec('COMMIT');
        return r;
      } catch (e) {
        d.exec('ROLLBACK');
        throw e;
      }
    },
    close: () => d.close(),
  };
}

// Router thật + SQLite thật trong thư mục tạm; auth giả theo header x-test-role.
async function withServer(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'layout-batch-'));
  const store = createStore(openTestDb(dir));
  const hub = createSseHub();
  const events = [];
  const origBroadcast = hub.broadcast.bind(hub);
  hub.broadcast = (name, data) => {
    events.push({ name, data });
    origBroadcast(name, data);
  };
  const fetchImpl = async (_url, init) => {
    const role = init?.headers?.Cookie?.replace('role=', '') || 'it';
    return { ok: true, status: 200, json: async () => ({ ok: true, user: { id: `u-${role}`, email: `${role}@t.invalid`, name: role, role } }) };
  };
  const app = createApp({ config: { authUrl: 'http://auth.invalid' }, store, model: makeModel(), hub, fetchImpl });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, body, role = 'it') => {
    const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', cookie: `role=${role}` }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  try {
    await fn({ call, events, store });
  } finally {
    hub.closeAll();
    await new Promise((r) => server.close(r));
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('HTTP /api/layout/batch: nguyên tử, tăng version một lần, phát sự kiện, state có props', async () => {
  await withServer(async ({ call, events }) => {
    const ok = await call('POST', '/api/layout/batch', { ops: [put('p_http01', 'table', FREE.x, FREE.z), { op: 'move', id: 'pantry', x: -26, z: 1, rotation: 90 }] });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.version, 1);
    assert.equal(events.at(-1).name, 'reset');
    const st = await call('GET', '/api/layout/state');
    assert.equal(st.body.version, 1);
    assert.equal(st.body.props.p_http01.kind, 'table');
    assert.equal(st.body.items.pantry.rotation, 90);

    // Lô có một phần lỗi: 409, không ghi gì, version giữ nguyên, vật hợp lệ trong lô cũng không được ghi.
    const bad = await call('POST', '/api/layout/batch', { ops: [put('p_http02', 'chair', FREE.x, FREE.z + 4), put('p_http03', 'chair', -19, 0)] });
    assert.equal(bad.status, 409);
    assert.equal(bad.body.id, 'p_http03');
    const st2 = await call('GET', '/api/layout/state');
    assert.equal(st2.body.version, 1);
    assert.deepEqual(Object.keys(st2.body.props), ['p_http01']);

    // Xóa vật thêm và đặt lại vật gốc trong cùng lô.
    const del = await call('POST', '/api/layout/batch', { ops: [{ op: 'remove', id: 'p_http01' }, { op: 'reset', id: 'pantry' }] });
    assert.equal(del.status, 200);
    const st3 = await call('GET', '/api/layout/state');
    assert.deepEqual(st3.body.props, {});
    assert.deepEqual(st3.body.items, {});
    assert.equal(st3.body.version, 2);
  });
});

test('HTTP /api/layout/batch: chỉ it/admin; endpoint cũ /move vẫn chạy và tôn trọng vật thêm', async () => {
  await withServer(async ({ call }) => {
    const denied = await call('POST', '/api/layout/batch', { ops: [put('p_role01', 'chair', FREE.x, FREE.z)] }, 'employee');
    assert.equal(denied.status, 403);
    assert.equal((await call('POST', '/api/layout/batch', {}, 'it')).status, 400);
    assert.equal((await call('POST', '/api/layout/batch', { ops: 'x' }, 'it')).status, 400);

    const mv = await call('POST', '/api/layout/move', { id: 'pantry', x: -26, z: 1, rotation: 0 }, 'employee');
    assert.equal(mv.status, 200);
    assert.equal(mv.body.version, 1);

    await call('POST', '/api/layout/batch', { ops: [put('p_role02', 'cabinet', FREE.x, FREE.z)] }, 'admin');
    const blocked = await call('POST', '/api/layout/move', { id: 'pantry', x: FREE.x + 1, z: FREE.z, rotation: 0 }, 'employee');
    assert.equal(blocked.status, 409);
  });
});

test('HTTP /api/layout/batch: lô lớn (100 thao tác, hơn 4kb) được nhận', async () => {
  await withServer(async ({ call }) => {
    const ops = [];
    for (let i = 0; i < MAX_BATCH_OPS; i++) ops.push({ op: 'reset', id: 'pantry', padding: 'x'.repeat(60) });
    const r = await call('POST', '/api/layout/batch', { ops });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  });
});
