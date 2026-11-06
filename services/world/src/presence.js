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
export function publicEntry(e) {
  return { id: e.id, name: e.name, x: e.x, z: e.z, yaw: e.yaw, anim: e.anim, seq: e.seq, t: e.at };
}

export function createPresenceStore({ ttlMs, maxPerTenant }) {
  // tenantId -> Map(userId -> entry)
  const tenants = new Map();
  // tenantId -> Set(userId) có pose mới chưa phát
  const dirty = new Map();

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
    markDirty(user.tenantId, user.id);
    return { created: !prev, entry, corrected: accepted.corrected };
  }

  /** Người dùng chủ động rời. Trả true nếu có presence. */
  function remove(tenantId, userId) {
    const m = room(tenantId, false);
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

  function list(tenantId) {
    const m = room(tenantId, false);
    return m ? [...m.values()].map(publicEntry) : [];
  }

  /** Lấy và xóa danh sách pose chưa phát: Map(tenantId -> [publicEntry]). */
  function drainDirty() {
    const out = new Map();
    for (const [tenantId, ids] of dirty) {
      const m = room(tenantId, false);
      const poses = [];
      if (m) for (const id of ids) {
        const e = m.get(id);
        if (e) poses.push(publicEntry(e));
      }
      if (poses.length) out.set(tenantId, poses);
    }
    dirty.clear();
    return out;
  }

  function stats() {
    let players = 0;
    for (const m of tenants.values()) players += m.size;
    return { tenants: tenants.size, players };
  }

  return { update, remove, sweep, list, drainDirty, stats };
}
