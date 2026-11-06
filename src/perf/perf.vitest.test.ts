import { describe, it, expect } from 'vitest';
import {
  percentile, summarize, createRollingWindow, checkBudget, DEFAULT_BUDGET, createWarnThrottle, estimateTextureBytes,
  analyzeLeak, createLeakCounter, slope, sampleBenchPath, createBenchRecorder, parsePerfParams, createPerfStore,
  DEFAULT_BENCH_PATH,
} from './index';
import { createAdaptiveController } from '../quality';

describe('stats', () => {
  it('percentile nearest-rank', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(v, 0.5)).toBe(50);
    expect(percentile(v, 0.95)).toBe(95);
    expect(percentile(v, 0.99)).toBe(99);
  });
  it('percentile rỗng là NaN, không sắp xếp lại đầu vào', () => {
    expect(percentile([], 0.5)).toBeNaN();
    const a = [3, 1, 2]; percentile(a, 0.5); expect(a).toEqual([3, 1, 2]);
  });
  it('summarize đếm khung giật > 50ms và FPS', () => {
    const s = summarize([16, 16, 16, 60, 100]);
    expect(s.hitches).toBe(2);
    expect(s.maxMs).toBe(100);
    expect(s.fps).toBeCloseTo(1000 / 41.6, 3);
  });
  it('summarize rỗng', () => { expect(summarize([]).frames).toBe(0); });
  it('cửa sổ trượt giữ N mẫu mới nhất theo thứ tự', () => {
    const w = createRollingWindow(3);
    [1, 2, 3, 4, 5].forEach((x) => w.push(x));
    expect(w.values()).toEqual([3, 4, 5]);
    expect(w.summary().maxMs).toBe(5);
    w.clear(); expect(w.length).toBe(0);
  });
  it('cửa sổ size không hợp lệ ném lỗi', () => { expect(() => createRollingWindow(0)).toThrow(); });
});

describe('budget', () => {
  it('trần draw call mặc định là 200', () => { expect(DEFAULT_BUDGET.maxDrawCalls).toBe(200); });
  it('vượt thì cảnh báo, bằng trần thì không', () => {
    expect(checkBudget({ drawCalls: 200 })).toHaveLength(0);
    const w = checkBudget({ drawCalls: 208 });
    expect(w).toHaveLength(1); expect(w[0].key).toBe('maxDrawCalls');
  });
  it('cấu hình ghi đè và bỏ qua NaN/thiếu', () => {
    expect(checkBudget({ triangles: 10, textureMB: NaN }, { maxTriangles: 5 }).map((x) => x.key)).toEqual(['maxTriangles']);
  });
  it('throttle cảnh báo theo cooldown', () => {
    const t = createWarnThrottle(1000);
    expect(t('a', 0)).toBe(true); expect(t('a', 500)).toBe(false); expect(t('a', 1500)).toBe(true); expect(t('b', 600)).toBe(true);
  });
  it('ước lượng texture có/không mipmap', () => {
    expect(estimateTextureBytes({ image: { width: 4, height: 4 }, generateMipmaps: false })).toBe(64);
    expect(estimateTextureBytes({ image: { width: 4, height: 4 } })).toBe(85);
    expect(estimateTextureBytes({})).toBe(0);
  });
});

describe('leak', () => {
  const mk = (f: (i: number) => number) => Array.from({ length: 20 }, (_, i) => ({ cycle: i + 1, geometries: f(i), textures: 10 }));
  it('slope', () => { expect(slope([0, 2, 4, 6])).toBeCloseTo(2); });
  it('phẳng = ok', () => { expect(analyzeLeak(mk(() => 50)).verdict).toBe('ok'); });
  it('tăng rồi phẳng = bounded-growth', () => { expect(analyzeLeak(mk((i) => 50 + Math.min(i, 5))).verdict).toBe('bounded-growth'); });
  it('tăng đều = suspect-leak', () => { expect(analyzeLeak(mk((i) => 50 + i * 3)).verdict).toBe('suspect-leak'); });
  it('ít chu kỳ = insufficient-data', () => { expect(analyzeLeak(mk(() => 1).slice(0, 3)).verdict).toBe('insufficient-data'); });
  it('counter ghi và báo cáo', () => {
    const c = createLeakCounter();
    for (let i = 0; i < 12; i++) c.record({ geometries: 10 + i, textures: 5 });
    expect(c.samples()[11].cycle).toBe(12);
    expect(c.report().verdict).toBe('suspect-leak');
  });
});

describe('bench', () => {
  it('đường đi tất định và kẹp', () => {
    const a = sampleBenchPath(DEFAULT_BENCH_PATH, 0.37), b = sampleBenchPath(DEFAULT_BENCH_PATH, 0.37);
    expect(a).toEqual(b);
    expect(sampleBenchPath(DEFAULT_BENCH_PATH, -1)).toEqual(DEFAULT_BENCH_PATH[0]);
    expect(sampleBenchPath(DEFAULT_BENCH_PATH, 2)).toEqual(DEFAULT_BENCH_PATH[3]);
  });
  it('nội suy giữa hai điểm', () => {
    const w = sampleBenchPath([{ pos: [0, 0, 0], look: [0, 0, 0] }, { pos: [10, 0, 0], look: [0, 0, 0] }], 0.5);
    expect(w.pos[0]).toBe(5);
  });
  it('recorder tổng hợp kết quả', () => {
    const r = createBenchRecorder(10, { dpr: 2 });
    r.record(16, { drawCalls: 100, triangles: 1000, geometries: 5, textures: 2, programs: 3 });
    r.record(18, { drawCalls: 120, triangles: 900, geometries: 6, textures: 2, programs: 3 });
    const res = r.result();
    expect(res.renderer.drawCallsMax).toBe(120); expect(res.renderer.drawCallsAvg).toBe(110);
    expect(res.renderer.geometries).toBe(6); expect(res.jsHeapMB).toBeNull(); expect(res.timing).toBe('rAF-wall-clock');
    expect(r.done(9.9)).toBe(false); expect(r.done(10)).toBe(true);
  });
  it('parse query', () => {
    expect(parsePerfParams('?perf=1&bench=1&benchSec=12')).toEqual({ perf: true, bench: true, benchSec: 12 });
    expect(parsePerfParams('?benchSec=99999').benchSec).toBe(30);
    expect(parsePerfParams('')).toEqual({ perf: false, bench: false, benchSec: 30 });
  });
});

describe('store + adaptive', () => {
  it('store snapshot và subscribe', () => {
    const s = createPerfStore(4); let n = 0; const un = s.subscribe(() => n++);
    [10, 20, 30].forEach((x) => s.pushFrame(x)); s.emit(); un(); s.emit();
    expect(n).toBe(1); expect(s.snapshot().frame.frames).toBe(3);
  });
  it('mẫu {ms, drawCalls} khớp API adaptive: khung chậm kéo hạ mức', () => {
    const a = createAdaptiveController({ initial: 'high', windowSize: 10, downCooldownMs: 0 });
    let ch = null as unknown;
    for (let i = 0; i < 10; i++) ch = a.push({ ms: 40, drawCalls: 150 }, 1000 + i) ?? ch;
    expect(a.level).toBe('medium'); expect(ch).toBeTruthy();
  });
});
