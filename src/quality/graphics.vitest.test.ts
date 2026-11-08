import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyTextureTier, applyTierToMaterial, buildAoHaloGeometry, distanceToBox, fitSize, lodRange, lodVisible, textureParamsFor,
} from './graphics';
import { QUALITY_TABLE } from './levels';
import { effectiveConfig } from './resolve';
import { parseSettings, sanitizeOptions } from './storage';

describe('ánh xạ mức → tham số', () => {
  it('texture: tăng dần theo tier', () => {
    const p = [0, 1, 2].map((t) => textureParamsFor(t as 0 | 1 | 2));
    expect(p[0]!.anisotropy).toBe(1);
    expect(p[0]!.maxSize).toBeLessThan(p[1]!.maxSize);
    expect(p[1]!.maxSize).toBeLessThan(p[2]!.maxSize);
    expect(p[1]!.anisotropy).toBeLessThan(p[2]!.anisotropy);
  });
  it('bảng chất lượng: thấp < trung bình < cao ở LOD và AO', () => {
    expect(QUALITY_TABLE.low.lodDistanceScale).toBeLessThan(QUALITY_TABLE.medium.lodDistanceScale);
    expect(QUALITY_TABLE.medium.lodDistanceScale).toBeLessThan(QUALITY_TABLE.high.lodDistanceScale);
    expect([QUALITY_TABLE.low, QUALITY_TABLE.medium, QUALITY_TABLE.high].map((c) => c.ambientOcclusion)).toEqual([false, false, true]);
  });
  it('LOD: mức thấp cắt gần hơn, có trễ quanh ngưỡng', () => {
    expect(lodRange(20, 0.6)).toBeLessThan(lodRange(20, 1.5));
    expect(lodVisible(11, 20, 0.6, true)).toBe(true); // 12 * 1.08
    expect(lodVisible(13.5, 20, 0.6, true)).toBe(false);
    expect(lodVisible(11.9, 20, 0.6, false)).toBe(false); // phải vào trong 12 * 0.92
    expect(lodVisible(10, 20, 0.6, false)).toBe(true);
  });
  it('khoảng cách tới hộp', () => {
    const b = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 2, 2));
    expect(distanceToBox(new THREE.Vector3(1, 1, 1), b)).toBe(0);
    expect(distanceToBox(new THREE.Vector3(5, 1, 1), b)).toBe(3);
  });
});

describe('cài đặt: ghim tùy chọn', () => {
  it('options thắng mức, không ghim thì theo mức', () => {
    const base = { mode: 'auto' as const, adaptive: true };
    expect(effectiveConfig(base, 'low').textureTier).toBe(0);
    expect(effectiveConfig(base, 'high').ambientOcclusion).toBe(true);
    const pinned = { ...base, options: { textureTier: 2 as const, ambientOcclusion: false } };
    expect(effectiveConfig(pinned, 'low').textureTier).toBe(2);
    expect(effectiveConfig(pinned, 'high').ambientOcclusion).toBe(false);
    expect(effectiveConfig(pinned, 'low').lodDistanceScale).toBe(0.6); // không ghim: theo mức
  });
  it('lọc giá trị hỏng khi đọc', () => {
    expect(sanitizeOptions({ textureTier: 7, lodDistanceScale: 3, ambientOcclusion: 'x' })).toBeUndefined();
    expect(parseSettings(JSON.stringify({ mode: 'low', options: { textureTier: 1, lodDistanceScale: 1.5, ambientOcclusion: true, bad: 1 } })).options)
      .toEqual({ textureTier: 1, lodDistanceScale: 1.5, ambientOcclusion: true });
  });
});

const resize = (_s: unknown, w: number, h: number) => ({ width: w, height: h }) as unknown as HTMLCanvasElement;

describe('applyTextureTier', () => {
  const tex = () => {
    const t = new THREE.Texture({ width: 2048, height: 1024 } as unknown as HTMLImageElement);
    t.anisotropy = 8;
    return t;
  };
  it('fitSize giữ tỉ lệ', () => {
    expect(fitSize(2048, 1024, 1024)).toEqual({ w: 1024, h: 512 });
    expect(fitSize(300, 200, 1024)).toEqual({ w: 300, h: 200 });
  });
  it('thấp: anisotropy 1 và hạ cỡ; cao: khôi phục ảnh gốc, anisotropy theo trần GPU', () => {
    const t = tex();
    const orig = t.image;
    expect(applyTextureTier(t, 0, 16, resize)).toBe(true);
    expect(t.anisotropy).toBe(1);
    expect(t.image.width).toBe(1024);
    expect(t.image.height).toBe(512);
    expect(applyTextureTier(t, 0, 16, resize)).toBe(false); // idempotent
    expect(applyTextureTier(t, 2, 8, resize)).toBe(true);
    expect(t.anisotropy).toBe(8); // trần GPU 8
    expect(t.image).toBe(orig);
  });
  it('bỏ qua texture dữ liệu thô', () => {
    const d = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    d.anisotropy = 4;
    expect(applyTextureTier(d, 0, 16)).toBe(false);
    expect(d.anisotropy).toBe(4);
  });
  it('áp lên mọi texture của vật liệu', () => {
    const m = new THREE.MeshStandardMaterial({ map: tex(), roughnessMap: tex() });
    expect(applyTierToMaterial(m, 1, 16, resize)).toBe(2);
    expect(m.map!.anisotropy).toBe(4);
    expect(m.roughnessMap!.image.width).toBe(2048); // tier 1 = 2048, không hạ
  });
});

describe('buildAoHaloGeometry', () => {
  it('nở ô ra và giảm alpha, giữ tâm', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]), 4));
    const h = buildAoHaloGeometry(g, 2, 0.5);
    const p = h.getAttribute('position') as THREE.BufferAttribute;
    expect(p.getX(0)).toBe(-2);
    expect(p.getZ(2)).toBe(2);
    expect((h.getAttribute('color') as THREE.BufferAttribute).getW(0)).toBe(0.5);
    expect((g.getAttribute('position') as THREE.BufferAttribute).getX(0)).toBe(-1); // nguồn không đổi
  });
});
