/**
 * Logic thuần của giao diện hồ sơ: kiểm form và chuyển lỗi API thành thông điệp/hành động cho người dùng.
 * Không phụ thuộc React hay fetch nên test được bằng vitest. Luật tên khớp services/auth/character.js
 * (validateDisplayName); server vẫn là nơi kiểm cuối cùng.
 */

export const NAME_MIN = 2;
export const NAME_MAX = 80;

/** Giá trị avatarRef hợp lệ phía UI: không dùng ảnh, hoặc vẽ từ nhân vật đã lưu. */
export type AvatarChoice = 'none' | 'character';

export interface NameCheck {
  ok: boolean;
  /** Tên đã chuẩn hóa (NFC, gộp khoảng trắng); chỉ dùng khi ok. */
  value: string;
  error: string | null;
}

function hasControlChar(s: string): boolean {
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 0x20 || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029) return true;
  }
  return false;
}

/** Chuẩn hóa như server: NFC, gộp khoảng trắng, cắt hai đầu. */
export function normalizeName(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/g, ' ').trim();
}

export function checkDisplayName(raw: string): NameCheck {
  const value = normalizeName(raw);
  const fail = (error: string): NameCheck => ({ ok: false, value, error });
  if (hasControlChar(value)) return fail('Tên chứa ký tự không hợp lệ.');
  if (/(:\/\/|^\s*(data|blob|javascript|file):)/i.test(value)) return fail('Tên không được chứa đường dẫn.');
  const len = Array.from(value).length;
  if (len < NAME_MIN || len > NAME_MAX) return fail(`Tên hiển thị từ ${NAME_MIN} đến ${NAME_MAX} ký tự.`);
  return { ok: true, value, error: null };
}

export function avatarRefToChoice(ref: string | null): AvatarChoice {
  return ref === 'character' ? 'character' : 'none';
}

export function choiceToAvatarRef(choice: AvatarChoice): string | null {
  return choice === 'character' ? 'character' : null;
}

export interface ProfileForm {
  name: string;
  avatar: AvatarChoice;
}

export interface ProfileBase {
  name: string;
  avatarRef: string | null;
  revision: number;
}

export type ProfilePatch = { revision: number; name?: string; avatarRef?: string | null };

/**
 * Tạo body PUT chỉ gồm trường thực sự đổi. Trả `{error}` khi tên sai, `{empty:true}` khi không có gì đổi.
 * avatarRef lạ (ví dụ 'preset:x') mà người dùng không đụng tới thì giữ nguyên, không bị ghi đè về null.
 */
export function buildProfilePatch(
  base: ProfileBase,
  form: ProfileForm,
): { patch: ProfilePatch } | { error: string } | { empty: true } {
  const patch: ProfilePatch = { revision: base.revision };
  const check = checkDisplayName(form.name);
  if (!check.ok) return { error: check.error ?? 'Tên không hợp lệ.' };
  if (check.value !== base.name) patch.name = check.value;
  if (form.avatar !== avatarRefToChoice(base.avatarRef)) patch.avatarRef = choiceToAvatarRef(form.avatar);
  if (patch.name === undefined && patch.avatarRef === undefined) return { empty: true };
  return { patch };
}

// ---------- Ánh xạ lỗi API ----------

export type ErrorKind =
  | 'auth' // phiên hết hạn hoặc chưa đăng nhập
  | 'conflict' // revision_conflict: bản trên server đã đổi
  | 'schema_newer'
  | 'rate_limited'
  | 'too_large'
  | 'invalid' // 422 và 403 field_forbidden
  | 'unsupported'
  | 'network'
  | 'server'
  | 'other';

export interface MappedError {
  kind: ErrorKind;
  message: string;
  /** Trường lỗi (path của server) khi có, ví dụ 'name'. */
  field: string | null;
  /** Giây phải chờ (429). */
  retryAfter: number | null;
  /** Revision hiện tại trên server (409). */
  currentRevision: number | null;
}

/** Hình dạng tối thiểu của ApiError, để test không cần import api.ts. */
export interface ApiErrorLike {
  status: number;
  code: string;
  message: string;
  data: Record<string, unknown> | null;
}

export function isApiErrorLike(e: unknown): e is ApiErrorLike {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as ApiErrorLike).status === 'number' &&
    typeof (e as ApiErrorLike).code === 'string' &&
    typeof (e as ApiErrorLike).message === 'string'
  );
}

const pathOf = (data: Record<string, unknown> | null): string | null =>
  data && typeof data.path === 'string' && data.path !== '' ? data.path : null;

export function mapProfileError(err: unknown): MappedError {
  const base: MappedError = { kind: 'other', message: 'Không thực hiện được. Thử lại.', field: null, retryAfter: null, currentRevision: null };
  if (!isApiErrorLike(err)) return base;
  const { status, code, data } = err;
  const field = pathOf(data);
  const out = (kind: ErrorKind, message: string, extra: Partial<MappedError> = {}): MappedError => ({
    ...base,
    kind,
    message,
    field,
    ...extra,
  });

  if (status === 0) return out('network', err.message);
  if (status === 401 || code === 'unauthenticated') return out('auth', 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.');
  if (code === 'revision_conflict') {
    const cur = data && typeof data.currentRevision === 'number' ? data.currentRevision : null;
    return out('conflict', 'Dữ liệu đã được sửa ở nơi khác (tab hoặc thiết bị khác). Tải lại rồi chọn bản muốn giữ.', {
      currentRevision: cur,
    });
  }
  if (code === 'schema_newer') return out('schema_newer', 'Bản lưu do phiên bản máy chủ mới hơn tạo, chưa đọc được.');
  if (code === 'rate_limited' || status === 429) {
    const ra = data && typeof data.retryAfter === 'number' ? data.retryAfter : null;
    return out('rate_limited', ra ? `Lưu quá nhanh. Thử lại sau ${ra} giây.` : 'Lưu quá nhanh. Thử lại sau ít giây.', {
      retryAfter: ra,
    });
  }
  if (code === 'payload_too_large' || status === 413) {
    return out('too_large', 'Nhân vật quá lớn để lưu lên máy chủ (tối đa 64 KB). Bớt họa tiết hoặc hình xăm rồi thử lại.');
  }
  if (code === 'content_rejected') {
    return out('invalid', field === 'name' ? 'Tên chứa từ ngữ không phù hợp. Hãy dùng tên khác.' : 'Nội dung chứa từ ngữ không phù hợp.');
  }
  if (status === 415) return out('unsupported', 'Máy chủ không nhận định dạng dữ liệu này.');
  if (code === 'field_forbidden') return out('invalid', 'Trường này không được sửa qua hồ sơ.');
  if (status === 422) return out('invalid', field ? `${err.message} (${field})` : err.message);
  if (status >= 500) return out('server', err.message);
  return out('other', err.message || base.message);
}

/** Lỗi cần tải lại dữ liệu từ server (người dùng phải chọn bản giữ). */
export const needsReload = (e: MappedError): boolean => e.kind === 'conflict';

// ---------- Tóm tắt nhân vật để hiển thị ----------

export interface LookSummary {
  name: string;
  bodyStyle: string;
  hair: string | null;
  outfitPieces: number;
  tattoos: number;
  scars: number;
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Tóm tắt thô một CharacterLook (đã qua server nên cấu trúc đúng, nhưng vẫn phòng thủ với dữ liệu lạ). */
export function summarizeLook(look: unknown): LookSummary | null {
  if (!isRec(look)) return null;
  const meta = isRec(look.meta) ? look.meta : {};
  const hair = isRec(look.hair) && typeof look.hair.style === 'string' ? look.hair.style : null;
  const outfit = isRec(look.outfit) ? Object.values(look.outfit).filter((v) => v !== null && v !== undefined).length : 0;
  return {
    name: typeof meta.name === 'string' && meta.name !== '' ? meta.name : 'Chưa đặt tên',
    bodyStyle: look.bodyStyle === 'chibi' ? 'chibi' : 'realistic',
    hair,
    outfitPieces: outfit,
    tattoos: Array.isArray(look.tattoos) ? look.tattoos.length : 0,
    scars: Array.isArray(look.scars) ? look.scars.length : 0,
  };
}

/**
 * Hành động khi bấm "Đồng bộ lên máy chủ": nếu đã có bản cloud khác bản cục bộ thì hỏi trước, không tự ghi đè.
 * `cloudJson`/`localJson` là chuỗi JSON ổn định của look (so sánh bằng chuỗi).
 */
export function planSync(
  cloud: { look: unknown | null; revision: number; corrupt: boolean },
  localJson: string | null,
  cloudJson: string | null,
): 'no_local' | 'upload' | 'same' | 'confirm_overwrite' {
  if (localJson === null) return 'no_local';
  if (cloud.look === null && !cloud.corrupt) return 'upload';
  if (cloudJson !== null && cloudJson === localJson) return 'same';
  return 'confirm_overwrite';
}
