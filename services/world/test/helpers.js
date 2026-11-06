// Dựng world với kết nối giả cho các test TASK 24-27 (không phải file test).
import { createConnectionHandler } from '../src/connection.js';
import { createHub } from '../src/hub.js';
import { createPresenceStore } from '../src/presence.js';
import { createRateLimiter } from '../src/rateLimit.js';
import { createWorld } from '../src/world.js';

export function fakeConn() {
  return {
    sent: [],
    bufferedAmount: 0,
    closed: null,
    send(text) {
      this.sent.push(JSON.parse(text));
    },
    close(code, reason) {
      this.closed = { code, reason };
    },
    terminate() {},
    last(type) {
      return [...this.sent].reverse().find((m) => m.type === type);
    },
    all(type) {
      return this.sent.filter((m) => m.type === type);
    },
  };
}

export function setup(over = {}) {
  const clock = { t: 1_000_000 };
  const now = () => clock.t;
  const presence = createPresenceStore({ ttlMs: 15_000, maxPerTenant: 50 });
  const limiter = createRateLimiter({ capacity: 10, refillPerSec: 10 });
  const hub = createHub({ maxClients: 50, maxPerUser: 2, maxBufferBytes: 1 << 20 });
  const world = createWorld({ presence, limiter, hub, now, ...over });
  function connect(user, opts) {
    const conn = fakeConn();
    world.takeover(user);
    const opened = world.openSession(user, opts);
    const { client, error } = hub.add(user, conn);
    if (error) return { error };
    hub.send(client, { ...world.snapshot(user), ...opened });
    const h = createConnectionHandler({ world, hub, client, now });
    // Mỗi tin cách nhau đủ thời gian để không dính flood 20 tin/giây trong test.
    const send = (msg) => {
      clock.t += 60;
      h.onMessage(Buffer.from(JSON.stringify(msg)), false);
    };
    return { conn, client, h, send, snap: conn.sent[0] };
  }
  return { clock, hub, world, presence, connect };
}

export const mk = (id, role, tenantId = 't1') => ({ id, name: `U${id}`, tenantId, accountRole: role });
export const OWNER = mk('o', 'admin');
export const EDITOR = mk('e', 'it');
export const MEMBER = mk('m', 'employee');
export const MEMBER2 = mk('m2', 'employee');
export const GUEST = mk('g', undefined);
export const pose = (seq, x = -4, z = 3) => ({ type: 'pose', v: 1, seq, x, z, yaw: 0, anim: 'idle' });
