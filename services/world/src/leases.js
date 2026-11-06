// TASK 24: lease ghế (seat), vật cầm (held), khóa chỉnh sửa (edit). Server là nơi duy nhất cấp quyền.
// Trạng thái trong RAM của một tiến trình (world chỉ chạy một instance; mất khi restart, không orphan vì không ai giữ).
// Thời gian luôn là đồng hồ server (tham số now). Fencing token `fence` tăng ngặt trong mỗi phòng.
// Thao tác nguyên tử vì Node chạy một luồng và mỗi hàm dưới đây không có điểm await.

export const KINDS = { seat: 'seat', held: 'held', edit: 'edit' };
const ID_RE = /^(seat|held|edit):[A-Za-z0-9_-]{1,40}$/;
const MAX_PER_KIND = { seat: 1, held: 1, edit: 3 };
const REQ_CACHE = 64;

export function parseResource(resource) {
  if (typeof resource !== 'string' || !ID_RE.test(resource)) return null;
  return { kind: resource.slice(0, resource.indexOf(':')), id: resource };
}

export function createLeaseStore({ ttlMs = 15_000, graceMs = 30_000, tombstoneMs = 600_000 } = {}) {
  // tenant -> { fence, res: Map(resource -> rec), req: Map(userId -> Map(requestId -> kết quả)) }
  const tenants = new Map();

  function T(tenantId) {
    let t = tenants.get(tenantId);
    if (!t) tenants.set(tenantId, (t = { fence: 0, res: new Map(), req: new Map() }));
    return t;
  }
  // rec: {resource, kind, ownerId, ownerName, leaseId, fence, revision, expiresAt, holdUntil, freedAt}
  const effExpiry = (r) => Math.max(r.expiresAt, r.holdUntil || 0);
  const live = (r, now) => r.ownerId !== null && effExpiry(r) > now;

  const view = (r, now) => ({
    resource: r.resource,
    ownerId: r.ownerId,
    ownerName: r.ownerName,
    leaseId: r.leaseId,
    fence: r.fence,
    revision: r.revision,
    expiresInMs: r.ownerId === null ? 0 : Math.max(0, effExpiry(r) - now),
  });

  function free(r, now) {
    r.ownerId = null;
    r.ownerName = null;
    r.leaseId = null;
    r.holdUntil = 0;
    r.revision += 1;
    r.freedAt = now;
  }

  function remember(t, userId, requestId, result) {
    if (typeof requestId !== 'string' || !requestId) return;
    let m = t.req.get(userId);
    if (!m) t.req.set(userId, (m = new Map()));
    m.set(requestId, result);
    if (m.size > REQ_CACHE) m.delete(m.keys().next().value);
  }

  function countHeld(t, userId, kind, now) {
    let n = 0;
    for (const r of t.res.values()) if (r.kind === kind && r.ownerId === userId && live(r, now)) n += 1;
    return n;
  }

  /**
   * Cấp lease. Idempotent theo requestId (retry trả đúng kết quả cũ) và theo chủ hiện tại
   * (chủ gọi lại thì chỉ gia hạn). Trả {ok, lease, changed} hoặc {ok:false, error, owner?}.
   */
  function acquire(user, { resource, requestId, expectedRevision }, now) {
    const p = parseResource(resource);
    if (!p) return { ok: false, error: 'invalid_resource' };
    const t = T(user.tenantId);
    const cached = t.req.get(user.id)?.get(requestId);
    if (cached && cached.resource === resource) return { ...cached.result, duplicate: true };

    let r = t.res.get(resource);
    if (!r) {
      r = { resource, kind: p.kind, ownerId: null, ownerName: null, leaseId: null, fence: 0, revision: 0, expiresAt: 0, holdUntil: 0, freedAt: now };
      t.res.set(resource, r);
    }
    let result;
    if (Number.isInteger(expectedRevision) && expectedRevision !== r.revision) {
      result = { ok: false, error: 'revision_conflict', lease: view(r, now) };
    } else if (live(r, now) && r.ownerId !== user.id) {
      result = { ok: false, error: 'occupied', owner: { id: r.ownerId, name: r.ownerName }, lease: view(r, now) };
    } else if (live(r, now)) {
      // Chủ gọi lại (double click, retry): giữ nguyên lease, gia hạn.
      r.expiresAt = now + ttlMs;
      r.holdUntil = 0;
      result = { ok: true, lease: view(r, now), changed: false };
    } else if (countHeld(t, user.id, p.kind, now) >= MAX_PER_KIND[p.kind]) {
      result = { ok: false, error: p.kind === 'seat' ? 'already_seated' : 'limit_reached' };
    } else {
      t.fence += 1;
      r.ownerId = user.id;
      r.ownerName = user.name;
      r.leaseId = `L${t.fence}`;
      r.fence = t.fence;
      r.revision += 1;
      r.expiresAt = now + ttlMs;
      r.holdUntil = 0;
      result = { ok: true, lease: view(r, now), changed: true };
    }
    remember(t, user.id, requestId, { resource, result });
    return result;
  }

  // Token hợp lệ nghĩa là: đúng chủ, đúng leaseId, đúng fence, chưa hết hạn theo giờ server.
  function holds(user, { resource, leaseId, fence }, now) {
    const r = tenants.get(user.tenantId)?.res.get(resource);
    return Boolean(r && live(r, now) && r.ownerId === user.id && r.leaseId === leaseId && r.fence === fence);
  }

  function heartbeat(user, tok, now) {
    if (!parseResource(tok.resource)) return { ok: false, error: 'invalid_resource' };
    if (!holds(user, tok, now)) return { ok: false, error: 'lease_lost' };
    const r = tenants.get(user.tenantId).res.get(tok.resource);
    r.expiresAt = now + ttlMs;
    return { ok: true, lease: view(r, now) };
  }

  /** Nhả lease. Gọi lại khi đã nhả: ok, released:false. Token cũ khi đã đổi chủ: stale_token (không nhả của người khác). */
  function release(user, tok, now) {
    if (!parseResource(tok.resource)) return { ok: false, error: 'invalid_resource' };
    const r = tenants.get(user.tenantId)?.res.get(tok.resource);
    if (!r || !live(r, now)) return { ok: true, released: false };
    if (r.ownerId !== user.id || r.leaseId !== tok.leaseId || r.fence !== tok.fence) return { ok: false, error: 'stale_token' };
    free(r, now);
    return { ok: true, released: true, lease: view(r, now) };
  }

  /** Chủ phòng thu hồi cưỡng bức (đã qua can() ở nơi gọi). */
  function forceRelease(tenantId, resource, now) {
    const r = tenants.get(tenantId)?.res.get(resource);
    if (!r || !live(r, now)) return { ok: true, released: false };
    const prev = r.ownerId;
    free(r, now);
    return { ok: true, released: true, prevOwnerId: prev, lease: view(r, now) };
  }

  /** Nhả mọi lease của user (rời chủ động, bị kick, mất quyền). Trả danh sách view đã nhả. */
  function releaseAll(tenantId, userId, now, kinds) {
    const out = [];
    for (const r of tenants.get(tenantId)?.res.values() || []) {
      if (r.ownerId === userId && live(r, now) && (!kinds || kinds.includes(r.kind))) {
        free(r, now);
        out.push(view(r, now));
      }
    }
    return out;
  }

  /** Mất kết nối: giữ lease thêm graceMs rồi mới nhả (sweep). */
  function hold(tenantId, userId, now) {
    for (const r of tenants.get(tenantId)?.res.values() || []) {
      if (r.ownerId === userId && live(r, now)) r.holdUntil = now + graceMs;
    }
  }

  /** Quay lại trong ân hạn: bỏ hold và gia hạn lease còn sống. Trả danh sách view còn sống. */
  function resume(tenantId, userId, now) {
    const out = [];
    for (const r of tenants.get(tenantId)?.res.values() || []) {
      if (r.ownerId === userId && live(r, now)) {
        r.holdUntil = 0;
        r.expiresAt = now + ttlMs;
        out.push(view(r, now));
      }
    }
    return out;
  }

  /** Nhả lease hết hạn; dọn bia mộ cũ. Trả [{tenantId, ownerId, lease}] đã nhả. */
  function sweep(now) {
    const out = [];
    for (const [tenantId, t] of tenants) {
      for (const [id, r] of t.res) {
        if (r.ownerId !== null && effExpiry(r) <= now) {
          const owner = r.ownerId;
          free(r, now);
          out.push({ tenantId, ownerId: owner, lease: view(r, now) });
        } else if (r.ownerId === null && now - r.freedAt > tombstoneMs) {
          t.res.delete(id);
        }
      }
    }
    return out;
  }

  function list(tenantId, now) {
    return [...(tenants.get(tenantId)?.res.values() || [])].filter((r) => live(r, now)).map((r) => view(r, now));
  }
  function query(tenantId, resource, now) {
    const r = tenants.get(tenantId)?.res.get(resource);
    return r ? view(r, now) : null;
  }
  function stats() {
    let n = 0;
    for (const t of tenants.values()) n += t.res.size;
    return { resources: n };
  }

  return { acquire, heartbeat, release, forceRelease, releaseAll, hold, resume, sweep, holds, list, query, stats };
}
