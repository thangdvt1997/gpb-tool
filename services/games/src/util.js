import crypto from 'node:crypto';

// Lỗi có thể trả thẳng cho client (message tiếng Việt, không có stack trace).
// details (tùy chọn) được gộp vào phản hồi, ví dụ trạng thái phòng khi trả 409.
export class ApiError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export function requireObject(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'Dữ liệu gửi lên không hợp lệ');
  }
  return body;
}

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

// Bỏ ký tự điều khiển, cắt khoảng trắng hai đầu và cắt theo độ dài tối đa (tính theo ký tự, không theo UTF-16).
// Chỉ báo lỗi khi sau khi cắt vẫn ngắn hơn min.
export function cleanText(value, { label, min = 0, max }) {
  if (value === undefined || value === null) {
    throw new ApiError(400, `${label} là bắt buộc`);
  }
  if (typeof value !== 'string') {
    throw new ApiError(400, `${label} phải là chuỗi ký tự`);
  }
  const text = Array.from(value.replace(CONTROL_CHARS, ' ').trim())
    .slice(0, max)
    .join('')
    .trim();
  if (Array.from(text).length < min) {
    throw new ApiError(400, `${label} phải từ ${min} đến ${max} ký tự`);
  }
  return text;
}

// Tên hiển thị lấy từ auth. Không dùng email làm tên để tránh lộ email cho người chơi khác.
const MAX_DISPLAY_NAME = 60;

export function displayName(user) {
  const raw = typeof user.name === 'string' ? user.name : '';
  const text = Array.from(raw.replace(CONTROL_CHARS, ' ').trim())
    .slice(0, MAX_DISPLAY_NAME)
    .join('')
    .trim();
  return text || 'Người chơi';
}

// Số nguyên phải có kiểu number (không nhận chuỗi) và nằm trong khoảng [min, max].
export function integerInRange(value, label, min, max) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new ApiError(400, `${label} phải là số nguyên từ ${min} đến ${max}`);
  }
  return value;
}

export function nowIso() {
  return new Date().toISOString();
}

export function newId(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

// Giới hạn số lần thực hiện theo khóa (ví dụ user id) trong cửa sổ trượt.
// Lưu trong bộ nhớ tiến trình: khởi động lại thì đếm lại. Đủ cho một instance.
export function createRateLimiter({ windowMs, max, message }) {
  const hits = new Map();
  return {
    take(key) {
      const now = Date.now();
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        throw new ApiError(429, message);
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 10_000) {
        for (const [k, times] of hits) {
          if (times.every((t) => now - t >= windowMs)) hits.delete(k);
        }
      }
    },
  };
}
