import { createHmac } from 'node:crypto';

// Cấp credential TURN ngắn hạn theo "TURN REST API" (coturn use-auth-secret):
// username = "<hết hạn unix giây>:<userId>", credential = base64(HMAC-SHA1(secret, username)).
// Secret chỉ nằm ở biến môi trường TURN_SECRET, không bao giờ gửi cho client.

export const TURN_DEFAULT_TTL_SEC = 600;
const MIN_TTL = 60;
const MAX_TTL = 3600;

export function loadTurnConfig(env = process.env) {
  const secret = String(env.TURN_SECRET || '');
  const urls = String(env.TURN_URLS || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^turns?:[^\s]+$/i.test(s));
  const ttlRaw = Number(env.TURN_TTL_SEC);
  const ttlSec = Number.isFinite(ttlRaw) && ttlRaw > 0 ? Math.min(MAX_TTL, Math.max(MIN_TTL, Math.floor(ttlRaw))) : TURN_DEFAULT_TTL_SEC;
  return { secret, urls, ttlSec };
}

export function createTurnIssuer({ secret, urls, ttlSec = TURN_DEFAULT_TTL_SEC, now = Date.now }) {
  const enabled = Boolean(secret) && urls.length > 0;
  function issue(user) {
    if (!enabled) return null;
    const expiresAt = Math.floor(now() / 1000) + ttlSec;
    // Id đã được auth chuẩn hóa; bỏ ký tự ':' để không lẫn định dạng username.
    const username = `${expiresAt}:${String(user.id).replace(/[^\w.-]/g, '_')}`;
    const credential = createHmac('sha1', secret).update(username).digest('base64');
    return { ttlSec, iceServers: [{ urls, username, credential }] };
  }
  return { enabled, issue };
}
