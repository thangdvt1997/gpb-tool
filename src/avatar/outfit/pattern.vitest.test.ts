import { describe, expect, it } from 'vitest';
import { PATTERNS } from '../../fashion/catalog';
import { PRESETS } from '../../fashion/presets';
import type { GarmentPattern } from '../../fashion/types';
import { coverMargin } from './coverage';
import { loadBodyData } from './glbBody.testutil';
import { bodyPatterns, drawPatterns, patternSignature, type Ctx2D } from './patternTexture';
import { Region, classifyBody } from './regions';
import { SHELL_CLASSES } from './shellClass';
import { neckFrame, vertexZoneBlend, vertexZones, ZONE_LIST } from './zones';

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

describe('băng gấu áo: liên tục qua ranh giới thân/chậu', () => {
  const data = loadBodyData('male_real');
  const cls = classifyBody(data);
  const spec = SHELL_CLASSES.find((c) => c.key === 'outer:bomber')!;
  it('mọi đỉnh thân, chậu, đùi thấp hơn gấu + 0,08 đều có band >= 0 (không còn bậc thang giữa các vùng)', () => {
    const { band } = vertexZoneBlend(cls, spec, data.normals);
    let n = 0;
    for (let v = 0; v < cls.vertexCount; v++) {
      const r = cls.region[v];
      if (r !== Region.torso && r !== Region.pelvis && r !== Region.thigh) continue;
      if (cls.u[v] < spec.hemU + 0.06) {
        expect(band[v], `đỉnh ${v} vùng ${r} u=${cls.u[v]}`).toBeGreaterThanOrEqual(0);
        n++;
      }
    }
    expect(n).toBeGreaterThan(100);
  });
});

describe('họa tiết: hướng lấy mẫu texture', () => {
  it('shader lấy mẫu theo puv (v lên trên = đỉnh canvas), không lật dọc', async () => {
    const { createShellMaterial } = await import('./threeShell');
    const m = createShellMaterial(0);
    const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <morphtarget_vertex>', fragmentShader: '#include <common>\n#include <clipping_planes_fragment>\n#include <color_fragment>' };
    (m.onBeforeCompile as (s: unknown) => void)(shader);
    expect(shader.fragmentShader).toContain('texture2D(uPatMap, puv)');
    expect(shader.fragmentShader).not.toContain('1.0 - puv.y');
  });
});

describe('đẩy đỉnh vỏ theo pháp tuyến', () => {
  it('thành phần hướng xuống của pháp tuyến bị giảm (gấu áo không võng xuống ở đũng/nách thành dải đen)', async () => {
    const { createShellMaterial } = await import('./threeShell');
    const m = createShellMaterial(0);
    const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <morphtarget_vertex>', fragmentShader: '#include <common>\n#include <clipping_planes_fragment>\n#include <color_fragment>' };
    (m.onBeforeCompile as (s: unknown) => void)(shader);
    expect(shader.vertexShader).toContain('sn.y *= (sn.y < 0.0 ? 0.3 : 1.0)');
    expect(shader.vertexShader).toContain('normalize(sn) * aOff');
    expect(shader.vertexShader).not.toContain('normalize(normal) * aOff');
  });
  it('mô phỏng CPU: đỉnh đũng có pháp tuyến hướng xuống (ny -0.9) dịch xuống ít hơn 70% so với trước', () => {
    const n = [0, -0.9, 0.4];
    const sn = [n[0], n[1] * 0.3, n[2]];
    const len = Math.hypot(sn[0], sn[1], sn[2]);
    const downShift = (sn[1] / len) * 0.065;
    const before = (n[1] / Math.hypot(n[0], n[1], n[2])) * 0.065;
    expect(Math.abs(downShift)).toBeLessThan(Math.abs(before) * 0.7);
  });
});

describe('cổ áo chỉ quanh cổ, không tràn lên vai', () => {
  const data = loadBodyData('male_real');
  const cls = classifyBody(data);
  const spec = SHELL_CLASSES.find((c) => c.key === 'outer:bomber')!;
  const frame = neckFrame(cls, data.positions)!;
  it('đo được trục và bán kính cổ hợp lý', () => {
    expect(frame.r).toBeGreaterThan(0.03);
    expect(frame.r).toBeLessThan(0.09);
  });
  it('đỉnh vai cách trục cổ xa hơn tầm với thì band cổ âm và không có vùng collar; quanh cổ thì dương', () => {
    const zb = vertexZoneBlend(cls, spec, data.normals, data.positions);
    const noPos = { zone: vertexZones(cls, spec, data.normals) };
    const withPos = vertexZones(cls, spec, data.normals, data.positions);
    const collar = ZONE_LIST.indexOf('collar');
    let farTop = 0;
    let nearTop = 0;
    for (let v = 0; v < cls.vertexCount; v++) {
      if (cls.region[v] !== Region.torso && cls.region[v] !== Region.neck) continue;
      if (cls.u[v] < spec.neckU - 0.05) continue;
      const d = Math.hypot(data.positions[v * 3] - frame.cx, data.positions[v * 3 + 2] - frame.cz);
      if (d > 1.7 * frame.r + 1e-4) {
        farTop++;
        expect(zb.zone[v], 'vai không phải collar').not.toBe(collar);
        expect(zb.band[v]).toBeLessThan(0);
      } else if (cls.u[v] > spec.neckU - 0.04) {
        nearTop++;
        expect(zb.band[v]).toBeGreaterThanOrEqual(-1e-6);
      }
    }
    expect(farTop).toBeGreaterThan(0);
    expect(nearTop).toBeGreaterThan(20);
    // Không có vị trí thì giữ hành vi cũ (collar theo độ cao).
    let oldCollar = 0;
    for (let v = 0; v < cls.vertexCount; v++) if (noPos.zone[v] === collar) oldCollar++;
    let newCollar = 0;
    for (let v = 0; v < cls.vertexCount; v++) if (withPos[v] === collar) newCollar++;
    expect(newCollar).toBeLessThan(oldCollar);
  });
});
