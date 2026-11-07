// TASK 26: vai trò theo phòng, ma trận quyền, hàm can() dùng chung cho mọi message, kick/mute, audit.
// Phòng = tenant. Vai trò phòng tách khỏi vai trò tài khoản: tài khoản chỉ cho vai trò MẶC ĐỊNH,
// chủ phòng có thể ghi đè (role.set) trong bộ nhớ. Mặc định từ chối với action lạ.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const ROLES = ['guest', 'member', 'editor', 'owner'];

// Ánh xạ ban đầu từ role tài khoản (auth). Role lạ hoặc thiếu -> guest (quyền tối thiểu).
const ACCOUNT_TO_ROOM = { admin: 'owner', it: 'editor', employee: 'member', moderator: 'member', guest: 'guest' };

export function roleFromAccount(accountRole) {
  return ACCOUNT_TO_ROOM[accountRole] || 'guest';
}

// Quyền tối thiểu của từng vai trò; vai trò cao kế thừa vai trò thấp.
const BASE = {
  guest: ['room.view', 'room.join', 'pose.send', 'chat.read'],
  member: ['chat.send', 'voice.use', 'seat.use', 'object.use', 'social.act'],
  editor: ['layout.edit'],
  owner: ['member.list', 'member.kick', 'member.mute', 'role.set', 'owner.transfer', 'audit.view', 'lease.force_release'],
};

export const MATRIX = (() => {
  const out = {};
  let acc = [];
  for (const r of ROLES) {
    acc = [...acc, ...BASE[r]];
    out[r] = new Set(acc);
  }
  return out;
})();

export const ACTIONS = new Set(Object.values(BASE).flat());

/**
 * Quyết định dùng chung cho realtime (và HTTP nếu cần).
 * actor: {id, tenantId, role, muted?}. resource: {tenantId?, targetId?, targetRole?, newRole?}.
 * Trả {ok:true} hoặc {ok:false, reason}.
 */
export function can(actor, action, resource = {}) {
  if (!actor || !actor.id || !ACTIONS.has(action)) return { ok: false, reason: 'forbidden' };
  const perms = MATRIX[actor.role];
  if (!perms || !perms.has(action)) return { ok: false, reason: 'forbidden' };
  // Chống truy cập phòng khác bằng đổi ID.
  if (resource.tenantId !== undefined && resource.tenantId !== actor.tenantId) return { ok: false, reason: 'cross_room' };
  if ((action === 'chat.send' || action === 'voice.use') && actor.muted) return { ok: false, reason: 'muted' };
  if (action === 'member.kick' || action === 'member.mute' || action === 'role.set' || action === 'owner.transfer') {
    if (resource.targetId === actor.id) return { ok: false, reason: 'cannot_target_self' };
    // Chủ phòng không đụng tới chủ phòng khác: không để phòng mất chủ cuối cùng.
    if (resource.targetRole === 'owner') return { ok: false, reason: 'cannot_target_owner' };
  }
  if (action === 'role.set') {
    if (!ROLES.includes(resource.newRole)) return { ok: false, reason: 'invalid_role' };
    if (resource.newRole === 'owner') return { ok: false, reason: 'cannot_grant_owner' };
  }
  return { ok: true };
}

export function capabilitiesOf(role) {
  return [...(MATRIX[role] || [])];
}

const FILE_NAME = 'room-roles.json';

/**
 * dataDir (tùy chọn): lưu bền ghi đè vai trò vào `${dataDir}/room-roles.json` (ghi tmp rồi rename nguyên tử).
 * Chỉ lưu vai trò; mute, kick, audit vẫn trong bộ nhớ. Tệp hỏng được đổi tên `.corrupt-<ts>` và bỏ qua.
 */
export function createRoleStore({ kickMs = 300_000, auditMax = 500, now = Date.now, dataDir = null, onError = () => {} } = {}) {
  const overrides = new Map(); // `${tenant}:${user}` -> role
  const filePath = dataDir ? join(dataDir, FILE_NAME) : null;

  function load() {
    if (!filePath) return;
    let raw;
    try {
      raw = readFileSync(filePath, 'utf8');
    } catch (err) {
      if (err && err.code !== 'ENOENT') onError(err);
      return;
    }
    try {
      const data = JSON.parse(raw);
      if (!data || data.version !== 1 || !data.rooms || typeof data.rooms !== 'object') throw new Error('bad_format');
      for (const [tenant, users] of Object.entries(data.rooms)) {
        for (const [uid, role] of Object.entries(users || {})) {
          if (ROLES.includes(role)) overrides.set(`${tenant}:${uid}`, role);
        }
      }
    } catch (err) {
      onError(err);
      try {
        renameSync(filePath, `${filePath}.corrupt-${now()}`);
      } catch {
        // Bỏ qua.
      }
    }
  }

  /** Ghi nguyên tử. Lỗi ghi không làm hỏng trạng thái bộ nhớ (báo qua onError). Trả true nếu ghi được. */
  function save() {
    if (!filePath) return true;
    const rooms = {};
    for (const [key, role] of overrides) {
      const i = key.indexOf(':');
      const tenant = key.slice(0, i);
      (rooms[tenant] ||= {})[key.slice(i + 1)] = role;
    }
    const tmp = `${filePath}.${process.pid}.tmp`;
    try {
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(tmp, JSON.stringify({ version: 1, rooms }), { mode: 0o600 });
      renameSync(tmp, filePath);
      return true;
    } catch (err) {
      onError(err);
      return false;
    }
  }
  load();
  const mutes = new Map(); // key -> until (ms) hoặc Infinity
  const kicks = new Map(); // key -> until
  const audits = new Map(); // tenant -> [entry]
  const k = (tenantId, userId) => `${tenantId}:${userId}`;

  function roleOf(user) {
    return overrides.get(k(user.tenantId, user.id)) || roleFromAccount(user.accountRole);
  }
  function isMuted(user) {
    const key = k(user.tenantId, user.id);
    const until = mutes.get(key);
    if (until === undefined) return false;
    if (now() >= until) {
      mutes.delete(key);
      return false;
    }
    return true;
  }
  /** Actor đầy đủ để đưa vào can(). Vai trò đọc lại mỗi lần nên thu hồi có hiệu lực ngay. */
  function actorOf(user) {
    return { id: user.id, tenantId: user.tenantId, role: roleOf(user), muted: isMuted(user) };
  }
  function setRole(tenantId, userId, role) {
    if (role === undefined) overrides.delete(k(tenantId, userId));
    else overrides.set(k(tenantId, userId), role);
    save();
  }
  /** Chuyển quyền chủ phòng: bên cũ xuống editor, bên mới lên owner, ghi một lần. */
  function transferOwner(tenantId, fromId, toId) {
    overrides.set(k(tenantId, fromId), 'editor');
    overrides.set(k(tenantId, toId), 'owner');
    save();
  }
  function setMute(tenantId, userId, on, durationMs) {
    const key = k(tenantId, userId);
    if (!on) mutes.delete(key);
    else mutes.set(key, durationMs > 0 ? now() + durationMs : Infinity);
  }
  function kick(tenantId, userId) {
    kicks.set(k(tenantId, userId), now() + kickMs);
  }
  function isKicked(tenantId, userId) {
    const key = k(tenantId, userId);
    const until = kicks.get(key);
    if (until === undefined) return false;
    if (now() >= until) {
      kicks.delete(key);
      return false;
    }
    return true;
  }
  /** Ghi audit trong bộ nhớ (giới hạn auditMax mỗi phòng). Không ghi nội dung chat hay token. */
  function audit(tenantId, entry) {
    let list = audits.get(tenantId);
    if (!list) audits.set(tenantId, (list = []));
    list.push({ at: now(), ...entry });
    if (list.length > auditMax) list.splice(0, list.length - auditMax);
  }
  function auditList(tenantId, limit = 50) {
    const list = audits.get(tenantId) || [];
    return list.slice(-Math.max(1, Math.min(200, limit))).reverse();
  }
  return { roleOf, actorOf, isMuted, setRole, transferOwner, setMute, kick, isKicked, audit, auditList };
}
