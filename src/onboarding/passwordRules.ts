/** Quy tắc mật khẩu phía giao diện (khớp ONBOARDING_UX.md mục 5.3 và ONBOARDING_API.md mục 3.5). */

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;
/** bcryptjs chỉ dùng 72 byte đầu, nên server từ chối quá dài (D8, phương án i). */
export const PASSWORD_MAX_BYTES = 72;

export const STRENGTH_LABELS = ['Yếu', 'Trung bình', 'Khá', 'Mạnh'] as const;

const encoder = new TextEncoder();

/** Số ký tự theo code point, khớp cách server đếm. */
export function charCount(value: string): number {
  return [...value].length;
}

/** Số byte UTF-8, dùng cho giới hạn 72 byte. */
export function byteCount(value: string): number {
  return encoder.encode(value).length;
}

export interface PasswordCheck {
  count: number;
  /** Từ 10 đến 128 ký tự. */
  length: boolean;
  /** Không quá 72 byte UTF-8. */
  bytes: boolean;
  /** Không giống email, phần trước @ của email, hoặc họ tên. */
  notPersonal: boolean;
  /** Khuyến nghị: có chữ hoa và chữ thường. */
  caseMix: boolean;
  /** Khuyến nghị: có số hoặc ký tự không phải chữ. */
  digitOrSymbol: boolean;
}

export function checkPassword(password: string, email: string, name: string): PasswordCheck {
  const count = charCount(password);
  const lower = password.toLowerCase();
  const mail = email.trim().toLowerCase();
  const local = mail.split('@')[0];
  const who = name.replace(/\s+/g, '').toLowerCase();
  const personal =
    (mail !== '' && lower === mail) ||
    (local.length >= 4 && lower.includes(local)) ||
    (who.length >= 2 && lower.replace(/\s+/g, '') === who);

  return {
    count,
    length: count >= PASSWORD_MIN && count <= PASSWORD_MAX,
    bytes: byteCount(password) <= PASSWORD_MAX_BYTES,
    notPersonal: !personal,
    caseMix: /\p{Ll}/u.test(password) && /\p{Lu}/u.test(password),
    digitOrSymbol: /[\p{N}\p{S}\p{P}]/u.test(password),
  };
}

/** Các điều kiện bắt buộc. Nút lưu chỉ bật khi đạt đủ. */
export function requiredOk(c: PasswordCheck): boolean {
  return c.length && c.bytes && c.notPersonal;
}

/** Mức độ mạnh 0 đến 3, theo ONBOARDING_UX.md mục 5.4. */
export function strengthLevel(c: PasswordCheck): number {
  if (!requiredOk(c)) return 0;
  const groups = (c.caseMix ? 1 : 0) + (c.digitOrSymbol ? 1 : 0);
  if (groups === 0) return 1;
  if (groups === 1) return 2;
  return c.count >= 14 ? 3 : 2;
}

/** Lỗi đầu tiên cần hiện dưới ô mật khẩu, hoặc null nếu không có. */
export function passwordError(c: PasswordCheck): string | null {
  if (c.count < PASSWORD_MIN) return `Mật khẩu cần ít nhất ${PASSWORD_MIN} ký tự.`;
  if (c.count > PASSWORD_MAX) return `Mật khẩu tối đa ${PASSWORD_MAX} ký tự.`;
  if (!c.bytes) {
    return `Mật khẩu quá dài, tối đa ${PASSWORD_MAX_BYTES} byte. Chữ có dấu tiếng Việt chiếm nhiều byte hơn, hãy rút ngắn.`;
  }
  if (!c.notPersonal) return 'Mật khẩu không được giống email hoặc họ tên.';
  return null;
}
