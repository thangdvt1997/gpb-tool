// TASK 27: resume token, bù sự kiện, thay phiên nhiều tab, ping/pong thật qua ws.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';
import { loadConfig } from '../src/config.js';
import { createEventLog, createSessions } from '../src/sessions.js';
import { createHub } from '../src/hub.js';
import { createPresenceStore } from '../src/presence.js';
import { createRateLimiter } from '../src/rateLimit.js';
import { createWorld } from '../src/world.js';
import { attachWorldSocket } from '../src/wsServer.js';
import { MEMBER, MEMBER2, OWNER, pose, setup } from './helpers.js';

test('eventLog: bù đủ, không có gì mới, khoảng trống lớn -> full, last vô lý -> full', () => {
  const log = createEventLog({ max: 3 });
  for (let i = 1; i <= 5; i++) log.append('t', { type: 'x', i });
  assert.deepEqual(log.since('t', 5), { full: false, events: [] });
  assert.deepEqual(log.since('t', 3).events.map((e) => e.eseq), [4, 5]);
  assert.equal(log.since('t', 1).full, true); // ring chỉ còn 3..5
  assert.equal(log.since('t', 99).full, true); // server restart: eseq nhỏ hơn
  assert.equal(log.since('t', undefined).full, true);
  assert.equal(log.since('khác', 0).full, false);
});

test('sessions: token đúng/sai/hết hạn; token xoay mỗi lần cấp', () => {
  const s = createSessions({ resumeTtlMs: 1000 });
  const u = { id: 'a', tenantId: 't' };
  const first = s.issue(u, 0);
  assert.equal(s.validate(u, first.token, 5).ok, true);
  assert.equal(s.validate(u, 'sai', 5).ok, false);
  assert.equal(s.validate({ id: 'b', tenantId: 't' }, first.token, 5).ok, false); // gắn danh tính
  s.markDisconnected(u, 100);
  assert.equal(s.validate(u, first.token, 1099).ok, true);
  assert.equal(s.validate(u, first.token, 1100).reason, 'expired');
  const second = s.issue(u, 2000, first);
  assert.notEqual(second.token, first.token);
  assert.equal(second.id, first.id);
  assert.equal(s.validate(u, first.token, 2001).ok, false);
});

test('resume trong ân hạn: lấy lại ghế, nhận sự kiện bị lỡ, spawn là vị trí cuối', () => {
  const { clock, connect, world } = setup();
  const a = connect(MEMBER);
  const w = connect(MEMBER2);
  a.send(pose(1, -4, 3));
  a.send({ type: 'lease.acquire', resource: 'seat:s1', requestId: '1' });
  const { resumeToken } = a.snap.session;
  const eseq = a.conn.last('lease').eseq;
  a.h.onClose();
  clock.t += 5000;
  w.send({ type: 'chat', channel: 'room', text: 'bạn đi đâu rồi', clientMsgId: 'x' });
  clock.t += 5000;
  world.step();
  const b = connect(MEMBER, { resumeToken, lastEventSeq: eseq });
  const r = b.snap.resumed;
  assert.equal(r.ok, true);
  assert.deepEqual(r.restored, ['seat:s1']);
  assert.deepEqual(r.lost, []);
  assert.equal(r.full, false);
  assert.deepEqual(r.events.map((e) => e.type), ['chat']);
  assert.equal(r.spawn.x, -4);
  assert.notEqual(b.snap.session.resumeToken, resumeToken);
  assert.equal(b.snap.leases.find((l) => l.resource === 'seat:s1').ownerId, 'm');
});

test('resume sau ân hạn: ghế đã nhả, báo lost; người khác đã ngồi thì không bị ghi đè', () => {
  const { clock, connect, world } = setup();
  const a = connect(MEMBER);
  const w = connect(MEMBER2);
  a.send({ type: 'lease.acquire', resource: 'seat:s1', requestId: '1' });
  const tok = a.snap.session.resumeToken;
  a.h.onClose();
  clock.t += 31_000;
  world.step();
  w.send({ type: 'lease.acquire', resource: 'seat:s1', requestId: '2' });
  assert.equal(w.conn.last('lease.result').ok, true);
  const b = connect(MEMBER, { resumeToken: tok, lastEventSeq: 0 });
  assert.equal(b.snap.resumed.ok, true);
  assert.deepEqual(b.snap.resumed.restored, []);
  assert.equal(b.snap.resumed.lost[0].resource, 'seat:s1');
  assert.equal(b.snap.leases.find((l) => l.resource === 'seat:s1').ownerId, 'm2');
});

test('token sai hoặc hết hạn: resumed.ok=false, full, lease cũ nhả; không token: phiên sạch', () => {
  const { clock, connect, world } = setup();
  const a = connect(MEMBER);
  a.send({ type: 'lease.acquire', resource: 'held:cup', requestId: '1' });
  a.h.onClose();
  const b = connect(MEMBER, { resumeToken: 'đoán mò', lastEventSeq: 0 });
  assert.equal(b.snap.resumed.ok, false);
  assert.equal(b.snap.resumed.full, true);
  assert.equal(b.snap.leases.length, 0);
  const tok = b.snap.session.resumeToken;
  b.h.onClose();
  clock.t += 121_000;
  world.step();
  for (let i = 0; i < 600; i++) world.step(); // kích hoạt dọn phiên định kỳ
  const c = connect(MEMBER, { resumeToken: tok });
  assert.equal(c.snap.resumed.ok, false);
  assert.equal(connect(MEMBER2).snap.resumed, null);
});

test('token của người khác không chiếm được phiên', () => {
  const { connect } = setup();
  const a = connect(MEMBER);
  const evil = connect(MEMBER2, { resumeToken: a.snap.session.resumeToken });
  assert.equal(evil.snap.resumed.ok, false);
});

test('tab mới thay phiên cũ: socket cũ đóng 4409, một avatar duy nhất, không leave giả', () => {
  const { connect, presence, hub } = setup();
  const w = connect(MEMBER2);
  const a1 = connect(MEMBER);
  a1.send(pose(1));
  const a2 = connect(MEMBER);
  assert.equal(a1.conn.closed.code, 4409);
  a1.h.onClose(); // sự kiện đóng đến muộn
  assert.equal(w.conn.all('leave').length, 0);
  assert.equal(presence.get('t1', 'm') !== null, true);
  assert.equal(hub.size(), 2);
  a1.h.onMessage(Buffer.from(JSON.stringify(pose(5))), false); // socket cũ bị bỏ qua
  assert.equal(a1.conn.all('ack').length, 1);
  assert.equal(a2.conn.closed, null);
});

// ---- Tích hợp qua ws thật (cổng ngẫu nhiên, 127.0.0.1) ----

async function boot() {
  const presence = createPresenceStore({ ttlMs: 15_000, maxPerTenant: 50 });
  const hub = createHub({ maxClients: 20, maxPerUser: 2, maxBufferBytes: 1 << 20 });
  const world = createWorld({ presence, limiter: createRateLimiter({ capacity: 10, refillPerSec: 10 }), hub });
  const users = { ckA: OWNER, ckB: MEMBER };
  const authClient = {
    fetchUser: async (cookie) => users[cookie] || null,
    verify: async (cookie) => users[cookie] || null,
  };
  const server = http.createServer();
  const config = loadConfig({});
  const sock = attachWorldSocket({ server, config, world, hub, authClient });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const open = (cookie, query = '') =>
    new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/api/world/ws${query}`, { headers: { Origin: 'http://localhost:5173', Cookie: cookie } });
      const msgs = [];
      ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
      ws.on('open', () => resolve({ ws, msgs }));
      ws.on('error', reject);
    });
  const close = async () => {
    world.stop();
    sock.close();
    await new Promise((r) => server.close(r));
  };
  return { open, close };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('ws thật: snapshot có session, role; tab thứ hai thay phiên (4409); resume qua query', async () => {
  const { open, close } = await boot();
  try {
    const c1 = await open('ckB');
    await wait(100);
    assert.equal(c1.msgs[0].type, 'snapshot');
    assert.equal(c1.msgs[0].role, 'member');
    assert.ok(c1.msgs[0].session.resumeToken);
    const closed = new Promise((r) => c1.ws.on('close', (code) => r(code)));
    const c2 = await open('ckB', `?resume=${encodeURIComponent(c1.msgs[0].session.resumeToken)}&last=0`);
    assert.equal(await closed, 4409);
    await wait(100);
    assert.equal(c2.msgs[0].resumed.ok, true);
    // ping ứng dụng nhận pong
    c2.ws.send(JSON.stringify({ type: 'ping', t: 7 }));
    await wait(100);
    assert.equal(c2.msgs.find((m) => m.type === 'pong').t, 7);
    // owner kick -> 4403 và không vào lại được
    const o = await open('ckA');
    const kicked = new Promise((r) => c2.ws.on('close', (code) => r(code)));
    o.ws.send(JSON.stringify({ type: 'mod.kick', target: 'm' }));
    assert.equal(await kicked, 4403);
    const again = await open('ckB');
    const code = await new Promise((r) => again.ws.on('close', r));
    assert.equal(code, 4403);
    o.ws.close();
  } finally {
    await close();
  }
});

test('ws thật: chưa đăng nhập đóng 4401', async () => {
  const { open, close } = await boot();
  try {
    const c = await open('không có');
    const code = await new Promise((r) => c.ws.on('close', r));
    assert.equal(code, 4401);
  } finally {
    await close();
  }
});
