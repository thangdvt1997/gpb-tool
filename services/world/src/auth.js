// Xác thực qua auth service: gọi AUTH_URL/api/auth/me với cookie được chuyển tiếp, timeout 3 giây.
// Cùng mẫu với services/display/src/auth.js, thêm tenant vì presence tách theo tenant.

const AUTH_TIMEOUT_MS = 3_000;
const MAX_NAME_LEN = 64;

// Chỉ giữ id, tên hiển thị và tenant. Email, vai trò, phòng ban không đi vào world.
export function normalizeUser(body) {
  if (!body || typeof body !== 'object' || body.ok === false) return null;
  const u = body.user && typeof body.user === 'object' ? body.user : null;
  if (!u) return null;
  if (u.id === undefined || u.id === null || u.id === '') return null;
  const tenantId = u.tenant && u.tenant.id !== undefined && u.tenant.id !== null ? String(u.tenant.id) : '';
  if (!tenantId) return null;
  // Bỏ ký tự điều khiển để tên không phá giao diện.
  const name = (typeof u.name === 'string' ? u.name : '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, MAX_NAME_LEN);
  return { id: String(u.id), name: name || 'Người dùng', tenantId };
}

/**
 * fetchUser(cookie): trả user, null khi auth từ chối (status khác 200 hoặc thiếu dữ liệu).
 * Ném lỗi khi mạng hỏng hoặc quá 3 giây; người gọi quyết định coi đó là gì.
 */
export function createAuthClient({ authUrl, fetchImpl = fetch }) {
  async function fetchUser(cookie) {
    const headers = { Accept: 'application/json' };
    if (cookie) headers.Cookie = cookie;
    const res = await fetchImpl(`${authUrl}/api/auth/me`, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    if (res.status !== 200) {
      await res.arrayBuffer().catch(() => {});
      return null;
    }
    return normalizeUser(await res.json());
  }

  /** Như fetchUser nhưng mọi lỗi đều thành null (dùng cho bắt tay và route HTTP). */
  async function verify(cookie) {
    try {
      return await fetchUser(cookie);
    } catch (err) {
      // Không ghi cookie hay nội dung phản hồi vào log.
      console.warn(`[world] không xác thực được phiên (${err && err.name ? err.name : 'Error'})`);
      return null;
    }
  }

  return { fetchUser, verify };
}

// Middleware cho route HTTP: mỗi request kiểm tra lại phiên, lỗi thì 401.
export function createAuthMiddleware(authClient) {
  return async function requireAuth(req, res, next) {
    const cookie = typeof req.headers.cookie === 'string' ? req.headers.cookie : '';
    const user = await authClient.verify(cookie);
    if (!user) return res.status(401).json({ ok: false, error: 'unauthenticated' });
    req.user = user;
    return next();
  };
}
