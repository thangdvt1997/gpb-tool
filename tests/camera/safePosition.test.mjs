// Chạy: node --test tests/camera/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createFallWatch,
  createSafeTracker,
  findSafeNear,
  isSpotSafe,
  mapStatus,
  SAFE_DEFAULTS,
} from '../../src/scene/controls/safePosition.ts';

// Sàn thử: hình chữ L đơn giản (không phải office thật): [0,10]x[0,4] hợp [0,4]x[0,10].
const onL = (x, z) => (x >= 0 && x <= 10 && z >= 0 && z <= 4) || (x >= 0 && x <= 4 && z >= 0 && z <= 10);
const desk = { minX: 5, maxX: 7, minZ: 1, maxZ: 2 };
const world = (extra = {}) => ({ isOnFloor: onL, obstacles: [desk], bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 }, ...extra });

test('isSpotSafe: cần sàn quanh vòng bán kính, tránh vật cản và người khác', () => {
  const w = world();
  assert.equal(isSpotSafe(2, 2, w), true);
  assert.equal(isSpotSafe(6, 1.5, w), false, 'trong bàn');
  assert.equal(isSpotSafe(6, 2.3, w), false, 'sát bàn hơn bán kính + khoảng trống');
  assert.equal(isSpotSafe(6, 2.6, w), true);
  assert.equal(isSpotSafe(8, 8, w), false, 'ngoài chữ L, không có sàn');
  assert.equal(isSpotSafe(4.3, 6, w), false, 'tâm ngoài sàn');
  assert.equal(isSpotSafe(3.8, 6, w), false, 'tâm có sàn nhưng mép vòng ra ngoài sàn');
  assert.equal(isSpotSafe(0.2, 2, w), false, 'sát biên phòng');
  assert.equal(isSpotSafe(Number.NaN, 2, w), false);
  const crowded = world({ others: () => [{ x: 2.5, z: 2 }] });
  assert.equal(isSpotSafe(2, 2, crowded), false, 'chồng lên người khác');
  assert.equal(isSpotSafe(3.3, 2, crowded), false, 'cách 0,8 m < 2 × 0,35 + 0,2');
  assert.equal(isSpotSafe(3.5, 2, crowded), true);
});

test('tracker: chỉ lấy mẫu khi đứng trên sàn, theo chu kỳ và khoảng cách tối thiểu', () => {
  const w = world();
  const t = createSafeTracker();
  assert.equal(t.observe(2, 0, 2, true, w, 0.016), true, 'mẫu đầu lấy ngay');
  assert.equal(t.observe(3, 0, 2, true, w, 0.1), false, 'chưa đủ chu kỳ');
  assert.equal(t.observe(2.2, 0, 2, true, w, 0.6), false, 'gần điểm cũ hơn minSpacing');
  assert.equal(t.observe(3, 1, 2, false, w, 0.6), false, 'đang nhảy');
  assert.equal(t.observe(6, 0, 1.5, true, w, 0.6), false, 'điểm không an toàn không lưu');
  assert.equal(t.observe(3, 0, 3, true, w, 0.6), true);
  assert.equal(t.size(), 2);
  assert.deepEqual(t.latest(), { x: 3, z: 3 });
});

test('đứng yên không sinh mẫu mới và không bao giờ tự dịch chuyển', () => {
  const w = world();
  const t = createSafeTracker();
  t.observe(2, 0, 2, true, w, 0.016);
  const pos = { x: 2, z: 2 };
  for (let i = 0; i < 600; i++) t.observe(pos.x, 0, pos.z, true, w, 1 / 60);
  assert.equal(t.size(), 1);
  assert.deepEqual(pos, { x: 2, z: 2 });
  const fw = createFallWatch();
  for (let i = 0; i < 600; i++) assert.equal(fw.update(mapStatus(pos.x, 0, pos.z, w), 1 / 60), false);
});

test('resolve: dùng điểm mới nhất còn trống, bỏ điểm đã bị người khác chiếm', () => {
  const others = [];
  const w = world({ others: () => others });
  const t = createSafeTracker();
  t.observe(1.5, 0, 1.5, true, w, 1);
  t.observe(3, 0, 3, true, w, 1);
  assert.deepEqual(t.resolve(w, { x: 2, z: 8 }), { x: 3, z: 3, source: 'history' });
  others.push({ x: 3, z: 3 });
  assert.deepEqual(t.resolve(w, { x: 2, z: 8 }), { x: 1.5, z: 1.5, source: 'history' });
});

test('resolve: mọi điểm cũ bị chặn thì tìm quanh điểm mới nhất, rồi spawn', () => {
  const blocks = [];
  const w = { isOnFloor: onL, obstacles: blocks, bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 } };
  const t = createSafeTracker();
  t.observe(2, 0, 2, true, w, 1);
  blocks.push({ minX: 1.6, maxX: 2.4, minZ: 1.6, maxZ: 2.4 }); // bàn mới kê đè lên chỗ cũ
  const r = t.resolve(w, { x: 2, z: 8 });
  assert.equal(r.source, 'history-near');
  assert.equal(isSpotSafe(r.x, r.z, w), true);
  assert.ok(Math.hypot(r.x - 2, r.z - 2) <= SAFE_DEFAULTS.searchStep * SAFE_DEFAULTS.searchRings + 1e-9);

  const empty = createSafeTracker();
  assert.deepEqual(empty.resolve(w, { x: 2, z: 8 }), { x: 2, z: 8, source: 'spawn' });
  blocks.push({ minX: 1.5, maxX: 2.5, minZ: 7.5, maxZ: 8.5 }); // spawn bị chặn
  const s = empty.resolve(w, { x: 2, z: 8 });
  assert.equal(s.source, 'spawn-near');
  assert.equal(isSpotSafe(s.x, s.z, w), true);
});

test('resolve trả null khi không còn chỗ nào (không dịch chuyển bừa)', () => {
  const w = { isOnFloor: () => false, obstacles: [] };
  const t = createSafeTracker();
  assert.equal(t.resolve(w, { x: 0, z: 0 }), null);
  assert.equal(findSafeNear(0, 0, w), null);
});

test('mapStatus và FallWatch: NaN/rơi phục hồi ngay, ra ngoài sàn chờ grace', () => {
  const w = world();
  assert.equal(mapStatus(2, 0, 2, w), 'ok');
  assert.equal(mapStatus(Number.NaN, 0, 2, w), 'invalid');
  assert.equal(mapStatus(2, Number.POSITIVE_INFINITY, 2, w), 'invalid');
  assert.equal(mapStatus(2, -5, 2, w), 'fell');
  assert.equal(mapStatus(8, 0, 8, w), 'outside');

  const fw = createFallWatch();
  assert.equal(fw.update('invalid', 0.016), true);
  assert.equal(fw.update('fell', 0.016), true);
  let fired = -1;
  for (let i = 0; i < 120; i++) {
    if (fw.update('outside', 1 / 60)) {
      fired = i;
      break;
    }
  }
  assert.ok(fired >= 58 && fired <= 60, `grace ~1 s, bắn ở khung ${fired}`);
  fw.update('outside', 0.5);
  fw.update('ok', 0.016); // quay lại sàn: đặt lại đếm
  assert.equal(fw.update('outside', 0.6), false);
});

test('tracker.clear xóa lịch sử', () => {
  const w = world();
  const t = createSafeTracker();
  t.observe(2, 0, 2, true, w, 1);
  t.clear();
  assert.equal(t.size(), 0);
  assert.equal(t.latest(), null);
});
