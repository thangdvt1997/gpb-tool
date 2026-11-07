import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOriginPolicy, originAllowed } from '../origin.js';
import { canView, validateBio } from '../about.js';

test('origin: mặc định cho phép gp.daisoncoop.com và localhost, chặn origin lạ', () => {
  const p = buildOriginPolicy({});
  assert.ok(originAllowed(p, 'https://gp.daisoncoop.com', 'x'));
  assert.ok(originAllowed(p, 'https://gp.daisoncoop.com/duong/dan', 'x'));
  assert.ok(originAllowed(p, 'http://localhost:5173', 'x'));
  assert.ok(!originAllowed(p, 'http://gp.daisoncoop.com', 'x'));
  assert.ok(!originAllowed(p, 'https://evil.example', 'x'));
  assert.ok(!originAllowed(p, 'null', 'x'));
  assert.ok(!originAllowed(p, 'khong-phai-url', 'x'));
  assert.ok(!originAllowed(p, 'http://localhost.evil.example', 'x'));
});

test('origin: ALLOWED_ORIGINS thay mặc định, localhost chỉ khi bật', () => {
  const p = buildOriginPolicy({ ALLOWED_ORIGINS: 'https://a.example, https://b.example:8443' });
  assert.ok(originAllowed(p, 'https://a.example', 'x'));
  assert.ok(originAllowed(p, 'https://b.example:8443', 'x'));
  assert.ok(!originAllowed(p, 'https://gp.daisoncoop.com', 'x'));
  assert.ok(!originAllowed(p, 'http://localhost:5173', 'x'));
  assert.ok(originAllowed(buildOriginPolicy({ ALLOWED_ORIGINS: 'https://a.example', ALLOW_LOCALHOST_ORIGINS: 'true' }), 'http://localhost:1', 'x'));
  assert.ok(originAllowed(p, 'http://host.internal:3001', 'host.internal:3001'));
});

test('canView và validateBio', () => {
  const a = { id: 1, tenant_id: 't1' };
  const b = { id: 2, tenant_id: 't1' };
  const c = { id: 3, tenant_id: 't2' };
  const pa = { id: 4, tenant_id: 'personal' };
  const pb = { id: 5, tenant_id: 'personal' };
  assert.ok(canView('self', a, a));
  assert.ok(!canView('self', b, a));
  assert.ok(canView('colleagues', b, a));
  assert.ok(!canView('colleagues', c, a));
  assert.ok(!canView('colleagues', pa, pb), 'tenant personal không phải đồng nghiệp');
  assert.ok(canView('everyone', c, a));
  assert.equal(validateBio('  a   b '), 'a b');
  assert.throws(() => validateBio(5));
});
