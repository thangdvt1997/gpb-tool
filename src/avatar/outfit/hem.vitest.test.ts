import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { coverMargin, hiddenSkinTriangles, resolveLayers, type PieceInput } from './coverage';
import { loadBodyData } from './glbBody.testutil';
import { classifyBody, Region } from './regions';
import { SHELL_CLASSES } from './shellClass';
import { createShellMaterial, deriveGeometry } from './threeShell';

const data = loadBodyData('male_real');
const cls = classifyBody(data);
const spec = (key: string) => SHELL_CLASSES.find((c) => c.key === key)!;
const piece = (key: string, slot: string): PieceInput => ({
  key: slot,
  spec: spec(key),
  variant: { fit: 'regular', tucked: false },
  order: spec(key).order,
});
const triCount = data.index.length / 3;
const CAP = 0.05 * (cls.bodyHeight / 1.8);

describe('mép trang phục: lề cắt liên tục', () => {
  const tee = piece('inner:tee', 'inner');
  const [res] = resolveLayers(cls, data.index, [tee]);

  it('thuộc tính aCut có mặt trên geometry vỏ và shader cắt theo nó', () => {
    const base = new THREE.BufferGeometry();
    base.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    const g = deriveGeometry(base, Uint32Array.from([0, 1, 2]), {
      offset: new Float32Array(3),
      zone: new Uint8Array(3),
      cut: Float32Array.from([0.01, -0.01, 0]),
    });
    expect(g.getAttribute('aCut').count).toBe(3);
    const m = createShellMaterial(0);
    const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <morphtarget_vertex>', fragmentShader: '#include <common>\n#include <clipping_planes_fragment>\n#include <color_fragment>' };
    (m.onBeforeCompile as (s: unknown) => void)(shader);
    expect(shader.vertexShader).toContain('vCut = aCut');
    expect(shader.fragmentShader).toContain('if (vCut < 0.0) discard');
  });

  it('gấu áo: lề đơn điệu theo độ cao và đổi dấu đúng tại u = hemU', () => {
    const hem = tee.spec.hemU;
    const span = cls.yNeck - cls.yPelvis;
    let checked = 0;
    for (let v = 0; v < cls.vertexCount; v++) {
      const r = cls.region[v];
      if (r !== Region.pelvis && r !== Region.thigh) continue;
      expect(res.cut[v]).toBeCloseTo(Math.max(-CAP, Math.min(CAP, (cls.u[v] - hem) * span)), 5);
      checked++;
    }
    expect(checked).toBeGreaterThan(500);
    // Với hai đỉnh bất kỳ cùng vùng chậu/đùi: cao hơn thì lề không nhỏ hơn.
    const vs: number[] = [];
    for (let v = 0; v < cls.vertexCount; v += 7) if (cls.region[v] === Region.pelvis) vs.push(v);
    vs.sort((a, b) => cls.u[a] - cls.u[b]);
    for (let i = 1; i < vs.length; i++) expect(res.cut[vs[i]]).toBeGreaterThanOrEqual(res.cut[vs[i - 1]] - 1e-7);
  });

  it('tam giác vắt qua biên được giữ trong vỏ; tam giác ngoài hẳn thì không', () => {
    const inShell = new Uint8Array(triCount);
    const shellIdx = res.index;
    const key = (a: number, b: number, c: number) => `${a},${b},${c}`;
    const set = new Set<string>();
    for (let i = 0; i < shellIdx.length; i += 3) set.add(key(shellIdx[i], shellIdx[i + 1], shellIdx[i + 2]));
    let straddle = 0;
    for (let f = 0; f < triCount; f++) {
      const c = [0, 1, 2].map((k) => res.cut[data.index[f * 3 + k]]);
      const has = set.has(key(data.index[f * 3], data.index[f * 3 + 1], data.index[f * 3 + 2]));
      inShell[f] = has ? 1 : 0;
      const anyPos = c.some((x) => x >= 0);
      const anyNeg = c.some((x) => x < 0);
      expect(has).toBe(anyPos);
      if (anyPos && anyNeg) {
        straddle++;
        // Đỉnh ngoài biên của tam giác vắt biên vẫn có độ đẩy dương (không chìm vào da).
        for (let k = 0; k < 3; k++) expect(res.offset[data.index[f * 3 + k]]).toBeGreaterThan(0);
      }
    }
    expect(straddle).toBeGreaterThan(50);
  });

  it('da chỉ phủ một phần KHÔNG bị ẩn; chỉ tam giác trọn trong vùng che mới ẩn', () => {
    const hidden = hiddenSkinTriangles(triCount, [res]);
    let partial = 0;
    for (let f = 0; f < triCount; f++) {
      const c = [0, 1, 2].map((k) => res.cut[data.index[f * 3 + k]]);
      if (c.every((x) => x >= 0)) expect(hidden[f]).toBe(1);
      else {
        expect(hidden[f]).toBe(0);
        if (c.some((x) => x >= 0)) partial++;
      }
    }
    expect(partial).toBeGreaterThan(50);
  });

  it('mọi loại món: lề hữu hạn, trong biên độ, và có cả đỉnh dương lẫn âm', () => {
    for (const s of SHELL_CLASSES) {
      if (!s.part) continue;
      const m = coverMargin(cls, s, { fit: 'regular', tucked: false });
      let pos = 0;
      let neg = 0;
      for (const x of m) {
        expect(Number.isFinite(x)).toBe(true);
        expect(Math.abs(x)).toBeLessThanOrEqual(CAP + 1e-6);
        if (x >= 0) pos++;
        else neg++;
      }
      expect(pos).toBeGreaterThan(0);
      expect(neg).toBeGreaterThan(0);
    }
  });

  it('đầu ống tay áo: lề liên tục qua khuỷu (không nhảy giữa tay trên và cẳng tay)', () => {
    const [sleeve] = resolveLayers(cls, data.index, [piece('inner:tee', 'inner')]);
    let maxJump = 0;
    for (let f = 0; f < triCount; f++) {
      for (let k = 0; k < 3; k++) {
        const a = data.index[f * 3 + k];
        const b = data.index[f * 3 + ((k + 1) % 3)];
        const ra = cls.region[a];
        const rb = cls.region[b];
        if ((ra === Region.upperArm && rb === Region.foreArm) || (ra === Region.foreArm && rb === Region.upperArm)) {
          maxJump = Math.max(maxJump, Math.abs(sleeve.cut[a] - sleeve.cut[b]));
        }
      }
    }
    expect(maxJump).toBeLessThan(CAP);
  });
});
