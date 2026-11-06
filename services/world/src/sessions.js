// TASK 27: phiên có resume token (có hạn, dùng một lần, gắn danh tính) và nhật ký sự kiện tin cậy theo phòng.
// Token KHÔNG thay cookie: cookie vẫn là danh tính (playerId = user.id do auth xác nhận). Token chứng minh
// "đây là phiên trước của chính người này" để lấy lại lease trong ân hạn và nhận phần sự kiện bị lỡ.

import { randomBytes, timingSafeEqual } from 'node:crypto';

const same = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

export function createSessions({ resumeTtlMs }) {
  const map = new Map(); // `${tenant}:${user}` -> {id, token, connected, expiresAt, lost, lastPose}
  const k = (user) => `${user.tenantId}:${user.id}`;

  /** Kiểm token. Trả {ok:true, session} hoặc {ok:false, reason}. */
  function validate(user, token, now) {
    const s = map.get(k(user));
    if (!s || typeof token !== 'string' || !same(s.token, token)) return { ok: false, reason: 'invalid' };
    if (!s.connected && now >= s.expiresAt) return { ok: false, reason: 'expired' };
    return { ok: true, session: s };
  }

  /** Cấp phiên (xoay token mỗi lần kết nối). Giữ id và danh sách lease mất nếu tiếp tục phiên cũ. */
  function issue(user, now, keepFrom) {
    const id = keepFrom ? keepFrom.id : randomBytes(9).toString('base64url');
    const s = {
      id,
      token: randomBytes(24).toString('base64url'),
      connected: true,
      expiresAt: Infinity,
      lost: [],
      lastPose: keepFrom ? keepFrom.lastPose : null,
    };
    map.set(k(user), s);
    return s;
  }

  function markDisconnected(user, now, lastPose) {
    const s = map.get(k(user));
    if (!s) return;
    s.connected = false;
    s.expiresAt = now + resumeTtlMs;
    if (lastPose) s.lastPose = lastPose;
  }

  function noteLost(user, resource, reason) {
    const s = map.get(k(user));
    if (s && s.lost.length < 20) s.lost.push({ resource, reason });
  }

  function drop(user) {
    map.delete(k(user));
  }

  function sweep(now) {
    for (const [key, s] of map) if (!s.connected && now >= s.expiresAt) map.delete(key);
  }

  return { validate, issue, markDisconnected, noteLost, drop, sweep, size: () => map.size };
}

export function createEventLog({ max }) {
  const tenants = new Map(); // tenant -> {seq, ring: []}
  const T = (id) => {
    let t = tenants.get(id);
    if (!t) tenants.set(id, (t = { seq: 0, ring: [] }));
    return t;
  };

  /** Gán eseq tăng dần, lưu và trả tin đã gắn eseq. */
  function append(tenantId, msg) {
    const t = T(tenantId);
    t.seq += 1;
    const out = { ...msg, eseq: t.seq };
    t.ring.push(out);
    if (t.ring.length > max) t.ring.shift();
    return out;
  }

  const current = (tenantId) => tenants.get(tenantId)?.seq || 0;

  /**
   * Sự kiện sau `last`. Trả {full:false, events} nếu bù được; {full:true, events:[]} nếu khoảng trống
   * lớn hơn nhật ký, last vô lý (server đã restart, last > seq hiện tại) hoặc last không hợp lệ.
   */
  function since(tenantId, last) {
    const t = tenants.get(tenantId);
    const cur = t ? t.seq : 0;
    if (!Number.isInteger(last) || last < 0 || last > cur) return { full: true, events: [] };
    if (last === cur) return { full: false, events: [] };
    const oldest = t.ring.length ? t.ring[0].eseq : cur + 1;
    if (last < oldest - 1) return { full: true, events: [] };
    return { full: false, events: t.ring.filter((e) => e.eseq > last) };
  }

  return { append, current, since };
}
