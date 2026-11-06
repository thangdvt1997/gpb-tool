/**
 * Vòng sao lưu cục bộ: giữ N bản gần nhất, mỗi bản có nhãn thời gian.
 * Lưu trên KeyValueStorage (mặc định localStorage). Mỗi bản một khóa + một khóa chỉ mục.
 */
import { isPlainObject } from './safeJson';
import type { MetaBackup } from './types';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const RING_PREFIX = 'gpb.backup.v1';
export const RING_DEFAULT_MAX = 5;
const REASONS: ReadonlySet<string> = new Set(['manual', 'auto', 'pre-import', 'pre-restore']);
const ID_RE = /^b[a-z0-9]{4,40}$/;

export type RingAddResult = { ok: true; meta: MetaBackup; dropped: string[] } | { ok: false; error: string };

export interface BackupRing {
  list(): MetaBackup[];
  add(text: string, opts?: { label?: string; reason?: MetaBackup['reason']; now?: Date }): RingAddResult;
  get(id: string): string | null;
  remove(id: string): boolean;
  readonly max: number;
}

export function createBackupRing(opts: { storage: KeyValueStorage; max?: number; prefix?: string }): BackupRing {
  const prefix = opts.prefix ?? RING_PREFIX;
  const max = Math.min(50, Math.max(1, Math.floor(opts.max ?? RING_DEFAULT_MAX)));
  const idxKey = `${prefix}.index`;
  const entryKey = (id: string) => `${prefix}.entry.${id}`;
  const st = opts.storage;
  let seq = 0;

  function readIndex(): MetaBackup[] {
    let raw: string | null = null;
    try {
      raw = st.getItem(idxKey);
    } catch {
      return [];
    }
    if (!raw) return [];
    let v: unknown;
    try {
      v = JSON.parse(raw);
    } catch {
      return [];
    }
    if (!Array.isArray(v)) return [];
    const out: MetaBackup[] = [];
    for (const m of v) {
      if (!isPlainObject(m)) continue;
      if (typeof m.id !== 'string' || !ID_RE.test(m.id) || typeof m.createdAt !== 'number' || !Number.isFinite(m.createdAt)) continue;
      out.push({
        id: m.id,
        createdAt: m.createdAt,
        label: typeof m.label === 'string' ? m.label.slice(0, 80) : '',
        reason: typeof m.reason === 'string' && REASONS.has(m.reason) ? (m.reason as MetaBackup['reason']) : 'manual',
        bytes: typeof m.bytes === 'number' ? m.bytes : 0,
      });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1));
  }

  function writeIndex(list: MetaBackup[]): void {
    st.setItem(idxKey, JSON.stringify(list));
  }

  function dropEntry(id: string): void {
    try {
      st.removeItem(entryKey(id));
    } catch {
      // Bỏ qua.
    }
  }

  const ring: BackupRing = {
    max,
    list: readIndex,
    get(id) {
      if (!ID_RE.test(id)) return null;
      try {
        return st.getItem(entryKey(id));
      } catch {
        return null;
      }
    },
    remove(id) {
      const list = readIndex();
      if (!list.some((m) => m.id === id)) return false;
      dropEntry(id);
      try {
        writeIndex(list.filter((m) => m.id !== id));
      } catch {
        return false;
      }
      return true;
    },
    add(text, o = {}) {
      const now = (o.now ?? new Date()).getTime();
      const id = `b${now.toString(36)}${(seq++ % 1296).toString(36).padStart(2, '0')}`;
      const label = (o.label?.trim() || new Date(now).toISOString()).slice(0, 80);
      const meta: MetaBackup = { id, createdAt: now, label, reason: o.reason ?? 'manual', bytes: new TextEncoder().encode(text).length };
      let list = readIndex();
      const dropped: string[] = [];
      // Chừa chỗ cho bản mới: bỏ các bản cũ nhất vượt quá max-1.
      while (list.length > max - 1) {
        const old = list[list.length - 1];
        list = list.slice(0, -1);
        dropEntry(old.id);
        dropped.push(old.id);
      }
      // Ghi bản mới; hết dung lượng thì bỏ thêm bản cũ nhất rồi thử lại.
      for (;;) {
        try {
          st.setItem(entryKey(id), text);
          writeIndex([meta, ...list]);
          return { ok: true, meta, dropped };
        } catch (e) {
          dropEntry(id);
          if (list.length === 0) return { ok: false, error: `Không lưu được bản sao lưu (hết dung lượng?): ${(e as Error).message}` };
          const old = list[list.length - 1];
          list = list.slice(0, -1);
          dropEntry(old.id);
          dropped.push(old.id);
        }
      }
    },
  };
  return ring;
}

/** Bộ nhớ trong bộ (cho test hoặc khi localStorage bị chặn). */
export function createMemoryStorage(limitBytes = Infinity): KeyValueStorage & { size(): number } {
  const m = new Map<string, string>();
  const total = () => [...m.values()].reduce((a, s) => a + s.length, 0);
  return {
    getItem: (k) => (m.has(k) ? (m.get(k) as string) : null),
    setItem(k, v) {
      const prev = m.get(k)?.length ?? 0;
      if (total() - prev + v.length > limitBytes) throw new Error('QuotaExceeded');
      m.set(k, v);
    },
    removeItem: (k) => void m.delete(k),
    size: () => m.size,
  };
}
