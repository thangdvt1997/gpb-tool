// TASK 24: lease ghế, vật cầm, khóa chỉnh sửa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLeaseStore, parseResource } from '../src/leases.js';
import { EDITOR, MEMBER, MEMBER2, setup } from './helpers.js';

const U = (id) => ({ id, name: id, tenantId: 't1' });

test('một ghế một người: người thứ hai bị occupied kèm chủ; fence tăng ngặt', () => {
  const s = createLeaseStore({});
  const a = s.acquire(U('a'), { resource: 'seat:s1', requestId: 'r1' }, 0);
  const b = s.acquire(U('b'), { resource: 'seat:s1', requestId: 'r2' }, 1);
  assert.equal(a.ok, true);
  assert.equal(b.error, 'occupied');
  assert.equal(b.owner.id, 'a');
  const c = s.acquire(U('b'), { resource: 'seat:s2', requestId: 'r3' }, 2);
  assert.ok(c.lease.fence > a.lease.fence);
});

test('một người chỉ ngồi một ghế; vật cầm tối đa một', () => {
  const s = createLeaseStore({});
  s.acquire(U('a'), { resource: 'seat:s1' }, 0);
  assert.equal(s.acquire(U('a'), { resource: 'seat:s2' }, 1).error, 'already_seated');
  s.acquire(U('a'), { resource: 'held:cup' }, 1);
  assert.equal(s.acquire(U('a'), { resource: 'held:pen' }, 2).error, 'limit_reached');
});

test('retry cùng requestId và double click không cấp hai lần', () => {
  const s = createLeaseStore({});
  const a = s.acquire(U('a'), { resource: 'seat:s1', requestId: 'x' }, 0);
  const again = s.acquire(U('a'), { resource: 'seat:s1', requestId: 'x' }, 5);
  assert.equal(again.duplicate, true);
  assert.equal(again.lease.fence, a.lease.fence);
  const dbl = s.acquire(U('a'), { resource: 'seat:s1', requestId: 'y' }, 6);
  assert.equal(dbl.changed, false);
  assert.equal(dbl.lease.fence, a.lease.fence);
});

test('hết hạn theo giờ server; heartbeat gia hạn; token cũ không còn hiệu lực', () => {
  const s = createLeaseStore({ ttlMs: 1000 });
  const a = s.acquire(U('a'), { resource: 'edit:desk' }, 0).lease;
  assert.equal(s.heartbeat(U('a'), a, 900).ok, true);
  assert.equal(s.holds(U('a'), a, 1800), true);
  assert.equal(s.holds(U('a'), a, 1901), false);
  assert.equal(s.heartbeat(U('a'), a, 1901).error, 'lease_lost');
  const b = s.acquire(U('b'), { resource: 'edit:desk' }, 2000);
  assert.equal(b.ok, true);
  assert.equal(s.holds(U('a'), a, 2001), false); // client cũ quay lại không ghi đè
  assert.ok(b.lease.fence > a.fence);
});

test('release lặp lại an toàn; token cũ không nhả lease của người khác', () => {
  const s = createLeaseStore({ ttlMs: 1000 });
  const a = s.acquire(U('a'), { resource: 'seat:s1' }, 0).lease;
  assert.equal(s.release(U('a'), a, 10).released, true);
  assert.deepEqual(s.release(U('a'), a, 11), { ok: true, released: false });
  const b = s.acquire(U('b'), { resource: 'seat:s1' }, 12).lease;
  assert.equal(s.release(U('a'), a, 13).error, 'stale_token');
  assert.equal(s.holds(U('b'), b, 14), true);
});

test('expectedRevision sai trả revision_conflict', () => {
  const s = createLeaseStore({});
  const a = s.acquire(U('a'), { resource: 'seat:s1' }, 0);
  s.release(U('a'), a.lease, 1);
  assert.equal(s.acquire(U('b'), { resource: 'seat:s1', expectedRevision: a.lease.revision }, 2).error, 'revision_conflict');
  assert.equal(s.acquire(U('b'), { resource: 'seat:s1', expectedRevision: a.lease.revision + 1 }, 2).ok, true);
});

test('mất kết nối: giữ trong ân hạn rồi sweep nhả; resume trong ân hạn giữ lại', () => {
  const s = createLeaseStore({ ttlMs: 1000, graceMs: 5000 });
  s.acquire(U('a'), { resource: 'seat:s1' }, 0);
  s.hold('t1', 'a', 100);
  assert.equal(s.sweep(4000).length, 0);
  assert.equal(s.acquire(U('b'), { resource: 'seat:s1' }, 4000).error, 'occupied');
  assert.equal(s.resume('t1', 'a', 4500).length, 1);
  assert.equal(s.sweep(5200).length, 0); // đã gia hạn
  s.hold('t1', 'a', 6000);
  const out = s.sweep(11_001);
  assert.equal(out.length, 1);
  assert.equal(out[0].ownerId, 'a');
  assert.equal(s.acquire(U('b'), { resource: 'seat:s1' }, 11_002).ok, true);
});

test('resource sai định dạng và phòng khác nhau tách biệt', () => {
  assert.equal(parseResource('seat:../x'), null);
  assert.equal(parseResource('door:1'), null);
  const s = createLeaseStore({});
  s.acquire(U('a'), { resource: 'seat:s1' }, 0);
  assert.equal(s.acquire({ id: 'b', name: 'b', tenantId: 't2' }, { resource: 'seat:s1' }, 1).ok, true);
});

test('world: hai người cùng ngồi một ghế, chỉ một người được; sự kiện lease có eseq', () => {
  const { connect } = setup();
  const a = connect(MEMBER);
  const b = connect(MEMBER2);
  a.send({ type: 'lease.acquire', resource: 'seat:s1', requestId: 'a1' });
  b.send({ type: 'lease.acquire', resource: 'seat:s1', requestId: 'b1' });
  assert.equal(a.conn.last('lease.result').ok, true);
  assert.equal(b.conn.last('lease.result').error, 'occupied');
  const ev = b.conn.all('lease');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].ownerId, 'm');
  assert.ok(ev[0].eseq >= 1);
});

test('world: tim đập mất thì lease hết hạn qua tick và người khác lấy được', () => {
  const { clock, world, connect } = setup();
  const a = connect(MEMBER);
  const b = connect(MEMBER2);
  a.send({ type: 'lease.acquire', resource: 'held:cup', requestId: '1' });
  const tok = a.conn.last('lease.result').lease;
  clock.t += 10_000;
  a.send({ type: 'lease.heartbeat', resource: 'held:cup', leaseId: tok.leaseId, fence: tok.fence });
  assert.equal(a.conn.last('lease.result').ok, true);
  clock.t += 16_000;
  world.step();
  assert.equal(b.conn.last('lease').reason, 'expired');
  b.send({ type: 'lease.acquire', resource: 'held:cup', requestId: '2' });
  assert.equal(b.conn.last('lease.result').ok, true);
  a.send({ type: 'lease.heartbeat', resource: 'held:cup', leaseId: tok.leaseId, fence: tok.fence });
  assert.equal(a.conn.last('lease.result').error, 'lease_lost');
});

test('world: edit lock chỉ editor, chỉ chủ khóa commit; token cũ bị từ chối; commit lặp idempotent', () => {
  const { clock, world, connect } = setup();
  const m = connect(MEMBER);
  const e = connect(EDITOR);
  m.send({ type: 'lease.acquire', resource: 'edit:desk1', requestId: 'm1' });
  assert.equal(m.conn.last('lease.result').error, 'forbidden');
  e.send({ type: 'lease.acquire', resource: 'edit:desk1', requestId: 'e1' });
  const tok = e.conn.last('lease.result').lease;
  const commit = { type: 'edit.commit', resource: 'edit:desk1', leaseId: tok.leaseId, fence: tok.fence, patch: { x: -3, z: 2 }, requestId: 'c1' };
  e.send(commit);
  assert.equal(e.conn.last('edit.result').revision, 1);
  e.send(commit);
  assert.equal(e.conn.last('edit.result').duplicate, true);
  assert.equal(e.conn.last('edit.result').revision, 1);
  e.send({ ...commit, requestId: 'c2', patch: { x: 'a' } });
  assert.equal(e.conn.last('edit.result').error, 'invalid_patch');
  assert.equal(m.conn.last('edit.applied').revision, 1);
  clock.t += 20_000;
  world.step();
  e.send({ ...commit, requestId: 'c3' });
  assert.equal(e.conn.last('edit.result').error, 'lease_lost');
});

test('world: rời hẳn nhả ngay; mất kết nối giữ ân hạn rồi nhả', () => {
  const { clock, world, connect } = setup();
  const a = connect(MEMBER);
  const w = connect(MEMBER2);
  a.send({ type: 'lease.acquire', resource: 'seat:s1', requestId: '1' });
  a.h.onClose();
  clock.t += 20_000;
  world.step();
  assert.notEqual(w.conn.last('lease').ownerId, null); // vẫn trong ân hạn 30 s
  clock.t += 15_000;
  world.step();
  assert.equal(w.conn.last('lease').ownerId, null);
  w.send({ type: 'lease.acquire', resource: 'seat:s2', requestId: '2' });
  w.send({ type: 'leave' });
  assert.equal(w.conn.last('lease').reason, 'left');
});
