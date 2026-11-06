// Test debounce, chuẩn hóa tìm kiếm, mô hình bản đồ. Chạy: node --test "src/minimap/core/test/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMapModel, buildNavGrid, categoryOfKind, createDebouncer, normalizeText, rectArea, walkableRects } from '../index.js';
import { real } from './realData.mjs';

function fakeTimers() {
  let now = 0;
  let seq = 0;
  const q = new Map();
  return {
    setTimeout(fn, ms) {
      const id = ++seq;
      q.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout(id) {
      q.delete(id);
    },
    advance(ms) {
      now += ms;
      for (const [id, t] of [...q].sort((a, b) => a[1].at - b[1].at)) {
        if (t.at <= now) {
          q.delete(id);
          t.fn();
        }
      }
    },
  };
}

test('debounce: nhiều thay đổi layout liên tiếp chỉ tính lại một lần, với dữ liệu mới nhất', () => {
  const t = fakeTimers();
  const calls = [];
  const d = createDebouncer((v) => calls.push(v), 250, t);
  d.call('v1');
  t.advance(100);
  d.call('v2');
  t.advance(100);
  d.call('v3');
  t.advance(249);
  assert.deepEqual(calls, []);
  assert.equal(d.pending, true);
  t.advance(1);
  assert.deepEqual(calls, ['v3']);
  d.call('v4');
  d.cancel();
  t.advance(1000);
  assert.deepEqual(calls, ['v3']);
  d.call('v5');
  d.flush();
  assert.deepEqual(calls, ['v3', 'v5']);
});

test('chuẩn hóa tiếng Việt', () => {
  assert.equal(normalizeText('Phòng Họp 1 (8 chỗ)'), 'phong hop 1 (8 cho)');
  assert.equal(normalizeText('Đông-Nam'), 'dong nam');
  assert.equal(normalizeText('server_room'), 'server room');
  assert.equal(normalizeText(undefined), '');
});

test('mô hình bản đồ từ dữ liệu thật: vùng đi lại khớp lưới, nhóm theo kind', () => {
  const grid = buildNavGrid({ walkRects: real.walkRects, obstacles: real.obstacles, radius: real.radius });
  const rects = walkableRects(grid);
  const cells = grid.walk.reduce((s, v) => s + v, 0);
  const area = rects.reduce((s, r) => s + rectArea(r), 0);
  assert.ok(Math.abs(area - cells * grid.cellSize ** 2) < 1e-6, `${area} vs ${cells * grid.cellSize ** 2}`);
  const items = real.objects.map((o) => ({
    id: o.id,
    label: o.label,
    kind: o.kind,
    rect: real.layout.footprint(o),
    center: { x: o.position[0], z: o.position[2] },
    isEntrance: o.id === 'entrance',
  }));
  const m = buildMapModel({ polygon: real.polygon, floor: real.walkRects, walls: real.outerWalls, items, grid });
  assert.deepEqual(m.doors.map((d) => d.id).sort(), ['entrance', 'lift7_east', 'lift7_west', 'security_gate']);
  assert.equal(categoryOfKind('meeting'), 'room');
  assert.equal(categoryOfKind('desk'), 'desk');
  // Không có vật ngoài L trong mô hình.
  for (const it of m.items) assert.ok(real.bounds.isObjectInOffice(real.byId(it.id)), it.id);
  assert.equal(m.walls.length, 3);
});
