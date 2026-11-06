import type { LibraryItem, LibraryKind } from './types';
import { foldVietnamese, queryTokens } from './text';

export type SortKey = 'name' | 'kind' | 'size' | 'triangles';

export interface LibraryQuery {
  text?: string;
  kinds?: readonly LibraryKind[];
  tags?: readonly string[];
  /** Lọc theo SPDX (so khớp không phân biệt hoa thường). */
  licenses?: readonly string[];
  onlyUsable?: boolean;
  sort?: SortKey;
  desc?: boolean;
  page?: number;
  pageSize?: number;
}

export interface LibraryPage {
  items: LibraryItem[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
}

export const DEFAULT_PAGE_SIZE = 24;

function haystack(it: LibraryItem): string {
  return foldVietnamese([it.id, it.name, it.description, it.kind, ...it.tags].join(' '));
}

export function filterItems(items: readonly LibraryItem[], q: LibraryQuery): LibraryItem[] {
  const tokens = queryTokens(q.text ?? '');
  const kinds = q.kinds && q.kinds.length ? new Set(q.kinds) : null;
  const tags = (q.tags ?? []).map(foldVietnamese).filter(Boolean);
  const lics = q.licenses && q.licenses.length ? new Set(q.licenses.map((s) => s.toLowerCase())) : null;
  return items.filter((it) => {
    if (q.onlyUsable && !it.usable) return false;
    if (kinds && !kinds.has(it.kind)) return false;
    if (lics && !lics.has((it.license?.spdx ?? '').toLowerCase())) return false;
    if (tags.length) {
      const own = it.tags.map(foldVietnamese);
      if (!tags.every((t) => own.includes(t))) return false;
    }
    if (tokens.length) {
      const h = haystack(it);
      if (!tokens.every((t) => h.includes(t))) return false;
    }
    return true;
  });
}

/** Giá trị null luôn xếp cuối bất kể chiều sắp xếp. */
export function sortItems(items: readonly LibraryItem[], key: SortKey = 'name', desc = false): LibraryItem[] {
  const num = (it: LibraryItem): number | null => (key === 'size' ? it.bytes : key === 'triangles' ? it.triangles : null);
  const dir = desc ? -1 : 1;
  return [...items].sort((a, b) => {
    if (key === 'size' || key === 'triangles') {
      const x = num(a);
      const y = num(b);
      if (x === null && y === null) return a.id.localeCompare(b.id);
      if (x === null) return 1;
      if (y === null) return -1;
      return (x - y) * dir || a.id.localeCompare(b.id);
    }
    if (key === 'kind') {
      return (a.kind.localeCompare(b.kind) || foldVietnamese(a.name).localeCompare(foldVietnamese(b.name))) * dir || a.id.localeCompare(b.id);
    }
    return foldVietnamese(a.name).localeCompare(foldVietnamese(b.name)) * dir || a.id.localeCompare(b.id);
  });
}

export function paginate<T>(items: readonly T[], page = 1, pageSize = DEFAULT_PAGE_SIZE): { items: T[]; page: number; pageCount: number; pageSize: number; total: number } {
  const size = Number.isFinite(pageSize) && pageSize >= 1 ? Math.floor(pageSize) : DEFAULT_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(pageCount, Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1));
  return { items: items.slice((p - 1) * size, p * size), page: p, pageCount, pageSize: size, total: items.length };
}

export function runQuery(items: readonly LibraryItem[], q: LibraryQuery): LibraryPage {
  const sorted = sortItems(filterItems(items, q), q.sort ?? 'name', q.desc ?? false);
  return paginate(sorted, q.page, q.pageSize);
}

/** Danh sách tag và giấy phép hiện có, để dựng bộ lọc. */
export function collectFacets(items: readonly LibraryItem[]): { tags: string[]; licenses: string[] } {
  const tags = new Set<string>();
  const lics = new Set<string>();
  for (const it of items) {
    it.tags.forEach((t) => tags.add(t));
    lics.add(it.license?.spdx || '(thiếu)');
  }
  return { tags: [...tags].sort(), licenses: [...lics].sort() };
}
