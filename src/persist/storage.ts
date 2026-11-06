/**
 * Storage adapter của bản lưu văn phòng.
 * - IndexedDB (db 'gpb-office', v1): store 'snapshots' (key sceneId), 'backups' (key `${sceneId}:${kind}`),
 *   'assets' (key asset id, nội dung Blob). Ghi snapshot + asset + backup 'previous' trong MỘT transaction
 *   readwrite, nên tab đóng giữa chừng hoặc lỗi quota thì transaction hủy, bản cũ còn nguyên.
 * - localStorage: chỉ tùy chọn nhỏ của module (bật/tắt autosave), bọc try/catch.
 * - Máy chủ: chưa có. Thêm adapter mới theo SnapshotStore (types.ts); không có đồng bộ cloud giả.
 */
import { casDecide, conflictMessage } from './core';
import type { AssetBlob, BackupKind, BackupRecord, OfficeSnapshot, ReadResult, SnapshotStore, StoreErrorCode, WriteResult } from './types';

const DB_NAME = 'gpb-office';
const DB_VERSION = 1;
const S_SNAP = 'snapshots';
const S_BACKUP = 'backups';
const S_ASSET = 'assets';

interface SnapRow {
  sceneId: string;
  raw: unknown;
}
interface BackupRow extends BackupRecord {
  key: string;
}
interface AssetRow {
  id: string;
  mime: string;
  bytes: number;
  sha256: string;
  blob: Blob;
}

function classify(err: unknown): { code: StoreErrorCode; error: string } {
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '';
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return { code: 'quota', error: 'Bộ nhớ trình duyệt đã đầy, chưa lưu được. Hãy xóa bớt dữ liệu trang hoặc ảnh xăm lớn.' };
  }
  if (name === 'InvalidStateError' || name === 'SecurityError' || name === 'UnknownError') {
    return { code: 'unavailable', error: 'Trình duyệt chặn bộ nhớ cục bộ (chế độ riêng tư hoặc bị tắt dữ liệu trang).' };
  }
  if (name === 'AbortError') return { code: 'error', error: 'Lượt ghi bị hủy giữa chừng; bản lưu trước vẫn giữ nguyên.' };
  return { code: 'error', error: 'Không ghi được bản lưu.' };
}

function reqP<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new DOMException('aborted', 'AbortError'));
    tx.onerror = () => reject(tx.error);
  });
}

export function indexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(S_SNAP)) db.createObjectStore(S_SNAP, { keyPath: 'sceneId' });
      if (!db.objectStoreNames.contains(S_BACKUP)) db.createObjectStore(S_BACKUP, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(S_ASSET)) db.createObjectStore(S_ASSET, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Tab khác nâng version DB: đóng để không chặn họ; lần dùng sau mở lại.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new DOMException('blocked', 'InvalidStateError'));
  });
}

function storedRevision(raw: unknown): number | null {
  if (raw && typeof raw === 'object' && 'revision' in raw) {
    const r = (raw as { revision: unknown }).revision;
    if (Number.isInteger(r)) return r as number;
  }
  return null;
}

/** Store IndexedDB. Gọi khi indexedDbAvailable() = true. */
export function createIndexedDbStore(): SnapshotStore {
  let dbP: Promise<IDBDatabase> | null = null;
  const db = (): Promise<IDBDatabase> => {
    if (!dbP) {
      dbP = openDb().catch((e) => {
        dbP = null;
        throw e;
      });
    }
    return dbP;
  };

  return {
    kind: 'indexeddb',

    async read(sceneId: string): Promise<ReadResult> {
      try {
        const tx = (await db()).transaction(S_SNAP, 'readonly');
        const row = (await reqP(tx.objectStore(S_SNAP).get(sceneId))) as SnapRow | undefined;
        return { ok: true, raw: row ? row.raw : null };
      } catch (e) {
        const c = classify(e);
        return { ok: false, code: c.code, error: c.error };
      }
    },

    async write(snapshot: OfficeSnapshot, expected: number | null, assets: readonly AssetBlob[]): Promise<WriteResult> {
      let tx: IDBTransaction;
      try {
        tx = (await db()).transaction([S_SNAP, S_BACKUP, S_ASSET], 'readwrite');
      } catch (e) {
        const c = classify(e);
        return { ok: false, code: c.code, error: c.error };
      }
      const done = txDone(tx);
      let outcome: WriteResult | null = null;
      try {
        const snaps = tx.objectStore(S_SNAP);
        const cur = (await reqP(snaps.get(snapshot.sceneId))) as SnapRow | undefined;
        const d = casDecide(cur ? storedRevision(cur.raw) : null, expected);
        if (!d.ok) {
          outcome = { ok: false, code: 'conflict', error: conflictMessage(d.storedRevision), storedRevision: d.storedRevision };
          tx.abort();
        } else {
          if (cur) {
            const b: BackupRow = { key: `${snapshot.sceneId}:previous`, kind: 'previous', sceneId: snapshot.sceneId, createdAt: Date.now(), raw: cur.raw };
            tx.objectStore(S_BACKUP).put(b);
          }
          const assetStore = tx.objectStore(S_ASSET);
          for (const a of assets) {
            const row: AssetRow = { id: a.ref.id, mime: a.ref.mime, bytes: a.ref.bytes, sha256: a.ref.sha256, blob: a.blob };
            assetStore.put(row);
          }
          const row: SnapRow = { sceneId: snapshot.sceneId, raw: { ...snapshot, revision: d.nextRevision } };
          snaps.put(row);
          outcome = { ok: true, revision: d.nextRevision };
        }
      } catch (e) {
        try {
          tx.abort();
        } catch {
          // Transaction đã kết thúc.
        }
        const c = classify(e);
        outcome = { ok: false, code: c.code, error: c.error };
      }
      try {
        await done;
      } catch (e) {
        if (outcome && !outcome.ok) return outcome;
        const c = classify(e);
        return { ok: false, code: c.code, error: c.error };
      }
      return outcome ?? { ok: false, code: 'error', error: 'Không ghi được bản lưu.' };
    },

    async readBackup(sceneId: string, kind: BackupKind): Promise<BackupRecord | null> {
      try {
        const tx = (await db()).transaction(S_BACKUP, 'readonly');
        const row = (await reqP(tx.objectStore(S_BACKUP).get(`${sceneId}:${kind}`))) as BackupRow | undefined;
        return row ? { kind: row.kind, sceneId: row.sceneId, createdAt: row.createdAt, raw: row.raw } : null;
      } catch {
        return null;
      }
    },

    async writeBackup(record: BackupRecord): Promise<WriteResult> {
      try {
        const tx = (await db()).transaction(S_BACKUP, 'readwrite');
        const row: BackupRow = { ...record, key: `${record.sceneId}:${record.kind}` };
        tx.objectStore(S_BACKUP).put(row);
        await txDone(tx);
        return { ok: true, revision: 0 };
      } catch (e) {
        const c = classify(e);
        return { ok: false, code: c.code, error: c.error };
      }
    },

    async getAsset(id: string): Promise<Blob | null> {
      try {
        const tx = (await db()).transaction(S_ASSET, 'readonly');
        const row = (await reqP(tx.objectStore(S_ASSET).get(id))) as AssetRow | undefined;
        return row ? row.blob : null;
      } catch {
        return null;
      }
    },

    async hasAssets(ids: readonly string[]): Promise<Set<string>> {
      const found = new Set<string>();
      if (ids.length === 0) return found;
      try {
        const tx = (await db()).transaction(S_ASSET, 'readonly');
        const store = tx.objectStore(S_ASSET);
        const keys = await Promise.all(ids.map((id) => reqP(store.getKey(id))));
        keys.forEach((k, i) => {
          if (k !== undefined) found.add(ids[i]);
        });
      } catch {
        // Không đọc được: coi như thiếu, người gọi dùng fallback.
      }
      return found;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Tùy chọn nhỏ trong localStorage                                     */
/* ------------------------------------------------------------------ */

const PREFS_KEY = 'gpb.persist.prefs.v1';

export interface PersistPrefs {
  autosave: boolean;
}

const DEFAULT_PREFS: PersistPrefs = { autosave: true };

export function loadPrefs(): PersistPrefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const v: unknown = JSON.parse(raw);
    const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
    return { autosave: typeof o.autosave === 'boolean' ? o.autosave : DEFAULT_PREFS.autosave };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/** Trả false nếu không ghi được (chế độ riêng tư, hết hạn mức); tùy chọn vẫn dùng trong phiên. */
export function savePrefs(p: PersistPrefs): boolean {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Asset                                                               */
/* ------------------------------------------------------------------ */

export async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}

export function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
