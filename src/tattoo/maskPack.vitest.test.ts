// @ts-ignore tsconfig không có kiểu node; vitest chạy trong node.
import { execFileSync } from 'node:child_process';
// @ts-ignore tsconfig không có kiểu node; vitest chạy trong node.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { buildRegionMasks } from './glbUv';
import { clearMaskCacheForTest, loadRegionMasks } from './masks';
import { packMasks, rleDecode, rleEncode, unpackMasks, validPacked, type PackedMasks } from './maskPack';
import { addItem } from './edit';
import { clampToIsland, inkOutsideMasks, masksFor, renderDoc } from './raster';
import { maskContains, maskRes, type RegionMask } from './regions';
import { emptyDoc, type StrokeItem } from './schema';

/** GLB tối thiểu: 2 tam giác, mỗi đỉnh gắn một xương (trọng số 1), pháp tuyến +Z. */
function tinyGlb(): ArrayBuffer {
  const uv = [0.1, 0.1, 0.3, 0.1, 0.1, 0.3, 0.6, 0.6, 0.8, 0.6, 0.6, 0.8];
  const nr = Array.from({ length: 6 }, () => [0, 0, 1]).flat();
  const wt = Array.from({ length: 6 }, () => [1, 0, 0, 0]).flat();
  const jn = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
  const f = new Float32Array([...uv, ...nr, ...wt]);
  const bin = new Uint8Array(f.byteLength + jn.length);
  bin.set(new Uint8Array(f.buffer), 0);
  bin.set(jn, f.byteLength);
  const json = {
    asset: { version: '2.0' },
    nodes: [{ name: 'upperarm_l' }, { name: 'thigh_r' }],
    skins: [{ joints: [0, 1] }],
    meshes: [{ name: 'base', primitives: [{ attributes: { TEXCOORD_0: 0, NORMAL: 1, WEIGHTS_0: 2, JOINTS_0: 3 } }] }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 48 },
      { buffer: 0, byteOffset: 48, byteLength: 72 },
      { buffer: 0, byteOffset: 120, byteLength: 96 },
      { buffer: 0, byteOffset: 216, byteLength: 24 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 6, type: 'VEC2' },
      { bufferView: 1, componentType: 5126, count: 6, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: 6, type: 'VEC4' },
      { bufferView: 3, componentType: 5121, count: 6, type: 'VEC4' },
    ],
  };
  let js = JSON.stringify(json);
  while (js.length % 4) js += ' ';
  const jb = new TextEncoder().encode(js);
  const total = 12 + 8 + jb.length + 8 + bin.length;
  const out = new ArrayBuffer(total);
  const dv = new DataView(out);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jb.length, true); dv.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(out, 20, jb.length).set(jb);
  const o = 20 + jb.length;
  dv.setUint32(o, bin.length, true); dv.setUint32(o + 4, 0x004e4942, true);
  new Uint8Array(out, o + 8, bin.length).set(bin);
  return out;
}

function stroke(region: StrokeItem['region'], side: StrokeItem['side'], points: number[]): StrokeItem {
  return { type: 'stroke', id: 'k1', region, side, points, size: 0.01, opacity: 1, ink: '#112233', erase: false };
}

const PACKED = JSON.parse(readFileSync(new URL('../../public/models/tattoo-masks.json', import.meta.url), 'utf8')) as PackedMasks;
const MODELS = ['male_real', 'female_real', 'chibi'] as const;

describe('mask 256 từ tam giác UV', () => {
  const ms = buildRegionMasks(tinyGlb(), 'base', 256);
  it('điểm UV thuộc đúng vùng', () => {
    const arm = masksFor(ms, 'upperArm', 'left');
    const thigh = masksFor(ms, 'thigh', 'right');
    expect(arm).toHaveLength(1);
    expect(thigh).toHaveLength(1);
    expect(maskRes(arm[0])).toBe(256);
    expect(maskContains(arm[0], 0.15, 0.15)).toBe(true);
    expect(maskContains(arm[0], 0.28, 0.12)).toBe(true);
    expect(maskContains(arm[0], 0.29, 0.29)).toBe(false); // sau cạnh huyền của tam giác
    expect(maskContains(arm[0], 0.7, 0.65)).toBe(false);
    expect(maskContains(thigh[0], 0.65, 0.65)).toBe(true);
    expect(maskContains(thigh[0], 0.15, 0.15)).toBe(false);
  });
  it('cạnh huyền chính xác tới 1 ô 256 (64 sẽ thô hơn 4 lần)', () => {
    const arm = masksFor(ms, 'upperArm', 'left')[0];
    // Cạnh u+v=0.4. Điểm cách cạnh ~0.01 (>1 ô = 0.0039) phía ngoài phải bị loại.
    expect(maskContains(arm, 0.205, 0.205)).toBe(false);
    expect(maskContains(arm, 0.195, 0.195)).toBe(true);
  });
  it('nét ở vùng A không tràn quá 1 ô mask sang vùng B', () => {
    const doc = addItem(emptyDoc(), 0, stroke('upperArm', 'left', [0.05, 0.05, 0.9, 0.9, 0.7, 0.2]));
    const out = renderDoc(doc, ms, 1024);
    const r = inkOutsideMasks(out, 1024, masksFor(ms, 'upperArm', 'left'), 1);
    expect(r.ink).toBeGreaterThan(0);
    expect(r.outside).toBe(0);
    // và không có mực nào trong lõi vùng đùi
    const px = (u: number, v: number) => out[(Math.floor(v * 1024) * 1024 + Math.floor(u * 1024)) * 4 + 3];
    expect(px(0.7, 0.65)).toBe(0);
    expect(px(0.15, 0.15)).toBeGreaterThan(0);
  });
});

describe('RLE và gói mask', () => {
  it('encode/decode khứ hồi, kể cả bắt đầu bằng 1 và toàn 0', () => {
    for (const g of [new Uint8Array([1, 1, 0, 1, 0, 0]), new Uint8Array(8), new Uint8Array(8).fill(1), new Uint8Array([0, 1, 1, 0])]) {
      expect(Array.from(rleDecode(rleEncode(g), g.length))).toEqual(Array.from(g));
    }
    expect(() => rleDecode([100], 4)).toThrow();
    expect(() => rleDecode([-1, 5], 4)).toThrow();
  });
  it('pack/unpack giữ nguyên lưới', () => {
    const ms = buildRegionMasks(tinyGlb(), 'base', 256);
    const back = unpackMasks(packMasks(ms, 256), 256);
    expect(back).toHaveLength(ms.length);
    for (const m of ms) {
      const b = back.find((x) => x.region === m.region && x.side === m.side)!;
      expect(Array.from(b.grid!)).toEqual(Array.from(m.grid!));
    }
  });
});

describe('mask đóng gói sẵn của 3 GLB thật', () => {
  it('tệp hợp lệ, res >= 256, nhỏ gọn', () => {
    expect(validPacked(PACKED)).toBe(true);
    expect(PACKED.res).toBeGreaterThanOrEqual(256);
    expect(readFileSync(new URL('../../public/models/tattoo-masks.json', import.meta.url)).length).toBeLessThan(100_000);
  });
  it.each(MODELS)('%s: vùng xăm có mask, nét trong bắp tay không tràn', (id) => {
    const ms = unpackMasks(PACKED.models[id], PACKED.res);
    for (const r of ['chest', 'back', 'upperArm', 'forearm', 'thigh', 'calf'] as const) expect(masksFor(ms, r, null).length).toBeGreaterThan(0);
    const arm = masksFor(ms, 'upperArm', null);
    const b = arm[0].box;
    const c = clampToIsland(arm, (b.u0 + b.u1) / 2, (b.v0 + b.v1) / 2)!;
    const doc = addItem(emptyDoc(), 0, stroke('upperArm', arm[0].side, [c.u, c.v, c.u + 0.05, c.v + 0.05, 0.02, 0.9]));
    const out = renderDoc(doc, ms, 1024);
    const r = inkOutsideMasks(out, 1024, arm, 1);
    expect(r.ink).toBeGreaterThan(0);
    expect(r.outside).toBe(0);
  });
  it('khớp tính lại từ GLB (male_real) ở 256', () => {
    const b = readFileSync(new URL('../../public/models/male_real.glb', import.meta.url));
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const fresh = packMasks(buildRegionMasks(ab, 'base', 256), 256);
    expect(fresh).toEqual(PACKED.models.male_real);
  });
  it('script sinh xác định: chạy hai lần --check đều khớp tệp trong repo', () => {
    const script = new URL('../../scripts/gen-tattoo-masks.mjs', import.meta.url).pathname;
    for (let i = 0; i < 2; i++) expect(() => execFileSync('node', [script, '--check'], { stdio: 'pipe' })).not.toThrow();
  }, 60_000);
});

describe('loader', () => {
  const fakeFetch = (packed: unknown) => vi.fn(async (url: string) => {
    if (url.endsWith('tattoo-masks.json')) return packed === null ? { ok: false, status: 404 } : { ok: true, status: 200, json: async () => packed };
    return { ok: true, status: 200, arrayBuffer: async () => tinyGlb() };
  });
  it('dùng mask 256 đóng gói cho URL mô hình', async () => {
    clearMaskCacheForTest();
    vi.stubGlobal('fetch', fakeFetch(PACKED));
    const ms = await loadRegionMasks('/models/male_real.glb');
    expect(maskRes(ms[0])).toBe(256);
  });
  it('dự phòng 64x64 từ GLB khi thiếu hoặc hỏng tệp đóng gói', async () => {
    for (const bad of [null, { v: 2 }, { v: 1, res: 256, models: { male_real: [{ r: 'chest', s: null, b: [0, 0, 1, 1], rl: [999999999] }] } }]) {
      clearMaskCacheForTest();
      const f = fakeFetch(bad);
      vi.stubGlobal('fetch', f);
      const ms = await loadRegionMasks('/models/male_real.glb');
      expect(maskRes(ms[0])).toBe(64);
    }
  });
});
