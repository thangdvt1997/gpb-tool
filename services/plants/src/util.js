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

const NAME_MAX = 80;

// Tên hiển thị trong nhật ký chăm sóc: bỏ ký tự điều khiển, cắt tối đa 80 ký tự (theo code point).
export function displayName(user) {
  const raw = user.name || user.email || user.id || '';
  const cleaned = String(raw).replace(/[\u0000-\u001F\u007F]+/g, ' ').trim();
  const cut = Array.from(cleaned).slice(0, NAME_MAX).join('');
  return cut || 'Nhân viên';
}
