// Chạy: node --test test/ (trong services/world, Node >= 20). Không cần npm install.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SPEED, STEP_SLACK } from '../src/config.js';
import { authorizePose, clampToFloor, limitStep, normalizeYaw, parsePose, PoseError } from '../src/pose.js';

const ok = { v: 1, seq: 1, x: -4, z: 3, yaw: 0, anim: 'walk' };
const code = (fn) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof PoseError);
    return e.code;
  }
  return null;
};

test('parsePose nhận pose hợp lệ và bỏ trường lạ', () => {
  const p = parsePose({ ...ok, email: 'x@y.z', teleport: true });
  assert.deepEqual(p, { seq: 1, x: -4, z: 3, yaw: 0, anim: 'walk' });
});

test('parsePose từ chối giá trị không hữu hạn hoặc sai kiểu', () => {
  assert.equal(code(() => parsePose({ ...ok, x: NaN })), 'invalid_position');
  assert.equal(code(() => parsePose({ ...ok, z: Infinity })), 'invalid_position');
  assert.equal(code(() => parsePose({ ...ok, x: '1' })), 'invalid_position');
  assert.equal(code(() => parsePose({ ...ok, yaw: null })), 'invalid_yaw');
  assert.equal(code(() => parsePose({ ...ok, anim: 'fly' })), 'invalid_anim');
  assert.equal(code(() => parsePose({ ...ok, seq: -1 })), 'invalid_seq');
  assert.equal(code(() => parsePose({ ...ok, seq: 1.5 })), 'invalid_seq');
  assert.equal(code(() => parsePose({ ...ok, v: 2 })), 'protocol_version');
  assert.equal(code(() => parsePose([])), 'invalid_body');
  assert.equal(code(() => parsePose(null)), 'invalid_body');
});

test('normalizeYaw đưa về [-π, π)', () => {
  assert.equal(normalizeYaw(0), 0);
  assert.ok(Math.abs(normalizeYaw(3 * Math.PI) - -Math.PI) < 1e-3);
  assert.ok(Math.abs(normalizeYaw(-Math.PI / 2 - 4 * Math.PI) - -Math.PI / 2) < 1e-3);
});

test('clampToFloor giữ điểm trong chữ L, kẹp điểm ngoài về mép gần nhất', () => {
  // Spawn (-4, 3) nằm trong sàn.
  assert.deepEqual(clampToFloor(-4, 3), { x: -4, z: 3, clamped: false });
  // Ngoài tường Nam (z > 15).
  assert.deepEqual(clampToFloor(-4, 100), { x: -4, z: 15, clamped: true });
  // Chỗ lõm của chữ L (khu dự phòng, bản vẽ x 20, y 5 → thế giới -9, -10) không phải sàn.
  const c = clampToFloor(-9, -10);
  assert.equal(c.clamped, true);
  assert.deepEqual({ x: c.x, z: c.z }, { x: -14.5, z: -10 });
  // Điểm rất xa vẫn hữu hạn.
  const far = clampToFloor(1e12, -1e12);
  assert.ok(Number.isFinite(far.x) && Number.isFinite(far.z));
});

test('limitStep chặn quãng đường vượt tốc độ tối đa', () => {
  const prev = { x: 0, z: 0 };
  assert.equal(limitStep(prev, { x: 0.5, z: 0 }, 100).limited, false);
  const s = limitStep(prev, { x: 20, z: 0 }, 100);
  assert.equal(s.limited, true);
  assert.ok(Math.abs(s.x - (MAX_SPEED * 0.1 + STEP_SLACK)) < 1e-9);
  // dt lớn được chặn ở 1 s: không thể "nghỉ" rồi nhảy xa.
  const long = limitStep(prev, { x: 50, z: 0 }, 60_000);
  assert.ok(Math.abs(long.x - (MAX_SPEED + STEP_SLACK)) < 1e-9);
});

test('authorizePose: người mới vào nhận điểm bất kỳ trong sàn, sau đó bị giới hạn tốc độ', () => {
  const first = authorizePose(null, parsePose({ ...ok, x: 10, z: 10 }), 1000);
  assert.equal(first.corrected, false);
  assert.deepEqual([first.x, first.z], [10, 10]);
  const jump = authorizePose({ x: 10, z: 10, at: 1000 }, parsePose({ ...ok, seq: 2, x: -20, z: 10 }), 1100);
  assert.equal(jump.corrected, true);
  assert.ok(Math.abs(10 - jump.x - (MAX_SPEED * 0.1 + STEP_SLACK)) < 1e-3);
});
