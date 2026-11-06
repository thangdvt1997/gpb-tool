const AUTH_TIMEOUT_MS = 3_000;

// Chuẩn hóa phản hồi của auth: { ok, user: {id, email, name, role?} } hoặc user trực tiếp.
function normalizeUser(body) {
  if (!body || typeof body !== 'object' || body.ok === false) return null;
  const u = body.user && typeof body.user === 'object' ? body.user : body;
  const email = typeof u.email === 'string' ? u.email : '';
  // Chỉ nhận id là chuỗi hoặc số hữu hạn. Object/mảng mà String() đổi thành "[object Object]" sẽ gộp nhiều người vào một id.
  let id = '';
  if (typeof u.id === 'string') id = u.id;
  else if (typeof u.id === 'number' && Number.isFinite(u.id)) id = String(u.id);
  else if (u.id === undefined || u.id === null) id = email;
  if (!id) return null;
  return {
    id,
    email,
    name: typeof u.name === 'string' ? u.name : '',
    role: typeof u.role === 'string' ? u.role : '',
  };
}

// Mỗi request đều gọi AUTH_URL/api/auth/me, forward header Cookie. Không cache: logout có hiệu lực ngay.
// Mọi lỗi (401, status khác 200, timeout, mạng, JSON hỏng) đều trả 401.
export function createAuthMiddleware({ authUrl, fetchImpl = fetch }) {
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

  return async function requireAuth(req, res, next) {
    const cookie = typeof req.headers.cookie === 'string' ? req.headers.cookie : '';

    let user = null;
    try {
      user = await fetchUser(cookie);
    } catch (err) {
      // Không ghi cookie, token hay nội dung phản hồi vào log.
      console.warn(`[auth] không xác thực được phiên (${err && err.name ? err.name : 'Error'})`);
    }
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Chưa đăng nhập' });
    }
    req.user = user;
    return next();
  };
}
