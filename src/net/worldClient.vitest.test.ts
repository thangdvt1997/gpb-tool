import { describe, expect, it } from 'vitest';
import { backoffDelay, WorldClient, type SocketLike } from './worldClient';

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  closedWith: number | undefined;
  onopen: SocketLike['onopen'] = null;
  onmessage: SocketLike['onmessage'] = null;
  onclose: SocketLike['onclose'] = null;
  onerror: SocketLike['onerror'] = null;
  constructor(public url: string) {}
  send(d: string) {
    this.sent.push(JSON.parse(d));
  }
  close(code?: number) {
    this.closedWith = code;
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  push(m: unknown) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

function harness(extra: Record<string, unknown> = {}) {
  let t = 1000;
  const socks: FakeSocket[] = [];
  const timers: { id: number; at: number; fn: () => void }[] = [];
  let nid = 0;
  const client = new WorldClient({
    url: 'ws://x/api/world/ws',
    createSocket: (u) => {
      const s = new FakeSocket(u);
      socks.push(s);
      return s;
    },
    now: () => t,
    random: () => 0.5,
    setTimer: (fn, ms) => {
      timers.push({ id: ++nid, at: t + ms, fn });
      return nid;
    },
    clearTimer: (h) => {
      const i = timers.findIndex((x) => x.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
    ...extra,
  });
  const advance = (ms: number) => {
    const end = t + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const n = timers[0];
      if (!n || n.at > end) break;
      timers.shift();
      t = n.at;
      n.fn();
    }
    t = end;
  };
  const snap = (over: Record<string, unknown> = {}) => ({
    type: 'snapshot', v: 1, tick: 1, serverTime: t, self: { id: 'me' }, ttlMs: 15000, players: [],
    epoch: 'E1', eseq: 0, role: 'member', capabilities: ['chat.send'], leases: [], objects: [],
    session: { id: 's', resumeToken: 'TOK1', resumeTtlMs: 120000 }, resumed: null, ...over,
  });
  return { client, socks, timers, advance, snap, now: () => t, last: () => socks[socks.length - 1] };
}

describe('backoffDelay', () => {
  const o = { baseMs: 500, maxMs: 8000, maxAttempts: 10 };
  it('tăng theo mũ và bị chặn trần', () => {
    expect(backoffDelay(0, o, () => 1)).toBe(500);
    expect(backoffDelay(2, o, () => 1)).toBe(2000);
    expect(backoffDelay(20, o, () => 1)).toBe(8000);
  });
  it('jitter nằm trong [cap/2, cap] và khác nhau giữa các client', () => {
    expect(backoffDelay(3, o, () => 0)).toBe(2000);
    expect(backoffDelay(3, o, () => 1)).toBe(4000);
    expect(backoffDelay(3, o, () => 0.3)).not.toBe(backoffDelay(3, o, () => 0.9));
  });
});

describe('WorldClient trạng thái', () => {
  it('connecting -> resyncing -> connected khi có snapshot; chưa connected thì chưa gửi pose', () => {
    const h = harness();
    const states: string[] = [];
    h.client.onState((s) => states.push(s));
    h.client.connect();
    h.last().open();
    expect(h.client.sendPose({ seq: 1, x: 0, z: 0, yaw: 0 })).toBe(false);
    h.last().push(h.snap());
    expect(states).toEqual(['connecting', 'resyncing', 'connected']);
    expect(h.client.sendPose({ seq: 1, x: 0, z: 0, yaw: 0 })).toBe(true);
    expect(h.client.selfId).toBe('me');
    expect(h.client.role).toBe('member');
  });

  it('mất socket thì reconnecting, kết nối lại dùng resume token và eseq cuối', () => {
    const h = harness();
    h.client.connect();
    h.last().open();
    h.last().push(h.snap({ eseq: 3 }));
    h.last().push({ type: 'lease', resource: 'seat:a', ownerId: 'x', fence: 2, revision: 1, reason: 'acquired', eseq: 4 });
    h.last().drop();
    expect(h.client.state).toBe('reconnecting');
    expect(h.socks.length).toBe(1);
    h.advance(1000);
    expect(h.socks.length).toBe(2);
    expect(h.last().url).toBe('ws://x/api/world/ws?resume=TOK1&last=4');
  });

  it('đo thời gian phục hồi và reset số lần thử khi connected lại', () => {
    const h = harness();
    h.client.connect();
    h.last().open();
    h.last().push(h.snap());
    h.last().drop();
    h.advance(800);
    h.last().open();
    h.last().push(h.snap({ session: { id: 's', resumeToken: 'TOK2', resumeTtlMs: 1 } }));
    expect(h.client.lastRecoveryMs).toBe(800);
    expect(h.client.attempts).toBe(0);
    expect(h.client.state).toBe('connected');
  });

  it('4401 -> authExpired, 4403 -> kicked, 4409 -> replaced: không tự thử lại và quên token', () => {
    for (const [code, state] of [[4401, 'authExpired'], [4403, 'kicked'], [4409, 'replaced']] as const) {
      const h = harness();
      h.client.connect();
      h.last().open();
      h.last().push(h.snap());
      h.last().drop(code);
      expect(h.client.state).toBe(state);
      h.advance(60_000);
      expect(h.socks.length).toBe(1);
      expect(h.timers.length).toBe(0);
    }
  });

  it('quá số lần thử thì disconnected; retry() thử lại thủ công', () => {
    const h = harness({ backoff: { maxAttempts: 2, baseMs: 100, maxMs: 100 } });
    h.client.connect();
    h.last().drop();
    h.advance(200);
    h.last().drop();
    h.advance(200);
    h.last().drop();
    expect(h.client.state).toBe('disconnected');
    const n = h.socks.length;
    h.client.retry();
    expect(h.socks.length).toBe(n + 1);
    expect(h.client.state).toBe('connecting');
  });

  it('disconnect(): gửi leave, đóng socket, không còn timer', () => {
    const h = harness();
    h.client.connect();
    h.last().open();
    const s = h.last();
    s.push(h.snap());
    h.client.disconnect();
    expect(s.sent[s.sent.length - 1]).toEqual({ type: 'leave' });
    expect(s.closedWith).toBe(1000);
    expect(h.timers.length).toBe(0);
    expect(h.client.state).toBe('disconnected');
    h.advance(60_000);
    expect(h.socks.length).toBe(1);
  });

  it('dispose(): không còn listener hay timer; đóng đang reconnect cũng dọn sạch', () => {
    const h = harness();
    let calls = 0;
    h.client.onState(() => (calls += 1));
    h.client.connect();
    h.last().open();
    h.last().push(h.snap());
    h.last().drop();
    h.client.dispose();
    expect(h.timers.length).toBe(0);
    const before = calls;
    h.advance(60_000);
    expect(h.socks.length).toBe(1);
    expect(calls).toBe(before);
  });
});

describe('ping/pong và phát hiện mất kết nối', () => {
  it('gửi ping định kỳ và tính RTT từ pong', () => {
    const h = harness({ pingMs: 1000 });
    h.client.connect();
    h.last().open();
    h.last().push(h.snap());
    h.advance(1000);
    const ping = h.last().sent.find((m) => m.type === 'ping') as { t: number };
    expect(ping).toBeTruthy();
    h.advance(40);
    h.last().push({ type: 'pong', t: ping.t, serverTime: 0, tick: 1 });
    expect(h.client.rttMs).toBe(40);
  });

  it('im lặng quá deadAfterMs: đóng socket chết và lên lịch reconnect', () => {
    const h = harness({ pingMs: 1000, deadAfterMs: 3000 });
    h.client.connect();
    h.last().open();
    h.last().push(h.snap());
    const first = h.last();
    h.advance(4500);
    expect(first.closedWith).toBe(4000);
    expect(h.client.state).toBe('reconnecting');
    h.advance(2000);
    expect(h.socks.length).toBe(2);
  });

  it('có tin đến thì không bị coi là chết', () => {
    const h = harness({ pingMs: 1000, deadAfterMs: 3000 });
    h.client.connect();
    h.last().open();
    h.last().push(h.snap());
    for (let i = 0; i < 6; i++) {
      h.advance(1000);
      h.last().push({ type: 'pong', t: null, serverTime: 0, tick: 1 });
    }
    expect(h.client.state).toBe('connected');
  });
});

describe('hàng đợi gửi khi mất kết nối', () => {
  it('chat được xếp hàng và gửi lại sau khi connected; pose và acquire thì bỏ', () => {
    const h = harness();
    h.client.connect();
    h.last().open();
    h.last().push(h.snap());
    h.last().drop();
    expect(h.client.sendPose({ seq: 2, x: 0, z: 0, yaw: 0 })).toBe(false);
    expect(h.client.send({ type: 'lease.acquire', resource: 'seat:a', requestId: 'r' })).toBe(false);
    const id = h.client.sendChat('xin chào', 'room');
    expect(h.client.queued).toBe(1);
    h.advance(1000);
    h.last().open();
    expect(h.last().sent.length).toBe(0); // chưa resync xong thì chưa gửi
    h.last().push(h.snap());
    const chat = h.last().sent.find((m) => m.type === 'chat');
    expect(chat).toMatchObject({ clientMsgId: id, text: 'xin chào' });
    expect(h.client.queued).toBe(0);
  });

  it('giới hạn kích thước hàng đợi (bỏ cái cũ nhất) và hạn tuổi', () => {
    const h = harness({ queueMax: 3, queueTtlMs: 5000 });
    h.client.connect();
    h.last().drop();
    for (let i = 0; i < 5; i++) h.client.send({ type: 'chat', channel: 'room', text: `t${i}`, clientMsgId: `c${i}` });
    expect(h.client.queued).toBe(3);
    h.advance(6000);
    h.client.send({ type: 'chat', channel: 'room', text: 'mới', clientMsgId: 'cx' });
    expect(h.client.queued).toBe(1);
  });
});

describe('sự kiện, resume và lease', () => {
  it('bỏ sự kiện có eseq đã áp (trùng/cũ)', () => {
    const h = harness();
    const got: string[] = [];
    h.client.onMessage((m) => m.type === 'chat' && got.push(m.id));
    h.client.connect();
    h.last().open();
    h.last().push(h.snap());
    const chat = (id: string, eseq: number) => ({ type: 'chat', id, eseq, channel: 'room', from: { id: 'a', name: 'A' }, text: 'x', at: 1 });
    h.last().push(chat('m1', 1));
    h.last().push(chat('m1', 1));
    h.last().push(chat('m0', 0 + 0));
    h.last().push(chat('m2', 2));
    expect(got).toEqual(['m1', 'm2']);
  });

  it('resume ok phát lại sự kiện bị lỡ theo thứ tự; full hoặc epoch mới thì không phát lại', () => {
    const run = (resumed: unknown, epoch = 'E1') => {
      const h = harness();
      const got: string[] = [];
      h.client.onMessage((m) => m.type === 'chat' && got.push(m.id));
      h.client.connect();
      h.last().open();
      h.last().push(h.snap());
      h.last().drop();
      h.advance(1000);
      h.last().open();
      h.last().push(h.snap({ epoch, eseq: 6, resumed }));
      return { got, h };
    };
    const ev = (id: string, eseq: number) => ({ type: 'chat', id, eseq, channel: 'room', from: { id: 'a', name: 'A' }, text: 'x', at: 1 });
    const ok = run({ ok: true, full: false, events: [ev('m5', 5), ev('m6', 6)] });
    expect(ok.got).toEqual(['m5', 'm6']);
    expect(ok.h.client.lastEventSeq).toBe(6);
    expect(run({ ok: true, full: true, events: [] }).got).toEqual([]);
    expect(run({ ok: true, full: false, events: [ev('m5', 5)] }, 'E2').got).toEqual([]);
    expect(run({ ok: false, reason: 'expired', full: true }).got).toEqual([]);
  });

  it('theo dõi lease của mình, gửi heartbeat, quên khi bị đổi chủ', () => {
    const h = harness({ leaseHeartbeatMs: 1000 });
    h.client.connect();
    h.last().open();
    h.last().push(h.snap());
    const rid = h.client.acquire('seat:s1');
    h.last().push({ type: 'lease.result', op: 'acquire', requestId: rid, resource: 'seat:s1', ok: true, lease: { resource: 'seat:s1', ownerId: 'me', leaseId: 'L1', fence: 1, revision: 1 } });
    expect(h.client.ownedLeases().length).toBe(1);
    h.advance(1000);
    expect(h.last().sent.find((m) => m.type === 'lease.heartbeat')).toMatchObject({ leaseId: 'L1', fence: 1 });
    h.last().push({ type: 'lease', resource: 'seat:s1', ownerId: 'other', fence: 2, revision: 2, reason: 'acquired', eseq: 1 });
    expect(h.client.ownedLeases().length).toBe(0);
  });

  it('snapshot sau reconnect: ghế đã mất thì không còn trong owned', () => {
    const h = harness();
    h.client.connect();
    h.last().open();
    h.last().push(h.snap({ leases: [{ resource: 'seat:s1', ownerId: 'me', leaseId: 'L1', fence: 1, revision: 1 }] }));
    expect(h.client.ownedLeases().length).toBe(1);
    h.last().drop();
    h.advance(1000);
    h.last().open();
    h.last().push(h.snap({ leases: [{ resource: 'seat:s1', ownerId: 'other', leaseId: 'L2', fence: 2, revision: 2 }] }));
    expect(h.client.ownedLeases().length).toBe(0);
  });

  it('lưu resume token vào storage và đọc lại ở lần tạo sau', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    const h = harness({ storage });
    h.client.connect();
    h.last().open();
    h.last().push(h.snap());
    expect(mem.get('world.resume')).toBe('TOK1');
    const h2 = harness({ storage });
    h2.client.connect();
    expect(h2.last().url).toContain('resume=TOK1');
    h.client.disconnect();
    expect(mem.has('world.resume')).toBe(false);
  });
});
