// Hành động xã hội (TASK 15): lời mời có đồng ý (bắt tay, đập tay) và hành động có mục tiêu (vẫy, cúi, chỉ tay).
// Server chỉ là bộ chuyển tiếp có kiểm soát: kiểm quyền (can), tần suất, khoảng cách, hạn lời mời; không lưu lâu dài.
// Bảng tầm khớp src/emotes/social/logic.ts (SOCIAL_ACTIONS.maxRange).

export const SOCIAL_ACTIONS = {
  wave_at: { range: 8, consent: false },
  bow: { range: 5, consent: false },
  point_at: { range: 12, consent: false },
  handshake: { range: 2.5, consent: true },
  high_five: { range: 2.5, consent: true },
};

export const INVITE_TTL_MS = 15_000;
// Lề cho độ trễ pose giữa hai bên: server chấp nhận xa hơn tầm client một hệ số (khớp CANCEL_DISTANCE_FACTOR).
export const RANGE_SLACK = 1.6;
const ID_RE = /^\S{1,64}$/;

export function isValidInviteId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

/** Kho lời mời đang chờ: mỗi người tối đa một lời mời đi và một lời mời đến. */
export function createInviteStore({ ttlMs = INVITE_TTL_MS } = {}) {
  const byId = new Map(); // `${tenant}:${id}` -> invite
  const key = (tenantId, id) => `${tenantId}:${id}`;

  const find = (tenantId, id) => byId.get(key(tenantId, id)) || null;

  function create(tenantId, { id, actionId, from, to }, now) {
    for (const inv of byId.values()) {
      if (inv.tenantId !== tenantId) continue;
      if (inv.id === id) return { ok: false, error: 'duplicate' };
      if (inv.from === from) return { ok: false, error: 'busy' };
      if (inv.to === to || inv.from === to || inv.to === from) return { ok: false, error: 'target_busy' };
    }
    const inv = { tenantId, id, actionId, from, to, createdAt: now, expiresAt: now + ttlMs, status: 'pending' };
    byId.set(key(tenantId, id), inv);
    return { ok: true, invite: inv };
  }

  function remove(tenantId, id) {
    byId.delete(key(tenantId, id));
  }

  /** Mọi lời mời liên quan tới một người (để hủy khi họ rời). */
  function involving(tenantId, userId) {
    return [...byId.values()].filter((i) => i.tenantId === tenantId && (i.from === userId || i.to === userId));
  }

  /** Bỏ lời mời hết hạn, trả danh sách đã bỏ. */
  function sweep(now) {
    const out = [];
    for (const [k, inv] of byId) {
      if (now >= inv.expiresAt) {
        byId.delete(k);
        out.push(inv);
      }
    }
    return out;
  }

  return { create, find, remove, involving, sweep, size: () => byId.size };
}

/** Dạng gửi cho client: bỏ tenantId. */
export function publicInvite(inv) {
  const { tenantId: _t, ...rest } = inv;
  return rest;
}
