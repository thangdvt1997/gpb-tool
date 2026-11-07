// Kiểm Origin/Referer cho request ghi (POST/PUT/PATCH/DELETE), bổ sung cho cookie SameSite=Lax.
// Cấu hình: ALLOWED_ORIGINS = danh sách origin cách nhau bằng dấu phẩy (thay thế mặc định).
// Mặc định: https://gp.daisoncoop.com, PUBLIC_BASE_URL (nếu có) và localhost/127.0.0.1 mọi cổng (dev).
// Request không có Origin lẫn Referer (curl, máy chủ gọi máy chủ) được cho qua: trình duyệt luôn gửi Origin
// với request ghi chéo trang, nên không mở thêm đường tấn công CSRF.

export const DEFAULT_ORIGINS = ['https://gp.daisoncoop.com'];
const LOCAL_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function normalize(o) {
  try {
    const u = new URL(o);
    return u.origin;
  } catch {
    return null;
  }
}

export function buildOriginPolicy(env = process.env) {
  const raw = (env.ALLOWED_ORIGINS ?? '').trim();
  const explicit = raw !== '';
  const list = explicit ? raw.split(',') : [...DEFAULT_ORIGINS, env.PUBLIC_BASE_URL ?? ''];
  const allowed = new Set(list.map((s) => normalize(s.trim())).filter(Boolean));
  return { allowed, allowLocal: !explicit || env.ALLOW_LOCALHOST_ORIGINS === 'true' };
}

export function originAllowed(policy, origin, host) {
  if (origin === 'null') return false;
  const o = normalize(origin);
  if (!o) return false;
  if (policy.allowed.has(o)) return true;
  if (policy.allowLocal && LOCAL_RE.test(o)) return true;
  // Cùng origin với chính máy chủ (Host không giả mạo được từ trang khác).
  if (host && (o === `http://${host}` || o === `https://${host}`)) return true;
  return false;
}

export function originGuard(policy = buildOriginPolicy()) {
  return (req, res, next) => {
    if (!WRITE_METHODS.has(req.method)) return next();
    const origin = req.get('origin');
    const referer = req.get('referer');
    const source = origin !== undefined ? origin : referer;
    if (source === undefined || source === '') return next();
    if (originAllowed(policy, source, req.get('host'))) return next();
    return res.status(403).json({ ok: false, code: 'origin_forbidden', error: 'Nguồn yêu cầu không được phép.' });
  };
}
