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
// Chuỗi vượt độ dài tối đa bị từ chối (400), không cắt âm thầm.
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
// Nhóm: 1 năm, 2 tháng, 3 ngày, 4 giờ, 5 phút, 6 giây, 8 dấu lệch, 9 giờ lệch, 10 phút lệch.
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|([+-])(\d{2}):(\d{2}))$/;

function daysInMonth(year, month) {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function parseIsoInstant(value, label) {
  const invalid = () =>
    new ApiError(400, `${label} phải là thời điểm ISO 8601 có múi giờ, ví dụ 2026-11-06T19:00:00+07:00`);
  if (typeof value !== 'string') throw invalid();
  const normalized = value.trim();
  const m = ISO_RE.exec(normalized);
  if (!m) throw invalid();
  // Date.parse chấp nhận ngày tràn (vd 2026-02-31), nên kiểm tra từng thành phần trước.
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(Number(m[1]), month)) throw invalid();
  if (Number(m[4]) > 23 || Number(m[5]) > 59 || (m[6] !== undefined && Number(m[6]) > 59)) throw invalid();
  if (m[8] !== undefined && (Number(m[9]) > 23 || Number(m[10]) > 59)) throw invalid();
  const ms = Date.parse(normalized);
  if (Number.isNaN(ms)) throw invalid();
  return new Date(ms);
}

// Vai trò được phép quản lý sự kiện: tạo, đóng, xem kết quả khi chưa đóng.
const ORGANIZER_ROLES = ['it', 'admin'];

export function isOrganizer(user) {
  return ORGANIZER_ROLES.includes(user.role);
}

// Sự kiện được coi là đã đóng khi status là 'closed', hoặc khi thời điểm hiện tại đã vượt endsAt (UTC).
// So sánh bằng mili giây đã parse, không so chuỗi. endsAt không parse được thì không coi là quá giờ.
export function isClosed(event, now = new Date()) {
  if (event.status === 'closed') return true;
  return now.getTime() > Date.parse(event.endsAt);
}

export function newId(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}
