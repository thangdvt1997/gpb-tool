import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMaskCacheForTest, loadRegionMasks } from './masks';
import { emptyDoc, PAINT_LIMITS, type StrokeItem, type TattooDoc } from './schema';
import {
  clearTattoo, createTattooBackupSection, getTattooDoc, resetTattooStoreForTest, setTattooDoc, subscribe, TATTOO_STORAGE_KEY,
} from './store';
import { findBodyMesh, shouldAttachOverlay } from './useBodyTattoo';
import { MASK_RES, type RegionMask } from './regions';

function mem(): Storage {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, get length() { return m.size; } } as Storage;
}
function docWith(n = 1, pts = 4): TattooDoc {
  const d = emptyDoc();
  for (let i = 0; i < n; i++) {
    const s: StrokeItem = { type: 'stroke', id: `s${i}`, region: 'upperArm', side: 'left', points: Array.from({ length: pts * 2 }, (_, j) => 0.3 + (j % 5) * 0.01), size: 0.008, opacity: 1, ink: '#222222', erase: false } as StrokeItem;
    d.layers[0].items.push(s);
  }
  return d;
}

beforeEach(() => { vi.stubGlobal('localStorage', mem()); resetTattooStoreForTest(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('store xăm', () => {
  it('lưu rồi đọc lại sau khi nạp lại từ localStorage', () => {
    expect(setTattooDoc('male_real', docWith(2))).toBe(true);
    resetTattooStoreForTest();
    expect(getTattooDoc('male_real').layers[0].items).toHaveLength(2);
  });
  it('tách theo mô hình', () => {
    setTattooDoc('chibi', docWith(1));
    expect(getTattooDoc('chibi').layers[0].items).toHaveLength(1);
    expect(getTattooDoc('female_real').layers[0].items).toHaveLength(0);
  });
  it('dữ liệu hỏng thì trả doc rỗng', () => {
    localStorage.setItem(TATTOO_STORAGE_KEY, '{không phải json');
    expect(getTattooDoc('chibi').layers[0].items).toHaveLength(0);
    resetTattooStoreForTest();
    localStorage.setItem(TATTOO_STORAGE_KEY, JSON.stringify({ v: 1, docs: { chibi: 'xxx', hack: '{}', male_real: 5 } }));
    expect(getTattooDoc('chibi').layers[0].items).toHaveLength(0);
  });
  it('kẹp giá trị bẩn khi nạp', () => {
    const bad = docWith(1) as unknown as { layers: { items: { size: number }[] }[] };
    bad.layers[0].items[0].size = 999;
    localStorage.setItem(TATTOO_STORAGE_KEY, JSON.stringify({ v: 1, docs: { chibi: JSON.stringify(bad) } }));
    expect(getTattooDoc('chibi').layers[0].items[0]).toMatchObject({ size: PAINT_LIMITS.brush.max });
  });
  it('từ chối doc quá giới hạn byte', () => {
    const big = JSON.stringify({ x: 'a'.repeat(PAINT_LIMITS.maxJsonBytes + 10) });
    localStorage.setItem(TATTOO_STORAGE_KEY, big);
    expect(getTattooDoc('chibi').layers[0].items).toHaveLength(0);
  });
  it('clearTattoo xóa và thông báo; doc rỗng không phát lại khi giống nhau', () => {
    const fn = vi.fn();
    const off = subscribe(fn);
    setTattooDoc('chibi', docWith(1));
    setTattooDoc('chibi', docWith(1));
    expect(fn).toHaveBeenCalledTimes(1);
    clearTattoo('chibi');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(TATTOO_STORAGE_KEY)).toBeNull();
    off();
  });
  it('phần sao lưu: đọc, kiểm tra, ghi', () => {
    setTattooDoc('male_real', docWith(1));
    const sec = createTattooBackupSection();
    const data = sec.read();
    expect(data).not.toBeNull();
    const v = sec.validate(data);
    expect(v.ok).toBe(true);
    clearTattoo('male_real');
    sec.write((v as { data: unknown }).data);
    expect(getTattooDoc('male_real').layers[0].items).toHaveLength(1);
    expect(sec.validate(null).ok).toBe(false);
  });
});

describe('masks cache', () => {
  it('cùng url chỉ fetch một lần, lỗi thì thử lại được', async () => {
    clearMaskCacheForTest();
    const f = vi.fn().mockResolvedValue({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) });
    vi.stubGlobal('fetch', f);
    await expect(loadRegionMasks('/a.glb')).rejects.toThrow();
    await expect(loadRegionMasks('/a.glb')).rejects.toThrow();
    expect(f).toHaveBeenCalledTimes(2);
    const g = vi.fn().mockResolvedValue({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(4) });
    vi.stubGlobal('fetch', g);
    const p1 = loadRegionMasks('/b.glb').catch(() => 1);
    const p2 = loadRegionMasks('/b.glb').catch(() => 1);
    await Promise.all([p1, p2]);
    expect(g).toHaveBeenCalledTimes(1);
  });
  it('huỷ bằng AbortSignal từ chối AbortError', async () => {
    clearMaskCacheForTest();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    const ac = new AbortController();
    const p = loadRegionMasks('/c.glb', ac.signal);
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('logic useBodyTattoo', () => {
  const m: RegionMask = { region: 'upperArm', side: 'left', box: { u0: 0, v0: 0, u1: 1, v1: 1 }, grid: new Uint8Array(MASK_RES * MASK_RES) };
  it('tìm mesh thân theo morph bodyBelly', () => {
    const root = new THREE.Group();
    const other = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    const body = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    body.morphTargetDictionary = { bodyBelly: 0 };
    const sub = new THREE.Group(); sub.add(body);
    root.add(other, sub);
    expect(findBodyMesh(root)).toBe(body);
    expect(findBodyMesh(new THREE.Group())).toBeNull();
  });
  it('quyết định gắn overlay', () => {
    const body = new THREE.Mesh();
    expect(shouldAttachOverlay(body, [m], docWith(1))).toBe(true);
    expect(shouldAttachOverlay(body, [m], emptyDoc())).toBe(false);
    expect(shouldAttachOverlay(body, null, docWith(1))).toBe(false);
    expect(shouldAttachOverlay(null, [m], docWith(1))).toBe(false);
  });
});
