/**
 * Xuất, nhập và lưu cục bộ cấu hình nhân vật (fashion.txt mục 9). Mọi dữ liệu nhập đều qua validate().
 * localStorage có thể ném lỗi (chế độ riêng tư, chặn dữ liệu trang, hết hạn mức) nên luôn bọc try/catch.
 * Ảnh tải lên chưa hỗ trợ: định dạng chỉ chứa tham số, không chứa ảnh.
 */
import { appearanceToLook, isLegacyAppearance } from './migrate';
import { validate } from './rules';
import type { CharacterLook, LookWarning, OutfitSet } from './types';
import { LOOK_SCHEMA_VERSION } from './types';

export const LOOK_FORMAT = 'gpb-character-look';
export const OUTFIT_SETS_STORAGE_KEY = 'gpb.fashion.outfitSets.v1';
/** Kích thước tối đa một look khi nhập/xuất (byte UTF-8). */
export const MAX_LOOK_BYTES = 64 * 1024;
/** Số bộ phối lưu cục bộ tối đa. */
export const MAX_OUTFIT_SETS = 24;
/** Tổng kích thước tối đa của danh sách bộ phối trong localStorage (byte UTF-8). */
export const MAX_OUTFIT_SETS_BYTES = 512 * 1024;
const MAX_SET_NAME = 40;

export type ImportResult =
  | { ok: true; look: CharacterLook; warnings: LookWarning[] }
  | { ok: false; error: string };

export type SaveResult = { ok: true; saved: number; warnings: string[] } | { ok: false; error: string };

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Xuất look thành chuỗi JSON có định dạng, đã qua validate. */
export function exportLook(look: CharacterLook): string {
  const clean = validate(look).look;
  return JSON.stringify({ format: LOOK_FORMAT, version: LOOK_SCHEMA_VERSION, look: clean }, null, 2);
}

/**
 * Nhập look từ chuỗi JSON. Nhận: bản xuất của exportLook, một CharacterLook trần, hoặc Appearance cũ
 * (tự chuyển đổi). Trả về lỗi tiếng Việt nếu không đọc được; dữ liệu đọc được thì luôn trả về look hợp lệ.
 */
export function importLook(text: unknown): ImportResult {
  if (typeof text !== 'string' || text.trim() === '') return { ok: false, error: 'Không có dữ liệu để nhập.' };
  if (byteLength(text) > MAX_LOOK_BYTES) {
    return { ok: false, error: `Dữ liệu quá lớn (tối đa ${Math.round(MAX_LOOK_BYTES / 1024)} KB).` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Dữ liệu không phải JSON hợp lệ.' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'Dữ liệu phải là một đối tượng JSON.' };
  }
  const obj = parsed as Record<string, unknown>;
  let body: unknown = obj;
  if ('format' in obj) {
    if (obj.format !== LOOK_FORMAT) return { ok: false, error: 'Định dạng tệp không phải cấu hình nhân vật.' };
    body = obj.look;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return { ok: false, error: 'Tệp thiếu phần cấu hình nhân vật.' };
    }
  }
  const result = isLegacyAppearance(body) ? appearanceToLook(body) : validate(body);
  return { ok: true, look: result.look, warnings: result.warnings };
}

function makeId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID().slice(0, 18);
  } catch {
    // Bỏ qua, dùng cách dự phòng.
  }
  return `set-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

const SET_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

function cleanName(name: unknown, fallback: string): string {
  if (typeof name !== 'string') return fallback;
  const n = Array.from(name.replace(/\s+/g, ' ').trim()).slice(0, MAX_SET_NAME).join('');
  return n || fallback;
}

/** Tạo bộ phối mới từ look hiện tại. */
export function createOutfitSet(name: string, look: CharacterLook): OutfitSet {
  const clean = validate(look).look;
  const setName = cleanName(name, 'Bộ phối');
  clean.meta.name = setName;
  return { id: makeId(), name: setName, savedAt: Date.now(), look: clean };
}

function sanitizeSet(value: unknown, index: number): OutfitSet | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const id = typeof v.id === 'string' && SET_ID_RE.test(v.id) ? v.id : `set-${index + 1}`;
  const savedAt = typeof v.savedAt === 'number' && Number.isFinite(v.savedAt) && v.savedAt > 0 ? v.savedAt : 0;
  const look = validate(v.look).look;
  return { id, name: cleanName(v.name, `Bộ phối ${index + 1}`), savedAt, look };
}

function getStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Lưu danh sách bộ phối vào localStorage. Bộ trùng id chỉ giữ bản đầu; quá MAX_OUTFIT_SETS thì bỏ bộ cuối.
 * Không ghi gì nếu tổng kích thước vượt giới hạn.
 */
export function saveOutfitSets(sets: readonly OutfitSet[]): SaveResult {
  const warnings: string[] = [];
  const seen = new Set<string>();
  const clean: OutfitSet[] = [];
  sets.forEach((s, i) => {
    const c = sanitizeSet(s, i);
    if (!c) return;
    if (seen.has(c.id)) {
      warnings.push(`Bộ phối trùng mã "${c.id}" đã bị bỏ.`);
      return;
    }
    seen.add(c.id);
    clean.push(c);
  });
  if (clean.length > MAX_OUTFIT_SETS) {
    warnings.push(`Chỉ lưu tối đa ${MAX_OUTFIT_SETS} bộ phối; đã bỏ ${clean.length - MAX_OUTFIT_SETS} bộ cuối.`);
    clean.length = MAX_OUTFIT_SETS;
  }
  const text = JSON.stringify({ format: `${LOOK_FORMAT}-sets`, version: LOOK_SCHEMA_VERSION, sets: clean });
  if (byteLength(text) > MAX_OUTFIT_SETS_BYTES) {
    return { ok: false, error: 'Danh sách bộ phối quá lớn để lưu cục bộ. Hãy xoá bớt bộ cũ.' };
  }
  const storage = getStorage();
  if (!storage) return { ok: false, error: 'Trình duyệt không cho lưu dữ liệu cục bộ.' };
  try {
    storage.setItem(OUTFIT_SETS_STORAGE_KEY, text);
  } catch {
    return { ok: false, error: 'Không lưu được: bộ nhớ trình duyệt đầy hoặc bị chặn.' };
  }
  return { ok: true, saved: clean.length, warnings };
}

/** Đọc danh sách bộ phối đã lưu. Dữ liệu hỏng hoặc không đọc được thì trả về mảng rỗng. */
export function loadOutfitSets(): OutfitSet[] {
  const storage = getStorage();
  if (!storage) return [];
  let text: string | null = null;
  try {
    text = storage.getItem(OUTFIT_SETS_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!text || byteLength(text) > MAX_OUTFIT_SETS_BYTES) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const list =
    typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>).sets : undefined;
  if (!Array.isArray(list)) return [];
  const out: OutfitSet[] = [];
  const seen = new Set<string>();
  list.slice(0, MAX_OUTFIT_SETS).forEach((item, i) => {
    const s = sanitizeSet(item, i);
    if (s && !seen.has(s.id)) {
      seen.add(s.id);
      out.push(s);
    }
  });
  return out;
}

/** Xoá toàn bộ bộ phối đã lưu cục bộ. */
export function clearOutfitSets(): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.removeItem(OUTFIT_SETS_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
