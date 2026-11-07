// Lõi world: nối presence, rate limit và hub; chạy tick phát pose và quét presence hết hạn.
// Không phụ thuộc transport, test được bằng kết nối giả.

import { randomBytes } from 'node:crypto';
import {
  CHAT_NEAR_RADIUS,
  CLOSE,
  EVENT_LOG_MAX,
  KICK_COOLDOWN_MS,
  LEASE_GRACE_MS,
  LEASE_TTL_MS,
  PRESENCE_TTL_MS,
  PROTOCOL_VERSION,
  RESUME_TTL_MS,
  TICK_MS,
} from './config.js';
import { createChat, CHAT } from './chat.js';
import { createLeaseStore, parseResource } from './leases.js';
import { sanitizeAppearance } from './appearance.js';
import { PoseError, parsePose } from './pose.js';
import { PresenceError } from './presence.js';
import { createRateLimiter } from './rateLimit.js';
import { RANGE_SLACK, SOCIAL_ACTIONS, createInviteStore, isValidInviteId, publicInvite } from './social.js';
import { can, capabilitiesOf, createRoleStore } from './roles.js';
import { createEventLog, createSessions } from './sessions.js';

const LEASE_ACTION = { seat: 'seat.use', held: 'object.use', edit: 'layout.edit' };
const MAX_OBJECTS = 500;
const COORD_LIMIT = 200;

export function createWorld({
  presence,
  limiter,
  hub,
  now = Date.now,
  leases = createLeaseStore({ ttlMs: LEASE_TTL_MS, graceMs: LEASE_GRACE_MS }),
  roles = createRoleStore({ kickMs: KICK_COOLDOWN_MS, now }),
  chat = createChat({ now, config: { ...CHAT, nearRadius: CHAT_NEAR_RADIUS } }),
  sessions = createSessions({ resumeTtlMs: RESUME_TTL_MS }),
  eventLog = createEventLog({ max: EVENT_LOG_MAX }),
  invites = createInviteStore(),
}) {
  let tick = 0;
  // Định danh lần chạy của server: đổi khi restart để client biết trạng thái cũ không còn giá trị.
  const epoch = randomBytes(6).toString('base64url');
  const editLimiter = createRateLimiter({ capacity: 10, refillPerSec: 10 });
  // Hành động xã hội: tối đa 5 tin liên tiếp, nạp 1 tin mỗi giây mỗi người.
  const socialLimiter = createRateLimiter({ capacity: 5, refillPerSec: 1 });
  // Đổi ngoại hình: tối đa 3 tin liên tiếp, nạp 1 tin mỗi 5 giây mỗi người.
  const appearanceLimiter = createRateLimiter({ capacity: 3, refillPerSec: 0.2 });
  const objects = new Map(); // tenant -> Map(resource -> {revision, x?, z?, yaw?, by, at})
  const commitCache = new Map(); // `${tenant}:${user}:${requestId}` -> kết quả (giới hạn 256)

  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  function snapshot(user) {
    return {
      type: 'snapshot',
      v: PROTOCOL_VERSION,
      tick,
      serverTime: now(),
      self: { id: user.id },
      ttlMs: PRESENCE_TTL_MS,
      players: presence.list(user.tenantId),
      // TASK 24/26/27: trạng thái dùng chung và quyền của chính người nhận.
      epoch,
      eseq: eventLog.current(user.tenantId),
      role: roles.roleOf(user),
      capabilities: capabilitiesOf(roles.roleOf(user)),
      leases: leases.list(user.tenantId, now()),
      objects: objectList(user.tenantId),
    };
  }

  function objectList(tenantId) {
    return [...(objects.get(tenantId) || [])].map(([resource, o]) => ({ resource, ...o }));
  }

  /** Phát sự kiện tin cậy cho cả phòng, có eseq để bù khi mất kết nối. */
  function emit(tenantId, msg, pred) {
    const e = eventLog.append(tenantId, msg);
    if (pred) hub.broadcastWhere(tenantId, e, pred);
    else hub.broadcast(tenantId, e);
    return e;
  }

  function leaseEvent(tenantId, lease, reason) {
    emit(tenantId, {
      type: 'lease',
      resource: lease.resource,
      ownerId: lease.ownerId,
      ownerName: lease.ownerName,
      fence: lease.fence,
      revision: lease.revision,
      reason,
    });
  }

  /** Nhả mọi lease (hoặc một số loại) của user và phát sự kiện. */
  function releaseUser(user, reason, kinds) {
    for (const l of leases.releaseAll(user.tenantId, user.id, now(), kinds)) leaseEvent(user.tenantId, l, reason);
  }

  // ----- Phiên và resume (TASK 27) -----

  /** Gọi khi một kết nối đã xác thực được mở (sau takeover, trước hoặc ngay khi gửi snapshot). */
  function openSession(user, { resumeToken, lastEventSeq } = {}) {
    const t = now();
    let resumed = null;
    let keep = null;
    if (resumeToken !== undefined && resumeToken !== null && resumeToken !== '') {
      const v = sessions.validate(user, resumeToken, t);
      if (v.ok) {
        keep = v.session;
        const restored = leases.resume(user.tenantId, user.id, t);
        const gap = eventLog.since(user.tenantId, lastEventSeq);
        resumed = {
          ok: true,
          restored: restored.map((l) => l.resource),
          lost: keep.lost,
          spawn: keep.lastPose ? { x: keep.lastPose.x, z: keep.lastPose.z, yaw: keep.lastPose.yaw } : null,
          full: gap.full,
          // Phần chat room bị lỡ: lọc người đã chặn như lúc phát trực tiếp.
          events: gap.events.filter((e) => e.type !== 'chat' || !chat.isBlockedBy(user.tenantId, user.id, e.from.id)),
        };
      } else {
        resumed = { ok: false, reason: v.reason, full: true };
        releaseUser(user, 'session_reset');
      }
    } else {
      // Phiên mới không mang token (tab mới, tải lại trang): bắt đầu sạch, không thừa hưởng lease cũ.
      releaseUser(user, 'session_reset');
    }
    const sess = sessions.issue(user, t, keep);
    return {
      session: { id: sess.id, resumeToken: sess.token, resumeTtlMs: RESUME_TTL_MS },
      resumed,
    };
  }

  /** Vào hub thất bại sau openSession: đánh dấu phiên chưa kết nối để token hết hạn đúng hạn. */
  function abortSession(user) {
    sessions.markDisconnected(user, now());
    leases.hold(user.tenantId, user.id, now());
  }

  /** Tab/thiết bị mới thay phiên cũ: đóng mọi socket cũ của người đó với mã 4409. */
  function takeover(user) {
    return hub.closeUser(user, CLOSE.REPLACED, 'replaced_by_new_session');
  }

  /** Nhận pose. Trả tin nhắn gửi lại cho người gửi: `ack` hoặc `error`. */
  function submitPose(user, body) {
    const t = now();
    const seq = body && Number.isInteger(body.seq) ? body.seq : undefined;
    const rl = limiter.take(user.id, t);
    if (!rl.ok) return { type: 'error', code: 'rate_limited', seq, retryAfterMs: rl.retryAfterMs };
    let pose;
    try {
      pose = parsePose(body);
    } catch (err) {
      if (err instanceof PoseError) return { type: 'error', code: err.code, seq };
      throw err;
    }
    try {
      const { created, entry, corrected, appearance } = presence.update(user, pose, t);
      if (created) {
        hub.broadcast(user.tenantId, { type: 'join', id: entry.id, name: entry.name, tick, ...(appearance ? { appearance } : {}) });
      }
      const accepted = { x: entry.x, z: entry.z, yaw: entry.yaw, anim: entry.anim };
      return { type: 'ack', seq: entry.seq, tick, accepted, corrected };
    } catch (err) {
      if (err instanceof PresenceError) return { type: 'error', code: err.code, seq };
      throw err;
    }
  }

  /** Nhận ngoại hình. Lọc theo whitelist; sai định dạng hoặc quá lớn thì từ chối, quá nhanh thì rate_limited. */
  function handleAppearance(user, client, m) {
    const rl = appearanceLimiter.take(user.id, now());
    if (!rl.ok) return deny(client, m, 'rate_limited', { retryAfterMs: rl.retryAfterMs });
    const look = sanitizeAppearance(m.appearance);
    if (!look) return deny(client, m, 'invalid_appearance');
    try {
      presence.setAppearance(user, look);
    } catch (err) {
      if (err instanceof PresenceError) return deny(client, m, err.code);
      throw err;
    }
    // Trả bản đã lọc để client đồng bộ với thứ người khác thấy.
    return hub.send(client, { type: 'appearance.ack', requestId: reqIdOf(m), appearance: look });
  }

  /**
   * reason: 'left' (client báo rời, hoặc bị kick) hoặc 'disconnect' (đóng kết nối cuối).
   * 'left' nhả ngay lease và hủy phiên; 'disconnect' giữ lease trong ân hạn để resume.
   */
  function leave(user, reason) {
    const last = presence.get(user.tenantId, user.id);
    dropInvites(user);
    if (presence.remove(user.tenantId, user.id)) {
      hub.broadcast(user.tenantId, { type: 'leave', id: user.id, reason, tick });
    }
    if (reason === 'left') {
      releaseUser(user, 'left');
      sessions.drop(user);
    } else {
      leases.hold(user.tenantId, user.id, now());
      sessions.markDisconnected(user, now(), last && { x: last.x, z: last.z, yaw: last.yaw });
    }
  }

  // Một bước tick: quét hết hạn rồi phát mọi pose thay đổi, mỗi tenant một tin nhắn.
  function step() {
    tick += 1;
    const t = now();
    for (const { tenantId, id } of presence.sweep(t)) {
      hub.broadcast(tenantId, { type: 'leave', id, reason: 'timeout', tick });
    }
    invites.sweep(t);
    for (const { tenantId, ownerId, lease } of leases.sweep(t)) {
      leaseEvent(tenantId, lease, 'expired');
      sessions.noteLost({ tenantId, id: ownerId }, lease.resource, 'expired');
    }
    for (const [tenantId, poses] of presence.drainDirty()) {
      hub.broadcast(tenantId, { type: 'poses', tick, serverTime: t, poses });
    }
    if (tick % 600 === 0) {
      limiter.prune(t);
      editLimiter.prune(t);
      socialLimiter.prune(t);
      appearanceLimiter.prune(t);
      chat.prune();
      sessions.sweep(t);
    }
  }


  // ----- Xử lý message mới (TASK 24/25/26/27). Trả true nếu đã xử lý. -----

  const reqIdOf = (m) => (typeof m.requestId === 'string' && m.requestId.length <= 40 ? m.requestId : undefined);

  function deny(client, m, code, extra) {
    hub.send(client, { type: 'error', code, requestId: reqIdOf(m), ...extra });
  }

  function findTarget(user, id) {
    if (typeof id !== 'string') return null;
    return hub.clientsOf({ tenantId: user.tenantId, id })[0]?.user || null;
  }

  function audit(user, action, target, result, m, detail) {
    roles.audit(user.tenantId, { actor: user.id, action, target: target || null, result, requestId: reqIdOf(m) || null, ...(detail ? { detail } : {}) });
  }

  function leaseToken(m) {
    return { resource: m.resource, leaseId: m.leaseId, fence: m.fence };
  }

  function handleLease(user, client, m) {
    const t = now();
    const requestId = reqIdOf(m);
    const p = parseResource(m.resource);
    if (!p) return hub.send(client, { type: 'lease.result', op: m.type, requestId, ok: false, error: 'invalid_resource' });
    const actor = roles.actorOf(user);
    if (m.type === 'lease.acquire') {
      const d = can(actor, LEASE_ACTION[p.kind], { tenantId: user.tenantId });
      if (!d.ok) return hub.send(client, { type: 'lease.result', op: 'acquire', requestId, resource: m.resource, ok: false, error: d.reason });
      const r = leases.acquire(user, { resource: m.resource, requestId, expectedRevision: m.expectedRevision }, t);
      if (r.ok && r.changed) leaseEvent(user.tenantId, r.lease, 'acquired');
      return hub.send(client, { type: 'lease.result', op: 'acquire', requestId, resource: m.resource, ...r });
    }
    if (m.type === 'lease.heartbeat') {
      // Quyền đọc lại mỗi lần: bị thu hồi giữa chừng thì lease bị nhả ở nhịp tim kế tiếp.
      const d = can(actor, LEASE_ACTION[p.kind], { tenantId: user.tenantId });
      if (!d.ok) {
        const rel = leases.release(user, leaseToken(m), t);
        if (rel.released) leaseEvent(user.tenantId, rel.lease, 'revoked');
        return hub.send(client, { type: 'lease.result', op: 'heartbeat', requestId, resource: m.resource, ok: false, error: 'lease_lost' });
      }
      return hub.send(client, { type: 'lease.result', op: 'heartbeat', requestId, resource: m.resource, ...leases.heartbeat(user, leaseToken(m), t) });
    }
    if (m.type === 'lease.release') {
      const r = leases.release(user, leaseToken(m), t);
      if (r.ok && r.released) leaseEvent(user.tenantId, r.lease, 'released');
      return hub.send(client, { type: 'lease.result', op: 'release', requestId, resource: m.resource, ...r });
    }
    if (m.type === 'lease.query') {
      return hub.send(client, { type: 'lease.result', op: 'query', requestId, resource: m.resource, ok: true, lease: leases.query(user.tenantId, m.resource, t) });
    }
    // lease.force: chỉ chủ phòng, có audit.
    const d = can(actor, 'lease.force_release', { tenantId: user.tenantId });
    audit(user, 'lease.force_release', m.resource, d.ok ? 'ok' : d.reason, m);
    if (!d.ok) return hub.send(client, { type: 'lease.result', op: 'force', requestId, resource: m.resource, ok: false, error: d.reason });
    const r = leases.forceRelease(user.tenantId, m.resource, t);
    if (r.released) {
      leaseEvent(user.tenantId, r.lease, 'forced');
      sessions.noteLost({ tenantId: user.tenantId, id: r.prevOwnerId }, m.resource, 'forced');
    }
    return hub.send(client, { type: 'lease.result', op: 'force', requestId, resource: m.resource, ok: true, released: r.released });
  }

  function handleEdit(user, client, m) {
    const requestId = reqIdOf(m);
    const fail = (error, extra) => hub.send(client, { type: 'edit.result', requestId, resource: m.resource, ok: false, error, ...extra });
    const p = parseResource(m.resource);
    if (!p || p.kind !== 'edit') return fail('invalid_resource');
    const rl = editLimiter.take(user.id, now());
    if (!rl.ok) return fail('rate_limited', { retryAfterMs: rl.retryAfterMs });
    const d = can(roles.actorOf(user), 'layout.edit', { tenantId: user.tenantId });
    if (!d.ok) return fail(d.reason);
    const ck = requestId ? `${user.tenantId}:${user.id}:${requestId}` : null;
    if (ck && commitCache.has(ck)) return hub.send(client, { ...commitCache.get(ck), duplicate: true });
    // Chỉ chủ khóa còn hạn với đúng token mới sửa được; client cũ mang token hết hạn bị từ chối.
    if (!leases.holds(user, leaseToken(m), now())) return fail('lease_lost');
    const patch = {};
    const src = m.patch && typeof m.patch === 'object' ? m.patch : {};
    for (const key of ['x', 'z', 'yaw']) {
      if (src[key] === undefined) continue;
      if (typeof src[key] !== 'number' || !Number.isFinite(src[key]) || Math.abs(src[key]) > COORD_LIMIT) return fail('invalid_patch');
      patch[key] = Math.round(src[key] * 1000) / 1000;
    }
    if (!Object.keys(patch).length) return fail('invalid_patch');
    let om = objects.get(user.tenantId);
    if (!om) objects.set(user.tenantId, (om = new Map()));
    const prev = om.get(m.resource);
    if (!prev && om.size >= MAX_OBJECTS) return fail('object_limit');
    if (Number.isInteger(m.expectedRevision) && m.expectedRevision !== (prev ? prev.revision : 0)) {
      return fail('revision_conflict', { revision: prev ? prev.revision : 0 });
    }
    const next = { ...(prev || {}), ...patch, revision: (prev ? prev.revision : 0) + 1, by: user.id, at: now() };
    om.set(m.resource, next);
    emit(user.tenantId, { type: 'edit.applied', resource: m.resource, ...next });
    const res = { type: 'edit.result', requestId, resource: m.resource, ok: true, revision: next.revision };
    if (ck) {
      commitCache.set(ck, res);
      if (commitCache.size > 256) commitCache.delete(commitCache.keys().next().value);
    }
    return hub.send(client, res);
  }

  // ----- Hành động xã hội (TASK 15) -----

  function sendToUser(tenantId, id, msg) {
    for (const c of hub.clientsOf({ tenantId, id })) hub.send(c, msg);
  }

  /** Người rời hoặc bị kick: hủy mọi lời mời liên quan và báo bên kia. */
  function dropInvites(user) {
    for (const inv of invites.involving(user.tenantId, user.id)) {
      invites.remove(user.tenantId, inv.id);
      if (inv.from === user.id) sendToUser(inv.tenantId, inv.to, { type: 'social_cancel', inviteId: inv.id, by: inv.from });
      else sendToUser(inv.tenantId, inv.from, { type: 'social_respond', inviteId: inv.id, by: inv.to, answer: 'decline' });
    }
  }

  function handleSocial(user, client, m) {
    const tenantId = user.tenantId;
    const inviteId = m.type === 'social_invite' ? m.invite && m.invite.id : m.inviteId;
    const denied = (code) => hub.send(client, { type: 'social.denied', code, inviteId: typeof inviteId === 'string' ? inviteId.slice(0, 64) : undefined });
    const d = can(roles.actorOf(user), 'social.act', { tenantId });
    if (!d.ok) return denied(d.reason);
    const rl = socialLimiter.take(user.id, now());
    if (!rl.ok) return hub.send(client, { type: 'social.denied', code: 'rate_limited', inviteId: typeof inviteId === 'string' ? inviteId.slice(0, 64) : undefined, retryAfterMs: rl.retryAfterMs });
    const t = now();
    const near = (a, b, action) => Boolean(a) && Boolean(b) && dist(a, b) <= action.range * RANGE_SLACK;
    const blockedByTarget = (targetId) => chat.isBlockedBy(tenantId, targetId, user.id);

    if (m.type === 'social_invite') {
      const src = m.invite && typeof m.invite === 'object' ? m.invite : {};
      const action = SOCIAL_ACTIONS[src.actionId];
      if (!action || !action.consent || !isValidInviteId(src.id) || typeof src.to !== 'string') return denied('invalid_invite');
      const target = findTarget(user, src.to);
      if (!target || target.id === user.id) return denied('target_not_found');
      if (!can(roles.actorOf(target), 'social.act', { tenantId }).ok) return denied('target_not_found');
      if (!near(presence.get(tenantId, user.id), presence.get(tenantId, target.id), action)) return denied('too_far');
      // Người nhận đã chặn người mời: coi như bị từ chối, không lộ việc bị chặn.
      if (blockedByTarget(target.id)) return hub.send(client, { type: 'social_respond', inviteId: src.id, by: target.id, answer: 'decline' });
      const r = invites.create(tenantId, { id: src.id, actionId: src.actionId, from: user.id, to: target.id }, t);
      if (!r.ok) {
        if (r.error === 'target_busy') return hub.send(client, { type: 'social_respond', inviteId: src.id, by: target.id, answer: 'decline' });
        return denied(r.error);
      }
      sendToUser(tenantId, target.id, { type: 'social_invite', invite: publicInvite(r.invite) });
      return undefined;
    }

    if (m.type === 'social_play') {
      const action = SOCIAL_ACTIONS[m.actionId];
      if (!action || action.consent || typeof m.to !== 'string') return denied('invalid_action');
      const target = findTarget(user, m.to);
      if (!target || target.id === user.id) return denied('target_not_found');
      if (!near(presence.get(tenantId, user.id), presence.get(tenantId, target.id), action)) return denied('too_far');
      if (blockedByTarget(target.id)) return undefined;
      sendToUser(tenantId, target.id, { type: 'social_play', actionId: m.actionId, from: user.id, to: target.id, startTime: t });
      return undefined;
    }

    const inv = typeof m.inviteId === 'string' ? invites.find(tenantId, m.inviteId) : null;
    if (!inv) return denied('invite_not_found');
    if (t >= inv.expiresAt) {
      invites.remove(tenantId, inv.id);
      return denied('expired');
    }
    if (m.type === 'social_cancel') {
      if (inv.from !== user.id) return denied('forbidden');
      invites.remove(tenantId, inv.id);
      sendToUser(tenantId, inv.to, { type: 'social_cancel', inviteId: inv.id, by: user.id });
      return undefined;
    }
    // social_respond
    if (inv.to !== user.id) return denied('forbidden');
    if (m.answer !== 'accept' && m.answer !== 'decline') return denied('invalid_answer');
    invites.remove(tenantId, inv.id);
    let answer = m.answer;
    if (answer === 'accept' && !near(presence.get(tenantId, inv.from), presence.get(tenantId, inv.to), SOCIAL_ACTIONS[inv.actionId])) {
      // Đi xa trong lúc chờ: hủy cả hai phía thay vì cho chạy hành động chạm tay từ xa.
      answer = 'decline';
      denied('too_far');
    }
    sendToUser(tenantId, inv.from, { type: 'social_respond', inviteId: inv.id, by: user.id, answer });
    return undefined;
  }

  function handleChat(user, client, m) {
    const fail = (code, extra) => hub.send(client, { type: 'error', code, clientMsgId: m.clientMsgId, ...extra });
    const d = can(roles.actorOf(user), 'chat.send', { tenantId: user.tenantId });
    if (!d.ok) return fail(d.reason);
    const r = chat.prepare(user, m);
    if (!r.ok) return fail(r.error, r.retryAfterMs ? { retryAfterMs: r.retryAfterMs } : undefined);
    const { msg } = r;
    hub.send(client, { type: 'chat.ack', clientMsgId: m.clientMsgId, id: msg.id, at: msg.at, duplicate: r.duplicate || undefined });
    if (r.duplicate) return undefined; // retry: không phát lại
    const notBlocked = (c) => c.user.id === user.id || !chat.isBlockedBy(user.tenantId, c.user.id, user.id);
    if (msg.channel === 'room') {
      emit(user.tenantId, { type: 'chat', ...msg }, notBlocked);
      return undefined;
    }
    // Kênh gần: người nhận do server tính theo vị trí pose hiện tại; người gửi chưa có vị trí thì không gửi được.
    const me = presence.get(user.tenantId, user.id);
    if (!me) {
      return fail('no_position');
    }
    hub.broadcastWhere(user.tenantId, { type: 'chat', ...msg }, (c) => {
      if (!notBlocked(c)) return false;
      if (c.user.id === user.id) return true;
      const o = presence.get(user.tenantId, c.user.id);
      return Boolean(o) && dist(me, o) <= CHAT_NEAR_RADIUS;
    });
    return undefined;
  }

  function handleModeration(user, client, m) {
    const requestId = reqIdOf(m);
    const result = (ok, extra) => hub.send(client, { type: 'mod.result', op: m.type, requestId, ok, ...extra });
    const actor = roles.actorOf(user);
    if (m.type === 'audit.list') {
      const d = can(actor, 'audit.view', { tenantId: user.tenantId });
      if (!d.ok) return result(false, { error: d.reason });
      return hub.send(client, { type: 'audit.list', requestId, entries: roles.auditList(user.tenantId, m.limit) });
    }
    if (m.type === 'member.list') {
      const d = can(actor, 'member.list', { tenantId: user.tenantId });
      if (!d.ok) return result(false, { error: d.reason });
      // Mỗi người một dòng (nhiều tab gộp). Chỉ id, tên, vai trò phòng, tắt tiếng: không lộ role tài khoản hay token.
      const seen = new Map();
      hub.forEach((c) => {
        if (c.user.tenantId !== user.tenantId || seen.has(c.user.id)) return;
        seen.set(c.user.id, { id: c.user.id, name: c.user.name, role: roles.roleOf(c.user), muted: roles.isMuted(c.user) });
      });
      return hub.send(client, { type: 'member.list', requestId, members: [...seen.values()] });
    }
    const target = findTarget(user, m.target);
    const action = { 'mod.kick': 'member.kick', 'mod.mute': 'member.mute', 'role.set': 'role.set', 'owner.transfer': 'owner.transfer' }[m.type];
    const d = can(actor, action, {
      tenantId: user.tenantId,
      targetId: typeof m.target === 'string' ? m.target : undefined,
      targetRole: target ? roles.roleOf(target) : undefined,
      newRole: m.role,
    });
    if (!d.ok) {
      audit(user, action, m.target, d.reason, m);
      return result(false, { error: d.reason });
    }
    if (!target) return result(false, { error: 'target_not_found' });

    if (m.type === 'mod.kick') {
      roles.kick(user.tenantId, target.id);
      audit(user, action, target.id, 'ok', m);
      dropInvites(target);
      releaseUser(target, 'kicked');
      sessions.drop(target);
      if (presence.remove(user.tenantId, target.id)) hub.broadcast(user.tenantId, { type: 'leave', id: target.id, reason: 'left', tick });
      hub.closeUser(target, CLOSE.KICKED, 'kicked');
      return result(true, { target: target.id });
    }
    if (m.type === 'mod.mute') {
      const on = m.on !== false;
      const dur = Number.isInteger(m.durationMs) ? Math.min(Math.max(m.durationMs, 1000), 86_400_000) : 600_000;
      roles.setMute(user.tenantId, target.id, on, dur);
      audit(user, action, target.id, 'ok', m, on ? `${dur}ms` : 'off');
      for (const c of hub.clientsOf(target)) hub.send(c, { type: 'muted', on, durationMs: on ? dur : 0 });
      return result(true, { target: target.id, on });
    }
    if (m.type === 'owner.transfer') {
      if (m.confirm !== true) return result(false, { error: 'confirm_required' });
      roles.transferOwner(user.tenantId, user.id, target.id);
      audit(user, action, target.id, 'ok', m, 'owner->editor');
      for (const u of [user, target]) {
        const role = roles.roleOf(u);
        for (const c of hub.clientsOf(u)) hub.send(c, { type: 'role', role, capabilities: capabilitiesOf(role) });
      }
      return result(true, { target: target.id, role: 'owner' });
    }
    // role.set: có hiệu lực ngay với phiên đang mở (thu hồi lease không còn quyền, gửi capability mới).
    roles.setRole(user.tenantId, target.id, m.role);
    audit(user, action, target.id, 'ok', m, m.role);
    const caps = new Set(capabilitiesOf(m.role));
    const drop = [];
    if (!caps.has('layout.edit')) drop.push('edit');
    if (!caps.has('seat.use')) drop.push('seat');
    if (!caps.has('object.use')) drop.push('held');
    if (drop.length) releaseUser(target, 'revoked', drop);
    for (const c of hub.clientsOf(target)) hub.send(c, { type: 'role', role: m.role, capabilities: [...caps] });
    return result(true, { target: target.id, role: m.role });
  }

  /** Điểm vào cho message ngoài pose/leave/ping. Trả true nếu type được xử lý. */
  function handle(user, client, m) {
    switch (m.type) {
      case 'lease.acquire':
      case 'lease.heartbeat':
      case 'lease.release':
      case 'lease.query':
      case 'lease.force':
        handleLease(user, client, m);
        return true;
      case 'edit.commit':
        handleEdit(user, client, m);
        return true;
      case 'social_invite':
      case 'social_respond':
      case 'social_cancel':
      case 'social_play':
        handleSocial(user, client, m);
        return true;
      case 'appearance':
        handleAppearance(user, client, m);
        return true;
      case 'chat':
        handleChat(user, client, m);
        return true;
      case 'chat.history': {
        const d = can(roles.actorOf(user), 'chat.read', { tenantId: user.tenantId });
        if (!d.ok) return deny(client, m, d.reason) || true;
        hub.send(client, { type: 'chat.history', requestId: reqIdOf(m), messages: chat.history(user, m) });
        return true;
      }
      case 'chat.block': {
        const r = chat.setBlock(user, m.target, m.on !== false);
        hub.send(client, { type: 'chat.block', requestId: reqIdOf(m), ...r });
        return true;
      }
      case 'mod.kick':
      case 'mod.mute':
      case 'role.set':
      case 'owner.transfer':
      case 'audit.list':
      case 'member.list':
        handleModeration(user, client, m);
        return true;
      default:
        return false;
    }
  }

  let timer = null;
  function start() {
    timer = setInterval(step, TICK_MS);
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    snapshot,
    submitPose,
    leave,
    step,
    start,
    stop,
    handle,
    openSession,
    takeover,
    abortSession,
    isKicked: (user) => roles.isKicked(user.tenantId, user.id),
    roles,
    leases,
    epoch,
    getTick: () => tick,
  };
}
