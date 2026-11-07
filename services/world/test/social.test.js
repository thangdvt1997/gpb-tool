// TASK 15: lời mời hành động xã hội qua world (kết nối giả + ws thật).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';
import { loadConfig } from '../src/config.js';
import { createHub } from '../src/hub.js';
import { createPresenceStore } from '../src/presence.js';
import { createRateLimiter } from '../src/rateLimit.js';
import { createWorld } from '../src/world.js';
import { attachWorldSocket } from '../src/wsServer.js';
import { GUEST, MEMBER, MEMBER2, OWNER, mk, pose, setup } from './helpers.js';

const invite = (id, to, actionId = 'handshake') => ({
  type: 'social_invite',
  invite: { id, actionId, from: 'ignored', to, createdAt: 0, expiresAt: 1e12, status: 'pending' },
});

function pair(over) {
  const s = setup(over);
  const a = s.connect(MEMBER);
  const b = s.connect(MEMBER2);
  a.send(pose(1, 0, 0));
  b.send(pose(1, 1, 0));
  return { ...s, a, b };
}

test('mời -> chấp nhận: bên nhận thấy lời mời với from do server đặt, bên mời nhận trả lời', () => {
  const { a, b } = pair();
  a.send(invite('m#1', 'm2'));
  const inv = b.conn.last('social_invite').invite;
  assert.equal(inv.from, 'm'); // không tin from do client gửi
  assert.equal(inv.to, 'm2');
  assert.equal(inv.status, 'pending');
  assert.equal(inv.expiresAt - inv.createdAt, 15_000);
  b.send({ type: 'social_respond', inviteId: 'm#1', answer: 'accept' });
  const r = a.conn.last('social_respond');
  assert.deepEqual([r.inviteId, r.by, r.answer], ['m#1', 'm2', 'accept']);
});

test('từ chối, hủy, và người thứ ba không trả lời hộ được', () => {
  const { a, b, connect } = pair();
  const c = connect(mk('c', 'employee'));
  c.send(pose(1, 0.5, 0));
  a.send(invite('m#1', 'm2'));
  c.send({ type: 'social_respond', inviteId: 'm#1', answer: 'accept' });
  assert.equal(c.conn.last('social.denied').code, 'forbidden');
  assert.equal(a.conn.last('social_respond'), undefined);
  b.send({ type: 'social_respond', inviteId: 'm#1', answer: 'decline' });
  assert.equal(a.conn.last('social_respond').answer, 'decline');
  // đã xong: trả lời lại bị từ chối
  b.send({ type: 'social_respond', inviteId: 'm#1', answer: 'accept' });
  assert.equal(b.conn.last('social.denied').code, 'invite_not_found');
  a.send(invite('m#2', 'm2'));
  b.send({ type: 'social_cancel', inviteId: 'm#2' }); // người nhận không được hủy
  assert.equal(b.conn.last('social.denied').code, 'forbidden');
  a.send({ type: 'social_cancel', inviteId: 'm#2' });
  assert.equal(b.conn.last('social_cancel').inviteId, 'm#2');
});

test('hết hạn: trả lời sau 15 s bị từ chối và dọn', () => {
  const { a, b, clock, world } = pair();
  a.send(invite('m#1', 'm2'));
  clock.t += 16_000;
  world.step();
  b.send({ type: 'social_respond', inviteId: 'm#1', answer: 'accept' });
  assert.equal(b.conn.last('social.denied').code, 'invite_not_found');
  assert.equal(a.conn.last('social_respond'), undefined);
});

test('khoảng cách: mời xa bị từ chối; chấp nhận khi đã đi xa thì thành từ chối', () => {
  const { a, b, clock } = pair();
  // Pose bị giới hạn tốc độ: đi dần ra xa.
  for (let i = 0; i < 4; i++) {
    clock.t += 1000;
    b.send(pose(2 + i, 1 + 8 * (i + 1), 0));
  }
  a.send(invite('m#1', 'm2'));
  assert.equal(a.conn.last('social.denied').code, 'too_far');
  assert.equal(b.conn.last('social_invite'), undefined);
  for (let i = 0; i < 4; i++) {
    clock.t += 1000;
    b.send(pose(10 + i, 33 - 8 * (i + 1), 0));
  }
  a.send(invite('m#2', 'm2'));
  assert.ok(b.conn.last('social_invite'));
  for (let i = 0; i < 4; i++) {
    clock.t += 1000;
    a.send(pose(20 + i, -8 * (i + 1), 0));
  }
  b.send({ type: 'social_respond', inviteId: 'm#2', answer: 'accept' });
  assert.equal(b.conn.last('social.denied').code, 'too_far');
  assert.equal(a.conn.last('social_respond').answer, 'decline');
});

test('vẫy/cúi/chỉ tay: chỉ chuyển tới đúng người nhận, startTime do server đặt; xa quá bị từ chối', () => {
  const { a, b, connect } = pair();
  const c = connect(mk('c', 'employee'));
  c.send(pose(1, 0.5, 0));
  a.send({ type: 'social_play', actionId: 'wave_at', to: 'm2', startTime: 5 });
  const p = b.conn.last('social_play');
  assert.deepEqual([p.actionId, p.from, p.to], ['wave_at', 'm', 'm2']);
  assert.notEqual(p.startTime, 5);
  assert.equal(c.conn.last('social_play'), undefined);
  a.send({ type: 'social_play', actionId: 'handshake', to: 'm2' }); // cần đồng ý: không đi đường này
  assert.equal(a.conn.last('social.denied').code, 'invalid_action');
  a.send({ type: 'social_play', actionId: 'rm -rf', to: 'm2' });
  assert.equal(a.conn.last('social.denied').code, 'invalid_action');
  a.send(invite('x', 'm2', 'wave_at')); // hành động không cần đồng ý không mời được
  assert.equal(a.conn.last('social.denied').code, 'invalid_invite');
});

test('quyền và phòng: guest không dùng được; khác phòng không thấy nhau; không tự mời mình', () => {
  const { a, connect } = pair();
  const g = connect(GUEST);
  g.send(pose(1, 0.2, 0));
  g.send(invite('g#1', 'm'));
  assert.equal(g.conn.last('social.denied').code, 'forbidden');
  const other = connect(mk('z', 'employee', 't2'));
  other.send(pose(1, 0.1, 0));
  a.send(invite('m#1', 'z'));
  assert.equal(a.conn.last('social.denied').code, 'target_not_found');
  assert.equal(other.conn.last('social_invite'), undefined);
  a.send(invite('m#2', 'm'));
  assert.equal(a.conn.last('social.denied').code, 'target_not_found');
  a.send(invite('m#3', 'guest-không-có'));
  assert.equal(a.conn.last('social.denied').code, 'target_not_found');
});

test('bận: mỗi người một lời mời đi; người nhận đang bận thì coi như từ chối', () => {
  const { a, b, connect } = pair();
  const c = connect(mk('c', 'employee'));
  c.send(pose(1, 0.5, 0));
  a.send(invite('m#1', 'm2'));
  a.send(invite('m#2', 'c'));
  assert.equal(a.conn.last('social.denied').code, 'busy');
  c.send(invite('c#1', 'm2')); // m2 đang có lời mời đến
  const r = c.conn.last('social_respond');
  assert.deepEqual([r.inviteId, r.by, r.answer], ['c#1', 'm2', 'decline']);
  assert.equal(b.conn.all('social_invite').length, 1);
  a.send(invite('m#1', 'm2')); // trùng id
  assert.equal(a.conn.last('social.denied').code, 'duplicate');
});

test('giới hạn tần suất: lặp mời/play dồn dập bị rate_limited', () => {
  const { a, clock } = pair();
  let denied = null;
  for (let i = 0; i < 12; i++) {
    clock.t -= 55; // gần như cùng thời điểm (send cộng 60 ms)
    a.send({ type: 'social_play', actionId: 'wave_at', to: 'm2' });
    denied = a.conn.last('social.denied') || denied;
  }
  assert.equal(denied.code, 'rate_limited');
  assert.ok(denied.retryAfterMs > 0);
});

test('người chặn: bị chặn mời thì nhận từ chối, người chặn không thấy gì', () => {
  const { a, b } = pair();
  b.send({ type: 'chat.block', target: 'm', on: true });
  a.send(invite('m#1', 'm2'));
  assert.equal(a.conn.last('social_respond').answer, 'decline');
  assert.equal(b.conn.last('social_invite'), undefined);
  a.send({ type: 'social_play', actionId: 'wave_at', to: 'm2' });
  assert.equal(b.conn.last('social_play'), undefined);
});

test('rời phòng/kick: hủy lời mời và báo bên kia', () => {
  const { a, b, connect } = pair();
  a.send(invite('m#1', 'm2'));
  a.h.onClose();
  assert.equal(b.conn.last('social_cancel').inviteId, 'm#1');
  // m2 là người nhận khi bên mời còn: bị kick thì bên mời nhận decline
  const a2 = connect(MEMBER);
  a2.send(pose(5, 0, 0));
  const o = connect(OWNER);
  a2.send(invite('m#9', 'm2'));
  o.send({ type: 'mod.kick', target: 'm2' });
  assert.equal(a2.conn.last('social_respond').answer, 'decline');
});

// ---- ws thật ----
test('ws thật: hai người trao lời mời và trả lời qua 127.0.0.1', async () => {
  const presence = createPresenceStore({ ttlMs: 15_000, maxPerTenant: 50 });
  const hub = createHub({ maxClients: 20, maxPerUser: 2, maxBufferBytes: 1 << 20 });
  const world = createWorld({ presence, limiter: createRateLimiter({ capacity: 10, refillPerSec: 10 }), hub });
  const users = { ckA: MEMBER, ckB: MEMBER2 };
  const authClient = { fetchUser: async (c) => users[c] || null, verify: async (c) => users[c] || null };
  const server = http.createServer();
  const sock = attachWorldSocket({ server, config: loadConfig({}), world, hub, authClient });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const open = (cookie) =>
    new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/api/world/ws`, { headers: { Origin: 'http://localhost:5173', Cookie: cookie } });
      const msgs = [];
      ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
      ws.on('open', () => resolve({ ws, msgs }));
      ws.on('error', reject);
    });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const a = await open('ckA');
    const b = await open('ckB');
    a.ws.send(JSON.stringify(pose(1, 0, 0)));
    b.ws.send(JSON.stringify(pose(1, 1, 0)));
    await wait(80);
    a.ws.send(JSON.stringify(invite('m#1', 'm2', 'high_five')));
    await wait(80);
    assert.equal(b.msgs.find((m) => m.type === 'social_invite').invite.from, 'm');
    b.ws.send(JSON.stringify({ type: 'social_respond', inviteId: 'm#1', answer: 'accept' }));
    await wait(80);
    assert.equal(a.msgs.find((m) => m.type === 'social_respond').answer, 'accept');
    a.ws.close();
    b.ws.close();
  } finally {
    world.stop();
    sock.close();
    await new Promise((r) => server.close(r));
  }
});
