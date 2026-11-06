/** Yêu thích và gần đây lưu trong localStorage, có kiểm tra dữ liệu hỏng. */

export const FAVORITES_KEY = 'gpb.library.favorites.v1';
export const RECENT_KEY = 'gpb.library.recent.v1';
export const RECENT_MAX = 12;
export const FAVORITES_MAX = 500;

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function defaultStore(): KV | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Chỉ nhận mảng chuỗi id hợp lệ; mọi thứ khác (JSON hỏng, sai kiểu) cho ra mảng rỗng. Loại trùng. */
export function parseIdList(raw: string | null, max: number): string[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: string[] = [];
  for (const v of data) {
    if (typeof v !== 'string' || v.length === 0 || v.length > 120) continue;
    if (!out.includes(v)) out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

function save(store: KV | null, key: string, ids: string[]): boolean {
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(ids));
    return true;
  } catch {
    return false;
  }
}

function load(store: KV | null, key: string, max: number): string[] {
  if (!store) return [];
  try {
    return parseIdList(store.getItem(key), max);
  } catch {
    return [];
  }
}

export function loadFavorites(store: KV | null = defaultStore()): string[] {
  return load(store, FAVORITES_KEY, FAVORITES_MAX);
}

/** Bật/tắt yêu thích. Trả danh sách mới. */
export function toggleFavorite(id: string, store: KV | null = defaultStore()): string[] {
  const cur = loadFavorites(store);
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-FAVORITES_MAX);
  save(store, FAVORITES_KEY, next);
  return next;
}

export function loadRecent(store: KV | null = defaultStore()): string[] {
  return load(store, RECENT_KEY, RECENT_MAX);
}

/** Đưa id lên đầu danh sách gần đây, giữ tối đa RECENT_MAX. */
export function pushRecent(id: string, store: KV | null = defaultStore()): string[] {
  const next = [id, ...loadRecent(store).filter((x) => x !== id)].slice(0, RECENT_MAX);
  save(store, RECENT_KEY, next);
  return next;
}

/** Bỏ id không còn trong thư viện (asset bị xoá). */
export function pruneIds(ids: readonly string[], known: ReadonlySet<string>): string[] {
  return ids.filter((i) => known.has(i));
}
