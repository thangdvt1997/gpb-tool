import crypto from 'node:crypto';
import { ApiError } from './util.js';

// Token xác nhận cho sự cố khẩn: lưu trong bộ nhớ, hết hạn sau ttlMs, chỉ dùng một lần, gắn với user đã tạo.
export function createConfirmStore({ ttlMs = 60_000, maxEntries = 5_000, now = Date.now } = {}) {
  const tokens = new Map();

  function sweep() {
    const t = now();
    for (const [k, v] of tokens) {
      if (v.expiresAt <= t) tokens.delete(k);
    }
  }

  return {
    ttlSeconds: Math.round(ttlMs / 1000),

    issue(userId, payload) {
      sweep();
      if (tokens.size >= maxEntries) {
        throw new ApiError(429, 'Quá nhiều yêu cầu xác nhận đang chờ, thử lại sau ít phút');
      }
      const token = crypto.randomBytes(24).toString('hex');
      tokens.set(token, { userId, payload, expiresAt: now() + ttlMs });
      return token;
    },

    // Token bị xóa ngay khi đọc, kể cả khi hết hạn hoặc sai người dùng, nên không dùng lại được.
    take(token, userId) {
      const entry = tokens.get(token);
      if (!entry) return null;
      tokens.delete(token);
      if (entry.expiresAt <= now() || entry.userId !== userId) return null;
      return entry.payload;
    },
  };
}
