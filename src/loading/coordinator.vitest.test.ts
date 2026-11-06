import { describe, it, expect } from 'vitest';
import { createLoadingCoordinator, type Scheduler } from './coordinator';
import { computeBackoff, redactUrl, classifyHttp } from './backoff';
import { createContextRecovery } from './contextRecovery';

function fakeSched() {
  let t = 0; let id = 0;
  const q = new Map<number, { at: number; fn: () => void }>();
  const s: Scheduler = {
    now: () => t,
    setTimeout: (fn, ms) => { q.set(++id, { at: t + ms, fn }); return id; },
    clearTimeout: (h) => { q.delete(h as number); },
  };
  const advance = async (ms: number) => {
    const end = t + ms;
    for (;;) {
      await flush();
      const next = [...q.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      q.delete(next[0]); t = next[1].at; next[1].fn();
    }
    t = end; await flush();
  };
  return { s, advance, pending: () => q.size };
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const deferred = <T,>() => { let res!: (v: T) => void, rej!: (e: unknown) => void; const p = new Promise<T>((a, b) => { res = a; rej = b; }); return { p, res, rej }; };

describe('backoff', () => {
  it('tăng theo mũ, có jitter, bị chặn trần', () => {
    const o = { baseMs: 100, maxMs: 1000, factor: 2 };
    expect(computeBackoff(0, o, () => 0)).toBe(50);
    expect(computeBackoff(0, o, () => 0.999)).toBe(100);
    expect(computeBackoff(10, o, () => 0)).toBe(500);
  });
  it('redact URL và phân loại http', () => {
    expect(redactUrl('https://a/b.glb?sig=SECRET#x')).toBe('https://a/b.glb');
    expect(classifyHttp(404).retryable).toBe(false);
    expect(classifyHttp(503).retryable).toBe(true);
    expect(classifyHttp(403).code).toBe('expired');
  });
});

describe('coordinator', () => {
  it('giới hạn song song và ưu tiên critical trước', async () => {
    const f = fakeSched(); const started: string[] = []; const ds: Record<string, ReturnType<typeof deferred<string>>> = {};
    const c = createLoadingCoordinator({ scheduler: f.s, maxConcurrent: 1,
      fetcher: (r) => { started.push(r.key); return (ds[r.key] = deferred<string>()).p; } });
    c.request({ key: 'a', url: 'u', priority: 'low' });
    c.request({ key: 'b', url: 'u', priority: 'low' });
    c.request({ key: 'c', url: 'u', priority: 'critical', critical: true });
    await flush();
    expect(started).toEqual(['a']);
    expect(c.activeCount).toBe(1);
    ds.a.res('A'); await flush();
    expect(started).toEqual(['a', 'c']);
    ds.c.res('C'); await flush();
    expect(started).toEqual(['a', 'c', 'b']);
  });

  it('dedupe cùng key+version, cache, version khác thì tải riêng', async () => {
    const f = fakeSched(); let calls = 0;
    const c = createLoadingCoordinator({ scheduler: f.s, fetcher: async () => ++calls });
    const [x, y] = [c.request({ key: 'k', version: '1', url: 'u' }), c.request({ key: 'k', version: '1', url: 'u' })];
    expect(await x.result).toMatchObject({ status: 'loaded', value: 1 });
    expect(await y.result).toMatchObject({ status: 'loaded', value: 1 });
    expect(calls).toBe(1);
    expect(await c.request({ key: 'k', version: '1', url: 'u' }).result).toMatchObject({ fromCache: true });
    await c.request({ key: 'k', version: '2', url: 'u' }).result;
    expect(calls).toBe(2);
  });

  it('retry với backoff cho lỗi tạm thời rồi thành công', async () => {
    const f = fakeSched(); let n = 0;
    const c = createLoadingCoordinator({ scheduler: f.s, random: () => 0, backoff: { baseMs: 100, maxMs: 1000, factor: 2 },
      fetcher: async () => { if (++n < 3) throw { status: 503 }; return 'ok'; } });
    const h = c.request({ key: 'k', url: 'u' });
    await f.advance(0);
    expect(c.getState(h.id)).toMatchObject({ status: 'retrying', attempt: 1 });
    await f.advance(50); expect(n).toBe(2);
    await f.advance(100); expect(n).toBe(3);
    expect(await h.result).toMatchObject({ status: 'loaded', value: 'ok' });
  });

  it('không retry 404; critical -> failed; optional -> fallback', async () => {
    const f = fakeSched(); let n = 0;
    const c = createLoadingCoordinator({ scheduler: f.s, fetcher: async () => { n++; throw { status: 404 }; } });
    const a = await c.request({ key: 'a', url: 'u', critical: true, fallback: 'PH' }).result;
    expect(a).toMatchObject({ status: 'failed', error: { status: 404 } });
    const b = await c.request({ key: 'b', url: 'u', fallback: 'PH' }).result;
    expect(b).toMatchObject({ status: 'fallback', value: 'PH' });
    expect(n).toBe(2);
  });

  it('dừng sau maxRetries', async () => {
    const f = fakeSched(); let n = 0;
    const c = createLoadingCoordinator({ scheduler: f.s, maxRetries: 2, fetcher: async () => { n++; throw new TypeError('x'); } });
    const h = c.request({ key: 'k', url: 'u' });
    await f.advance(60000);
    expect(await h.result).toMatchObject({ status: 'failed', error: { code: 'network' } });
    expect(n).toBe(3);
  });

  it('timeout abort và retry', async () => {
    const f = fakeSched(); const signals: AbortSignal[] = [];
    const c = createLoadingCoordinator({ scheduler: f.s, timeoutMs: 1000, maxRetries: 0,
      fetcher: (_r, ctx) => { signals.push(ctx.signal); return new Promise(() => {}); } });
    const h = c.request({ key: 'k', url: 'u' });
    await f.advance(1000);
    expect(signals[0].aborted).toBe(true);
    expect(await h.result).toMatchObject({ status: 'failed', error: { code: 'timeout' } });
    expect(c.activeCount).toBe(0);
  });

  it('hủy giữa chừng: abort khi hết consumer, giải phóng slot', async () => {
    const f = fakeSched(); const sig: AbortSignal[] = [];
    const c = createLoadingCoordinator({ scheduler: f.s, maxConcurrent: 1,
      fetcher: (r, ctx) => { sig.push(ctx.signal); return r.key === 'a' ? new Promise(() => {}) : Promise.resolve('B'); } });
    const a1 = c.request({ key: 'a', url: 'u' }); const a2 = c.request({ key: 'a', url: 'u' });
    const b = c.request({ key: 'b', url: 'u' });
    await flush();
    a1.cancel(); expect(sig[0].aborted).toBe(false);
    a2.cancel(); expect(sig[0].aborted).toBe(true);
    expect(await a2.result).toEqual({ status: 'cancelled' });
    expect(await b.result).toMatchObject({ status: 'loaded', value: 'B' });
  });

  it('group: đổi đồ liên tục hủy request cũ, kết quả cũ không gắn vào mới', async () => {
    const f = fakeSched(); const ds: Record<string, ReturnType<typeof deferred<string>>> = {};
    const c = createLoadingCoordinator({ scheduler: f.s, fetcher: (r) => (ds[r.key] = deferred<string>()).p });
    const old = c.request({ key: 'shirt1', url: 'u', group: 'shirt' });
    await flush();
    const cur = c.request({ key: 'shirt2', url: 'u', group: 'shirt' });
    await flush();
    ds.shirt1.res('OLD'); ds.shirt2.res('NEW');
    expect(await old.result).toEqual({ status: 'cancelled' });
    expect(await cur.result).toMatchObject({ value: 'NEW' });
  });

  it('retry thủ công sau failed; progress không giả phần trăm', async () => {
    const f = fakeSched(); let ok = false;
    const c = createLoadingCoordinator({ scheduler: f.s, fetcher: async (_r, ctx) => { if (!ok) throw { status: 404 }; ctx.onProgress({ loaded: 1 }); return 'v'; } });
    const h = c.request({ key: 'k', url: 'u', critical: true });
    await h.result;
    expect(c.progress()).toMatchObject({ total: 1, failed: 1, bytePercent: null });
    ok = true;
    const r = c.retry(h.id)!;
    expect(await r.result).toMatchObject({ status: 'loaded' });
    expect(c.progress().bytePercent).toBeNull();
  });

  it('dispose không để lại listener/timer', async () => {
    const f = fakeSched();
    const c = createLoadingCoordinator({ scheduler: f.s, fetcher: () => new Promise(() => {}) });
    let n = 0; c.subscribe(() => n++);
    c.request({ key: 'k', url: 'u' }); await flush();
    c.dispose();
    expect(f.pending()).toBe(0);
    const m = n; c.request({ key: 'z', url: 'u' });
    expect(n).toBe(m);
  });
});

describe('contextRecovery', () => {
  function mk(over: Partial<Parameters<typeof createContextRecovery>[0]> = {}) {
    const f = fakeSched(); const log: string[] = [];
    const r = createContextRecovery({
      pause: () => log.push('pause'), resume: () => log.push('resume'), remount: () => log.push('remount'),
      saveState: () => { log.push('save'); }, reload: () => log.push('reload'),
      setTimeout: f.s.setTimeout, clearTimeout: f.s.clearTimeout, restoreWaitMs: 1000, maxRemounts: 1, ...over });
    return { r, log, f };
  }
  it('lost -> restored -> remount -> ready -> resume', () => {
    const { r, log } = mk();
    expect(r.onLost()).toBe(true); r.onRestored(); r.onReady();
    expect(log).toEqual(['pause', 'remount', 'resume']);
    expect(r.phase).toBe('ok');
  });
  it('không restored: hết hạn thì remount, lần sau lưu rồi reload', async () => {
    const { r, log, f } = mk();
    r.onLost(); await f.advance(1000); r.onLost(); await f.advance(1000); await flush();
    expect(log).toEqual(['pause', 'remount', 'save', 'reload']);
    expect(r.phase).toBe('failed');
  });
  it('saveState lỗi vẫn reload; dispose xóa timer', async () => {
    const a = mk({ maxRemounts: 0, saveState: () => { throw new Error('x'); } });
    a.r.onLost(); await a.f.advance(1000); await flush();
    expect(a.log).toContain('reload');
    const b = mk(); b.r.onLost(); b.r.dispose(); expect(b.f.pending()).toBe(0);
  });
});
