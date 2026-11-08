// Bản nháp bố cục lưu cục bộ (localStorage) để không mất khi tải lại trang. Có phiên bản schema và migrate.
// Phần thuần (build/parse/migrate/apply) tách khỏi I/O để test không cần trình duyệt.
import type { LayoutDraft, LayoutDraftAdapter } from '../backup/sections';
import { validateLayoutDraft } from '../backup/sections';
import { safeParse, utf8Bytes } from '../backup/safeJson';
import { buildBatchOps, type EditorState } from './core';

export const DRAFT_KEY = 'gpb.layoutDraft';
export const DRAFT_FORMAT = 'gpb-layout-draft';
/** v1: { items } ; v2: thêm props, removed, baseVersion. */
export const DRAFT_SCHEMA_VERSION = 2;
export const MAX_DRAFT_BYTES = 256 * 1024;
export const DRAFT_EVENT = 'gpb:layout-draft-changed';

export interface StoredDraft {
  format: typeof DRAFT_FORMAT;
  schemaVersion: number;
  savedAt: number;
  /** Phiên bản bố cục máy chủ lúc tạo nháp (null: không rõ, vd. nhập từ sao lưu). */
  baseVersion: number | null;
  draft: LayoutDraft;
}

/** Nháp rút từ trạng thái trình biên tập: chỉ các vật khác bản đã lưu. null nếu không có thay đổi. */
export function draftFromState(s: Pick<EditorState, 'saved' | 'draft' | 'defaults' | 'env'>): LayoutDraft | null {
  const ops = buildBatchOps(s);
  if (ops.length === 0) return null;
  const out: LayoutDraft = { items: {} };
  for (const o of ops) {
    if (o.op === 'remove') (out.removed ??= []).push(o.id);
    else {
      const p = s.draft[o.id];
      out.items[o.id] = p.door ? { x: p.x, z: p.z, rotation: p.rotation, door: true } : { x: p.x, z: p.z, rotation: p.rotation };
      if (o.op === 'put') (out.props ??= {})[o.id] = o.kind;
    }
  }
  return out;
}

/** Nâng bản đã lưu (mọi phiên bản cũ) lên phiên bản hiện tại; null nếu không đọc được. */
export function migrateStored(raw: unknown): StoredDraft | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.format !== DRAFT_FORMAT || typeof r.schemaVersion !== 'number' || !Number.isInteger(r.schemaVersion)) return null;
  if (r.schemaVersion > DRAFT_SCHEMA_VERSION || r.schemaVersion < 1) return null;
  let draft: unknown = r.draft;
  let baseVersion: number | null = typeof r.baseVersion === 'number' && Number.isFinite(r.baseVersion) ? r.baseVersion : null;
  // v1 -> v2: chưa có props/removed/baseVersion; các vật chỉ là vật gốc.
  if (r.schemaVersion === 1) {
    const d = (draft ?? {}) as { items?: unknown };
    draft = { items: d.items };
    baseVersion = null;
  }
  const v = validateLayoutDraft(draft);
  if (!v.ok) return null;
  const data = v.data as LayoutDraft;
  if (Object.keys(data.items).length === 0 && !(data.removed && data.removed.length)) return null;
  return { format: DRAFT_FORMAT, schemaVersion: DRAFT_SCHEMA_VERSION, savedAt: typeof r.savedAt === 'number' ? r.savedAt : 0, baseVersion, draft: data };
}

export function parseStored(text: string | null): StoredDraft | null {
  if (!text || utf8Bytes(text) > MAX_DRAFT_BYTES) return null;
  const p = safeParse(text);
  return p.ok ? migrateStored(p.value) : null;
}

export interface DraftStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function defaultStorage(): DraftStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadStoredDraft(st: DraftStorage | null = defaultStorage()): StoredDraft | null {
  if (!st) return null;
  try {
    const text = st.getItem(DRAFT_KEY);
    const d = parseStored(text);
    if (text && !d) st.removeItem(DRAFT_KEY); // hỏng: bỏ để không hỏi lại mãi
    return d;
  } catch {
    return null;
  }
}

/** Ghi nháp; trả false nếu đầy bộ nhớ hoặc bị chặn (không ném lỗi: nháp chỉ là tiện ích). */
export function saveStoredDraft(draft: LayoutDraft, baseVersion: number | null, st: DraftStorage | null = defaultStorage(), now = Date.now()): boolean {
  if (!st) return false;
  const rec: StoredDraft = { format: DRAFT_FORMAT, schemaVersion: DRAFT_SCHEMA_VERSION, savedAt: now, baseVersion, draft };
  const text = JSON.stringify(rec);
  if (utf8Bytes(text) > MAX_DRAFT_BYTES) return false;
  try {
    st.setItem(DRAFT_KEY, text);
    return true;
  } catch {
    return false;
  }
}

export function clearStoredDraft(st: DraftStorage | null = defaultStorage()): void {
  try {
    st?.removeItem(DRAFT_KEY);
  } catch {
    /* bỏ qua */
  }
}

function notify(): void {
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(DRAFT_EVENT));
  } catch {
    /* bỏ qua */
  }
}

/** Adapter cho gói sao lưu (phần "layoutdraft"). */
export function createDraftBackupAdapter(st: DraftStorage | null = defaultStorage()): LayoutDraftAdapter {
  return {
    read: () => loadStoredDraft(st)?.draft ?? null,
    write(d) {
      if (!saveStoredDraft(d, null, st)) throw new Error('Không ghi được bản nháp bố cục (bộ nhớ đầy hoặc bị chặn).');
      notify();
    },
    clear() {
      clearStoredDraft(st);
      notify();
    },
  };
}
