import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePose } from '../src/pose.js';
import { createPresenceStore, PresenceError } from '../src/presence.js';

const A = { id: '1', name: 'An', tenantId: 't1' };
const B = { id: '2', name: 'Bình', tenantId: 't1' };
const C = { id: '3', name: 'Chi', tenantId: 't2' };
const pose = (seq, x = -4, z = 3) => parsePose({ v: 1, seq, x, z, yaw: 0 });

test('presence hết hạn sau TTL nếu không cập nhật', () => {
  const p = createPresenceStore({ ttlMs: 15_000, maxPerTenant: 10 });
  p.update(A, pose(1), 0);
  p.update(B, pose(1), 10_000);
  assert.deepEqual(p.sweep(15_000), []);
  assert.deepEqual(p.sweep(15_001), [{ tenantId: 't1', id: '1' }]);
  assert.deepEqual(p.list('t1').map((e) => e.id), ['2']);
  // Cập nhật làm mới hạn.
  p.update(B, pose(2), 20_000);
  assert.deepEqual(p.sweep(34_000), []);
  assert.equal(p.sweep(35_001).length, 1);
  assert.deepEqual(p.stats(), { tenants: 0, players: 0 });
});

test('seq trùng hoặc cũ bị từ chối; sau khi hết hạn nhận seq mới bất kỳ', () => {
  const p = createPresenceStore({ ttlMs: 1000, maxPerTenant: 10 });
  p.update(A, pose(5), 0);
  assert.throws(() => p.update(A, pose(5), 10), (e) => e instanceof PresenceError && e.code === 'stale_seq');
  assert.throws(() => p.update(A, pose(4), 10), (e) => e.code === 'stale_seq');
  p.sweep(2000);
  assert.equal(p.update(A, pose(0), 2000).created, true);
});

test('tenant tách biệt và giới hạn số người mỗi tenant', () => {
  const p = createPresenceStore({ ttlMs: 1000, maxPerTenant: 1 });
  p.update(A, pose(1), 0);
  p.update(C, pose(1), 0);
  assert.throws(() => p.update(B, pose(1), 0), (e) => e.code === 'room_full');
  assert.deepEqual(p.list('t1').map((e) => e.id), ['1']);
  assert.deepEqual(p.list('t2').map((e) => e.id), ['3']);
  // Dữ liệu công khai không có tenant hay email.
  assert.deepEqual(Object.keys(p.list('t1')[0]).sort(), ['anim', 'id', 'name', 'seq', 't', 'x', 'yaw', 'z']);
});

test('remove trả false khi không có presence', () => {
  const p = createPresenceStore({ ttlMs: 1000, maxPerTenant: 10 });
  assert.equal(p.remove('t1', '1'), false);
  p.update(A, pose(1), 0);
  assert.equal(p.remove('t1', '1'), true);
  assert.deepEqual(p.drainDirty().size, 0);
});
