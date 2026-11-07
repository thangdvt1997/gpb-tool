// TASK 27: mạng chập chờn qua ws thật trên 127.0.0.1: ngắt đột ngột (không bắt tay đóng), token dùng một lần,
// token hết hạn -> snapshot đầy đủ, khung hỏng giữa chừng, người khác thấy leave rồi join lại.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import WebSocket from 'ws';
import { loadConfig } from '../src/config.js';
import { createHub } from '../src/hub.js';
import { createPresenceStore } from '../src/presence.js';
import { createRateLimiter } from '../src/rateLimit.js';
import { createEventLog, createSessions } from '../src/sessions.js';
import { createWorld } from '../src/world.js';
import { attachWorldSocket } from '../src/wsServer.js';
import { MEMBER, MEMBER2, pose } from './helpers.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 2000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await wait(15);
  }
  throw new Error('hết thời gian chờ điều kiện');
};

async function boot({ resumeTtlMs = 120_000 } = {}) {
  const presence = createPresenceStore({ ttlMs: 15_000, maxPerTenant: 50 });
  const hub = createHub({ maxClients: 20, maxPerUser: 2, maxBufferBytes: 1 << 20 });
  const world = createWorld({
    presence,
    limiter: createRateLimiter({ capacity: 10, refillPerSec: 10 }),
    hub,
    sessions: createSessions({ resumeTtlMs }),
    eventLog: createEventLog({ max: 500 }),
  });
  const users = { ckA: MEMBER, ckB: MEMBER2 };
  const authClient = { fetchUser: async (c) => users[c] || null, verify: async (c) => users[c] || null };
  const server = http.createServer();
  const sock = attachWorldSocket({ server, config: loadConfig({}), world, hub, authClient });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const open = (cookie, query = '') =>
    new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/api/world/ws${query}`, { headers: { Origin: 'http://localhost:5173', Cookie: cookie } });
      const msgs = [];
      ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
      ws.on('open', () => resolve({ ws, msgs, send: (m) => ws.send(JSON.stringify(m)) }));
      ws.on('error', reject);
    });
  const close = async () => {
    world.stop();
    sock.close();
    await new Promise((r) => server.close(r));
  };
  return { open, close, world, hub, port };
}
const resumeQ = (snap, last) => `?resume=${encodeURIComponent(snap.session.resumeToken)}&last=${last}`;

test('ngắt đột ngột giữa chừng: người khác thấy leave, quay lại bằng token giữ ghế và nhận chat bị lỡ; token chỉ dùng một lần', async () => {
  const { open, close } = await boot();
  try {
    const a = await open('ckA');
    const b = await open('ckB');
    await until(() => a.msgs.find((m) => m.type === 'snapshot'));
    const snap = a.msgs.find((m) => m.type === 'snapshot');
    a.send(pose(1, -4, 3));
    b.send(pose(1, 2, 2));
    a.send({ type: 'lease.acquire', resource: 'seat:s1', requestId: 'r1' });
    const lease = await until(() => a.msgs.find((m) => m.type === 'lease'));
    // Ngắt kiểu mất mạng: hủy socket, không có khung đóng.
    a.ws.terminate();
    await until(() => b.msgs.find((m) => m.type === 'leave' && m.id === 'm' && m.reason === 'disconnect'));
    b.send({ type: 'chat', channel: 'room', text: 'quay lại đi', clientMsgId: 'c1' });
    await until(() => b.msgs.find((m) => m.type === 'chat.ack'));
    const a2 = await open('ckA', resumeQ(snap, lease.eseq));
    const s2 = await until(() => a2.msgs.find((m) => m.type === 'snapshot'));
    assert.equal(s2.resumed.ok, true);
    assert.deepEqual(s2.resumed.restored, ['seat:s1']);
    assert.equal(s2.resumed.full, false);
    assert.deepEqual(s2.resumed.events.map((e) => e.type), ['chat']);
    assert.equal(s2.resumed.spawn.x, -4);
    assert.notEqual(s2.session.resumeToken, snap.session.resumeToken);
    // Token cũ đã bị xoay: dùng lại (kẻ phát lại hoặc tab cũ) không được.
    a2.ws.close();
    await wait(50);
    const replay = await open('ckA', resumeQ(snap, lease.eseq));
    const s3 = await until(() => replay.msgs.find((m) => m.type === 'snapshot'));
    assert.equal(s3.resumed.ok, false);
    assert.equal(s3.resumed.full, true);
    replay.ws.close();
    b.ws.close();
  } finally {
    await close();
  }
});

test('token hết hạn: snapshot đầy đủ (full), ghế đã nhả, người khác ngồi được', async () => {
  const { open, close, world } = await boot({ resumeTtlMs: 150 });
  try {
    const a = await open('ckA');
    const b = await open('ckB');
    const snap = await until(() => a.msgs.find((m) => m.type === 'snapshot'));
    a.send(pose(1, -4, 3));
    b.send(pose(1, 2, 2));
    a.send({ type: 'lease.acquire', resource: 'seat:s1', requestId: 'r1' });
    await until(() => a.msgs.find((m) => m.type === 'lease'));
    a.ws.terminate();
    await until(() => b.msgs.find((m) => m.type === 'leave' && m.id === 'm'));
    await wait(250); // quá hạn token (150 ms)
    const a2 = await open('ckA', resumeQ(snap, 0));
    const s2 = await until(() => a2.msgs.find((m) => m.type === 'snapshot'));
    assert.equal(s2.resumed.ok, false);
    assert.equal(s2.resumed.reason, 'expired');
    assert.equal(s2.resumed.full, true);
    assert.equal(s2.leases.some((l) => l.ownerId === 'm'), false);
    assert.equal(s2.players.length, 1); // trạng thái phòng đủ trong snapshot (chỉ b)
    assert.ok(world.getTick() >= 0);
    b.send({ type: 'lease.acquire', resource: 'seat:s1', requestId: 'r2' });
    const res = await until(() => b.msgs.find((m) => m.type === 'lease.result' && m.requestId === 'r2'));
    assert.equal(res.ok, true);
    a2.ws.close();
    b.ws.close();
  } finally {
    await close();
  }
});

test('khung hỏng giữa chừng: JSON cụt báo lỗi nhưng giữ kết nối; khung quá lớn đóng 1009; flood đóng 1008', async () => {
  const { open, close } = await boot();
  try {
    const a = await open('ckA');
    await until(() => a.msgs.find((m) => m.type === 'snapshot'));
    a.ws.send('{"type":"pose","v":1,"seq":');
    const err = await until(() => a.msgs.find((m) => m.type === 'error' && m.code === 'invalid_json'));
    assert.ok(err);
    a.send({ type: 'ping', t: 1 });
    await until(() => a.msgs.find((m) => m.type === 'pong'));
    const closed = new Promise((r) => a.ws.on('close', (code) => r(code)));
    a.ws.send('x'.repeat(5000));
    assert.equal(await closed, 1009);

    const f = await open('ckB');
    await until(() => f.msgs.find((m) => m.type === 'snapshot'));
    const fc = new Promise((r) => f.ws.on('close', (code) => r(code)));
    for (let i = 0; i < 80; i++) f.send({ type: 'ping', t: i });
    assert.equal(await fc, 1008);
  } finally {
    await close();
  }
});

test('TCP bị cắt cứng (socket.destroy phía client): server dọn kết nối, presence rời, vào lại bình thường', async () => {
  const { open, close, hub } = await boot();
  try {
    const a = await open('ckA');
    await until(() => a.msgs.find((m) => m.type === 'snapshot'));
    a.send(pose(1, 0, 0));
    await until(() => a.msgs.find((m) => m.type === 'ack'));
    assert.equal(hub.size(), 1);
    a.ws._socket.destroy();
    await until(() => hub.size() === 0);
    const again = await open('ckA');
    const s = await until(() => again.msgs.find((m) => m.type === 'snapshot'));
    assert.equal(s.resumed ?? null, null); // không token: phiên sạch
    again.ws.close();
  } finally {
    await close();
  }
});

test('nửa mở: client mở TCP, gửi nửa bắt tay HTTP rồi im lặng không làm treo server', async () => {
  const { open, close, port } = await boot();
  const half = net.connect(port, '127.0.0.1');
  try {
    await new Promise((r) => half.once('connect', r));
    half.write('GET /api/world/ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\n');
    const a = await open('ckA');
    assert.ok(await until(() => a.msgs.find((m) => m.type === 'snapshot')));
    a.ws.close();
  } finally {
    half.destroy();
    await close();
  }
});
