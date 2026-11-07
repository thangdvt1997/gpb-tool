// Presence và pose trong bộ nhớ, tách theo tenant.
// Giới hạn: mất khi restart; nhiều tiến trình không chia sẻ trạng thái (chỉ chạy một instance).

import { authorizePose } from './pose.js';

export class PresenceError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// Dữ liệu công khai cho người cùng tenant: chỉ id, tên hiển thị và pose.
// `look` (ngoại hình đã lọc) chỉ kèm khi có và cần phát.
export function publicEntry(e, look) {
  const out = { id: e.id, name: e.name, x: e.x, z: e.z, yaw: e.yaw, anim: e.anim, seq: e.seq, t: e.at };
  if (look) out.appearance = look;
  return out;
}

export function createPresenceStore({ ttlMs, maxPerTenant }) {
  // tenantId -> Map(userId -> entry)
  const tenants = new Map();
  // tenantId -> Set(userId) có pose mới chưa phát
  const dirty = new Map();
  // tenantId -> Map(userId -> ngoại hình đã lọc). Sống qua TTL pose, mất khi người đó rời.
  const looks = new Map();
  // tenantId -> Set(userId) có ngoại hình mới chưa phát trong poses.
  const lookDirty = new Map();

  function room(tenantId, create) {
    let m = tenants.get(tenantId);
    if (!m && create) {
      m = new Map();
      tenants.set(tenantId, m);
    }
    return m;
  }

  function markDirty(tenantId, userId) {
    let s = dirty.get(tenantId);
    if (!s) {
      s = new Set();
      dirty.set(tenantId, s);
    }
    s.add(userId);
  }

  const lookOf = (tenantId, userId) => looks.get(tenantId)?.get(userId);

  /** Lưu ngoại hình đã lọc. Ném PresenceError 'room_full' nếu tenant đã đủ chỗ cho người mới. */
  function setAppearance(user, look) {
    let lm = looks.get(user.tenantId);
    if (!lm) looks.set(user.tenantId, (lm = new Map()));
    if (!lm.has(user.id) && lm.size >= maxPerTenant) throw new PresenceError('room_full');
    lm.set(user.id, look);
    let ld = lookDirty.get(user.tenantId);
    if (!ld) lookDirty.set(user.tenantId, (ld = new Set()));
    ld.add(user.id);
    if (room(user.tenantId, false)?.has(user.id)) markDirty(user.tenantId, user.id);
  }

  function appearanceOf(tenantId, userId) {
    return lookOf(tenantId, userId) || null;
  }

  /**
   * Ghi pose đã parse cho user. Trả {created, entry, corrected}.
   * Ném PresenceError: 'stale_seq' (seq không tăng), 'room_full'.
   */
  function update(user, pose, now) {
    const m = room(user.tenantId, true);
    const prev = m.get(user.id);
    if (!prev && m.size >= maxPerTenant) throw new PresenceError('room_full');
    // Gói trùng hoặc đến muộn hơn gói đã nhận bị bỏ. Presence mới (sau khi hết hạn) nhận seq bất kỳ.
    if (prev && pose.seq <= prev.seq) throw new PresenceError('stale_seq');
    const accepted = authorizePose(prev ? { x: prev.x, z: prev.z, at: prev.at } : null, pose, now);
    const entry = {
      id: user.id,
      name: user.name,
      x: accepted.x,
      z: accepted.z,
      yaw: accepted.yaw,
      anim: accepted.anim,
      seq: accepted.seq,
      at: now,
    };
    m.set(user.id, entry);
    if (!prev && lookOf(user.tenantId, user.id)) {
      let ld = lookDirty.get(user.tenantId);
      if (!ld) lookDirty.set(user.tenantId, (ld = new Set()));
      ld.add(user.id);
    }
    markDirty(user.tenantId, user.id);
    return { created: !prev, entry, corrected: accepted.corrected, appearance: lookOf(user.tenantId, user.id) || null };
  }

  /** Người dùng chủ động rời. Trả true nếu có presence. */
  function remove(tenantId, userId) {
    const m = room(tenantId, false);
    looks.get(tenantId)?.delete(userId);
    if (looks.get(tenantId)?.size === 0) looks.delete(tenantId);
    lookDirty.get(tenantId)?.delete(userId);
    if (!m || !m.delete(userId)) return false;
    dirty.get(tenantId)?.delete(userId);
    if (m.size === 0) tenants.delete(tenantId);
    return true;
  }

  /** Xóa presence quá hạn. Trả [{tenantId, id}] đã xóa. */
  function sweep(now) {
    const expired = [];
    for (const [tenantId, m] of tenants) {
      for (const [id, e] of m) {
        if (now - e.at > ttlMs) {
          m.delete(id);
          dirty.get(tenantId)?.delete(id);
          expired.push({ tenantId, id });
        }
      }
      if (m.size === 0) tenants.delete(tenantId);
    }
    return expired;
  }

  /** Pose hiện tại của một người (bản sao công khai) hoặc null. */
  function get(tenantId, userId) {
    const e = room(tenantId, false)?.get(userId);
    return e ? publicEntry(e, lookOf(tenantId, userId)) : null;
  }

  function list(tenantId) {
    const m = room(tenantId, false);
    return m ? [...m.values()].map((e) => publicEntry(e, lookOf(tenantId, e.id))) : [];
  }

  /** Lấy và xóa danh sách pose chưa phát: Map(tenantId -> [publicEntry]). */
  function drainDirty() {
    const out = new Map();
    for (const [tenantId, ids] of dirty) {
      const m = room(tenantId, false);
      const poses = [];
      if (m) for (const id of ids) {
        const e = m.get(id);
        if (e) poses.push(publicEntry(e, lookDirty.get(tenantId)?.has(id) ? lookOf(tenantId, id) : undefined));
      }
      if (poses.length) out.set(tenantId, poses);
    }
    dirty.clear();
    lookDirty.clear();
    return out;
  }

  function stats() {
    let players = 0;
    for (const m of tenants.values()) players += m.size;
    return { tenants: tenants.size, players };
  }

  return { update, setAppearance, appearanceOf, remove, sweep, get, list, drainDirty, stats };
}
