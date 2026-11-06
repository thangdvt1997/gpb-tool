// TASK 25a: chat chữ theo phòng (cả tenant) và theo khoảng cách (bán kính quanh người gửi).
// Server quyết định người nhận; client không tự lọc kênh. Chỉ kênh 'room' có lịch sử ngắn trong RAM;
// kênh 'near' không lưu (riêng tư theo vị trí). Thoại theo khoảng cách: CHƯA làm (cần TURN/SFU).

import { findBlocked } from './profanity.js';
import { createRateLimiter } from './rateLimit.js';

export const CHAT = {
  maxChars: 250, // 250 ký tự tiếng Việt <= ~750 byte, còn vừa khung 1 KB của WS
  nearRadius: 10, // mét
  history: 100, // tin kênh room giữ mỗi phòng
  rate: { capacity: 5, refillPerSec: 0.5 }, // burst 5, bền vững 1 tin / 2 giây
  maxBlocks: 100,
  dedupe: 64,
};

// Bỏ ký tự điều khiển, ký tự định hướng/độ rộng bằng 0 (dùng để giả mạo hiển thị). Server không bao giờ gửi HTML.
export function sanitizeText(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .normalize('NFC')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function createChat({ now = Date.now, config = CHAT } = {}) {
  const limiter = createRateLimiter(config.rate);
  const tenants = new Map(); // tenant -> {n, hist: [], dedupe: Map(userId -> Map(clientMsgId -> msg))}
  const blocks = new Map(); // `${tenant}:${user}` -> Set(userId bị chặn)

  const T = (id) => {
    let t = tenants.get(id);
    if (!t) tenants.set(id, (t = { n: 0, hist: [], dedupe: new Map() }));
    return t;
  };

  function isBlockedBy(tenantId, receiverId, senderId) {
    return Boolean(blocks.get(`${tenantId}:${receiverId}`)?.has(senderId));
  }

  /** Bật/tắt chặn một người. Chỉ ảnh hưởng thứ mình nhận. */
  function setBlock(user, targetId, on) {
    if (typeof targetId !== 'string' || !targetId || targetId === user.id) return { ok: false, error: 'invalid_target' };
    const key = `${user.tenantId}:${user.id}`;
    let s = blocks.get(key);
    if (!s) blocks.set(key, (s = new Set()));
    if (on) {
      if (!s.has(targetId) && s.size >= config.maxBlocks) return { ok: false, error: 'too_many_blocks' };
      s.add(targetId);
    } else s.delete(targetId);
    return { ok: true, blocked: [...s] };
  }

  /**
   * Chuẩn bị tin. Kiểm: kênh, độ dài, từ cấm, rate limit, trùng clientMsgId. Quyền gửi (can) kiểm ở nơi gọi.
   * Trả {ok, msg, duplicate?} hoặc {ok:false, error, retryAfterMs?}.
   */
  function prepare(user, { channel, text, clientMsgId }) {
    if (channel !== 'room' && channel !== 'near') return { ok: false, error: 'invalid_channel' };
    if (typeof clientMsgId !== 'string' || clientMsgId.length < 1 || clientMsgId.length > 40) return { ok: false, error: 'invalid_message' };
    const t = T(user.tenantId);
    const prev = t.dedupe.get(user.id)?.get(clientMsgId);
    if (prev) return { ok: true, msg: prev, duplicate: true };
    const clean = sanitizeText(text);
    if (!clean) return { ok: false, error: 'empty' };
    if (Array.from(clean).length > config.maxChars) return { ok: false, error: 'too_long' };
    if (findBlocked(clean)) return { ok: false, error: 'content_rejected' };
    const rl = limiter.take(`${user.tenantId}:${user.id}`, now());
    if (!rl.ok) return { ok: false, error: 'rate_limited', retryAfterMs: rl.retryAfterMs };
    t.n += 1;
    // senderId/tên do server xác nhận từ phiên, không lấy từ payload.
    const msg = { id: `m${t.n}`, channel, from: { id: user.id, name: user.name }, text: clean, at: now() };
    let d = t.dedupe.get(user.id);
    if (!d) t.dedupe.set(user.id, (d = new Map()));
    d.set(clientMsgId, msg);
    if (d.size > config.dedupe) d.delete(d.keys().next().value);
    if (channel === 'room') {
      t.hist.push(msg);
      if (t.hist.length > config.history) t.hist.shift();
    }
    return { ok: true, msg };
  }

  /** Lịch sử kênh room: tin có số thứ tự < beforeN (nếu có), tối đa limit, bỏ người đã chặn. Cũ trước. */
  function history(user, { beforeId, limit } = {}) {
    const t = tenants.get(user.tenantId);
    if (!t) return [];
    const num = (id) => Number(String(id).slice(1));
    let list = t.hist;
    if (typeof beforeId === 'string' && /^m\d+$/.test(beforeId)) list = list.filter((m) => num(m.id) < num(beforeId));
    list = list.filter((m) => !isBlockedBy(user.tenantId, user.id, m.from.id));
    const n = Math.max(1, Math.min(50, Number.isInteger(limit) ? limit : 30));
    return list.slice(-n);
  }

  function prune() {
    limiter.prune(now());
  }

  return { prepare, history, setBlock, isBlockedBy, prune };
}
