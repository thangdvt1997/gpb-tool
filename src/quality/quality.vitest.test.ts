import { describe, it, expect } from 'vitest';
import { createAdaptiveController } from './adaptive';
import { QUALITY_TABLE, configFor, clampDpr, ENGINE_SUPPORT } from './levels';
import { loadQualitySettings, saveQualitySettings, resetQualitySettings, parseSettings, QUALITY_STORAGE_KEY } from './storage';
import { suggestInitialLevel } from './detect';

const feed = (c: ReturnType<typeof createAdaptiveController>, ms: number, frames: number, t0: number, dt = 16) => {
  let last = null as ReturnType<typeof c.push>; let t = t0;
  for (let i = 0; i < frames; i++) { t += dt; const r = c.push({ ms }, t); if (r) last = r; }
  return { last, t };
};

describe('adaptive', () => {
  it('hạ mức khi chậm, tôn trọng cooldown', () => {
    const c = createAdaptiveController({ initial: 'high', windowSize: 10, downCooldownMs: 1000 });
    const a = feed(c, 40, 10, 0);
    expect(a.last).toMatchObject({ to: 'medium', reason: 'slow' });
    const b = feed(c, 40, 10, a.t, 10); // 100ms < cooldown
    expect(b.last).toBeNull();
    const d = feed(c, 40, 100, b.t, 20);
    expect(c.level).toBe('low');
  });
  it('không hạ dưới low, không nâng quá ceiling', () => {
    const c = createAdaptiveController({ initial: 'low', ceiling: 'medium', windowSize: 5, upCooldownMs: 0, downCooldownMs: 0 });
    feed(c, 40, 20, 0);
    expect(c.level).toBe('low');
    feed(c, 8, 50, 1000);
    expect(c.level).toBe('medium');
    feed(c, 8, 50, 5000);
    expect(c.level).toBe('medium');
  });
  it('vùng chết giữa upMs và downMs: không đổi', () => {
    const c = createAdaptiveController({ initial: 'medium', windowSize: 5, upCooldownMs: 0, downCooldownMs: 0 });
    feed(c, 18, 500, 0);
    expect(c.level).toBe('medium');
  });
  it('chống dao động: nâng rồi bị hạ ngay thì chờ nâng lâu hơn', () => {
    const c = createAdaptiveController({ initial: 'medium', windowSize: 5, upCooldownMs: 1000, downCooldownMs: 0 });
    let t = 0;
    let r = feed(c, 8, 200, t, 20); t = r.t;           // nâng lên high
    expect(c.level).toBe('high');
    r = feed(c, 40, 5, t, 20); t = r.t;               // bị hạ ngay
    expect(c.level).toBe('medium');
    const before = t;
    r = feed(c, 8, 60, t, 20); t = r.t;                // 1200ms < 2000ms (penalty x2)
    expect(c.level).toBe('medium');
    feed(c, 8, 100, t, 20);
    expect(c.level).toBe('high');
    expect(t - before).toBeGreaterThan(0);
  });
  it('khóa thủ công: không đổi; bỏ qua mẫu hitch', () => {
    const c = createAdaptiveController({ initial: 'high', windowSize: 5, downCooldownMs: 0 });
    c.setEnabled(false);
    feed(c, 50, 50, 0);
    expect(c.level).toBe('high');
    c.setEnabled(true);
    feed(c, 1000, 50, 100);
    expect(c.level).toBe('high');
  });
  it('trần draw call lấy từ tham số', () => {
    const c = createAdaptiveController({ initial: 'high', windowSize: 5, downCooldownMs: 0, maxDrawCalls: 50 });
    let t = 0, ch = null as ReturnType<typeof c.push>;
    for (let i = 0; i < 5; i++) ch = c.push({ ms: 10, drawCalls: 80 }, (t += 16)) ?? ch;
    expect(ch).toMatchObject({ to: 'medium' });
    const d = createAdaptiveController({ initial: 'high', windowSize: 5, downCooldownMs: 0 });
    for (let i = 0; i < 5; i++) d.push({ ms: 10, drawCalls: 9999 }, (t += 16));
    expect(d.level).toBe('high');
  });
  it('ném lỗi nếu hysteresis sai', () => {
    expect(() => createAdaptiveController({ upMs: 30, downMs: 20 })).toThrow();
  });
});

describe('levels/config', () => {
  it('bảng đơn điệu theo mức; override; clamp dpr', () => {
    expect(QUALITY_TABLE.low.dprCap).toBeLessThan(QUALITY_TABLE.high.dprCap);
    expect(configFor('medium', { shadows: false }).shadows).toBe(false);
    expect(clampDpr(3, 1.5)).toBe(1.5);
    expect(clampDpr(0, 2)).toBe(1);
    expect(ENGINE_SUPPORT.dprCap).toBe(true);
  });
});

describe('storage', () => {
  const mem = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };
  it('lưu/đọc/reset', () => {
    const kv = mem();
    expect(loadQualitySettings(kv).mode).toBe('auto');
    expect(saveQualitySettings({ mode: 'low', adaptive: false }, kv)).toBe(true);
    expect(loadQualitySettings(kv)).toMatchObject({ mode: 'low', adaptive: false });
    expect(resetQualitySettings(kv).mode).toBe('auto');
    expect(kv.m.has(QUALITY_STORAGE_KEY)).toBe(false);
  });
  it('chịu lỗi: storage ném, JSON hỏng, giá trị lạ', () => {
    const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('x'); } };
    expect(loadQualitySettings(bad).mode).toBe('auto');
    expect(saveQualitySettings({ mode: 'high', adaptive: true }, bad)).toBe(false);
    expect(() => resetQualitySettings(bad)).not.toThrow();
    expect(parseSettings('{bad').mode).toBe('auto');
    expect(parseSettings('{"mode":"ultra"}').mode).toBe('auto');
  });
});

describe('detect', () => {
  it('đề xuất theo khả năng', () => {
    expect(suggestInitialLevel({ webgl2: false })).toBe('low');
    expect(suggestInitialLevel({ benchMedianMs: 30 })).toBe('low');
    expect(suggestInitialLevel({ deviceMemoryGb: 8, hardwareConcurrency: 8 })).toBe('high');
    expect(suggestInitialLevel({ deviceMemoryGb: 4, coarsePointer: true })).toBe('low');
  });
});
