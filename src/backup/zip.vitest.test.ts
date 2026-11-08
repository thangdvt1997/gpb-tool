import { describe, expect, it } from 'vitest';
import { buildBundleZip, extractImages, parseBundleZip } from './bundleZip';
import { applyImport, previewImport } from './importer';
import { createRegistry } from './registry';
import { createBackupRing, createMemoryStorage } from './ring';
import { createBackupService } from './service';
import type { BackupSection } from './types';
import { buildZip, crc32, readZip } from './zip';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const enc = new TextEncoder();
const big = { maxTotalBytes: 25 * 1024 * 1024 };

function env() {
  let data: unknown = { name: 'cũ', img: PNG, list: [1, 2] };
  const sec: BackupSection = {
    id: 'tattoos', label: 'Xăm', version: 1, migrations: {},
    validate: (d) => (typeof d === 'object' && d !== null ? { ok: true, data: d, warnings: [] } : { ok: false, error: 'sai' }),
    read: () => data, write: (d) => { data = d; },
  };
  const registry = createRegistry([sec]);
  const ring = createBackupRing({ storage: createMemoryStorage(), max: 3 });
  const service = createBackupService({ registry, ring });
  return { registry, ring, service, get: () => data, set: (d: unknown) => { data = d; } };
}

describe('zip store-only', () => {
  it('CRC32 khớp giá trị chuẩn', () => {
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926);
  });
  it('vòng ghi/đọc', () => {
    const z = buildZip([{ name: 'a.txt', data: enc.encode('xin chào') }, { name: 'd/b.bin', data: new Uint8Array([1, 2, 3]) }]);
    const r = readZip(z, big);
    expect(r.ok && r.files.map((f) => f.name)).toEqual(['a.txt', 'd/b.bin']);
    expect(r.ok && new TextDecoder().decode(r.files[0]!.data)).toBe('xin chào');
  });
  it('từ chối tên không an toàn khi ghi', () => {
    expect(() => buildZip([{ name: '../x', data: new Uint8Array() }])).toThrow();
  });
  it('tệp hỏng/cắt cụt/CRC sai', () => {
    const z = buildZip([{ name: 'a.txt', data: enc.encode('hello world') }]);
    expect(readZip(z.slice(0, 20), big).ok).toBe(false);
    expect(readZip(enc.encode('không phải zip'), big).ok).toBe(false);
    const bad = z.slice();
    bad[30 + 5 + 2] ^= 0xff; // sửa dữ liệu
    const r = readZip(bad, big);
    expect(!r.ok && r.error).toMatch(/CRC32/);
  });
  it('giới hạn cỡ và số mục', () => {
    const z = buildZip([{ name: 'a', data: new Uint8Array(100) }]);
    expect(readZip(z, { maxTotalBytes: 10 }).ok).toBe(false);
    const many = buildZip(Array.from({ length: 5 }, (_, i) => ({ name: `f${i}`, data: new Uint8Array(1) })));
    expect(readZip(many, { ...big, maxEntries: 3 }).ok).toBe(false);
  });
});

describe('gói ZIP sao lưu', () => {
  it('extractImages lấy ảnh data URL', () => {
    const imgs = extractImages({ a: [PNG, PNG], b: 'text' });
    expect(imgs).toHaveLength(1);
    expect(imgs[0]!.name).toBe('tattoos/01.png');
    expect(imgs[0]!.data[0]).toBe(0x89);
  });

  it('xuất rồi nhập lại (replace) thành công, có sao lưu trước', async () => {
    const e = env();
    const out = await buildBundleZip(e.registry, { now: new Date('2026-11-08T00:00:00Z') });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.images).toBe(1);
    const names = readZip(out.bytes, big);
    expect(names.ok && names.files.map((f) => f.name)).toEqual(['manifest.json', 'data.json', 'tattoos/01.png']);
    e.set({ name: 'mới', list: [9] });
    const p = await parseBundleZip(out.bytes, e.registry);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.parsed.checksum).toBe('ok');
    const prev = await previewImport(p.parsed, e.registry, 'replace');
    expect(prev[0]!.status).toBe('changed');
    const r = await applyImport(p.parsed, e.registry, { mode: 'replace', ring: e.ring });
    expect(r.ok && r.backupId).toBeTruthy();
    expect(e.get()).toEqual({ name: 'cũ', img: PNG, list: [1, 2] });
  });

  it('qua service.exportZip/parseZip', async () => {
    const e = env();
    const x = await e.service.exportZip();
    expect(x.ok && x.fileName).toMatch(/^gpb-backup-.*\.zip$/);
    if (!x.ok) return;
    expect((await e.service.parseZip(x.bytes)).ok).toBe(true);
  });

  async function zipWith(mut: (files: { name: string; data: Uint8Array }[]) => void) {
    const e = env();
    const out = await buildBundleZip(e.registry);
    if (!out.ok) throw new Error('x');
    const r = readZip(out.bytes, big);
    if (!r.ok) throw new Error('y');
    const files = r.files.map((f) => ({ ...f }));
    mut(files);
    return { e, bytes: buildZip(files) };
  }

  it('data.json bị sửa: checksum SHA-256 của manifest bắt được', async () => {
    const { e, bytes } = await zipWith((f) => {
      const d = f.find((x) => x.name === 'data.json')!;
      d.data = enc.encode(new TextDecoder().decode(d.data).replace('cũ', 'xấu'));
    });
    const r = await parseBundleZip(bytes, e.registry);
    expect(!r.ok && r.error).toMatch(/Checksum/);
  });

  it('thiếu data.json, thiếu manifest, sai định dạng', async () => {
    const a = await zipWith((f) => void f.splice(f.findIndex((x) => x.name === 'data.json'), 1));
    expect((await parseBundleZip(a.bytes, a.e.registry)).ok).toBe(false);
    const b = await zipWith((f) => { f.find((x) => x.name === 'manifest.json')!.data = enc.encode('{"format":"khac","files":[]}'); });
    const rb = await parseBundleZip(b.bytes, b.e.registry);
    expect(!rb.ok && rb.error).toMatch(/không phải gói/);
  });

  it('chặn __proto__ trong data.json dù manifest khớp', async () => {
    const e = env();
    const evil = enc.encode('{"header":{"app":"gpb-office","format":"gpb-backup","schemaVersion":1,"createdAt":"x","sectionVersions":{}},"sections":{"tattoos":{"__proto__":{"x":1}}}}');
    const { sha256Bytes } = await import('./safeJson');
    const man = { format: 'gpb-backup-zip', version: 1, files: [{ name: 'data.json', bytes: evil.length, sha256: await sha256Bytes(evil) }] };
    const bytes = buildZip([{ name: 'manifest.json', data: enc.encode(JSON.stringify(man)) }, { name: 'data.json', data: evil }]);
    const r = await parseBundleZip(bytes, e.registry);
    expect(!r.ok && r.error).toMatch(/không an toàn/);
  });

  it('giới hạn cỡ nhập', async () => {
    const { e, bytes } = await zipWith(() => {});
    const r = await parseBundleZip(bytes, e.registry, { maxBytes: 200 });
    expect(r.ok).toBe(false);
  });
});
