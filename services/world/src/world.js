// Lõi world: nối presence, rate limit và hub; chạy tick phát pose và quét presence hết hạn.
// Không phụ thuộc transport, test được bằng kết nối giả.

import { PRESENCE_TTL_MS, PROTOCOL_VERSION, TICK_MS } from './config.js';
import { PoseError, parsePose } from './pose.js';
import { PresenceError } from './presence.js';

export function createWorld({ presence, limiter, hub, now = Date.now }) {
  let tick = 0;

  function snapshot(user) {
    return {
      type: 'snapshot',
      v: PROTOCOL_VERSION,
      tick,
      serverTime: now(),
      self: { id: user.id },
      ttlMs: PRESENCE_TTL_MS,
      players: presence.list(user.tenantId),
    };
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
      const { created, entry, corrected } = presence.update(user, pose, t);
      if (created) hub.broadcast(user.tenantId, { type: 'join', id: entry.id, name: entry.name, tick });
      const accepted = { x: entry.x, z: entry.z, yaw: entry.yaw, anim: entry.anim };
      return { type: 'ack', seq: entry.seq, tick, accepted, corrected };
    } catch (err) {
      if (err instanceof PresenceError) return { type: 'error', code: err.code, seq };
      throw err;
    }
  }

  /** reason: 'left' (client báo rời) hoặc 'disconnect' (đóng kết nối cuối). */
  function leave(user, reason) {
    if (presence.remove(user.tenantId, user.id)) {
      hub.broadcast(user.tenantId, { type: 'leave', id: user.id, reason, tick });
    }
  }

  // Một bước tick: quét hết hạn rồi phát mọi pose thay đổi, mỗi tenant một tin nhắn.
  function step() {
    tick += 1;
    const t = now();
    for (const { tenantId, id } of presence.sweep(t)) {
      hub.broadcast(tenantId, { type: 'leave', id, reason: 'timeout', tick });
    }
    for (const [tenantId, poses] of presence.drainDirty()) {
      hub.broadcast(tenantId, { type: 'poses', tick, serverTime: t, poses });
    }
    if (tick % 600 === 0) limiter.prune(t);
  }

  let timer = null;
  function start() {
    timer = setInterval(step, TICK_MS);
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { snapshot, submitPose, leave, step, start, stop, getTick: () => tick };
}
