import crypto from 'node:crypto';

// Lỗi có thể trả thẳng cho client (message tiếng Việt, không có stack trace).
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function requireObject(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'Dữ liệu gửi lên không hợp lệ');
  }
  return body;
}

const LINE_CONTROL = /[\u0000-\u001F\u007F]/;
const MULTILINE_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

// Chuẩn hóa và kiểm tra chuỗi. Độ dài tính theo ký tự (code point), không theo UTF-16.
export function cleanText(value, { label, min = 0, max, multiline = false, optional = false }) {
  if (value === undefined || value === null) {
    if (optional) return '';
    throw new ApiError(400, `${label} là bắt buộc`);
  }
  if (typeof value !== 'string') {
    throw new ApiError(400, `${label} phải là chuỗi ký tự`);
  }
  const text = multiline ? value.replace(/\r\n?/g, '\n').trim() : value.trim();
  const length = Array.from(text).length;
  if (length < min || (max !== undefined && length > max)) {
    throw new ApiError(
      400,
      min > 0 ? `${label} phải từ ${min} đến ${max} ký tự` : `${label} tối đa ${max} ký tự`,
    );
  }
  if ((multiline ? MULTILINE_CONTROL : LINE_CONTROL).test(text)) {
    throw new ApiError(400, `${label} chứa ký tự không hợp lệ`);
  }
  return text;
}

export function oneOf(value, allowed, message) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new ApiError(400, message);
  }
  return value;
}

// Chỉ nhận ISO 8601 có múi giờ rõ ràng (Z hoặc +hh:mm), tránh giờ local của server.
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export function parseIsoInstant(value, label) {
  const invalid = () =>
    new ApiError(400, `${label} phải là thời điểm ISO 8601 có múi giờ, ví dụ 2026-11-06T09:00:00+07:00`);
  if (typeof value !== 'string') throw invalid();
  // Trong query string, dấu + thường bị đổi thành khoảng trắng: "...09:00:00 07:00" nên khôi phục lại.
  const normalized = value.replace(/ (\d{2}:\d{2})$/, '+$1');
  if (!ISO_RE.test(normalized)) throw invalid();
  const ms = Date.parse(normalized);
  if (Number.isNaN(ms)) throw invalid();
  return new Date(ms);
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

// Khóa "ngày" theo giờ Việt Nam (UTC+7), dạng YYYY-MM-DD.
export function vnDayKey(date) {
  return new Date(date.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

export function newId(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}
