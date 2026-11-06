// Luồng tin nhắn WebSocket với kết nối giả (không cần thư viện ws).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOSE } from '../src/config.js';
import { createConnectionHandler } from '../src/connection.js';
import { createHub } from '../src/hub.js';
import { createPresenceStore } from '../src/presence.js';
import { createRateLimiter } from '../src/rateLimit.js';
import { createWorld } from '../src/world.js';

const A = { id: '1', name: 'An', tenantId: 't1' };
const B = { id: '2', name: 'Bình', tenantId: 't1' };
const C = { id: '3', name: 'Chi', tenantId: 't2' };

function fakeConn() {
  return {
    sent: [],
    bufferedAmount: 0,
    closed: null,
    terminated: false,
    send(text) {
      this.sent.push(JSON.parse(text));
    },
    close(code, reason) {
      this.closed = { code, reason };
    },
    terminate() {
      this.terminated = true;
    },
    types() {
      return this.sent.map((m) => m.type);
    },
  };
}

function setup() {
  const clock = { t: 0 };
  const now = () => clock.t;
  const presence = createPresenceStore({ ttlMs: 15_000, maxPerTenant: 10 });
  const limiter = createRateLimiter({ capacity: 10, refillPerSec: 10 });
  const hub = createHub({ maxClients: 10, maxPerUser: 2, maxBufferBytes: 1024 });
  const world = createWorld({ presence, limiter, hub, now });
  function connect(user) {
    const conn = fakeConn();
    const { client, error } = hub.add(user, conn);
    if (error) return { error };
    hub.send(client, world.snapshot(user));
    const h = createConnectionHandler({ world, hub, client, now });
    const sendMsg = (msg) => h.onMessage(Buffer.from(JSON.stringify(msg)), false);
    return { conn, client, h, sendMsg };
  }
  return { clock, hub, world, connect };
}

const pose = (seq, extra = {}) => ({ type: 'pose', v: 1, seq, x: -4, z: 3, yaw: 0, anim: 'walk', ...extra });

test('snapshot, join, poses theo tick, leave do hết hạn; tenant khác không nhận', () => {
  const { clock, world, connect } = setup();
  const a = connect(A);
  const b = connect(B);
  const c = connect(C);
  b.sendMsg(pose(1));
  assert.equal(b.conn.sent.at(-1).type, 'ack');
  world.step();
  clock.t = 15_001;
  world.step();
  assert.deepEqual(a.conn.types(), ['snapshot', 'join', 'poses', 'leave']);
  assert.equal(a.conn.sent[2].poses[0].id, '2');
  assert.equal(a.conn.sent[3].reason, 'timeout');
  assert.deepEqual(c.conn.types(), ['snapshot']);
  // Không lộ email hay tenant trong tin phát.
  assert.equal(JSON.stringify(a.conn.sent).includes('tenant'), false);
});

test('pose: kẹp sàn trả corrected, seq cũ trả stale_seq, giá trị lỗi trả error', () => {
  const { clock, connect } = setup();
  const b = connect(B);
  b.sendMsg(pose(1));
  clock.t = 100;
  b.sendMsg(pose(2, { x: 500 }));
  const ack = b.conn.sent.at(-1);
  assert.equal(ack.type, 'ack');
  assert.equal(ack.corrected, true);
  assert.ok(ack.accepted.x < -2);
  b.sendMsg(pose(2));
  assert.deepEqual(b.conn.sent.at(-1), { type: 'error', code: 'stale_seq', seq: 2 });
  clock.t = 200;
  b.sendMsg(pose(3, { yaw: 'x' }));
  assert.equal(b.conn.sent.at(-1).code, 'invalid_yaw');
});

test('giới hạn 10 pose mỗi giây: lần 11 trả rate_limited, kết nối vẫn mở', () => {
  const { connect } = setup();
  const a = connect(A);
  for (let i = 1; i <= 10; i++) a.sendMsg(pose(i));
  a.sendMsg(pose(11));
  const last = a.conn.sent.at(-1);
  assert.equal(last.code, 'rate_limited');
  assert.equal(last.retryAfterMs, 100);
  assert.equal(a.conn.closed, null);
});

test('flood tin nhắn (quá 20 trong cùng thời điểm) đóng 1008', () => {
  const { connect } = setup();
  const a = connect(A);
  for (let i = 0; i < 20; i++) a.sendMsg({ type: 'ping', t: i });
  assert.equal(a.conn.closed, null);
  a.sendMsg({ type: 'ping', t: 99 });
  assert.equal(a.conn.closed.code, CLOSE.POLICY);
});

test('khung quá 1 KB đóng 1009, khung nhị phân đóng 1003, JSON hỏng trả error', () => {
  const { connect } = setup();
  const a = connect(A);
  a.h.onMessage(Buffer.from('{"x":"' + 'a'.repeat(1100) + '"}'), false);
  assert.equal(a.conn.closed.code, 1009);
  const b = connect(B);
  b.h.onMessage(Buffer.from([1, 2, 3]), true);
  assert.equal(b.conn.closed.code, CLOSE.UNSUPPORTED);
  const c = connect(C);
  c.h.onMessage(Buffer.from('{nope'), false);
  assert.equal(c.conn.sent.at(-1).code, 'invalid_json');
  c.sendMsg({ type: 'teleport' });
  assert.equal(c.conn.sent.at(-1).code, 'unknown_type');
});

test('tối đa 2 kết nối mỗi người; đóng kết nối cuối thì phát leave disconnect', () => {
  const { connect, hub } = setup();
  const watcher = connect(B);
  const a1 = connect(A);
  const a2 = connect(A);
  assert.deepEqual(connect(A), { error: 'too_many_connections' });
  a1.sendMsg(pose(1));
  a1.h.onClose();
  assert.equal(watcher.conn.types().includes('leave'), false);
  a2.h.onClose();
  assert.deepEqual(watcher.conn.sent.at(-1), { type: 'leave', id: '1', reason: 'disconnect', tick: 0 });
  assert.equal(hub.size(), 1);
});

test('ping trả pong giữ nguyên t của client; leave trả về rời phòng', () => {
  const { clock, connect } = setup();
  const watcher = connect(B);
  const a = connect(A);
  clock.t = 1234;
  a.sendMsg({ type: 'ping', t: 42 });
  assert.deepEqual(a.conn.sent.at(-1), { type: 'pong', t: 42, serverTime: 1234, tick: 0 });
  a.sendMsg(pose(1));
  a.sendMsg({ type: 'leave' });
  assert.equal(watcher.conn.sent.at(-1).reason, 'left');
});

test('hub ngắt kết nối có bộ đệm gửi vượt ngưỡng (backpressure)', () => {
  const { connect, hub } = setup();
  const slow = connect(A);
  slow.conn.bufferedAmount = 4096;
  hub.broadcast('t1', { type: 'poses', poses: [] });
  assert.equal(slow.conn.terminated, true);
});
