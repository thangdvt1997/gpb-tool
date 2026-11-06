import { ApiError } from '../auth/api';

/** Chuỗi dùng chung của luồng onboarding (lấy từ ONBOARDING_UX.md). */
export const COPY = {
  generic: 'Có lỗi không xác định. Thử lại.',
  network: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
  mailFailed:
    'Chưa gửi được mã xác minh. Hãy thử lại sau ít phút. Nếu vẫn chưa nhận được mã sau vài phút, liên hệ Phòng CNTT.',
  sessionExpired: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục. Bản nhân vật của bạn vẫn được giữ.',
  otpLocked: 'Bạn đã nhập sai quá 5 lần. Bấm “Gửi lại mã” để nhận mã mới.',
  otpExpired: 'Mã đã hết hạn. Bấm “Gửi lại mã” để nhận mã mới.',
  saveNetwork: 'Chưa lưu được nhân vật. Bản của bạn vẫn còn trên máy này. Kiểm tra mạng rồi bấm “Thử lưu lại”.',
} as const;

/**
 * Lấy thông điệp hiển thị cho một lỗi. Ưu tiên copy riêng theo mã lỗi, rồi đến thông điệp của server.
 */
export function errorText(err: unknown, byCode: Readonly<Record<string, string>> = {}): string {
  if (!(err instanceof ApiError)) return COPY.generic;
  if (err.code && byCode[err.code]) return byCode[err.code];
  return err.message;
}

/** Đọc một trường số trong body lỗi (ví dụ attemptsLeft, retryAfter). */
export function errorNumber(err: unknown, key: string): number | null {
  if (!(err instanceof ApiError) || !err.data) return null;
  const value = err.data[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function waitCopy(seconds: number | null): string {
  return seconds !== null && seconds > 0
    ? `Vừa gửi mã. Hãy đợi ${seconds} giây rồi thử lại.`
    : 'Vừa gửi mã. Hãy đợi một lát rồi thử lại.';
}

export function wrongCodeCopy(attemptsLeft: number): string {
  return `Mã chưa đúng. Kiểm tra lại mã trong thư. Bạn còn ${attemptsLeft} lần thử.`;
}
