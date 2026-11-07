import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createApp } from '../src/app.js';
import { createTurnIssuer, loadTurnConfig } from '../src/turn.js';

const USER = { id: 'u7', name: 'An', tenantId: 't1' };
const URLS = ['turn:turn.example.com:3478?transport=udp', 'turn:turn.example.com:3478?transport=tcp'];

test('loadTurnConfig: lọc URL sai, kẹp TTL', () => {
  const c = loadTurnConfig({ TURN_SECRET: 's', TURN_URLS: ' turn:a:3478 , http://x, turns:b:5349 ', TURN_TTL_SEC: '999999' });
  assert.deepEqual(c.urls, ['turn:a:3478', 'turns:b:5349']);
  assert.equal(c.ttlSec, 3600);
  assert.equal(loadTurnConfig({}).ttlSec, 600);
});

test('issue: username có hạn, credential là HMAC-SHA1 base64', () => {
  const t = createTurnIssuer({ secret: 'k', urls: URLS, ttlSec: 600, now: () => 1_000_000_000 });
  const { iceServers, ttlSec } = t.issue({ id: 'a:b c' });
  assert.equal(ttlSec, 600);
  const [s] = iceServers;
  assert.equal(s.username, '1000600:a_b_c');
  assert.equal(s.credential, createHmac('sha1', 'k').update(s.username).digest('base64'));
  assert.deepEqual(s.urls, URLS);
  assert.equal(JSON.stringify(iceServers).includes('"k"'), false);
});

test('không cấu hình thì không cấp', () => {
  assert.equal(createTurnIssuer({ secret: '', urls: URLS }).issue(USER), null);
  assert.equal(createTurnIssuer({ secret: 'k', urls: [] }).enabled, false);
});

async function withApp(turn, authUser, fn) {
  const app = createApp({
    world: { getTick: () => 0, snapshot: () => ({}) },
    hub: { size: () => 0 },
    presence: { stats: () => ({ players: 0 }) },
    authClient: { verify: async () => authUser },
    turn,
  });
  const server = await new Promise((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test('GET /api/world/turn: 401 khi chưa đăng nhập', async () => {
  const turn = createTurnIssuer({ secret: 'k', urls: URLS });
  await withApp(turn, null, async (base) => {
    const res = await fetch(`${base}/api/world/turn`);
    assert.equal(res.status, 401);
  });
});

test('GET /api/world/turn: 200 có iceServers, no-store; 503 khi thiếu cấu hình', async () => {
  const turn = createTurnIssuer({ secret: 'k', urls: URLS });
  await withApp(turn, USER, async (base) => {
    const res = await fetch(`${base}/api/world/turn`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.match(body.iceServers[0].username, /^\d+:u7$/);
  });
  await withApp(createTurnIssuer({ secret: '', urls: [] }), USER, async (base) => {
    const res = await fetch(`${base}/api/world/turn`);
    assert.equal(res.status, 503);
  });
});
