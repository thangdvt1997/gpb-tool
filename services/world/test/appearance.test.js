// Ngoại hình: lọc whitelist, giới hạn, phát qua snapshot/join/poses; thêm một ca ws thật.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';
import { loadConfig, TICK_MS } from '../src/config.js';
import { sanitizeAppearance, DEFAULT_APPEARANCE } from '../src/appearance.js';
import { createHub } from '../src/hub.js';
import { createPresenceStore } from '../src/presence.js';
import { createRateLimiter } from '../src/rateLimit.js';
import { createWorld } from '../src/world.js';
import { attachWorldSocket } from '../src/wsServer.js';
import { MEMBER, MEMBER2, mk, pose, setup } from './helpers.js';

const LOOK = { bodyType: 'broad', skinTone: 3, hairStyle: 'bun', hairColor: '#AABBCC', eyeColor: '#112233', outfit: 'blazer', topColor: '#ff0000', bottomColor: '#00ff00', shoes: 'heels', accessories: ['watch', 'glasses', 'watch'] };

test('sanitize: whitelist trường, sửa giá trị sai, khử trùng lặp phụ kiện', () => {
  const r = sanitizeAppearance({ ...LOOK, evil: '<script>', __proto__: { x: 1 }, outfit: 'nope', hairColor: 'red' });
  assert.deepEqual(Object.keys(r).sort(), Object.keys(DEFAULT_APPEARANCE).sort());
  assert.equal(r.outfit, DEFAULT_APPEARANCE.outfit);
  assert.equal(r.hairColor, DEFAULT_APPEARANCE.hairColor);
  assert.equal(r.topColor, '#ff0000');
  assert.deepEqual(r.accessories, ['glasses', 'watch']);
  assert.equal(sanitizeAppearance({ ...LOOK, topColor: '#ABCDEF' }).topColor, '#abcdef');
  for (const bad of [null, 5, 'x', [], undefined]) assert.equal(sanitizeAppearance(bad), null);
  assert.equal(sanitizeAppearance({ ...LOOK, pad: 'x'.repeat(700) }), null);
  assert.deepEqual(sanitizeAppearance({}), DEFAULT_APPEARANCE);
  assert.equal(sanitizeAppearance({ skinTone: 9 }).skinTone, DEFAULT_APPEARANCE.skinTone);
});

test('gửi trước pose: join, snapshot cho người vào sau và poses đều mang ngoại hình đã lọc', () => {
  const { a, b, world, connect } = (() => {
    const s = setup();
    return { ...s, a: s.connect(MEMBER), b: s.connect(MEMBER2) };
  })();
  b.send(pose(1, 1, 0));
  a.send({ type: 'appearance', appearance: LOOK, requestId: 'r1' });
  const ack = a.conn.last('appearance.ack');
  assert.equal(ack.requestId, 'r1');
  assert.equal(ack.appearance.hairColor, '#aabbcc');
  a.send(pose(1, 0, 0));
  assert.equal(b.conn.last('join').appearance.outfit, 'blazer');
  world.step();
  const poses = b.conn.last('poses').poses;
  assert.equal(poses.find((p) => p.id === 'm').appearance.shoes, 'heels');
  // tick sau không lặp lại ngoại hình
  a.send(pose(2, 0.1, 0));
  world.step();
  assert.equal(b.conn.last('poses').poses.find((p) => p.id === 'm').appearance, undefined);
  const c = connect(mk('c', 'employee'));
  assert.equal(c.snap.players.find((p) => p.id === 'm').appearance.bodyType, 'broad');
  assert.equal(c.snap.players.find((p) => p.id === 'm2').appearance, undefined);
});

test('đổi khi đang online được phát trong poses; không bị xóa khi hết TTL pose, mất khi rời', () => {
  const { a, b, world, presence, clock } = (() => {
    const s = setup();
    return { ...s, a: s.connect(MEMBER), b: s.connect(MEMBER2) };
  })();
  a.send(pose(1, 0, 0));
  b.send(pose(1, 1, 0));
  world.step();
  a.send({ type: 'appearance', appearance: { ...LOOK, outfit: 'tuxedo' } });
  world.step();
  assert.equal(b.conn.last('poses').poses.find((p) => p.id === 'm').appearance.outfit, 'tuxedo');
  clock.t += 20_000;
  world.step(); // hết TTL pose
  assert.equal(presence.list('t1').length, 0);
  a.send(pose(9, 0, 0));
  assert.equal(presence.list('t1').find((p) => p.id === 'm').appearance.outfit, 'tuxedo');
  a.send({ type: 'leave' });
  assert.equal(presence.appearanceOf('t1', 'm'), null);
});

test('từ chối đầu vào xấu và giới hạn tần suất; không lộ sang tenant khác', () => {
  const { a, connect } = (() => {
    const s = setup();
    return { ...s, a: s.connect(MEMBER) };
  })();
  a.send({ type: 'appearance', appearance: 'str' });
  assert.equal(a.conn.last('error').code, 'invalid_appearance');
  a.send({ type: 'appearance', appearance: { ...LOOK, pad: 'x'.repeat(700) } });
  assert.equal(a.conn.all('error').length, 2);
  for (let i = 0; i < 4; i += 1) a.send({ type: 'appearance', appearance: LOOK });
  assert.equal(a.conn.all('appearance.ack').length, 1); // tin lỗi cũng tốn lượt
  assert.equal(a.conn.last('error').code, 'rate_limited');
  const other = connect(mk('x', 'employee', 't2'));
  other.send(pose(1, 0, 0));
  assert.equal(other.snap.players.length, 0);
});

test('ws thật: ngoại hình đi từ người này sang người kia qua 127.0.0.1', async () => {
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
    world.start();
    const a = await open('ckA');
    const b = await open('ckB');
    b.ws.send(JSON.stringify(pose(1, 1, 0)));
    a.ws.send(JSON.stringify({ type: 'appearance', appearance: { ...LOOK, evil: 1 } }));
    a.ws.send(JSON.stringify(pose(1, 0, 0)));
    await wait(TICK_MS * 4 + 100);
    const seen = [...b.msgs.filter((m) => m.type === 'join'), ...b.msgs.filter((m) => m.type === 'poses').flatMap((m) => m.poses)].find((x) => x.id === 'm' && x.appearance);
    assert.ok(seen, 'B nhận được ngoại hình của A');
    assert.equal(seen.appearance.evil, undefined);
    assert.equal(seen.appearance.outfit, 'blazer');
    assert.equal(a.msgs.find((m) => m.type === 'appearance.ack').appearance.skinTone, 3);
    a.ws.close();
    b.ws.close();
  } finally {
    world.stop();
    sock.close();
    await new Promise((r) => server.close(r));
  }
});
