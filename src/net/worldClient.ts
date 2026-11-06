// Client WebSocket của world service: máy trạng thái kết nối, reconnect backoff có jitter, resume token,
// ping/pong phát hiện mất kết nối, hàng đợi gửi có giới hạn (chỉ loại tin an toàn để gửi lại), thay phiên nhiều tab.
// Không phụ thuộc React hay DOM; WebSocket, đồng hồ, timer, random đều tiêm được để test.

import { CLOSE_CODES, type LeaseView, type ServerMessage, type Snapshot } from './protocol';

export type ConnState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'resyncing' // socket đã mở, chờ snapshot; chưa cho gửi input gameplay
  | 'disconnected' // hết số lần thử hoặc người dùng rời; thử lại thủ công
  | 'authExpired'
  | 'replaced' // tab khác đã thay phiên này
  | 'kicked';

export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number; reason?: string }) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
}

export interface KeyValueStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export interface BackoffOptions {
  baseMs: number;
  maxMs: number;
  maxAttempts: number;
}

export interface WorldClientOptions {
  url: string;
  createSocket?: (url: string) => SocketLike;
  now?: () => number;
  random?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
  /** Nơi lưu resume token (mặc định không lưu: tải lại trang là phiên mới). Truyền sessionStorage để sống qua F5. */
  storage?: KeyValueStore | null;
  backoff?: Partial<BackoffOptions>;
  queueMax?: number;
  queueTtlMs?: number;
  pingMs?: number;
  /** Quá thời gian này không nhận gì từ server thì coi là mất kết nối. */
  deadAfterMs?: number;
  leaseHeartbeatMs?: number;
}

const OPEN = 1;
const STORE_KEY = 'world.resume';

/** Backoff mũ với "equal jitter": nửa cố định + nửa ngẫu nhiên, tránh bầy đàn kết nối lại cùng lúc. */
export function backoffDelay(attempt: number, o: BackoffOptions, random: () => number): number {
  const cap = Math.min(o.maxMs, o.baseMs * 2 ** Math.max(0, attempt));
  return Math.round(cap / 2 + (cap / 2) * random());
}

/** Loại tin được phép xếp hàng khi mất kết nối và gửi lại sau resync (có idempotency hoặc vô hại khi lặp). */
const QUEUEABLE = new Set(['chat', 'chat.block', 'lease.release']);

type Listener = (msg: ServerMessage) => void;

export class WorldClient {
  state: ConnState = 'idle';
  selfId: string | null = null;
  role: Snapshot['role'] = 'guest';
  capabilities = new Set<string>();
  rttMs: number | null = null;
  lastEventSeq = 0;
  epoch: string | null = null;
  attempts = 0;
  /** Giây phục hồi gần nhất (ms) để đo/hiện; null nếu chưa từng mất kết nối. */
  lastRecoveryMs: number | null = null;
  lastCloseCode: number | null = null;

  private sock: SocketLike | null = null;
  private resumeToken: string | null = null;
  private msgListeners = new Set<Listener>();
  private stateListeners = new Set<(s: ConnState) => void>();
  private queue: { msg: Record<string, unknown>; at: number }[] = [];
  private owned = new Map<string, LeaseView>();
  private timers: unknown[] = [];
  private retryTimer: unknown = null;
  private pingTimer: unknown = null;
  private hbTimer: unknown = null;
  private lastRx = 0;
  private lostAt: number | null = null;
  private stopped = true;
  private reqN = 0;

  private readonly opt: Required<Omit<WorldClientOptions, 'storage' | 'createSocket'>> & {
    storage: KeyValueStore | null;
    createSocket: (url: string) => SocketLike;
  };

  constructor(o: WorldClientOptions) {
    this.opt = {
      url: o.url,
      createSocket: o.createSocket ?? ((u) => new WebSocket(u) as unknown as SocketLike),
      now: o.now ?? Date.now,
      random: o.random ?? Math.random,
      setTimer: o.setTimer ?? ((fn, ms) => setTimeout(fn, ms)),
      clearTimer: o.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>)),
      storage: o.storage ?? null,
      backoff: {},
      queueMax: o.queueMax ?? 20,
      queueTtlMs: o.queueTtlMs ?? 30_000,
      pingMs: o.pingMs ?? 10_000,
      deadAfterMs: o.deadAfterMs ?? 25_000,
      leaseHeartbeatMs: o.leaseHeartbeatMs ?? 5_000,
    };
    this.backoffOpt = { baseMs: 500, maxMs: 15_000, maxAttempts: 12, ...o.backoff };
    try {
      this.resumeToken = this.opt.storage?.getItem(STORE_KEY) ?? null;
    } catch {
      this.resumeToken = null;
    }
  }

  private backoffOpt: BackoffOptions;

  // ----- đăng ký -----
  onMessage(fn: Listener): () => void {
    this.msgListeners.add(fn);
    return () => this.msgListeners.delete(fn);
  }
  onState(fn: (s: ConnState) => void): () => void {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }

  private setState(s: ConnState): void {
    if (this.state === s) return;
    this.state = s;
    for (const fn of [...this.stateListeners]) fn(s);
  }

  /** Cho phép gửi input gameplay (pose, acquire, edit). Chỉ khi đã resync xong. */
  get ready(): boolean {
    return this.state === 'connected';
  }

  // ----- vòng đời -----
  connect(): void {
    if (!this.stopped && this.sock) return;
    this.stopped = false;
    this.attempts = 0;
    this.open('connecting');
  }

  /** Thử lại thủ công sau disconnected (không áp dụng cho authExpired/kicked/replaced: cần hành động khác). */
  retry(): void {
    if (this.state !== 'disconnected' && this.state !== 'replaced') return;
    this.stopped = false;
    this.attempts = 0;
    this.open('connecting');
  }

  /** Rời phòng: báo server nhả lease, đóng socket, dọn timer và hàng đợi. */
  disconnect(): void {
    this.stopped = true;
    if (this.sock && this.sock.readyState === OPEN) {
      try {
        this.sock.send(JSON.stringify({ type: 'leave' }));
      } catch {
        // Bỏ qua.
      }
    }
    this.teardownSocket(1000, 'client_leave');
    this.clearAllTimers();
    this.queue = [];
    this.owned.clear();
    this.forgetSession();
    this.setState('disconnected');
  }

  private forgetSession(): void {
    this.resumeToken = null;
    try {
      this.opt.storage?.removeItem(STORE_KEY);
    } catch {
      // Bỏ qua.
    }
  }

  private buildUrl(): string {
    if (!this.resumeToken) return this.opt.url;
    const sep = this.opt.url.includes('?') ? '&' : '?';
    return `${this.opt.url}${sep}resume=${encodeURIComponent(this.resumeToken)}&last=${this.lastEventSeq}`;
  }

  private open(state: ConnState): void {
    this.clearRetry();
    this.teardownSocket();
    this.setState(state);
    let sock: SocketLike;
    try {
      sock = this.opt.createSocket(this.buildUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.sock = sock;
    sock.onopen = () => {
      if (this.sock !== sock) return;
      this.lastRx = this.opt.now();
      this.setState('resyncing');
      this.startPing();
    };
    sock.onmessage = (ev) => {
      if (this.sock !== sock) return;
      this.lastRx = this.opt.now();
      this.receive(ev.data);
    };
    sock.onerror = () => {
      // Lỗi luôn kèm close; xử lý ở onclose.
    };
    sock.onclose = (ev) => {
      if (this.sock !== sock) return;
      this.handleClose(ev.code);
    };
  }

  private teardownSocket(code?: number, reason?: string): void {
    const s = this.sock;
    this.sock = null;
    this.stopPing();
    this.stopHeartbeat();
    if (!s) return;
    s.onopen = s.onmessage = s.onclose = s.onerror = null;
    try {
      s.close(code, reason);
    } catch {
      // Bỏ qua.
    }
  }

  private handleClose(code: number): void {
    this.lastCloseCode = code;
    this.sock = null;
    this.stopPing();
    this.stopHeartbeat();
    if (this.stopped) return;
    if (this.lostAt === null) this.lostAt = this.opt.now();
    // Mã cuối cùng: không tự kết nối lại.
    if (code === CLOSE_CODES.UNAUTHENTICATED) return this.finalState('authExpired');
    if (code === CLOSE_CODES.KICKED) return this.finalState('kicked');
    if (code === CLOSE_CODES.REPLACED) return this.finalState('replaced');
    this.scheduleReconnect();
  }

  private finalState(s: ConnState): void {
    this.stopped = true;
    this.forgetSession();
    this.clearAllTimers();
    this.queue = [];
    this.owned.clear();
    this.setState(s);
  }

  private scheduleReconnect(): void {
    if (this.attempts >= this.backoffOpt.maxAttempts) {
      this.setState('disconnected');
      return;
    }
    const delay = backoffDelay(this.attempts, this.backoffOpt, this.opt.random);
    this.attempts += 1;
    this.setState('reconnecting');
    this.retryTimer = this.opt.setTimer(() => {
      this.retryTimer = null;
      if (!this.stopped) this.open('reconnecting');
    }, delay);
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) this.opt.clearTimer(this.retryTimer);
    this.retryTimer = null;
  }

  // ----- ping/pong -----
  private startPing(): void {
    this.stopPing();
    const tickFn = () => {
      this.pingTimer = this.opt.setTimer(tickFn, this.opt.pingMs);
      const now = this.opt.now();
      if (now - this.lastRx > this.opt.deadAfterMs) {
        // Im lặng quá lâu: socket có thể đã chết mà không có close. Đóng chủ động rồi kết nối lại.
        this.lastCloseCode = 4000;
        this.teardownSocket(4000, 'dead');
        if (this.lostAt === null) this.lostAt = now;
        if (!this.stopped) this.scheduleReconnect();
        return;
      }
      this.rawSend({ type: 'ping', t: now });
    };
    this.pingTimer = this.opt.setTimer(tickFn, this.opt.pingMs);
  }
  private stopPing(): void {
    if (this.pingTimer !== null) this.opt.clearTimer(this.pingTimer);
    this.pingTimer = null;
  }

  // ----- nhận -----
  private receive(data: unknown): void {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(String(data)) as ServerMessage;
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof (msg as { type?: unknown }).type !== 'string') return;
    if (msg.type === 'snapshot') return this.onSnapshot(msg);
    if (msg.type === 'pong') {
      if (typeof msg.t === 'number') this.rttMs = Math.max(0, this.opt.now() - msg.t);
    } else if (msg.type === 'role') {
      this.role = msg.role;
      this.capabilities = new Set(msg.capabilities);
    }
    // Sự kiện tin cậy có eseq: bỏ cái đã áp (trùng/cũ), cập nhật mốc.
    const eseq = (msg as { eseq?: number }).eseq;
    if (typeof eseq === 'number') {
      if (eseq <= this.lastEventSeq) return;
      this.lastEventSeq = eseq;
    }
    this.trackLeases(msg);
    this.emit(msg);
  }

  private emit(msg: ServerMessage): void {
    for (const fn of [...this.msgListeners]) fn(msg);
  }

  private onSnapshot(snap: Snapshot): void {
    const newEpoch = this.epoch !== null && this.epoch !== snap.epoch;
    this.epoch = snap.epoch;
    this.selfId = snap.self.id;
    this.role = snap.role;
    this.capabilities = new Set(snap.capabilities);
    // Ghế/vật cầm: chỉ còn của mình nếu server vẫn ghi nhận (không tin trạng thái cục bộ).
    this.owned.clear();
    for (const l of snap.leases) if (l.ownerId === snap.self.id && l.leaseId) this.owned.set(l.resource, l);
    if (snap.session) {
      this.resumeToken = snap.session.resumeToken;
      try {
        this.opt.storage?.setItem(STORE_KEY, snap.session.resumeToken);
      } catch {
        // Bỏ qua.
      }
    }
    // Snapshot đầy đủ luôn là nguồn sự thật. Chat/sự kiện bị lỡ nằm trong resumed.events (đã sắp theo eseq).
    const replay = snap.resumed?.ok && !snap.resumed.full && !newEpoch ? snap.resumed.events ?? [] : [];
    this.lastEventSeq = snap.eseq;
    this.emit(snap);
    for (const ev of replay) this.emit(ev);
    if (this.lostAt !== null) {
      this.lastRecoveryMs = this.opt.now() - this.lostAt;
      this.lostAt = null;
    }
    this.attempts = 0;
    this.setState('connected');
    this.startHeartbeat();
    this.flushQueue();
  }

  // ----- gửi -----
  private rawSend(msg: Record<string, unknown>): boolean {
    if (!this.sock || this.sock.readyState !== OPEN) return false;
    try {
      this.sock.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gửi một tin. Khi chưa sẵn sàng: loại có idempotency (chat, chat.block, lease.release) vào hàng đợi giới hạn;
   * các loại khác (pose, acquire, edit.commit, mod.*) bị bỏ và trả false, vì server là nguồn sự thật sau resync.
   */
  send(msg: Record<string, unknown>): boolean {
    const type = String(msg.type);
    if (type === 'ping' || type === 'leave') return this.rawSend(msg);
    if (this.ready && this.rawSend(msg)) return true;
    if (!QUEUEABLE.has(type) || this.stopped) return false;
    const now = this.opt.now();
    this.queue = this.queue.filter((q) => now - q.at <= this.opt.queueTtlMs);
    if (this.queue.length >= this.opt.queueMax) this.queue.shift();
    this.queue.push({ msg, at: now });
    return true;
  }

  get queued(): number {
    return this.queue.length;
  }

  private flushQueue(): void {
    const now = this.opt.now();
    const items = this.queue.filter((q) => now - q.at <= this.opt.queueTtlMs);
    this.queue = [];
    for (const q of items) this.rawSend(q.msg);
  }

  newId(prefix = 'r'): string {
    this.reqN += 1;
    return `${prefix}${this.opt.now().toString(36)}${this.reqN.toString(36)}${Math.floor(this.opt.random() * 1e6).toString(36)}`;
  }

  // ----- API tiện cho gameplay -----
  sendPose(p: { seq: number; x: number; z: number; yaw: number; anim?: string }): boolean {
    return this.send({ type: 'pose', v: 1, ...p });
  }

  /** Gửi chat; trả clientMsgId để UI theo dõi pending/sent/failed. Có thể xếp hàng khi mất mạng. */
  sendChat(text: string, channel: 'room' | 'near'): string {
    const clientMsgId = this.newId('c');
    this.send({ type: 'chat', channel, text, clientMsgId });
    return clientMsgId;
  }

  acquire(resource: string): string {
    const requestId = this.newId();
    this.send({ type: 'lease.acquire', resource, requestId });
    return requestId;
  }

  release(resource: string): void {
    const l = this.owned.get(resource);
    if (!l) return;
    this.owned.delete(resource);
    this.send({ type: 'lease.release', resource, leaseId: l.leaseId, fence: l.fence });
  }

  ownedLeases(): LeaseView[] {
    return [...this.owned.values()];
  }

  private trackLeases(msg: ServerMessage): void {
    if (msg.type === 'lease.result' && msg.ok && msg.lease && msg.resource && (msg.op === 'acquire' || msg.op === 'heartbeat')) {
      if (msg.lease.ownerId === this.selfId) this.owned.set(msg.resource, msg.lease);
    } else if (msg.type === 'lease.result' && !msg.ok && msg.resource && (msg.error === 'lease_lost' || msg.error === 'stale_token')) {
      this.owned.delete(msg.resource);
    } else if (msg.type === 'lease' && msg.ownerId !== this.selfId) {
      this.owned.delete(msg.resource);
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    const beat = () => {
      this.hbTimer = this.opt.setTimer(beat, this.opt.leaseHeartbeatMs);
      for (const l of this.owned.values()) {
        this.rawSend({ type: 'lease.heartbeat', resource: l.resource, leaseId: l.leaseId, fence: l.fence });
      }
    };
    this.hbTimer = this.opt.setTimer(beat, this.opt.leaseHeartbeatMs);
  }
  private stopHeartbeat(): void {
    if (this.hbTimer !== null) this.opt.clearTimer(this.hbTimer);
    this.hbTimer = null;
  }

  private clearAllTimers(): void {
    this.clearRetry();
    this.stopPing();
    this.stopHeartbeat();
    for (const t of this.timers) this.opt.clearTimer(t);
    this.timers = [];
  }

  /** Dọn hết khi component unmount: không còn socket, timer, listener. */
  dispose(): void {
    this.stopped = true;
    this.teardownSocket(1000, 'dispose');
    this.clearAllTimers();
    this.queue = [];
    this.owned.clear();
    this.msgListeners.clear();
    this.stateListeners.clear();
  }
}
