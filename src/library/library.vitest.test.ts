// tsconfig chỉ khai báo types vite/client nên không có kiểu node; test chạy trong Node nên import vẫn hợp lệ.
// @ts-expect-error thiếu @types/node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromAccessories, fromGarments, fromManifest, fromPropSpots, isSafeRelativeUrl, mergeItems, type ManifestLike } from './adapter';
import { computeGlbStats, computeGltfStats, GlbParseError, readGlbJson } from './glbStats';
import { filterItems, paginate, runQuery, sortItems } from './query';
import { FAVORITES_KEY, loadFavorites, loadRecent, parseIdList, pushRecent, RECENT_MAX, toggleFavorite, type KV } from './storage';
import { foldVietnamese } from './text';
import type { LibraryItem } from './types';
import { buildDefaultLibrary } from './sources';

function memStore(init: Record<string, string> = {}): KV & { m: Map<string, string> } {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

const lic = { spdx: 'CC0-1.0', source: 'x', verified: true };
const manifest: ManifestLike = {
  assets: [
    { assetId: 'a.chair', type: 'chair', url: 'chair.glb', bytes: 100, lods: [{ level: 0, triangles: 500 }], license: lic },
    { assetId: 'a.nolic', type: 'furniture', url: 'x.glb', bytes: 50 },
    { assetId: 'a.bad', type: 'prop', url: '../evil.glb', license: lic },
    { assetId: 'a.weird', type: 'zzz', url: 'w.glb', license: lic },
  ],
};

describe('text', () => {
  it('bỏ dấu tiếng Việt', () => {
    expect(foldVietnamese('  Áo Sơ-mi ĐỎ  ')).toBe('ao so-mi do');
    expect(foldVietnamese('Quần  dài')).toBe('quan dai');
  });
});

describe('adapter', () => {
  const items = fromManifest(manifest);
  it('ánh xạ loại và lod 0', () => {
    const c = items.find((i) => i.id === 'a.chair')!;
    expect(c.kind).toBe('furniture');
    expect(c.triangles).toBe(500);
    expect(c.file).toBe('/models/chair.glb');
    expect(c.usable).toBe(true);
  });
  it('thiếu giấy phép bị đánh dấu không dùng được', () => {
    const n = items.find((i) => i.id === 'a.nolic')!;
    expect(n.usable).toBe(false);
    expect(n.reasons.join(' ')).toMatch(/giấy phép/i);
  });
  it('URL không an toàn và loại lạ bị chặn', () => {
    expect(items.find((i) => i.id === 'a.bad')!.usable).toBe(false);
    expect(items.find((i) => i.id === 'a.bad')!.file).toBeNull();
    expect(items.find((i) => i.id === 'a.weird')!.usable).toBe(false);
    expect(isSafeRelativeUrl('https://x/a.glb')).toBe(false);
    expect(isSafeRelativeUrl('/a.glb')).toBe(false);
    expect(isSafeRelativeUrl('a.glb')).toBe(true);
  });
  it('gộp: ID trùng được báo và đánh dấu', () => {
    const g = fromGarments([{ id: 'x', name: 'Áo', description: '', group: 'inner', kind: 'k', styles: ['office'] }], { inner: 'Áo trong' }, { office: 'Công sở' });
    const r = mergeItems(g, g);
    expect(r.duplicates).toEqual(['garment.x']);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]!.usable).toBe(false);
  });
  it('phụ kiện và đạo cụ', () => {
    const a = fromAccessories([{ id: 'r', name: 'Kính', slot: 'eyewear', styles: [] }], { eyewear: 'Kính' }, {});
    expect(a[0]!.kind).toBe('accessory');
    const p = fromPropSpots([{ kind: 'fire' }, { kind: 'fire' }, { kind: 'plant' }]);
    expect(p.map((x) => x.id).sort()).toEqual(['prop.fire', 'prop.plant']);
    expect(p.find((x) => x.id === 'prop.fire')!.description).toContain('2 vị trí');
  });
  it('thư viện thật: không trùng id, mọi mục dùng được, có đủ 5 loại chính', () => {
    const lib = buildDefaultLibrary();
    expect(lib.duplicates).toEqual([]);
    expect(lib.items.every((i) => i.usable)).toBe(true);
    const kinds = new Set(lib.items.map((i) => i.kind));
    for (const k of ['character', 'outfit', 'accessory', 'furniture', 'prop']) expect(kinds.has(k as never)).toBe(true);
  });
});

describe('query', () => {
  const lib = buildDefaultLibrary().items;
  it('tìm không dấu', () => {
    const r = filterItems(lib, { text: 'ao so mi' });
    expect(r.length).toBeGreaterThan(0);
    expect(filterItems(lib, { text: 'ÁO SƠ MI' }).length).toBe(r.length);
  });
  it('lọc loại, tag, giấy phép', () => {
    expect(filterItems(lib, { kinds: ['character'] }).every((i) => i.kind === 'character')).toBe(true);
    // Ba nhân vật MPFB trong manifest (nam, nữ, chibi) là CC0.
    expect(filterItems(lib, { licenses: ['cc0-1.0'] }).length).toBe(3);
    expect(filterItems(lib, { tags: ['fire'] }).map((i) => i.id)).toEqual(['prop.fire']);
  });
  it('onlyUsable loại mục hỏng', () => {
    const all = fromManifest(manifest);
    expect(filterItems(all, { onlyUsable: true }).map((i) => i.id)).toEqual(['a.chair']);
  });
  it('sắp xếp: null xuống cuối', () => {
    const s = sortItems(lib, 'size', true);
    expect(s[0]!.bytes).not.toBeNull();
    expect(s[s.length - 1]!.bytes).toBeNull();
    const n = sortItems(lib, 'name');
    expect(n.length).toBe(lib.length);
  });
  it('phân trang kẹp trang', () => {
    const p = paginate([1, 2, 3, 4, 5], 99, 2);
    expect(p).toMatchObject({ page: 3, pageCount: 3, items: [5] });
    expect(paginate([], 1, 0).pageCount).toBe(1);
    expect(runQuery(lib, { page: 2, pageSize: 5 }).items).toHaveLength(5);
  });
});

describe('storage', () => {
  it('dữ liệu hỏng cho mảng rỗng', () => {
    expect(parseIdList('{oops', 10)).toEqual([]);
    expect(parseIdList('{"a":1}', 10)).toEqual([]);
    expect(parseIdList('["a",1,"a","",null,"b"]', 10)).toEqual(['a', 'b']);
    expect(loadFavorites(memStore({ [FAVORITES_KEY]: 'xx' }))).toEqual([]);
  });
  it('bật/tắt yêu thích', () => {
    const s = memStore();
    expect(toggleFavorite('a', s)).toEqual(['a']);
    expect(toggleFavorite('a', s)).toEqual([]);
  });
  it('gần đây: đưa lên đầu, giới hạn', () => {
    const s = memStore();
    for (let i = 0; i < RECENT_MAX + 5; i++) pushRecent(`i${i}`, s);
    pushRecent('i10', s);
    const r = loadRecent(s);
    expect(r).toHaveLength(RECENT_MAX);
    expect(r[0]).toBe('i10');
  });
  it('không có storage hoặc setItem ném lỗi vẫn không sập', () => {
    expect(toggleFavorite('a', null)).toEqual(['a']);
    const bad: KV = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(pushRecent('z', bad)).toEqual(['z']);
  });
});

describe('glbStats', () => {
  it('đếm tam giác, xương, morph từ JSON', () => {
    const s = computeGltfStats({
      accessors: [{ count: 3, min: [0, 0, 0], max: [1, 2, 3] }, { count: 6 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, targets: [{}, {}] }] }],
      skins: [{ joints: [0, 1, 2] }],
      materials: [{}],
      buffers: [{ uri: 'http://x/a.bin' }, { uri: 'data:abc' }],
    });
    expect(s).toMatchObject({ meshes: 1, triangles: 2, bones: 3, morphTargets: 2, materials: 1, boundsMax: [1, 2, 3] });
    expect(s.externalUris).toEqual(['http://x/a.bin']);
  });
  it('từ chối tệp không phải GLB', () => {
    expect(() => computeGlbStats(new ArrayBuffer(8))).toThrow(GlbParseError);
    const b = new Uint8Array(32);
    expect(() => readGlbJson(b.buffer)).toThrow(GlbParseError);
  });
  it('GLB thật khớp manifest (tam giác)', () => {
    const file = readFileSync('public/models/male_real.glb') as Uint8Array;
    const ab = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    const st = computeGlbStats(ab);
    const m = JSON.parse(String(readFileSync('public/models/manifest.json', 'utf8'))) as ManifestLike;
    const tri = m.assets.find((a) => a.assetId === 'char.male_real')!.lods![0]!.triangles;
    expect(st.triangles).toBe(tri);
    expect(st.bones).toBeGreaterThan(40);
    expect(st.meshes).toBeGreaterThan(0);
  });
});

it('LibraryItem tối thiểu cho sortItems ổn định theo id', () => {
  const mk = (id: string): LibraryItem => ({ id, kind: 'prop', name: 'Same', description: '', tags: [], license: null, file: null, bytes: null, triangles: null, version: null, source: 'office-props', usable: false, reasons: [], warnings: [] });
  expect(sortItems([mk('b'), mk('a')]).map((i) => i.id)).toEqual(['a', 'b']);
});

import { colorForId, svgDataUrl, thumbFileName, thumbnailFor, thumbnailSvg } from './thumbnail';
import { addUpload, createMemoryAssetStore, MAX_UPLOAD_BYTES, userItemFromRecord, validateUpload } from './upload';

describe('thumbnail', () => {
  const lib = buildDefaultLibrary().items;
  it('mọi mục có thumbnail kích thước cố định và alt tiếng Việt', () => {
    for (const it of lib) {
      const t = thumbnailFor(it);
      expect(t.width).toBe(56);
      expect(t.height).toBe(56);
      expect(t.alt.startsWith('Ảnh minh họa')).toBe(true);
      expect(t.src.length).toBeGreaterThan(10);
    }
  });
  it('mục manifest dùng SVG tĩnh /thumbs/, mục procedural dùng data URL', () => {
    const m = lib.find((i) => i.source === 'manifest')!;
    expect(thumbnailFor(m).src).toBe(`/thumbs/${thumbFileName(m.id)}`);
    const g = lib.find((i) => i.source === 'fashion-catalog')!;
    expect(thumbnailFor(g).src.startsWith('data:image/svg+xml')).toBe(true);
  });
  it('mỗi mục manifest có tệp SVG sinh sẵn trong public/thumbs', () => {
    for (const it of lib.filter((i) => i.source === 'manifest')) {
      const svg = readFileSync(`public/thumbs/${thumbFileName(it.id)}`, 'utf8').trimEnd();
      expect(svg).toBe(thumbnailSvg(it.kind, colorForId(it.id), it.name));
    }
  });
  it('SVG xác định, thoát ký tự, màu theo id', () => {
    expect(colorForId('a')).toBe(colorForId('a'));
    expect(colorForId('a')).not.toBe(colorForId('b'));
    expect(thumbnailSvg('outfit', 'red', '<x>')).toContain('&lt;x&gt;');
    expect(svgDataUrl('<svg/>')).toContain('%3Csvg');
  });
});

describe('upload', () => {
  function glb(len = 20, magic = 'glTF', ver = 2, declared = len): Uint8Array {
    const b = new Uint8Array(len);
    for (let i = 0; i < 4; i++) b[i] = magic.charCodeAt(i);
    const dv = new DataView(b.buffer);
    dv.setUint32(4, ver, true);
    dv.setUint32(8, declared, true);
    return b;
  }
  it('nhận GLB hợp lệ', () => {
    expect(validateUpload('a.glb', 20, glb())).toEqual({ ok: true, ext: 'glb' });
  });
  it('từ chối sai đuôi, sai magic, sai phiên bản, sai độ dài, rỗng', () => {
    expect(validateUpload('a.png', 20, glb()).ok).toBe(false);
    expect(validateUpload('a.glb', 20, glb(20, 'RIFF')).ok).toBe(false);
    expect(validateUpload('a.glb', 20, glb(20, 'glTF', 1)).ok).toBe(false);
    expect(validateUpload('a.glb', 20, glb(20, 'glTF', 2, 99)).ok).toBe(false);
    expect(validateUpload('a.glb', 0, new Uint8Array()).ok).toBe(false);
  });
  it('từ chối quá 10 MB', () => {
    const r = validateUpload('a.glb', MAX_UPLOAD_BYTES + 1, glb());
    expect(!r.ok && r.error).toMatch(/quá lớn/);
    expect(validateUpload('a.glb', MAX_UPLOAD_BYTES, glb(MAX_UPLOAD_BYTES)).ok).toBe(true);
  });
  it('gltf: cần asset.version, không tham chiếu tệp ngoài', () => {
    const j = (o: unknown) => { const b = new TextEncoder().encode(JSON.stringify(o)); return validateUpload('a.gltf', b.length, b); };
    expect(j({ asset: { version: '2.0' } }).ok).toBe(true);
    expect(j({ asset: { version: '2.0' }, buffers: [{ uri: 'data:application/octet-stream;base64,AA==' }] }).ok).toBe(true);
    expect(j({ asset: { version: '2.0' }, buffers: [{ uri: 'http://x/y.bin' }] }).ok).toBe(false);
    expect(j({ foo: 1 }).ok).toBe(false);
    const bad = new TextEncoder().encode('{nope');
    expect(validateUpload('a.gltf', bad.length, bad).ok).toBe(false);
  });
  it('addUpload lưu vào kho, từ chối tệp xấu, xóa được', async () => {
    const store = createMemoryAssetStore();
    const ok = await addUpload(new File([glb() as BlobPart], 'ghe_go.glb'), store);
    expect(ok.ok).toBe(true);
    const bad = await addUpload(new File(['hello'], 'x.glb'), store);
    expect(bad.ok).toBe(false);
    expect(await addUpload(new File(['hello'], 'x.txt'), store)).toMatchObject({ ok: false });
    const recs = await store.list();
    expect(recs).toHaveLength(1);
    const it = userItemFromRecord(recs[0]!, 'blob:x');
    expect(it.name).toBe('ghe go');
    expect(it.license).toBeNull();
    expect(it.usable).toBe(true);
    expect(it.warnings.join(' ')).toMatch(/chưa có giấy phép/);
    await store.remove(recs[0]!.id);
    expect(await store.list()).toHaveLength(0);
  });
});
