// Token bucket theo khóa (userId), trong bộ nhớ. Thời gian truyền vào để test không cần đồng hồ thật.

export function createRateLimiter({ capacity, refillPerSec, idleMs = 60_000 }) {
  const buckets = new Map();

  /** Lấy một token. Trả {ok, retryAfterMs}. */
  function take(key, now) {
    let b = buckets.get(key);
    if (!b) {
      b = { tokens: capacity, at: now };
      buckets.set(key, b);
    } else {
      const elapsed = Math.max(0, now - b.at) / 1000;
      b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerSec);
      b.at = now;
    }
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return { ok: true, retryAfterMs: 0 };
    }
    return { ok: false, retryAfterMs: Math.ceil(((1 - b.tokens) / refillPerSec) * 1000) };
  }

  // Bỏ bucket đã đầy và không dùng lâu để Map không lớn mãi.
  function prune(now) {
    for (const [key, b] of buckets) {
      if (now - b.at > idleMs) buckets.delete(key);
    }
  }

  return { take, prune, size: () => buckets.size };
}
