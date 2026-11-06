// @ts-ignore tsconfig không có kiểu node; vitest chạy trong node.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { addItem, clearRegion, commit, newHistory, redo, undo, removeItem, addLayer, removeLayer } from './edit';
import { applyTattooOverlay, patchFragment } from './overlay';
import { buildRegionMasks } from './glbUv';
import { clampToIsland, dilateEdges, densify, hasInk, inRegion, masksFor, renderDoc, resolutionFor, uvBoxToRect, pointAllowed } from './raster';
import { MASK_RES, type RegionMask } from './regions';
import { canAddItem, DEFAULT_INK, emptyDoc, migrateDoc, PAINT_LIMITS, parseDoc, sanitizeDoc, serializeDoc, TATTOO_DOC_VERSION, type StampItem, type StrokeItem } from './schema';
import { STAMP_TEMPLATES, getStampTemplate } from './templates';

/** Mask giả: ô lưới từ (x0,y0) đến (x1,y1) thuộc vùng. */
function mask(region: RegionMask['region'], side: RegionMask['side'], x0: number, y0: number, x1: number, y1: number): RegionMask {
  const grid = new Uint8Array(MASK_RES * MASK_RES);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y * MASK_RES + x] = 1;
  return { region, side, box: { u0: x0 / MASK_RES, v0: y0 / MASK_RES, u1: (x1 + 1) / MASK_RES, v1: (y1 + 1) / MASK_RES }, grid };
}
const ARM = mask('upperArm', 'left', 8, 8, 31, 31);
const masks = [ARM];

const stroke = (over: Partial<StrokeItem> = {}): StrokeItem => ({
  type: 'stroke', id: 's1', region: 'upperArm', side: 'left', points: [0.2, 0.3, 0.4, 0.3], size: 0.01, opacity: 1, ink: DEFAULT_INK, erase: false, ...over,
});
const stamp = (over: Partial<StampItem> = {}): StampItem => ({
  type: 'stamp', id: 'p1', templateId: 'flower', text: '', region: 'upperArm', side: 'left', u: 0.3, v: 0.3, rotation: 0, scale: 1, flipX: false, opacity: 1, ink: DEFAULT_INK, ...over,
});
const alphaAt = (d: Uint8ClampedArray, size: number, u: number, v: number) => d[(Math.floor(v * size) * size + Math.floor(u * size)) * 4 + 3];

describe('schema', () => {
  it('kẹp số, ép màu về bảng mực, bỏ vùng cấm', () => {
    const d = sanitizeDoc({ layers: [{ id: 'a', items: [
      { type: 'stroke', region: 'upperArm', points: [-5, 9, 0.5, 0.5], size: 99, opacity: 7, ink: '#ff0000' },
      { type: 'stroke', region: 'face', points: [0, 0, 1, 1] },
    ] }] });
    const s = d.layers[0].items;
    expect(s).toHaveLength(1);
    const it = s[0] as StrokeItem;
    expect(it.points).toEqual([0, 1, 0.5, 0.5]);
    expect(it.size).toBe(PAINT_LIMITS.brush.max);
    expect(it.opacity).toBe(1);
    expect(it.ink).not.toBe('#ff0000');
  });
  it('cắt giới hạn số lớp, mục, điểm', () => {
    const many = Array.from({ length: 300 }, () => stroke());
    const d = sanitizeDoc({ layers: Array.from({ length: 20 }, () => ({ items: many })) });
    expect(d.layers.length).toBe(PAINT_LIMITS.maxLayers);
    expect(d.layers.reduce((n, l) => n + l.items.length, 0)).toBeLessThanOrEqual(PAINT_LIMITS.maxItems);
    const long = sanitizeDoc({ layers: [{ items: [stroke({ points: new Array(20000).fill(0.5) })] }] });
    expect((long.layers[0].items[0] as StrokeItem).points.length).toBe(PAINT_LIMITS.maxPointsPerStroke * 2);
  });
  it('làm sạch chữ và id', () => {
    const d = sanitizeDoc({ layers: [{ id: '<x>', items: [stamp({ templateId: 'text', text: 'a\u0000b' + 'x'.repeat(50), id: '../a' })] }] });
    const s = d.layers[0].items[0] as StampItem;
    expect(s.text.length).toBe(PAINT_LIMITS.maxTextLength);
    expect(s.text).not.toContain('\u0000');
    expect(s.id).not.toContain('/');
    expect(d.layers[0].id).toMatch(/^L\d/);
  });
  it('mẫu chữ rỗng bị bỏ', () => {
    expect(sanitizeDoc({ layers: [{ items: [stamp({ templateId: 'text', text: '  ' })] }] }).layers[0].items).toHaveLength(0);
  });
  it('migrate v1 sang v2', () => {
    const d = migrateDoc({ version: 1, strokes: [{ region: 'chest', points: [0.1, 0.1, 0.2, 0.2], color: '#7a2e2e', width: 0.01 }] });
    expect(d.version).toBe(TATTOO_DOC_VERSION);
    expect(d.layers[0].items[0]).toMatchObject({ type: 'stroke', region: 'chest', ink: '#7a2e2e', size: 0.005 });
  });
  it('migrate dữ liệu rác trả tài liệu rỗng hợp lệ', () => {
    expect(migrateDoc(null).layers).toHaveLength(1);
    expect(migrateDoc('x').layers[0].items).toEqual([]);
  });
  it('parse/serialize khứ hồi, từ chối JSON hỏng và quá byte', () => {
    const d = addItem(emptyDoc(), 0, stroke());
    expect(parseDoc(serializeDoc(d))?.layers[0].items).toHaveLength(1);
    expect(parseDoc('{hỏng')).toBeNull();
    expect(parseDoc(' '.repeat(PAINT_LIMITS.maxJsonBytes + 1))).toBeNull();
  });
  it('canAddItem chặn khi đủ số mục', () => {
    let d = emptyDoc();
    for (let i = 0; i < PAINT_LIMITS.maxItems; i++) d = addItem(d, 0, stroke({ id: 'a' + i }));
    expect(canAddItem(d, stroke())).toBe(false);
    expect(addItem(d, 0, stroke())).toBe(d);
  });
});

describe('templates', () => {
  it('có ít nhất 6 mẫu gồm rồng, tribal, hoa, mọi điểm trong [-1.5,1.5]', () => {
    expect(STAMP_TEMPLATES.length).toBeGreaterThanOrEqual(6);
    for (const id of ['dragon', 'tribal', 'flower']) expect(getStampTemplate(id)).toBeDefined();
    for (const t of STAMP_TEMPLATES) {
      expect(t.paths.length).toBeGreaterThan(0);
      for (const p of t.paths) for (const x of p.pts) { expect(Number.isFinite(x)).toBe(true); expect(Math.abs(x)).toBeLessThanOrEqual(1.5); }
    }
  });
  it('mỗi mẫu vẽ ra pixel trong vùng', () => {
    for (const t of STAMP_TEMPLATES) {
      const doc = addItem(emptyDoc(), 0, stamp({ templateId: t.id, u: 0.3, v: 0.3, scale: 1.5 }));
      expect(hasInk(renderDoc(doc, masks, 256))).toBe(true);
    }
  });
});

describe('raster logic', () => {
  it('uvBoxToRect ánh xạ và kẹp', () => {
    expect(uvBoxToRect({ u0: 0.25, v0: 0.5, u1: 0.5, v1: 1.2 }, 1024)).toEqual({ x: 256, y: 512, w: 256, h: 512 });
    expect(resolutionFor('high')).toBe(2048);
    expect(resolutionFor('low')).toBe(1024);
  });
  it('masksFor lọc theo vùng và bên', () => {
    const r = mask('upperArm', 'right', 40, 8, 50, 20);
    expect(masksFor([ARM, r], 'upperArm', 'left')).toEqual([ARM]);
    expect(masksFor([ARM, r], 'upperArm', null)).toHaveLength(2);
    expect(masksFor([ARM], 'chest', null)).toHaveLength(0);
  });
  it('inRegion/pointAllowed', () => {
    expect(inRegion(masks, 0.3, 0.3)).toBe(true);
    expect(inRegion(masks, 0.9, 0.9)).toBe(false);
    expect(pointAllowed(masks, 'upperArm', 'left', 0.3, 0.3)).toBe(true);
    expect(pointAllowed(masks, 'chest', null, 0.3, 0.3)).toBe(false);
  });
  it('clampToIsland kéo điểm ngoài vào trong, giữ điểm trong', () => {
    expect(clampToIsland(masks, 0.3, 0.3)).toEqual({ u: 0.3, v: 0.3 });
    const p = clampToIsland(masks, 0.9, 0.3)!;
    expect(inRegion(masks, p.u, p.v)).toBe(true);
    expect(p.u).toBeLessThan(0.5);
    expect(clampToIsland([], 0.5, 0.5)).toBeNull();
  });
  it('densify nội suy đều và giữ điểm đơn', () => {
    const d = densify([0, 0, 10, 0], 2);
    expect(d.length / 2).toBe(6);
    expect(d[d.length - 2]).toBe(10);
    expect(densify([5, 5], 1)).toEqual([5, 5]);
  });
  it('nét vẽ ra mực đúng chỗ và bị cắt ngoài vùng', () => {
    const doc = addItem(emptyDoc(), 0, stroke({ points: [0.2, 0.3, 0.9, 0.3], size: 0.01 }));
    const d = renderDoc(doc, masks, 512, { dilate: 0 });
    expect(alphaAt(d, 512, 0.3, 0.3)).toBe(255);
    expect(alphaAt(d, 512, 0.8, 0.3)).toBe(0);
  });
  it('vùng không có mask thì không vẽ gì', () => {
    const doc = addItem(emptyDoc(), 0, stroke({ region: 'chest', side: null }));
    expect(hasInk(renderDoc(doc, masks, 256))).toBe(false);
  });
  it('độ mờ làm giảm alpha, tẩy xoá mực', () => {
    const half = renderDoc(addItem(emptyDoc(), 0, stroke({ opacity: 0.5 })), masks, 512, { dilate: 0 });
    expect(alphaAt(half, 512, 0.3, 0.3)).toBeGreaterThan(110);
    expect(alphaAt(half, 512, 0.3, 0.3)).toBeLessThan(145);
    let doc = addItem(emptyDoc(), 0, stroke());
    doc = addItem(doc, 0, stroke({ id: 'e', erase: true, points: [0.3, 0.3], size: 0.02 }));
    const d = renderDoc(doc, masks, 512, { dilate: 0 });
    expect(alphaAt(d, 512, 0.3, 0.3)).toBe(0);
    expect(alphaAt(d, 512, 0.21, 0.3)).toBeGreaterThan(0);
  });
  it('lớp ẩn không được vẽ', () => {
    const doc = addItem(emptyDoc(), 0, stroke());
    doc.layers[0] = { ...doc.layers[0], visible: false };
    expect(hasInk(renderDoc(doc, masks, 256))).toBe(false);
  });
  it('xoay và lật đổi vị trí pixel của mẫu', () => {
    const a = renderDoc(addItem(emptyDoc(), 0, stamp({ templateId: 'dragon', flipX: false, scale: 2 })), masks, 256, { dilate: 0 });
    const b = renderDoc(addItem(emptyDoc(), 0, stamp({ templateId: 'dragon', flipX: true, scale: 2 })), masks, 256, { dilate: 0 });
    expect(a.some((x, i) => x !== b[i])).toBe(true);
    expect(hasInk(a) && hasInk(b)).toBe(true);
  });
  it('mẫu chữ dùng bitmap cung cấp, bỏ qua khi không có', () => {
    const doc = addItem(emptyDoc(), 0, stamp({ templateId: 'text', text: 'A', scale: 2 }));
    expect(hasInk(renderDoc(doc, masks, 256))).toBe(false);
    const text = () => ({ w: 8, h: 4, alpha: new Uint8Array(32).fill(255) });
    expect(hasInk(renderDoc(doc, masks, 256, { text }))).toBe(true);
  });
  it('dilateEdges lan mực sang pixel trong suốt kề bên nhưng có giới hạn', () => {
    const n = 16;
    const d = new Uint8ClampedArray(n * n * 4);
    const c = (8 * n + 8) * 4;
    d.set([10, 20, 30, 255], c);
    dilateEdges(d, n, 2);
    expect(d[(8 * n + 10) * 4 + 3]).toBe(255);
    expect(d[(8 * n + 10) * 4]).toBe(10);
    expect(d[(8 * n + 11) * 4 + 3]).toBe(0);
  });
  it('render đủ 2048 không tràn (nét nhỏ)', () => {
    const d = renderDoc(addItem(emptyDoc(), 0, stroke()), masks, 2048);
    expect(d.length).toBe(2048 * 2048 * 4);
    expect(hasInk(d)).toBe(true);
  });
});

describe('edit/history', () => {
  it('hoàn tác và làm lại', () => {
    let h = newHistory();
    h = commit(h, addItem(h.present, 0, stroke()));
    h = commit(h, addItem(h.present, 0, stroke({ id: 'b' })));
    expect(h.present.layers[0].items).toHaveLength(2);
    h = undo(h);
    expect(h.present.layers[0].items).toHaveLength(1);
    h = redo(h);
    expect(h.present.layers[0].items).toHaveLength(2);
    h = undo(undo(undo(h)));
    expect(h.present.layers[0].items).toHaveLength(0);
    h = commit(h, addItem(h.present, 0, stroke()));
    h = undo(h);
    h = commit(h, addItem(h.present, 0, stroke({ id: 'z' })));
    expect(h.future).toHaveLength(0);
  });
  it('commit cùng tham chiếu không thêm lịch sử', () => {
    const h = newHistory();
    expect(commit(h, h.present)).toBe(h);
  });
  it('xoá vùng, xoá mục, lớp', () => {
    let d = addItem(emptyDoc(), 0, stroke());
    d = addItem(d, 0, stroke({ id: 'c', region: 'chest', side: null }));
    d = clearRegion(d, 'upperArm', null);
    expect(d.layers[0].items.map((i) => i.region)).toEqual(['chest']);
    expect(removeItem(d, d.layers[0].items[0].id).layers[0].items).toHaveLength(0);
    d = addLayer(d);
    expect(d.layers).toHaveLength(2);
    expect(removeLayer(d, 1).layers).toHaveLength(1);
    expect(removeLayer(removeLayer(d, 1), 0).layers).toHaveLength(1);
  });
});

describe('overlay', () => {
  const fakeCanvas = { width: 4, height: 4 } as unknown as HTMLCanvasElement;
  function bodyMesh() {
    const m = new THREE.MeshStandardMaterial({ name: 'body' });
    m.map = new THREE.Texture();
    return new THREE.Mesh(new THREE.BufferGeometry(), m);
  }
  it('patchFragment chèn sau map_fragment, bỏ qua shader lạ', () => {
    const p = patchFragment('void main(){\n#include <map_fragment>\n}')!;
    expect(p).toContain('tattooMap');
    expect(p.indexOf('#include <map_fragment>')).toBeLessThan(p.indexOf('texture2D( tattooMap'));
    expect(patchFragment('void main(){}')).toBeNull();
  });
  it('áp dụng bản sao vật liệu, giữ map gốc, dispose trả lại sạch', () => {
    const mesh = bodyMesh();
    const orig = mesh.material as THREE.MeshStandardMaterial;
    const h = applyTattooOverlay(mesh, fakeCanvas)!;
    expect(h).not.toBeNull();
    const cur = mesh.material as THREE.MeshStandardMaterial;
    expect(cur).not.toBe(orig);
    expect(cur.map).toBe(orig.map);
    expect(h.texture.flipY).toBe(false);
    const shader = { uniforms: {} as Record<string, { value: unknown }>, fragmentShader: '#include <map_fragment>' };
    cur.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, null as unknown as THREE.WebGLRenderer);
    expect(shader.uniforms.tattooMap.value).toBe(h.texture);
    expect(cur.customProgramCacheKey()).toContain('tattoo');
    let disposedTex = 0;
    h.texture.addEventListener('dispose', () => disposedTex++);
    h.dispose();
    h.dispose();
    expect(mesh.material).toBe(orig);
    expect(disposedTex).toBe(1);
  });
  it('không có map thì trả null và không đổi vật liệu', () => {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
    const m = mesh.material;
    expect(applyTattooOverlay(mesh, fakeCanvas)).toBeNull();
    expect(mesh.material).toBe(m);
  });
  it('mesh nhiều vật liệu chỉ thay vật liệu có map', () => {
    const a = new THREE.MeshStandardMaterial();
    const b = new THREE.MeshStandardMaterial(); b.map = new THREE.Texture();
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), [a, b]);
    const h = applyTattooOverlay(mesh, fakeCanvas)!;
    const arr = mesh.material as THREE.Material[];
    expect(arr[0]).toBe(a);
    expect(arr[1]).not.toBe(b);
    h.dispose();
    expect((mesh.material as THREE.Material[])[1]).toBe(b);
  });
});

describe('GLB thật', () => {
  it('buildRegionMasks cho vùng xăm trên male_real.glb và nét bị cắt trong đảo UV', () => {
    const buf: { buffer: ArrayBuffer; byteOffset: number; byteLength: number } = readFileSync(new URL('../../public/models/male_real.glb', import.meta.url));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const ms = buildRegionMasks(ab);
    const arm = masksFor(ms, 'upperArm', null);
    expect(arm.length).toBeGreaterThan(0);
    const b = arm[0].box;
    const c = clampToIsland(arm, (b.u0 + b.u1) / 2, (b.v0 + b.v1) / 2)!;
    const doc = addItem(emptyDoc(), 0, stroke({ side: arm[0].side, points: [c.u, c.v, c.u + 0.01, c.v] }));
    expect(hasInk(renderDoc(doc, ms, 512))).toBe(true);
  });
});
