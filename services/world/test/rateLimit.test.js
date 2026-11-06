import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../src/rateLimit.js';

test('cho tối đa 10 lần liền, lần 11 bị chặn kèm thời gian chờ', () => {
  const rl = createRateLimiter({ capacity: 10, refillPerSec: 10 });
  for (let i = 0; i < 10; i++) assert.equal(rl.take('u1', 0).ok, true);
  const r = rl.take('u1', 0);
  assert.equal(r.ok, false);
  assert.equal(r.retryAfterMs, 100);
});

test('nạp lại theo thời gian, không vượt dung lượng', () => {
  const rl = createRateLimiter({ capacity: 10, refillPerSec: 10 });
  for (let i = 0; i < 10; i++) rl.take('u1', 0);
  assert.equal(rl.take('u1', 50).ok, false);
  assert.equal(rl.take('u1', 100).ok, true);
  // Nghỉ 10 giây vẫn chỉ được 10 lần liền.
  let n = 0;
  while (rl.take('u1', 10_100).ok) n++;
  assert.equal(n, 10);
});

test('tốc độ ổn định 10 lần mỗi giây được chấp nhận, 20 lần mỗi giây bị chặn một nửa', () => {
  const rl = createRateLimiter({ capacity: 10, refillPerSec: 10 });
  let ok10 = 0;
  for (let t = 0; t < 5000; t += 100) if (rl.take('a', t).ok) ok10++;
  assert.equal(ok10, 50);
  const rl2 = createRateLimiter({ capacity: 10, refillPerSec: 10 });
  let ok20 = 0;
  for (let t = 0; t < 5000; t += 50) if (rl2.take('b', t).ok) ok20++;
  // 10 token ban đầu + 10/s trong 5 s, cộng một chút do làm tròn.
  assert.ok(ok20 >= 59 && ok20 <= 61, `ok20=${ok20}`);
});

test('khóa tách biệt và prune xóa bucket lâu không dùng', () => {
  const rl = createRateLimiter({ capacity: 1, refillPerSec: 1, idleMs: 1000 });
  assert.equal(rl.take('a', 0).ok, true);
  assert.equal(rl.take('a', 0).ok, false);
  assert.equal(rl.take('b', 0).ok, true);
  rl.prune(5000);
  assert.equal(rl.size(), 0);
});
