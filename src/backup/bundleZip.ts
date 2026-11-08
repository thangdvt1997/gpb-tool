/**
 * Gói .zip: manifest.json + data.json (đúng gói JSON, có checksum SHA-256 bên trong) + ảnh xăm nhúng (tattoos/).
 * Nhập ZIP lấy data.json rồi đi qua parseBundleText (giới hạn cỡ, chặn __proto__, checksum, migrate, schema).
 */
import { buildBundle, type BuildOptions } from './bundle';
import type { ParseBundleResult } from './importer';
import { parseBundleText } from './importer';
import type { BackupRegistry } from './registry';
import { sha256Bytes } from './safeJson';
import { buildZip, readZip, type ZipFile } from './zip';
import { MAX_IMPORT_BYTES } from './types';

export const ZIP_FORMAT = 'gpb-backup-zip';
export const ZIP_MAX_IMAGES = 40;
const IMG_RE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;
const EXT: Record<string, string> = { png: 'png', jpeg: 'jpg', webp: 'webp' };

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Tìm ảnh data URL trong dữ liệu (không đệ quy sâu quá giới hạn, bỏ trùng). */
export function extractImages(value: unknown): ZipFile[] {
  const out: ZipFile[] = [];
  const seen = new Set<string>();
  const stack: unknown[] = [value];
  let guard = 0;
  while (stack.length && out.length < ZIP_MAX_IMAGES && guard++ < 200_000) {
    const v = stack.pop();
    if (typeof v === 'string') {
      if (v.length < 40 || seen.has(v)) continue;
      const m = IMG_RE.exec(v);
      if (!m) continue;
      seen.add(v);
      try {
        out.push({ name: `tattoos/${String(out.length + 1).padStart(2, '0')}.${EXT[m[1]!]}`, data: b64ToBytes(m[2]!) });
      } catch {
        /* base64 hỏng: bỏ qua ảnh, dữ liệu gốc vẫn nằm trong data.json */
      }
    } else if (Array.isArray(v)) {
      for (const x of v) stack.push(x);
    } else if (typeof v === 'object' && v !== null) {
      for (const x of Object.values(v)) stack.push(x);
    }
  }
  return out;
}

export function zipFileName(jsonName: string): string {
  return jsonName.replace(/\.json$/i, '.zip');
}

export type BuildZipResult =
  | { ok: true; bytes: Uint8Array; images: number; sections: number; removed: string[] }
  | { ok: false; error: string };

export async function buildBundleZip(registry: BackupRegistry, opts: BuildOptions = {}): Promise<BuildZipResult> {
  const r = await buildBundle(registry, opts);
  if (!r.ok) return r;
  const enc = new TextEncoder();
  const data = enc.encode(r.text);
  const images = extractImages(r.bundle.sections);
  const files: ZipFile[] = [{ name: 'data.json', data }, ...images];
  const entries: Array<{ name: string; bytes: number; sha256: string }> = [];
  for (const f of files) entries.push({ name: f.name, bytes: f.data.length, sha256: await sha256Bytes(f.data) });
  const manifest = {
    format: ZIP_FORMAT,
    version: 1,
    app: r.bundle.header.app,
    createdAt: r.bundle.header.createdAt,
    bundleChecksum: r.bundle.header.checksum,
    files: entries,
    note: 'Dữ liệu gốc nằm ở data.json; thư mục tattoos/ chỉ là bản sao ảnh xăm để xem.',
  };
  const bytes = buildZip([{ name: 'manifest.json', data: enc.encode(JSON.stringify(manifest, null, 2)) }, ...files]);
  return { ok: true, bytes, images: images.length, sections: Object.keys(r.bundle.sections).length, removed: r.removed };
}

export async function parseBundleZip(bytes: Uint8Array, registry: BackupRegistry, opts: { maxBytes?: number } = {}): Promise<ParseBundleResult> {
  const max = opts.maxBytes ?? MAX_IMPORT_BYTES;
  const z = readZip(bytes, { maxTotalBytes: max });
  if (!z.ok) return z;
  const byName = new Map(z.files.map((f) => [f.name, f.data]));
  const mraw = byName.get('manifest.json');
  const data = byName.get('data.json');
  if (!mraw || !data) return { ok: false, error: 'ZIP thiếu manifest.json hoặc data.json.' };
  let manifest: { format?: unknown; files?: unknown };
  try {
    manifest = JSON.parse(new TextDecoder().decode(mraw));
  } catch {
    return { ok: false, error: 'manifest.json trong ZIP không hợp lệ.' };
  }
  if (typeof manifest !== 'object' || manifest === null || manifest.format !== ZIP_FORMAT || !Array.isArray(manifest.files)) {
    return { ok: false, error: 'ZIP không phải gói sao lưu của ứng dụng này.' };
  }
  for (const e of manifest.files as Array<{ name?: unknown; sha256?: unknown }>) {
    if (typeof e?.name !== 'string' || typeof e.sha256 !== 'string') return { ok: false, error: 'manifest.json trong ZIP sai cấu trúc.' };
    const f = byName.get(e.name);
    if (!f) return { ok: false, error: `ZIP thiếu tệp "${e.name}" khai trong manifest.` };
    if ((await sha256Bytes(f)) !== e.sha256) return { ok: false, error: `Checksum SHA-256 của "${e.name}" không khớp: gói bị sửa hoặc hỏng.` };
  }
  if (!(manifest.files as Array<{ name?: unknown }>).some((e) => e.name === 'data.json')) return { ok: false, error: 'manifest.json không khai data.json.' };
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    return { ok: false, error: 'data.json không phải UTF-8 hợp lệ.' };
  }
  return parseBundleText(text, registry, { maxBytes: max });
}
