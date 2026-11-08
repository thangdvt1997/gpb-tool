/**
 * Tải lên asset phía client (task 18): kiểm tệp, lưu IndexedDB, không gửi lên máy chủ.
 * Kiểm: đuôi .glb/.gltf, cỡ <= 10 MB, magic 'glTF' (glb) hoặc JSON glTF tự chứa (gltf).
 */
import type { LibraryItem } from './types';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const USER_ID_PREFIX = 'user.';

export type UploadCheck = { ok: true; ext: 'glb' | 'gltf' } | { ok: false; error: string };

/** Kiểm thuần theo tên, cỡ và nội dung (đủ 12 byte đầu cho glb; .gltf cần toàn bộ nội dung). */
export function validateUpload(name: string, size: number, bytes: Uint8Array): UploadCheck {
  const m = /\.(glb|gltf)$/i.exec(name);
  if (!m) return { ok: false, error: 'Chỉ nhận tệp .glb hoặc .gltf.' };
  if (size <= 0 || bytes.length === 0) return { ok: false, error: 'Tệp rỗng.' };
  if (size > MAX_UPLOAD_BYTES) return { ok: false, error: `Tệp quá lớn (tối đa ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).` };
  const ext = m[1]!.toLowerCase() as 'glb' | 'gltf';
  if (ext === 'glb') {
    const magic = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0);
    if (bytes.length < 12 || magic !== 'glTF') return { ok: false, error: 'Không phải tệp GLB hợp lệ (thiếu dấu hiệu "glTF").' };
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (dv.getUint32(4, true) !== 2) return { ok: false, error: 'Chỉ hỗ trợ GLB phiên bản 2.' };
    if (dv.getUint32(8, true) !== size) return { ok: false, error: 'Độ dài khai báo trong GLB không khớp cỡ tệp (tệp hỏng).' };
    return { ok: true, ext };
  }
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { ok: false, error: 'Không phải tệp glTF hợp lệ (JSON hỏng).' };
  }
  const o = json as { asset?: { version?: unknown }; buffers?: Array<{ uri?: unknown }>; images?: Array<{ uri?: unknown }> };
  if (typeof o !== 'object' || o === null || typeof o.asset?.version !== 'string') return { ok: false, error: 'Không phải tệp glTF hợp lệ (thiếu asset.version).' };
  for (const r of [...(o.buffers ?? []), ...(o.images ?? [])]) {
    if (typeof r?.uri === 'string' && !r.uri.startsWith('data:')) return { ok: false, error: 'glTF tham chiếu tệp ngoài; hãy dùng .glb hoặc glTF nhúng sẵn dữ liệu.' };
  }
  return { ok: true, ext };
}

export interface UserAssetRecord {
  id: string;
  name: string;
  fileName: string;
  bytes: number;
  addedAt: number;
  data: Blob;
}

export interface UserAssetStore {
  list(): Promise<UserAssetRecord[]>;
  put(rec: UserAssetRecord): Promise<void>;
  remove(id: string): Promise<void>;
}

export function createMemoryAssetStore(): UserAssetStore {
  const m = new Map<string, UserAssetRecord>();
  return {
    async list() {
      return [...m.values()].sort((a, b) => b.addedAt - a.addedAt);
    },
    async put(r) {
      m.set(r.id, r);
    },
    async remove(id) {
      m.delete(id);
    },
  };
}

const DB_NAME = 'gpb-library';
const STORE = 'user-assets';

function reqP<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error ?? new Error('IndexedDB lỗi'));
  });
}

export function createIdbAssetStore(): UserAssetStore | null {
  if (typeof indexedDB === 'undefined') return null;
  let dbp: Promise<IDBDatabase> | null = null;
  const db = () =>
    (dbp ??= new Promise<IDBDatabase>((res, rej) => {
      const o = indexedDB.open(DB_NAME, 1);
      o.onupgradeneeded = () => o.result.createObjectStore(STORE, { keyPath: 'id' });
      o.onsuccess = () => res(o.result);
      o.onerror = () => rej(o.error ?? new Error('Không mở được IndexedDB'));
    }));
  const tx = async (mode: IDBTransactionMode) => (await db()).transaction(STORE, mode).objectStore(STORE);
  return {
    async list() {
      const all = (await reqP((await tx('readonly')).getAll())) as UserAssetRecord[];
      return all.sort((a, b) => b.addedAt - a.addedAt);
    },
    async put(r) {
      await reqP((await tx('readwrite')).put(r));
    },
    async remove(id) {
      await reqP((await tx('readwrite')).delete(id));
    },
  };
}

export const USER_UPLOAD_WARNING = 'Tự tải lên, chưa có giấy phép. Chỉ lưu trên trình duyệt này, không gửi lên máy chủ.';

export function userItemFromRecord(rec: UserAssetRecord, url: string): LibraryItem {
  return {
    id: rec.id,
    kind: 'prop',
    name: rec.name,
    description: `Tệp tự tải lên: ${rec.fileName}.`,
    tags: ['của tôi', 'tự tải lên'],
    license: null,
    file: url,
    bytes: rec.bytes,
    triangles: null,
    version: null,
    source: 'user-upload',
    usable: true,
    reasons: [],
    warnings: [USER_UPLOAD_WARNING],
  };
}

export function newUserId(): string {
  const r = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return USER_ID_PREFIX + r;
}

export function nameFromFile(fileName: string): string {
  return fileName.replace(/\.(glb|gltf)$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 60) || 'Tệp tải lên';
}

/** Đọc, kiểm và lưu một tệp. */
export async function addUpload(file: File, store: UserAssetStore): Promise<{ ok: true; record: UserAssetRecord } | { ok: false; error: string }> {
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: `Tệp quá lớn (tối đa ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).` };
  if (!/\.(glb|gltf)$/i.test(file.name)) return { ok: false, error: 'Chỉ nhận tệp .glb hoặc .gltf.' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const v = validateUpload(file.name, file.size, bytes);
  if (!v.ok) return v;
  const record: UserAssetRecord = {
    id: newUserId(),
    name: nameFromFile(file.name),
    fileName: file.name.slice(0, 120),
    bytes: file.size,
    addedAt: Date.now(),
    data: new Blob([bytes as BlobPart], { type: v.ext === 'glb' ? 'model/gltf-binary' : 'model/gltf+json' }),
  };
  try {
    await store.put(record);
  } catch (e) {
    return { ok: false, error: `Không lưu được vào trình duyệt: ${(e as Error).message}` };
  }
  return { ok: true, record };
}
