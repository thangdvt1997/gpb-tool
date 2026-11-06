// Test tuyến trên dữ liệu thật: it.json + officeBounds.ts + vật cản như ITOffice.tsx.
// Chạy: node --test "src/minimap/core/test/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNavGrid, buildSearchIndex, distPointRect, findRoute, searchIndex, circleCovered } from '../index.js';
import { real } from './realData.mjs';

const grid = buildNavGrid({ walkRects: real.walkRects, obstacles: real.obstacles, radius: real.radius, cellSize: 0.2 });
const R = real.radius;
const SPAWN = real.layout.SPAWN;

function destOf(id) {
  const o = real.byId(id);
  assert.ok(o, `thiếu ${id} trong it.json`);
  return { x: o.position[0], z: o.position[2], rect: real.layout.footprint(o) };
}

function assertClear(points, label) {
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1];
    const b = points[k];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.02));
    for (let s = 0; s <= n; s++) {
      const x = a.x + ((b.x - a.x) * s) / n;
      const z = a.z + ((b.z - a.z) * s) / n;
      assert.ok(real.bounds.isInsideOffice(x, z), `${label}: (${x.toFixed(2)}, ${z.toFixed(2)}) ngoài chữ L`);
      assert.ok(circleCovered(x, z, R - 1e-3, real.walkRects), `${label}: (${x.toFixed(2)}, ${z.toFixed(2)}) sát mép L quá bán kính`);
      for (const o of real.obstacles) {
        const d = distPointRect(x, z, o);
        assert.ok(d >= R - 1e-3, `${label}: (${x.toFixed(2)}, ${z.toFixed(2)}) cách vật cản ${d.toFixed(3)}`);
      }
    }
  }
}

test('SPAWN đứng được trên lưới thật', () => {
  const res = findRoute(grid, SPAWN, { x: SPAWN.x, z: SPAWN.z });
  assert.equal(res.status, 'ok');
  assert.equal(res.startSnapped, false);
});

test('đích ở nhánh dọc chữ L (desk_L1, mr1) và nhánh ngang (desk_B7, soc_room) từ SPAWN', () => {
  for (const id of ['desk_L1', 'mr1', 'desk_B7', 'soc_room']) {
    const dest = destOf(id);
    const res = findRoute(grid, SPAWN, dest);
    assert.equal(res.status, 'ok', `${id}: ${res.status}`);
    // Bàn và phòng kính là vật đặc: dừng sát mép footprint.
    assert.equal(res.goalSnapped, true, id);
    const d = distPointRect(res.goal.x, res.goal.z, dest.rect);
    assert.ok(d >= R - 1e-9 && d <= 1.5, `${id}: cách đích ${d}`);
    const straight = Math.hypot(res.goal.x - SPAWN.x, res.goal.z - SPAWN.z);
    assert.ok(res.length >= straight - 1e-9, `${id}: tuyến ngắn hơn đường thẳng`);
    assertClear(res.points, id);
  }
});

test('tuyến giữa hai nhánh: từ desk_L1 (nhánh dọc) tới desk_B7 (đầu Đông nhánh ngang)', () => {
  const from = findRoute(grid, SPAWN, destOf('desk_L1')).goal;
  const res = findRoute(grid, from, destOf('desk_B7'));
  assert.equal(res.status, 'ok');
  assertClear(res.points, 'L1→B7');
  // Phải vòng xuống nhánh ngang: có điểm z > 0 (nam góc trong L tại z 0.2).
  assert.ok(res.points.some((p) => p.z > 0.2), 'không đi qua nhánh ngang');
});

test('đích ngoài chữ L (lounge, karaoke_room, core_st2, util_health) không tới được, không tạo tuyến', () => {
  for (const id of ['lounge', 'karaoke_room', 'core_st2', 'util_health']) {
    const res = findRoute(grid, SPAWN, destOf(id));
    assert.notEqual(res.status, 'ok', id);
    assert.equal(res.points.length, 0);
  }
  // wc_block nằm ngoài L nhưng mặt Tây chạm mép L (x 35.9): tuyến chỉ tới mép L, không vào trong khối.
  const wc = findRoute(grid, SPAWN, destOf('wc_block'));
  if (wc.status === 'ok') assertClear(wc.points, 'wc_block');
});

test('tới cửa thang máy Đông (lift7_east) qua khu an ninh', () => {
  const res = findRoute(grid, real.entry.ENTRY_DROP, destOf('lift7_east'));
  assert.equal(res.status, 'ok');
  assertClear(res.points, 'lift7_east');
});

test('tìm theo dữ liệu thật: mã phòng, tên phòng không dấu, squad; không có thì rỗng', () => {
  const items = real.objects.map((o) => ({
    id: o.id,
    label: o.label,
    kind: o.kind,
    squad: o.squad,
    rect: real.layout.footprint(o),
    center: { x: o.position[0], z: o.position[2] },
  }));
  const idx = buildSearchIndex(items);
  assert.equal(searchIndex(idx, 'mr2')[0].id, 'mr2');
  const rooms = searchIndex(idx, 'phong hop').map((i) => i.id);
  assert.deepEqual(rooms.slice().sort(), ['mr1', 'mr2', 'mr3']);
  const data = searchIndex(idx, 'data bi').map((i) => i.id).sort();
  assert.deepEqual(data, ['desk_B4', 'desk_L2']);
  assert.equal(searchIndex(idx, 'desk_b7')[0].id, 'desk_B7');
  // Vật ngoài L (karaoke_room) không có trong chỉ mục vì không dựng.
  assert.deepEqual(searchIndex(idx, 'karaoke'), []);
  assert.deepEqual(searchIndex(idx, 'zzz khong co'), []);
  assert.deepEqual(searchIndex(idx, '   '), []);
  assert.deepEqual(searchIndex(buildSearchIndex([]), 'mr1'), []);
});
