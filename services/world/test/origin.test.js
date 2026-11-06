import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUser } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import { isAllowedOrigin } from '../src/origin.js';

const prod = loadConfig({ NODE_ENV: 'production' });
const dev = loadConfig({});

test('production: chỉ gp.daisoncoop.com qua https', () => {
  assert.equal(isAllowedOrigin('https://gp.daisoncoop.com', prod), true);
  assert.equal(isAllowedOrigin('https://gp.daisoncoop.com:443', prod), true);
  assert.equal(isAllowedOrigin('http://gp.daisoncoop.com', prod), false);
  assert.equal(isAllowedOrigin('https://gp.daisoncoop.com.evil.com', prod), false);
  assert.equal(isAllowedOrigin('https://evil.com', prod), false);
  assert.equal(isAllowedOrigin('http://localhost:5173', prod), false);
  assert.equal(isAllowedOrigin(undefined, prod), false);
  assert.equal(isAllowedOrigin('null', prod), false);
  assert.equal(isAllowedOrigin('not a url', prod), false);
});

test('phát triển: thêm localhost và 127.0.0.1 qua http', () => {
  assert.equal(isAllowedOrigin('http://localhost:5173', dev), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:18081', dev), true);
  assert.equal(isAllowedOrigin('http://localhost.evil.com', dev), false);
  const forced = loadConfig({ NODE_ENV: 'production', WORLD_ALLOW_LOCALHOST: '1' });
  assert.equal(isAllowedOrigin('http://localhost:5173', forced), true);
});

test('ALLOWED_ORIGINS thêm origin, vẫn giữ mặc định', () => {
  const cfg = loadConfig({ NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://staging.example.com/ , ' });
  assert.equal(isAllowedOrigin('https://staging.example.com', cfg), true);
  assert.equal(isAllowedOrigin('https://gp.daisoncoop.com', cfg), true);
});

test('normalizeUser chỉ giữ id, tên, tenant; thiếu tenant thì từ chối', () => {
  const u = normalizeUser({
    ok: true,
    user: { id: 7, email: 'a@b.c', name: ' An\u0007 ', role: 'admin', tenant: { id: 3, name: 'X' } },
  });
  assert.deepEqual(u, { id: '7', name: 'An', tenantId: '3' });
  assert.equal(normalizeUser({ ok: true, user: { id: 7, name: 'An' } }), null);
  assert.equal(normalizeUser({ ok: false }), null);
});
