/** So sánh hai giá trị JSON thành danh sách thay đổi có đường dẫn (cho xem trước nhập). */
import { isPlainObject, FORBIDDEN_KEYS } from './safeJson';
import type { DiffEntry } from './types';

function short(v: unknown): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  const t = s ?? 'undefined';
  return t.length > 40 ? `${t.slice(0, 37)}...` : t;
}

export interface DiffResult {
  entries: DiffEntry[];
  truncated: boolean;
  /** Tổng số thay đổi (kể cả phần bị cắt). */
  total: number;
}

export function diffValues(before: unknown, after: unknown, opts: { limit?: number; ignore?: readonly string[] } = {}): DiffResult {
  const limit = opts.limit ?? 50;
  const ignore = new Set(opts.ignore ?? []);
  const entries: DiffEntry[] = [];
  let total = 0;
  const push = (e: DiffEntry) => {
    total++;
    if (entries.length < limit) entries.push(e);
  };
  const walk = (a: unknown, b: unknown, path: string): void => {
    if (path && ignore.has(path)) return;
    if (a === undefined && b === undefined) return;
    if (a === undefined) return push({ path: path || '(gốc)', kind: 'added', after: short(b) });
    if (b === undefined) return push({ path: path || '(gốc)', kind: 'removed', before: short(a) });
    if (isPlainObject(a) && isPlainObject(b)) {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const k of [...keys].sort()) {
        if (FORBIDDEN_KEYS.has(k)) continue;
        walk(a[k], b[k], path ? `${path}.${k}` : k);
      }
      return;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      const n = Math.max(a.length, b.length);
      for (let i = 0; i < n; i++) walk(a[i], b[i], `${path}[${i}]`);
      return;
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) push({ path: path || '(gốc)', kind: 'changed', before: short(a), after: short(b) });
  };
  walk(before, after, '');
  return { entries, truncated: total > entries.length, total };
}

/** Gộp sâu an toàn: đối tượng gộp theo khóa (dữ liệu nhập ưu tiên), mảng và giá trị đơn lấy dữ liệu nhập. */
export function deepMerge(current: unknown, incoming: unknown): unknown {
  if (isPlainObject(current) && isPlainObject(incoming)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(current)) if (!FORBIDDEN_KEYS.has(k)) out[k] = current[k];
    for (const k of Object.keys(incoming)) {
      if (FORBIDDEN_KEYS.has(k)) continue;
      out[k] = k in out ? deepMerge(out[k], incoming[k]) : incoming[k];
    }
    return out;
  }
  return incoming;
}
