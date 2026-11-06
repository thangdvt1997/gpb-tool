import crypto from 'node:crypto';
import { config } from './config.js';
import { db, ensureTenant } from './db.js';
import { tenantFor } from './tenants.js';

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
export const normEmail = (value) => String(value ?? '').trim().toLowerCase();
export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

const SESSION_SECONDS = 7 * 24 * 3600;
// Phiên tạm đăng ký: 30 phút, không gia hạn (ONBOARDING_API D3).
export const ONBOARDING_SECONDS = 30 * 60;
export const OTP_MS = 10 * 60e3;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_MS = 60e3;
export const LOGIN_MAX_FAILS = 5;
export const LOGIN_LOCK_MIN = 15;
export const ONBOARDING_MAX_ATTEMPTS = 5;

// Mật khẩu: 10 đến 128 ký tự (đếm theo code point), tối đa 72 byte UTF-8 vì bcrypt chỉ dùng 72 byte đầu (D8).
export const PASSWORD_MIN_CHARS = 10;
export const PASSWORD_MAX_CHARS = 128;
export const PASSWORD_MAX_BYTES = 72;

// Một thông điệp dùng chung cho mọi lỗi mã OTP ở bước verify, để không lộ trạng thái email (ONBOARDING_API 6.2).
export const INVALID_CODE_MESSAGE = 'Mã xác minh không đúng hoặc đã hết hạn. Hãy kiểm tra lại hoặc bấm "Gửi lại mã".';
const OTP_LOCKED_MESSAGE = 'Nhập sai quá nhiều lần. Hãy bấm "Gửi lại mã" để nhận mã mới.';

// ---------- Cookie ----------

// sid: phiên đầy đủ, Path=/. osid: phiên tạm, Path=/api/auth để trình duyệt không gửi tới các service văn phòng.
const SID_PATH = '/';
const OSID_PATH = '/api/auth';

// Đọc cookie theo tên. Chỉ chấp nhận đúng định dạng token đã tạo, tránh giá trị lạ đi vào DB.
function readCookie(req, name) {
  const header = req.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1 || part.slice(0, eq).trim() !== name) continue;
    const value = part.slice(eq + 1).trim();
    return /^[A-Za-z0-9_-]{32,128}$/.test(value) ? value : null;
  }
  return null;
}

export const readSid = (req) => readCookie(req, 'sid');
export const readOsid = (req) => readCookie(req, 'osid');

function cookieString(name, value, path, maxAge) {
  return `${name}=${value}; HttpOnly; SameSite=Lax; Path=${path}; Max-Age=${maxAge}${config.cookieSecure ? '; Secure' : ''}`;
}

export const sidCookie = (token) => cookieString('sid', token, SID_PATH, SESSION_SECONDS);
export const osidCookie = (token) => cookieString('osid', token, OSID_PATH, ONBOARDING_SECONDS);
export const clearSidCookie = () => cookieString('sid', '', SID_PATH, 0);
export const clearOsidCookie = () => cookieString('osid', '', OSID_PATH, 0);

// ---------- Phiên ----------

// Session lưu SHA-256 của token, không lưu token gốc.
export function createSession(userId, scope = 'full') {
  const token = randomToken();
  const now = Date.now();
  const ttlSeconds = scope === 'onboarding' ? ONBOARDING_SECONDS : SESSION_SECONDS;
  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, created_at, scope, attempts) VALUES (?, ?, ?, ?, ?, 0)',
  ).run(sha256(token), userId, now + ttlSeconds * 1000, now, scope);
  return token;
}

// Xóa mọi phiên tạm của người dùng.
export function endOnboardingSessions(userId) {
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND scope = 'onboarding'").run(userId);
}

// Đổi sang phiên đầy đủ: xóa sid cũ (chống session fixation), xóa phiên tạm của người dùng, tạo sid mới.
// Trả về token mới. Gọi trong transaction khi cần cập nhật users cùng lúc.
export function rotateToFullSession(req, userId) {
  const old = readSid(req);
  if (old) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(old));
  endOnboardingSessions(userId);
  return createSession(userId, 'full');
}

// ---------- Người dùng ----------

const USER_FIELDS = `u.id, u.email, u.name, u.role, u.department, u.tenant_id, u.onboarding_step, u.appearance,
  u.status, u.ban_until, u.react_bump,
  t.type AS tenant_type, t.name AS tenant_name`;

// ---------- Khóa tài khoản (MODERATION mục 3) ----------

const nowIso = () => new Date().toISOString();

// Ghi một dòng nhật ký kiểm duyệt (chỉ thêm).
export function logModerationAction({ actorId = null, action, targetUserId = null, reportId = null, reason = null, banUntil = null }) {
  db.prepare(
    'INSERT INTO moderation_actions (at, actor_id, action, target_user_id, report_id, reason, ban_until) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(nowIso(), actorId, action, targetUserId, reportId, reason, banUntil);
}

// Thu hồi mọi phiên (kể cả phiên tạm) của người dùng.
export function revokeSessions(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

const banExpired = (banUntil) => banUntil !== null && banUntil !== undefined && Date.parse(banUntil) <= Date.now();

// Mở khóa vì hết hạn. Chỉ ghi nhật ký khi thật sự có thay đổi.
function liftExpiredBan(userId, banUntil) {
  db.transaction(() => {
    const info = db
      .prepare(
        "UPDATE users SET status = 'active', ban_reason = NULL, ban_until = NULL, banned_by = NULL, banned_at = NULL WHERE id = ? AND status = 'banned'",
      )
      .run(userId);
    if (info.changes === 1) {
      logModerationAction({ action: 'auto_unban', targetUserId: userId, reason: 'Hết hạn khóa', banUntil });
    }
  })();
}

// Trả về { until } nếu tài khoản đang bị khóa, null nếu không. Khóa tạm đã hết hạn thì tự mở rồi trả null.
// row cần có id, status, ban_until.
export function activeBan(row) {
  if (!row || row.status !== 'banned') return null;
  const until = row.ban_until ?? null;
  if (banExpired(until)) {
    liftExpiredBan(row.id, until);
    row.status = 'active';
    row.ban_until = null;
    return null;
  }
  return { until };
}

// Mở khóa mọi tài khoản đã hết hạn khóa (gọi định kỳ).
export function liftAllExpiredBans() {
  const rows = db.prepare("SELECT id, ban_until FROM users WHERE status = 'banned' AND ban_until IS NOT NULL").all();
  for (const r of rows) {
    if (banExpired(r.ban_until)) liftExpiredBan(r.id, r.ban_until);
  }
}

// Trả về người dùng của phiên đầy đủ (scope 'full') còn hạn, hoặc null. Phiên tạm không bao giờ là đăng nhập.
// Người đang bị khóa: thu hồi phiên, đặt req.banInfo = { until } và trả null.
export function sessionUser(req) {
  const sid = readSid(req);
  if (!sid) return null;
  const row = db
    .prepare(
      `SELECT ${USER_FIELDS}
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN tenants t ON t.id = u.tenant_id
       WHERE s.token_hash = ? AND s.scope = 'full' AND s.expires_at > ?`,
    )
    .get(sha256(sid), Date.now());
  if (!row) return null;
  const ban = activeBan(row);
  if (ban) {
    revokeSessions(row.id);
    req.banInfo = ban;
    return null;
  }
  return row;
}

// Phiên tạm đăng ký (osid) còn hạn, hoặc null. Chỉ dùng cho các endpoint đăng ký.
export function onboardingSession(req) {
  const osid = readOsid(req);
  if (!osid) return null;
  const row = db
    .prepare(
      `SELECT s.token_hash, s.user_id, s.attempts, s.expires_at,
         u.email, u.email_verified_at, u.password_hash, u.onboarding_step, u.status, u.ban_until
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.scope = 'onboarding' AND s.expires_at > ?`,
    )
    .get(sha256(osid), Date.now());
  if (!row) return null;
  // Người đang bị khóa không được tiếp tục đăng ký.
  if (activeBan({ id: row.user_id, status: row.status, ban_until: row.ban_until })) {
    revokeSessions(row.user_id);
    return null;
  }
  return row;
}

export function loadUser(id) {
  return db
    .prepare(`SELECT ${USER_FIELDS} FROM users u JOIN tenants t ON t.id = u.tenant_id WHERE u.id = ?`)
    .get(id);
}

// Dùng cho đăng nhập bằng mật khẩu: kèm password_hash và email_verified_at.
export function findLoginUser(email) {
  return (
    db
      .prepare(
        `SELECT ${USER_FIELDS}, u.password_hash, u.email_verified_at
         FROM users u JOIN tenants t ON t.id = u.tenant_id
         WHERE u.email = ?`,
      )
      .get(email) ?? null
  );
}

// Dạng người dùng trả ra cho client. Không bao giờ có password_hash, tour_done_at hay appearance.
export function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    department: row.department,
    role: row.role,
    // Dữ liệu cũ không có bước onboarding được coi là đã xong, để frontend không phải đoán.
    onboardingStep: row.onboarding_step ?? 'done',
    tenant: {
      id: row.tenant_id,
      type: row.tenant_type,
      name: row.tenant_name,
    },
  };
}

// Tạo hoặc đăng nhập người dùng OAuth. Email đã được nhà cung cấp xác minh nên đặt verified ngay.
// Tài khoản OAuth không bao giờ ở bước 'password' (D6): đi thẳng sang 'appearance'.
export function signInOAuthUser(email, name) {
  const tenant = tenantFor(email);
  const displayName = String(name ?? '').trim().slice(0, 80) || email.split('@')[0];
  const now = Date.now();
  return db.transaction(() => {
    ensureTenant(tenant);
    const row = db
      .prepare('SELECT id, email_verified_at, onboarding_step FROM users WHERE email = ?')
      .get(email);
    if (row) {
      if (!row.email_verified_at) {
        // Nhà cung cấp đã xác minh email. Mật khẩu của tài khoản chưa xác minh có thể do người khác đặt trước, nên bỏ đi.
        db.prepare(
          "UPDATE users SET email_verified_at = ?, password_hash = NULL, onboarding_step = 'appearance' WHERE id = ?",
        ).run(now, row.id);
      } else if (row.onboarding_step === 'password') {
        // Đã xác minh nhưng chưa đặt mật khẩu: đăng nhập OAuth đủ để hoàn tất đăng ký.
        db.prepare("UPDATE users SET onboarding_step = 'appearance', password_hash = NULL WHERE id = ?").run(row.id);
      }
      return row.id;
    }
    const info = db
      .prepare(
        `INSERT INTO users (email, name, password_hash, tenant_id, email_verified_at, created_at, onboarding_step)
         VALUES (?, ?, NULL, ?, ?, ?, 'appearance')`,
      )
      .run(email, displayName, tenant.id, now, now);
    return Number(info.lastInsertRowid);
  })();
}

// ---------- Mật khẩu ----------

// Trả về thông báo lỗi tiếng Việt, hoặc null nếu mật khẩu hợp lệ. Không cắt mật khẩu âm thầm.
export function passwordProblem(password, email) {
  if (typeof password !== 'string') return 'Mật khẩu không hợp lệ.';
  const chars = [...password].length;
  if (chars < PASSWORD_MIN_CHARS || chars > PASSWORD_MAX_CHARS) {
    return `Mật khẩu cần từ ${PASSWORD_MIN_CHARS} đến ${PASSWORD_MAX_CHARS} ký tự.`;
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    return `Mật khẩu quá dài: tối đa ${PASSWORD_MAX_BYTES} byte UTF-8. Ký tự có dấu tốn nhiều byte hơn, hãy rút ngắn.`;
  }
  if (password.toLowerCase() === String(email).toLowerCase()) return 'Mật khẩu không được trùng email.';
  return null;
}

// ---------- OTP ----------

// Số giây còn phải đợi trước khi được gửi mã mới (0 nghĩa là gửi được).
export function otpWaitSeconds(email) {
  const last = db
    .prepare('SELECT created_at FROM otp_codes WHERE email = ? AND purpose = ? ORDER BY id DESC LIMIT 1')
    .get(email, 'verify');
  if (!last) return 0;
  const left = OTP_RESEND_MS - (Date.now() - last.created_at);
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

// Trạng thái mã OTP đang hiệu lực: số giây còn lại đến khi hết hạn và số lần nhập còn lại.
// Không có mã hiệu lực thì trả giá trị mặc định (600 giây, 5 lần), giống một mã mới chưa nhập sai.
export function otpStatus(email) {
  const row = db
    .prepare(
      'SELECT expires_at, attempts FROM otp_codes WHERE email = ? AND purpose = ? AND expires_at > ? ORDER BY id DESC LIMIT 1',
    )
    .get(email, 'verify', Date.now());
  if (!row) return { expiresInSeconds: OTP_MS / 1000, attemptsLeft: OTP_MAX_ATTEMPTS };
  return {
    expiresInSeconds: Math.max(1, Math.ceil((row.expires_at - Date.now()) / 1000)),
    attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - row.attempts),
  };
}

// Tạo mã OTP mới, thay thế mã cũ, và trả về mã thô để gửi đi. Không lưu mã thô.
export function issueOtp(email) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const now = Date.now();
  db.prepare('DELETE FROM otp_codes WHERE email = ? AND purpose = ?').run(email, 'verify');
  db.prepare(
    'INSERT INTO otp_codes (email, code_hash, purpose, expires_at, attempts, created_at) VALUES (?, ?, ?, ?, 0, ?)',
  ).run(email, sha256(`${email}:${code}`), 'verify', now + OTP_MS, now);
  return code;
}

// Kiểm tra mã. Mọi lỗi "sai hoặc hết hạn hoặc không có mã" trả cùng một mã và thông điệp.
// Chỉ trạng thái đã nhập sai quá nhiều lần mới trả khác (429 otp_locked).
export function checkOtp(email, code) {
  const row = db
    .prepare(
      'SELECT id, code_hash, attempts FROM otp_codes WHERE email = ? AND purpose = ? AND expires_at > ? ORDER BY id DESC LIMIT 1',
    )
    .get(email, 'verify', Date.now());
  if (!row) {
    return { ok: false, status: 400, code: 'invalid_code', error: INVALID_CODE_MESSAGE };
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, status: 429, code: 'otp_locked', error: OTP_LOCKED_MESSAGE };
  }
  db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
  const given = Buffer.from(sha256(`${email}:${code}`), 'hex');
  const expected = Buffer.from(row.code_hash, 'hex');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return { ok: false, status: 400, code: 'invalid_code', error: INVALID_CODE_MESSAGE };
  }
  db.prepare('DELETE FROM otp_codes WHERE email = ? AND purpose = ?').run(email, 'verify');
  return { ok: true };
}

// ---------- Khóa đăng nhập sai (trong bộ nhớ, reset khi khởi động lại) ----------

const loginFails = new Map(); // email -> { count, lockedUntil, touchedAt }

// Số phút còn bị khóa (0 nghĩa là không bị khóa).
export function loginLockMinutes(email) {
  const f = loginFails.get(email);
  if (!f || f.lockedUntil <= Date.now()) return 0;
  return Math.ceil((f.lockedUntil - Date.now()) / 60e3);
}

// Ghi nhận một lần sai. Trả về số phút khóa nếu vừa bị khóa, ngược lại 0.
export function recordLoginFail(email) {
  const now = Date.now();
  const f = loginFails.get(email) ?? { count: 0, lockedUntil: 0, touchedAt: now };
  f.count += 1;
  f.touchedAt = now;
  if (f.count >= LOGIN_MAX_FAILS) {
    f.count = 0;
    f.lockedUntil = now + LOGIN_LOCK_MIN * 60e3;
  }
  loginFails.set(email, f);
  return loginLockMinutes(email);
}

export function clearLoginFails(email) {
  loginFails.delete(email);
}

export function sweepLoginFails() {
  const now = Date.now();
  for (const [email, f] of loginFails) {
    if (f.lockedUntil <= now && now - f.touchedAt > LOGIN_LOCK_MIN * 60e3) {
      loginFails.delete(email);
    }
  }
}
