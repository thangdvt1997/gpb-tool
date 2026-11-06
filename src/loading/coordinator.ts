import { computeBackoff, DEFAULT_BACKOFF, normalizeError, type BackoffOptions } from './backoff';
import type {
  AssetRequest, AssetState, Fetcher, LoadError, LoadResult, Priority, Progress,
} from './types';

export interface Scheduler {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (h: unknown) => void;
  now: () => number;
}

export interface CoordinatorOptions {
  fetcher: Fetcher<any>;
  maxConcurrent?: number;
  timeoutMs?: number;
  /** Số lần retry tự động tối đa (không tính lần đầu). */
  maxRetries?: number;
  backoff?: BackoffOptions;
  random?: () => number;
  scheduler?: Scheduler;
  isOnline?: () => boolean;
}

export interface Handle<T> {
  id: string;
  result: Promise<LoadResult<T>>;
  /** Hủy phần của consumer này; tải thật chỉ bị abort khi không còn consumer nào. */
  cancel: () => void;
}

const PRIO: Record<Priority, number> = { critical: 0, high: 1, normal: 2, low: 3 };

const defaultScheduler: Scheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

interface Entry {
  id: string;
  req: AssetRequest<any>;
  seq: number;
  prio: number;
  state: AssetState;
  consumers: Set<symbol>;
  waiters: Array<(r: LoadResult<any>) => void>;
  controller?: AbortController;
  timer?: unknown;
  retryTimer?: unknown;
  settled: boolean;
  /** token để bỏ kết quả của lần chạy cũ. */
  run: number;
}

export const assetId = (r: { key: string; version?: string }) => `${r.key}@${r.version ?? ''}`;

export function createLoadingCoordinator(opts: CoordinatorOptions) {
  const maxConcurrent = Math.max(1, opts.maxConcurrent ?? 4);
  const timeoutMs = opts.timeoutMs ?? 20000;
  const maxRetries = opts.maxRetries ?? 3;
  const backoff = opts.backoff ?? DEFAULT_BACKOFF;
  const random = opts.random ?? Math.random;
  const sch = opts.scheduler ?? defaultScheduler;

  const entries = new Map<string, Entry>();
  const cache = new Map<string, unknown>();
  const groups = new Map<string, string>(); // group -> id hiện hành
  const listeners = new Set<() => void>();
  let queue: Entry[] = [];
  let active = 0;
  let seq = 0;
  let disposed = false;

  const emit = () => { for (const l of [...listeners]) l(); };

  function settle(e: Entry, r: LoadResult<any>) {
    if (e.settled) return;
    e.settled = true;
    if (e.timer !== undefined) sch.clearTimeout(e.timer);
    if (e.retryTimer !== undefined) sch.clearTimeout(e.retryTimer);
    e.timer = e.retryTimer = undefined;
    const w = e.waiters; e.waiters = [];
    for (const f of w) f(r);
    emit();
  }

  function pump() {
    if (disposed) return;
    while (active < maxConcurrent && queue.length) {
      queue.sort((a, b) => a.prio - b.prio || a.seq - b.seq);
      const e = queue.shift()!;
      if (e.settled) continue;
      start(e);
    }
  }

  function start(e: Entry) {
    active++;
    const run = ++e.run;
    const ac = new AbortController();
    e.controller = ac;
    e.state = { ...e.state, status: 'loading', retryAt: undefined };
    emit();
    let finished = false;
    const done = (fn: () => void) => {
      if (finished) return;
      finished = true;
      if (e.timer !== undefined) sch.clearTimeout(e.timer);
      e.timer = undefined;
      active--;
      if (run === e.run && !e.settled) fn();
      pump();
    };
    e.timer = sch.setTimeout(() => {
      ac.abort();
      done(() => fail(e, { code: 'timeout', message: `timeout ${timeoutMs}ms`, retryable: true }));
    }, timeoutMs);
    let p: Promise<unknown>;
    try {
      p = Promise.resolve(opts.fetcher(e.req, {
        signal: ac.signal,
        attempt: e.state.attempt,
        onProgress: (b) => { if (run === e.run && !e.settled) { e.state = { ...e.state, bytes: b }; emit(); } },
      }));
    } catch (err) { p = Promise.reject(err); }
    p.then(
      (value) => done(() => {
        cache.set(e.id, value);
        e.state = { ...e.state, status: 'loaded', error: undefined };
        settle(e, { status: 'loaded', value, fromCache: false });
      }),
      (err) => done(() => {
        if (ac.signal.aborted && e.settled) return;
        fail(e, normalizeError(err));
      }),
    );
  }

  function fail(e: Entry, error: LoadError) {
    if (e.settled) return;
    if (error.code === 'cancelled') {
      e.state = { ...e.state, status: 'cancelled', error };
      settle(e, { status: 'cancelled' });
      return;
    }
    if (error.retryable && e.state.attempt < maxRetries) {
      const delay = computeBackoff(e.state.attempt, backoff, random);
      e.state = { ...e.state, status: 'retrying', attempt: e.state.attempt + 1, error, retryAt: sch.now() + delay };
      emit();
      e.retryTimer = sch.setTimeout(() => {
        e.retryTimer = undefined;
        if (e.settled) return;
        e.state = { ...e.state, status: 'queued' };
        queue.push(e);
        pump();
      }, delay);
      return;
    }
    if (!e.req.critical && e.req.fallback !== undefined) {
      e.state = { ...e.state, status: 'fallback', error };
      settle(e, { status: 'fallback', value: e.req.fallback, error });
      return;
    }
    e.state = { ...e.state, status: 'failed', error };
    settle(e, { status: 'failed', error });
  }

  function abortEntry(e: Entry) {
    if (e.settled) return;
    e.run++; // vô hiệu hóa callback của lần chạy hiện tại
    const wasLoading = e.state.status === 'loading';
    e.controller?.abort();
    queue = queue.filter((q) => q !== e);
    e.state = { ...e.state, status: 'cancelled' };
    if (wasLoading) active--;
    settle(e, { status: 'cancelled' });
    if (wasLoading) pump();
  }

  function request<T>(req: AssetRequest<T>): Handle<T> {
    const id = assetId(req);
    const token = Symbol(id);
    if (disposed) {
      return { id, result: Promise.resolve({ status: 'cancelled' } as LoadResult<T>), cancel() {} };
    }
    // Đổi đồ liên tục: request mới trong group hủy request cũ khác id.
    if (req.group) {
      const prev = groups.get(req.group);
      if (prev && prev !== id) { const pe = entries.get(prev); if (pe) abortEntry(pe); }
      groups.set(req.group, id);
    }
    if (cache.has(id)) {
      return { id, result: Promise.resolve({ status: 'loaded', value: cache.get(id) as T, fromCache: true }), cancel() {} };
    }
    let e = entries.get(id);
    if (e && (e.settled)) { entries.delete(id); e = undefined; }
    if (!e) {
      e = {
        id, req, seq: seq++, prio: PRIO[req.priority ?? 'normal'], consumers: new Set(), waiters: [],
        settled: false, run: 0,
        state: { key: req.key, id, status: 'queued', attempt: 0, critical: !!req.critical },
      };
      entries.set(id, e);
      queue.push(e);
    } else if (PRIO[req.priority ?? 'normal'] < e.prio) {
      e.prio = PRIO[req.priority ?? 'normal']; // nâng ưu tiên khi bị dedupe
      if (req.critical) { e.req = { ...e.req, critical: true }; e.state = { ...e.state, critical: true }; }
    }
    e.consumers.add(token);
    const ent = e;
    const result = new Promise<LoadResult<T>>((resolve) => ent.waiters.push(resolve as (r: LoadResult<any>) => void));
    emit();
    pump();
    return {
      id, result,
      cancel() {
        if (!ent.consumers.delete(token)) return;
        if (ent.consumers.size === 0) abortEntry(ent);
      },
    };
  }

  /** Thử lại thủ công asset đã failed/fallback/cancelled (reset bộ đếm retry). */
  function retry<T = unknown>(id: string): Handle<T> | null {
    const e = entries.get(id);
    if (!e || !['failed', 'fallback', 'cancelled'].includes(e.state.status)) return null;
    entries.delete(id);
    const r = e.req;
    return request<T>(r);
  }

  function cancel(id: string) { const e = entries.get(id); if (e) abortEntry(e); }
  function cancelAll() { for (const e of [...entries.values()]) abortEntry(e); }

  function getState(id: string): AssetState | undefined { return entries.get(id)?.state; }
  function getStates(): AssetState[] { return [...entries.values()].map((e) => e.state); }

  function progress(): Progress {
    const st = getStates();
    let loaded = 0, failed = 0, done = 0, criticalPending = 0, bl = 0, bt = 0, allKnown = st.length > 0;
    for (const s of st) {
      const fin = ['loaded', 'fallback', 'failed', 'cancelled'].includes(s.status);
      if (fin) done++;
      if (s.status === 'loaded') loaded++;
      if (s.status === 'failed') failed++;
      if (s.critical && !fin) criticalPending++;
      if (s.status === 'loaded') { /* đã xong: không cần byte */ bl += s.bytes?.total ?? 0; bt += s.bytes?.total ?? 0; if (s.bytes?.total === undefined) allKnown = false; }
      else if (!fin) { if (s.bytes?.total === undefined) allKnown = false; else { bl += s.bytes.loaded; bt += s.bytes.total; } }
    }
    return { total: st.length, done, loaded, failed, bytePercent: allKnown && bt > 0 ? Math.min(100, (bl / bt) * 100) : null, criticalPending };
  }

  function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

  function clearCache(id?: string) { if (id) cache.delete(id); else cache.clear(); }

  function dispose() {
    cancelAll();
    disposed = true;
    listeners.clear();
    entries.clear(); cache.clear(); queue = [];
  }

  return { request, retry, cancel, cancelAll, getState, getStates, progress, subscribe, clearCache, dispose,
    get activeCount() { return active; }, get queuedCount() { return queue.length; }, isOnline: opts.isOnline };
}

export type LoadingCoordinator = ReturnType<typeof createLoadingCoordinator>;
