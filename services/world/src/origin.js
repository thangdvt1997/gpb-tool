// Kiểm tra header Origin khi bắt tay WebSocket. Trình duyệt luôn gửi Origin cho WebSocket,
// nên thiếu Origin bị từ chối (chặn cả trang lạ lẫn client không phải trình duyệt không khai báo).

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isAllowedOrigin(origin, { allowedOrigins, allowLocalhostOrigin }) {
  if (typeof origin !== 'string' || origin === '' || origin === 'null') return false;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  // So sánh theo origin đã chuẩn hóa (scheme + host + port), không theo chuỗi thô.
  if (allowedOrigins.some((o) => o === url.origin)) return true;
  return Boolean(allowLocalhostOrigin) && url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname);
}
