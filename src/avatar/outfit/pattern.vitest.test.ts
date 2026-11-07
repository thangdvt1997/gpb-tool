import { describe, expect, it } from 'vitest';
import { PATTERNS } from '../../fashion/catalog';
import { PRESETS } from '../../fashion/presets';
import type { GarmentPattern } from '../../fashion/types';
import { coverMargin } from './coverage';
import { loadBodyData } from './glbBody.testutil';
import { bodyPatterns, drawPatterns, patternSignature, type Ctx2D } from './patternTexture';
import { Region, classifyBody } from './regions';
import { SHELL_CLASSES } from './shellClass';

function fakeCtx(): Ctx2D & { texts: string[]; ops: number } {
  const c = {
    texts: [] as string[],
    ops: 0,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    globalAlpha: 1,
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    clearRect() {},
    fillRect() { c.ops++; },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    closePath() {},
    fill() { c.ops++; },
    stroke() { c.ops++; },
    fillText(t: string) { c.texts.push(t); c.ops++; },
    measureText(t: string) { return { width: t.length * 10 }; },
  };
  return c;
}

const pat = (patternId: string, over: Partial<GarmentPattern> = {}): GarmentPattern => ({ patternId, zone: 'body', color: '#222222', scale: 1, rotation: 0, offsetX: 0, offsetY: 0, text: '', ...over });

describe('họa tiết và chữ trên áo (canvas)', () => {
  it('mọi họa tiết trong danh mục đều vẽ được', () => {
    for (const p of PATTERNS) {
      const ctx = fakeCtx();
      const n = drawPatterns(ctx, [pat(p.id, { text: 'ABC' })]);
      expect(n, p.id).toBe(1);
      if (p.id !== 'pt-text') expect(ctx.ops, p.id).toBeGreaterThan(0);
    }
  });
  it('chữ tự nhập được vẽ; chữ rỗng thì không', () => {
    const a = fakeCtx();
    drawPatterns(a, [pat('pt-text', { text: 'PHỐ' })]);
    expect(a.texts).toEqual(['PHỐ']);
    const b = fakeCtx();
    drawPatterns(b, [pat('pt-text')]);
    expect(b.texts).toEqual([]);
  });
  it('họa tiết của bộ mẫu Boy Phố nằm vùng thân và đổi chữ thì đổi chữ ký', () => {
    const boy = PRESETS.find((p) => p.name === 'Boy Phố')!;
    const w = boy.look.outfit.inner!;
    expect(bodyPatterns(w.patterns).length).toBe(1);
    const s1 = patternSignature(w.patterns);
    const s2 = patternSignature([{ ...w.patterns[0], text: 'KHÁC' }]);
    expect(s1).not.toBe(s2);
  });
});

describe('mép quần ở hông liên tục với cạp', () => {
  const data = loadBodyData('male_real');
  const cls = classifyBody(data);
  const spec = SHELL_CLASSES.find((c) => c.key === 'bottom:trousers') ?? SHELL_CLASSES.find((c) => c.part === 'bottom')!;
  it('đỉnh đùi cao hơn cạp có lề không dương hơn lề theo độ cao', () => {
    const m = coverMargin(cls, spec, { fit: 'regular', tucked: false });
    const span = cls.yNeck - cls.yPelvis;
    let n = 0;
    for (let v = 0; v < cls.vertexCount; v++) {
      if (cls.region[v] !== Region.thigh) continue;
      const byHeight = (spec.waistU - cls.u[v]) * span;
      expect(m[v]).toBeLessThanOrEqual(Math.max(-1, byHeight) + 1e-6);
      n++;
    }
    expect(n).toBeGreaterThan(0);
  });
});
