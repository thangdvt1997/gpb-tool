import express from 'express';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { db, ensureTenant, purgeExpired } from './db.js';
import { tenantFor } from './tenants.js';
import { mailMode, sendOtp } from './mailer.js';
import {
  EMAIL_RE,
  normEmail,
  sha256,
  readSid,
  readOsid,
  sidCookie,
  osidCookie,
  clearSidCookie,
  clearOsidCookie,
  createSession,
  rotateToFullSession,
  endOnboardingSessions,
  sessionUser,
  onboardingSession,
  loadUser,
  findLoginUser,
  publicUser,
  otpWaitSeconds,
  otpStatus,
  issueOtp,
  checkOtp,
  loginLockMinutes,
  recordLoginFail,
  clearLoginFails,
  sweepLoginFails,
  signInOAuthUser,
  passwordProblem,
  activeBan,
  revokeSessions,
  logModerationAction,
  liftAllExpiredBans,
  OTP_RESEND_MS,
  ONBOARDING_MAX_ATTEMPTS,
  INVALID_CODE_MESSAGE,
} from './auth.js';
import { normalizeAppearance, readAppearance, AppearanceError } from './appearance.js';
import { findBlocked } from './profanity.js';
import {
  CHARACTER_SCHEMA_VERSION,
  CharacterError,
  validateCharacter,
  migrateStoredCharacter,
  validateAvatarRef,
  validateDisplayName,
} from './character.js';
import {
  oauthEnabled,
  beginOAuth,
  consumeOAuthState,
  exchangeGoogle,
  exchangeMicrosoft,
  OAuthError,
  MS_CONSUMER_TENANT,
} from './oauth.js';

import { originGuard } from './origin.js';
import {
  AboutError,
  DEFAULT_VISIBILITY,
  canView,
  validateBio,
  validateStatus,
  validateStatusText,
  validateVisibility,
} from './about.js';

const app = express();
app.disable('x-powered-by');
// Chặn request ghi từ origin lạ trước mọi thứ khác (ngoài SameSite=Lax).
app.use('/api/auth', originGuard());
// Báo cáo kiểm duyệt có thể dài hơn (lý do 300 + bản chụp 500 ký tự có dấu), nên route này có giới hạn riêng.
// Parser này đặt trước parser toàn cục; khi đã đọc body thì parser toàn cục bỏ qua.
app.use('/api/auth/moderation', express.json({ limit: '16kb' }));
// Nhân vật cá nhân: look tối đa 64 KB (MAX_CHARACTER_BYTES) cộng vỏ { revision, look }. Vượt thì 413 ở error handler;
// look trong giới hạn body nhưng quá 64 KB thì route trả 413.
app.use('/api/auth/profile/character', express.json({ limit: '72kb' }));
// Body hợp lệ đều dưới 1 KB. Giới hạn 4 KB chặn payload lớn (ONBOARDING_API mục 3.0).
app.use(express.json({ limit: '4kb' }));
app.use('/api/auth', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Express 4 không bắt lỗi của handler async, nên mọi handler async đi qua wrap().
const wrap = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const bad = (res, error, status = 400, code = 'invalid_input') => res.status(status).json({ ok: false, code, error });

// So sánh mật khẩu với hash giả khi không có mật khẩu thật, để thời gian phản hồi không lộ tài khoản.
const DUMMY_HASH = bcrypt.hashSync('khong-phai-mat-khau-that', 12);

const OAUTH_LABEL = { google: 'Google', microsoft: 'Microsoft' };
const lockMessage = (minutes) => `Đăng nhập sai quá nhiều lần. Thử lại sau ${minutes} phút.`;
const SESSION_EXPIRED_MESSAGE = 'Phiên đăng ký đã hết hạn hoặc đã hoàn tất. Hãy bắt đầu lại.';
const RESEND_SECONDS = Math.ceil(OTP_RESEND_MS / 1000);

// Giới hạn ghi ngoại hình: 1 lần mỗi 5 giây cho mỗi người dùng, theo instance (ONBOARDING_API 4.3).
const APPEARANCE_WRITE_MS = 5000;
const lastAppearanceWrite = new Map(); // userId -> thời điểm ghi thành công cuối (ms)

const BATCH_MAX_IDS = 100;

async function sendOtpSafely(email, code, context) {
  try {
    await sendOtp(email, code);
  } catch (err) {
    console.error(`[mail] ${context} thất bại:`, err.code ?? err.name);
    return false;
  }
  return true;
}

// Phát mã không chờ mail gửi xong: thời gian phản hồi không lộ việc có gửi mail hay không (ONBOARDING_API 6.2).
// Lỗi mail chỉ được ghi log; người dùng bấm gửi lại.
function dispatchOtp(email, context) {
  const code = issueOtp(email);
  void sendOtpSafely(email, code, context);
}

// Trường đếm ngược cho phản hồi đăng ký và xác minh (ONBOARDING_API mục 3.1).
// wait: số giây còn phải chờ trước khi gửi mã mới, tính trước khi phát mã trong request này.
//   resendInSeconds = wait, hoặc 60 khi được phép gửi (giống 409 của /login, để không lộ trạng thái email).
//   retryAfter chỉ có khi đang bị giới hạn gửi lại (wait > 0).
// expiresInSeconds và attemptsLeft lấy từ mã đang hiệu lực (xem otpStatus).
function otpFields(email, wait = otpWaitSeconds(email)) {
  const status = otpStatus(email);
  const fields = {
    expiresInSeconds: status.expiresInSeconds,
    resendInSeconds: wait > 0 ? wait : RESEND_SECONDS,
    attemptsLeft: status.attemptsLeft,
  };
  if (wait > 0) fields.retryAfter = wait;
  return fields;
}

app.get('/api/health', (_req, res) => res.json({ ok: true, mail: mailMode() }));

app.get('/api/auth/providers', (_req, res) => {
  res.json({ google: oauthEnabled('google'), microsoft: oauthEnabled('microsoft') });
});

app.get('/api/auth/me', (req, res) => {
  const row = sessionUser(req);
  if (row) {
    return res.json({
      ok: true,
      user: publicUser(row),
      // Dữ liệu cũ không có bước thì trả 'done' rõ ràng.
      onboardingStep: row.onboarding_step ?? 'done',
      appearance: readAppearance(row.appearance),
      preferences: { reactBump: row.react_bump !== 0 },
    });
  }
  if (req.banInfo) {
    // Phiên đã bị thu hồi vì tài khoản bị khóa (MODERATION mục 3).
    res.setHeader('Set-Cookie', [clearSidCookie(), clearOsidCookie()]);
    return res.status(401).json({ ok: false, code: 'account_banned', error: 'account_banned', until: req.banInfo.until });
  }
  const pending = onboardingSession(req);
  if (pending) {
    // Phiên tạm đăng ký không phải đăng nhập. Service văn phòng gọi /me nên phải bị từ chối ở đây.
    return res.status(403).json({
      ok: false,
      code: 'onboarding_session',
      error: 'Cần hoàn tất đăng ký.',
      onboardingStep: pending.onboarding_step,
    });
  }
  return bad(res, 'Chưa đăng nhập.', 401, 'unauthenticated');
});

// Đăng ký chỉ nhận email và họ tên. Không nhận hay lưu mật khẩu (D1).
// Luôn trả 201 để không lộ email nào đã có tài khoản (D2), trừ các lỗi định dạng và tần suất.
app.post('/api/auth/register', (req, res) => {
  const body = req.body ?? {};
  const email = normEmail(body.email);
  const name = String(body.name ?? '').trim().slice(0, 80);
  if ('password' in body) {
    // Client cũ vẫn gửi password: bỏ qua, không ghi và không log giá trị.
    console.warn('[auth] register: có trường password, đã bỏ qua');
  }

  if (!EMAIL_RE.test(email)) return bad(res, 'Email không hợp lệ.', 400, 'invalid_input');
  if (name.length < 2) return bad(res, 'Nhập họ tên (ít nhất 2 ký tự).', 400, 'invalid_input');
  // Bộ lọc từ tục (MODERATION mục 2). Không phụ thuộc email đã tồn tại hay chưa nên không lộ trạng thái tài khoản.
  if (findBlocked(name)) {
    return res.status(422).json({ ok: false, code: 'content_rejected', error: 'content_rejected' });
  }

  const tenant = tenantFor(email);
  // Mọi phản hồi 201 đều có trường đếm ngược. wait được tính trước khi phát mã mới trong request này.
  const accepted = (wait) =>
    res.status(201).json({
      ok: true,
      needsVerification: true,
      email,
      tenant: { id: tenant.id, type: tenant.type, name: tenant.name },
      ...otpFields(email, wait),
    });

  const existing = db
    .prepare('SELECT id, email_verified_at, onboarding_step FROM users WHERE email = ?')
    .get(email);
  const wait = otpWaitSeconds(email);

  // Tài khoản đã xong xác minh (đang hoạt động, đã onboard, hoặc OAuth): không gửi mã, không đổi gì.
  if (existing && existing.onboarding_step !== 'password') {
    console.info('[auth] register: email đã có tài khoản đang hoạt động, không thay đổi');
    return accepted(wait);
  }

  ensureTenant(tenant);

  if (!existing) {
    db.prepare(
      "INSERT INTO users (email, name, password_hash, tenant_id, onboarding_step, created_at) VALUES (?, ?, NULL, ?, 'password', ?)",
    ).run(email, name, tenant.id, Date.now());
    dispatchOtp(email, 'gửi OTP đăng ký');
    return accepted(wait);
  }

  // Còn ở bước đặt mật khẩu: chưa xác minh (pending) hoặc đã xác minh nhưng chưa có mật khẩu.
  if (!existing.email_verified_at) {
    if (wait) {
      return res.status(429).json({
        ok: false,
        code: 'otp_wait',
        error: `Vừa gửi mã. Hãy đợi ${wait} giây rồi thử lại.`,
        ...otpFields(email, wait),
      });
    }
    db.prepare('UPDATE users SET name = ?, tenant_id = ?, password_hash = NULL WHERE id = ?').run(
      name,
      tenant.id,
      existing.id,
    );
  }
  // Đã xác minh và chưa có mật khẩu: không đổi tên. Gửi lại mã nếu đã qua 60 giây.
  if (wait === 0) dispatchOtp(email, 'gửi OTP đăng ký lại');
  return accepted(wait);
});

// Nhận mã, đặt phiên tạm osid (30 phút). Không cấp sid (D3).
app.post('/api/auth/verify', (req, res) => {
  const email = normEmail(req.body?.email);
  const code = String(req.body?.code ?? '').trim();
  if (!/^\d{6}$/.test(code)) return bad(res, 'Mã xác minh gồm 6 chữ số.', 400, 'invalid_input');

  // Mọi lỗi (sai mã, hết hạn, không có tài khoản, tài khoản đã xong) đều cho cùng một phản hồi.
  // Lỗi đều kèm trạng thái mã (attemptsLeft, đếm ngược) để frontend hiển thị đúng.
  const check = checkOtp(email, code);
  if (!check.ok) {
    return res.status(check.status).json({ ok: false, code: check.code, error: check.error, ...otpFields(email) });
  }

  const user = db.prepare('SELECT id, onboarding_step, password_hash FROM users WHERE email = ?').get(email);
  if (!user || user.onboarding_step !== 'password' || user.password_hash) {
    return res
      .status(400)
      .json({ ok: false, code: 'invalid_code', error: INVALID_CODE_MESSAGE, ...otpFields(email) });
  }

  const token = db.transaction(() => {
    db.prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?').run(
      Date.now(),
      user.id,
    );
    endOnboardingSessions(user.id);
    return createSession(user.id, 'onboarding');
  })();
  res.setHeader('Set-Cookie', osidCookie(token));
  res.json({ ok: true, onboardingStep: 'password', email });
});

// Luôn 200, không lộ trạng thái. Chỉ gửi khi email còn ở bước đặt mật khẩu và đã qua 60 giây.
app.post('/api/auth/resend', (req, res) => {
  const email = normEmail(req.body?.email);
  const user = db.prepare('SELECT onboarding_step FROM users WHERE email = ?').get(email);
  if (user?.onboarding_step === 'password' && otpWaitSeconds(email) === 0) {
    dispatchOtp(email, 'gửi lại OTP');
  }
  res.json({ ok: true });
});

// Tải lại trang đặt mật khẩu: chỉ đọc osid.
app.get('/api/auth/onboarding', (req, res) => {
  const row = onboardingSession(req);
  if (!row || row.onboarding_step !== 'password') {
    return bad(res, SESSION_EXPIRED_MESSAGE, 401, 'onboarding_session');
  }
  res.json({ ok: true, email: row.email, onboardingStep: 'password', expiresAt: row.expires_at });
});

// Đặt mật khẩu bằng osid. Thành công: đổi osid lấy sid đầy đủ (D3).
app.post(
  '/api/auth/password',
  wrap(async (req, res) => {
    const row = onboardingSession(req);
    if (!row) {
      // Đã đặt mật khẩu (chỉ còn sid) thì 409 step_conflict; không có gì thì 401.
      if (sessionUser(req)) return bad(res, 'Mật khẩu đã được đặt. Hãy tải lại trang.', 409, 'step_conflict');
      return bad(res, SESSION_EXPIRED_MESSAGE, 401, 'onboarding_session');
    }
    if (row.onboarding_step !== 'password' || !row.email_verified_at || row.password_hash) {
      return bad(res, 'Bước đăng ký không đúng. Hãy tải lại trang.', 409, 'step_conflict');
    }

    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const problem = passwordProblem(password, row.email);
    if (problem) {
      const attempts = row.attempts + 1;
      if (attempts >= ONBOARDING_MAX_ATTEMPTS) {
        db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(row.token_hash);
        return bad(res, 'Nhập sai quá nhiều lần. Hãy đợi rồi bấm "Gửi lại mã" để bắt đầu lại.', 429, 'onboarding_locked');
      }
      db.prepare('UPDATE sessions SET attempts = ? WHERE token_hash = ?').run(attempts, row.token_hash);
      return bad(res, problem, 400, 'invalid_input');
    }

    const hash = await bcrypt.hash(password, 12);
    const userId = row.user_id;
    // Cập nhật có điều kiện trên bước: hai request song song chỉ một request thành công.
    const token = db.transaction(() => {
      const info = db
        .prepare(
          "UPDATE users SET password_hash = ?, onboarding_step = 'appearance' WHERE id = ? AND onboarding_step = 'password' AND email_verified_at IS NOT NULL",
        )
        .run(hash, userId);
      if (info.changes !== 1) return null;
      return rotateToFullSession(req, userId);
    })();
    if (!token) return bad(res, 'Bước đăng ký không đúng. Hãy tải lại trang.', 409, 'step_conflict');

    res.setHeader('Set-Cookie', [sidCookie(token), clearOsidCookie()]);
    res.json({ ok: true, onboardingStep: 'appearance', user: publicUser(loadUser(userId)) });
  }),
);

app.post(
  '/api/auth/login',
  wrap(async (req, res) => {
    const email = normEmail(req.body?.email);
    const password = String(req.body?.password ?? '');

    const locked = loginLockMinutes(email);
    if (locked) return bad(res, lockMessage(locked), 429, 'login_locked');

    const user = findLoginUser(email);

    // Đã xác minh nhưng chưa có mật khẩu: không phải sai mật khẩu, không tính vào bộ đếm khóa.
    if (user && user.email_verified_at && !user.password_hash && user.onboarding_step === 'password') {
      await bcrypt.compare(password, DUMMY_HASH);
      const wait = otpWaitSeconds(email);
      if (wait === 0) dispatchOtp(email, 'gửi OTP đặt mật khẩu');
      return res.status(409).json({
        ok: false,
        code: 'password_setup_required',
        needsPassword: true,
        onboardingStep: 'password',
        email,
        resendInSeconds: wait === 0 ? RESEND_SECONDS : wait,
        error: 'Tài khoản chưa có mật khẩu. Hãy nhập mã xác minh để đặt mật khẩu.',
      });
    }

    // Chưa xác minh hoặc đăng nhập bằng OAuth (không có hash): 401 chung, không gửi mã (D10).
    const hasPassword = Boolean(user?.password_hash && user.email_verified_at);
    const passwordOk = await bcrypt.compare(password, hasPassword ? user.password_hash : DUMMY_HASH);
    if (!hasPassword || !passwordOk) {
      const lockedNow = recordLoginFail(email);
      if (lockedNow) return bad(res, lockMessage(lockedNow), 429, 'login_locked');
      return bad(res, 'Email hoặc mật khẩu không đúng.', 401, 'invalid_credentials');
    }

    clearLoginFails(email);
    // Đã đúng mật khẩu mới báo khóa, để người lạ không dò được tài khoản nào bị khóa. Khóa tạm hết hạn thì tự mở.
    const ban = activeBan(user);
    if (ban) {
      return res.status(403).json({ ok: false, code: 'account_banned', error: 'account_banned', until: ban.until });
    }
    const token = db.transaction(() => rotateToFullSession(req, user.id))();
    res.setHeader('Set-Cookie', [sidCookie(token), clearOsidCookie()]);
    res.json({ ok: true, user: publicUser(user), onboardingStep: user.onboarding_step ?? 'done' });
  }),
);

app.post('/api/auth/logout', (req, res) => {
  for (const token of [readSid(req), readOsid(req)]) {
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  }
  res.setHeader('Set-Cookie', [clearSidCookie(), clearOsidCookie()]);
  res.json({ ok: true });
});

// ---------- Hồ sơ nhân vật (ONBOARDING_API mục 4.3). Chỉ chấp nhận phiên đầy đủ (sid). ----------

function requireFullSession(req, res, next) {
  const row = sessionUser(req);
  if (!row) return bad(res, 'Chưa đăng nhập.', 401, 'unauthenticated');
  req.authUser = row;
  next();
}

app.get('/api/auth/profile/appearance', requireFullSession, (req, res) => {
  res.json({
    ok: true,
    appearance: readAppearance(req.authUser.appearance),
    onboardingStep: req.authUser.onboarding_step ?? 'done',
  });
});

// Ghi ngoại hình của chính mình. Không nhận userId, role, department từ client.
app.put('/api/auth/profile/appearance', requireFullSession, (req, res) => {
  const me = req.authUser;
  let value;
  try {
    // Body không phải JSON object (kể cả thiếu Content-Type) thì trả 400 với thông điệp rõ ràng.
    value = normalizeAppearance(req.is('application/json') ? req.body : undefined);
  } catch (err) {
    if (err instanceof AppearanceError) {
      return res.status(400).json({ ok: false, code: err.code, error: err.message, path: err.path });
    }
    throw err;
  }

  const now = Date.now();
  const last = lastAppearanceWrite.get(me.id);
  if (last !== undefined && now - last < APPEARANCE_WRITE_MS) {
    const retryAfter = Math.ceil((APPEARANCE_WRITE_MS - (now - last)) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      ok: false,
      code: 'rate_limited',
      error: `Lưu quá nhanh. Thử lại sau ${retryAfter} giây.`,
      retryAfter,
    });
  }
  lastAppearanceWrite.set(me.id, now);

  db.prepare('UPDATE users SET appearance = ? WHERE id = ?').run(JSON.stringify(value), me.id);
  res.json({ ok: true, appearance: value });
});

// Đọc công khai cho người đã đăng nhập cùng tenant. Chỉ trả id, tên và ngoại hình.
app.get('/api/auth/profile/appearance/:userId', requireFullSession, (req, res) => {
  res.set('Cache-Control', 'private, no-cache');
  const raw = req.params.userId;
  const id = Number(raw);
  const target =
    /^\d+$/.test(raw) && Number.isSafeInteger(id)
      ? db.prepare('SELECT id, name, appearance, tenant_id FROM users WHERE id = ?').get(id)
      : undefined;
  // Không tồn tại và khác tenant cho cùng một phản hồi.
  if (!target || target.tenant_id !== req.authUser.tenant_id) {
    return bad(res, 'Không tìm thấy người dùng.', 404, 'not_found');
  }
  res.json({
    ok: true,
    user: { id: target.id, name: target.name, appearance: readAppearance(target.appearance) },
  });
});

// Đọc hàng loạt cho phòng, tối đa 100 id. Có ETag để poll nhận 304 khi không đổi.
app.get('/api/auth/profile/appearances', requireFullSession, (req, res) => {
  res.set('Cache-Control', 'private, no-cache');
  const raw = typeof req.query.ids === 'string' ? req.query.ids : '';
  const unique = [...new Set(raw === '' ? [] : raw.split(',').map((s) => s.trim()))];
  if (unique.length > BATCH_MAX_IDS || !unique.every((s) => /^\d+$/.test(s))) {
    return bad(res, `Danh sách id không hợp lệ: tối đa ${BATCH_MAX_IDS} id, mỗi id là số.`, 400, 'invalid_input');
  }

  const ids = unique.map(Number).filter(Number.isSafeInteger);
  let items = [];
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT id, name, appearance FROM users WHERE tenant_id = ? AND id IN (${placeholders}) ORDER BY id`,
      )
      .all(req.authUser.tenant_id, ...ids);
    items = rows.map((r) => ({ id: r.id, name: r.name, appearance: readAppearance(r.appearance) }));
  }

  const body = JSON.stringify({ ok: true, items });
  const etag = `"${sha256(body)}"`;
  res.set('ETag', etag);
  if (req.get('If-None-Match') === etag) return res.status(304).end();
  res.type('application/json').send(body);
});

// Bước appearance sang tour. Cần appearance đã lưu.
app.post('/api/auth/profile/onboarding/complete', requireFullSession, (req, res) => {
  const id = req.authUser.id;
  const info = db
    .prepare(
      "UPDATE users SET onboarding_step = 'tour' WHERE id = ? AND onboarding_step = 'appearance' AND appearance IS NOT NULL",
    )
    .run(id);
  if (info.changes === 1) return res.json({ ok: true, onboardingStep: 'tour' });

  const current = db.prepare('SELECT onboarding_step, appearance FROM users WHERE id = ?').get(id);
  if (current?.onboarding_step === 'appearance' && current.appearance === null) {
    return bad(res, 'Hãy lưu ngoại hình trước khi tiếp tục.', 409, 'appearance_missing');
  }
  return bad(res, 'Bước đăng ký không đúng. Hãy tải lại trang.', 409, 'step_conflict');
});

// Tour sang done. Gọi lại khi đã done thì vẫn 200 (idempotent).
app.post('/api/auth/profile/onboarding/tour-done', requireFullSession, (req, res) => {
  const id = req.authUser.id;
  const info = db
    .prepare("UPDATE users SET onboarding_step = 'done', tour_done_at = ? WHERE id = ? AND onboarding_step = 'tour'")
    .run(Date.now(), id);
  if (info.changes === 1) return res.json({ ok: true, onboardingStep: 'done' });

  const current = db.prepare('SELECT onboarding_step FROM users WHERE id = ?').get(id);
  if (current?.onboarding_step === 'done') return res.json({ ok: true, onboardingStep: 'done' });
  return bad(res, 'Bước đăng ký không đúng. Hãy tải lại trang.', 409, 'step_conflict');
});

// ---------- Tùy chọn cá nhân và danh bạ ----------

app.get('/api/auth/profile/preferences', requireFullSession, (req, res) => {
  res.json({ ok: true, preferences: { reactBump: req.authUser.react_bump !== 0 } });
});

// Chỉ ghi cho chính người đăng nhập. Không nhận userId từ client.
app.post('/api/auth/profile/preferences', requireFullSession, (req, res) => {
  const value = req.body?.reactBump;
  if (typeof value !== 'boolean') return bad(res, 'reactBump phải là true hoặc false.', 400, 'invalid_input');
  db.prepare('UPDATE users SET react_bump = ? WHERE id = ?').run(value ? 1 : 0, req.authUser.id);
  res.json({ ok: true, preferences: { reactBump: value } });
});

// ---------- Hồ sơ cá nhân và nhân vật lưu lâu dài (docs/design/PROFILE.md) ----------
// Mọi route dưới đây chỉ đọc/ghi dữ liệu của req.authUser.id (lấy từ phiên sid ở server). Không route nào nhận id
// người khác; /api/auth/profile/character/:id không tồn tại nên rơi vào 404 chung.

const PROFILE_WRITE_MS = 2000;
const CHARACTER_WRITE_MS = 2000;
const lastProfileWrite = new Map(); // userId -> ms
const lastCharacterWrite = new Map(); // userId -> ms
// Trường client không được tự đổi (đổi qua CLI quản trị hoặc không bao giờ đổi). Gửi lên thì 403.
const PROFILE_FORBIDDEN = new Set(['id', 'userId', 'user_id', 'email', 'department', 'role', 'tenant', 'tenantId', 'tenant_id', 'status']);
const PROFILE_WRITABLE = new Set(['revision', 'name', 'avatarRef']);
const CHARACTER_BODY_KEYS = new Set(['revision', 'look']);

// Trả số giây phải chờ (đã gửi 429) hoặc 0 khi được ghi. Ghi nhận thời điểm khi được phép.
function writeThrottled(res, map, ms, userId) {
  const now = Date.now();
  const last = map.get(userId);
  if (last !== undefined && now - last < ms) {
    const retryAfter = Math.ceil((ms - (now - last)) / 1000);
    res.set('Retry-After', String(retryAfter));
    res.status(429).json({ ok: false, code: 'rate_limited', error: `Lưu quá nhanh. Thử lại sau ${retryAfter} giây.`, retryAfter });
    return true;
  }
  map.set(userId, now);
  return false;
}

const unprocessable = (res, err) =>
  res.status(422).json({ ok: false, code: err.code, error: err.message, path: err.path });

// revision là số nguyên >= 0: bản client đang có (0 nghĩa là "chưa có bản nào trên server").
function readRevision(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function jsonBodyOr415(req, res) {
  if (!req.is('application/json') || typeof req.body !== 'object' || req.body === null || Array.isArray(req.body)) {
    res.status(415).json({ ok: false, code: 'unsupported_media_type', error: 'Body phải là đối tượng JSON (Content-Type: application/json).' });
    return null;
  }
  return req.body;
}

function profileView(user) {
  const row = db.prepare('SELECT avatar_ref, revision, updated_at FROM user_profiles WHERE user_id = ?').get(user.id);
  return {
    id: user.id,
    name: user.name,
    // Email chỉ trả cho chính chủ ở route này; danh bạ và route công khai không bao giờ có email.
    email: user.email,
    department: user.department,
    avatarRef: row?.avatar_ref ?? null,
    revision: row?.revision ?? 0,
    updatedAt: row?.updated_at ?? null,
  };
}

app.get('/api/auth/profile', requireFullSession, (req, res) => {
  res.json({ ok: true, profile: profileView(req.authUser) });
});

// Sửa tên hiển thị và tham chiếu ảnh đại diện của chính mình. Phòng ban, vai trò, email chỉ đổi qua CLI quản trị.
app.put('/api/auth/profile', requireFullSession, (req, res) => {
  const me = req.authUser;
  const body = jsonBodyOr415(req, res);
  if (!body) return;
  const keys = Object.keys(body);
  const forbidden = keys.find((k) => PROFILE_FORBIDDEN.has(k));
  if (forbidden) {
    return res.status(403).json({ ok: false, code: 'field_forbidden', error: 'Không được sửa trường này qua hồ sơ.', path: forbidden });
  }
  const unknown = keys.find((k) => !PROFILE_WRITABLE.has(k));
  if (unknown) return unprocessable(res, new CharacterError('Trường không hợp lệ.', { path: unknown, code: 'unknown_field' }));
  const expected = readRevision(body.revision);
  if (expected === null) {
    return unprocessable(res, new CharacterError('revision phải là số nguyên >= 0.', { path: 'revision', code: 'invalid_revision' }));
  }

  let name;
  let avatarRef;
  try {
    if ('name' in body) name = validateDisplayName(body.name);
    if ('avatarRef' in body) avatarRef = validateAvatarRef(body.avatarRef);
  } catch (err) {
    if (err instanceof CharacterError) return unprocessable(res, err);
    throw err;
  }
  if (name === undefined && avatarRef === undefined) {
    return unprocessable(res, new CharacterError('Không có gì để cập nhật.', { path: '', code: 'empty_update' }));
  }
  if (name !== undefined && findBlocked(name)) {
    return res.status(422).json({ ok: false, code: 'content_rejected', error: 'content_rejected', path: 'name' });
  }
  if (writeThrottled(res, lastProfileWrite, PROFILE_WRITE_MS, me.id)) return;

  const now = Date.now();
  const result = db.transaction(() => {
    const row = db.prepare('SELECT avatar_ref, revision FROM user_profiles WHERE user_id = ?').get(me.id);
    const current = row?.revision ?? 0;
    if (current !== expected) return { conflict: current };
    const nextRef = avatarRef !== undefined ? avatarRef : (row?.avatar_ref ?? null);
    db.prepare(
      `INSERT INTO user_profiles (user_id, avatar_ref, revision, updated_at) VALUES (?, ?, 1, ?)
       ON CONFLICT(user_id) DO UPDATE SET avatar_ref = excluded.avatar_ref, revision = revision + 1, updated_at = excluded.updated_at`,
    ).run(me.id, nextRef, now);
    if (name !== undefined) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, me.id);
    return { conflict: null };
  })();
  if (result.conflict !== null) {
    return res.status(409).json({ ok: false, code: 'revision_conflict', error: 'Hồ sơ đã được sửa ở nơi khác. Tải lại rồi thử lại.', currentRevision: result.conflict });
  }
  res.json({ ok: true, profile: profileView({ ...me, name: name ?? me.name }) });
});

// ---------- Giới thiệu, trạng thái, quyền riêng tư (PROFILE.md mục 10) ----------
const ABOUT_WRITE_MS = 2000;
const lastAboutWrite = new Map();
const ABOUT_WRITABLE = new Set(['revision', 'bio', 'presence', 'statusText', 'profileVisibility', 'characterVisibility']);

function aboutRow(userId) {
  return db.prepare('SELECT * FROM user_about WHERE user_id = ?').get(userId);
}

function aboutView(row) {
  return {
    bio: row?.bio ?? '',
    presence: row?.status ?? 'free',
    statusText: row?.status_text ?? '',
    profileVisibility: row?.profile_visibility ?? DEFAULT_VISIBILITY,
    characterVisibility: row?.character_visibility ?? DEFAULT_VISIBILITY,
    revision: row?.revision ?? 0,
    updatedAt: row?.updated_at ?? null,
  };
}

app.get('/api/auth/profile/about', requireFullSession, (req, res) => {
  res.json({ ok: true, about: aboutView(aboutRow(req.authUser.id)) });
});

app.put('/api/auth/profile/about', requireFullSession, (req, res) => {
  const me = req.authUser;
  const body = jsonBodyOr415(req, res);
  if (!body) return;
  const keys = Object.keys(body);
  const forbidden = keys.find((k) => PROFILE_FORBIDDEN.has(k));
  if (forbidden) {
    return res.status(403).json({ ok: false, code: 'field_forbidden', error: 'Không được sửa trường này qua hồ sơ.', path: forbidden });
  }
  const unknown = keys.find((k) => !ABOUT_WRITABLE.has(k));
  if (unknown) return res.status(422).json({ ok: false, code: 'unknown_field', error: 'Trường không hợp lệ.', path: unknown });
  const expected = readRevision(body.revision);
  if (expected === null) {
    return res.status(422).json({ ok: false, code: 'invalid_revision', error: 'revision phải là số nguyên >= 0.', path: 'revision' });
  }
  const patch = {};
  try {
    if ('bio' in body) patch.bio = validateBio(body.bio);
    if ('presence' in body) patch.status = validateStatus(body.presence);
    if ('statusText' in body) patch.status_text = validateStatusText(body.statusText);
    if ('profileVisibility' in body) patch.profile_visibility = validateVisibility(body.profileVisibility, 'profileVisibility');
    if ('characterVisibility' in body) patch.character_visibility = validateVisibility(body.characterVisibility, 'characterVisibility');
  } catch (err) {
    if (err instanceof AboutError) {
      return res.status(422).json({ ok: false, code: err.code, error: err.message, path: err.path });
    }
    throw err;
  }
  if (Object.keys(patch).length === 0) {
    return res.status(422).json({ ok: false, code: 'empty_update', error: 'Không có gì để cập nhật.', path: '' });
  }
  if (writeThrottled(res, lastAboutWrite, ABOUT_WRITE_MS, me.id)) return;

  const now = Date.now();
  const result = db.transaction(() => {
    const row = aboutRow(me.id);
    const current = row?.revision ?? 0;
    if (current !== expected) return { conflict: current };
    const next = {
      bio: row?.bio ?? '',
      status: row?.status ?? 'free',
      status_text: row?.status_text ?? '',
      profile_visibility: row?.profile_visibility ?? DEFAULT_VISIBILITY,
      character_visibility: row?.character_visibility ?? DEFAULT_VISIBILITY,
      ...patch,
    };
    db.prepare(
      `INSERT INTO user_about (user_id, bio, status, status_text, profile_visibility, character_visibility, revision, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(user_id) DO UPDATE SET bio = excluded.bio, status = excluded.status, status_text = excluded.status_text,
         profile_visibility = excluded.profile_visibility, character_visibility = excluded.character_visibility,
         revision = revision + 1, updated_at = excluded.updated_at`,
    ).run(me.id, next.bio, next.status, next.status_text, next.profile_visibility, next.character_visibility, now);
    return { conflict: null };
  })();
  if (result.conflict !== null) {
    return res.status(409).json({ ok: false, code: 'revision_conflict', error: 'Hồ sơ đã được sửa ở nơi khác. Tải lại rồi thử lại.', currentRevision: result.conflict });
  }
  res.json({ ok: true, about: aboutView(aboutRow(me.id)) });
});

// Thẻ hồ sơ của người khác, theo quyền riêng tư của họ. Không có email. Nhân vật chỉ kèm khi characterVisibility cho phép.
app.get('/api/auth/profile/about/:userId', requireFullSession, (req, res) => {
  if (!/^[1-9]\d{0,9}$/.test(req.params.userId)) return bad(res, 'Không tìm thấy.', 404, 'not_found');
  const owner = db
    .prepare("SELECT id, name, department, tenant_id FROM users WHERE id = ? AND status = 'active'")
    .get(Number(req.params.userId));
  if (!owner) return bad(res, 'Không tìm thấy.', 404, 'not_found');
  const viewer = req.authUser;
  const about = aboutRow(owner.id);
  const view = aboutView(about);
  if (!canView(view.profileVisibility, viewer, owner)) {
    return res.status(403).json({ ok: false, code: 'profile_private', error: 'Hồ sơ này không công khai với bạn.' });
  }
  const prof = db.prepare('SELECT avatar_ref FROM user_profiles WHERE user_id = ?').get(owner.id);
  const card = {
    id: owner.id,
    name: owner.name,
    department: owner.department ?? null,
    avatarRef: prof?.avatar_ref ?? null,
    bio: view.bio,
    presence: view.presence,
    statusText: view.statusText,
    character: null,
  };
  if (canView(view.characterVisibility, viewer, owner)) {
    const row = characterRow(owner.id);
    if (row) {
      const out = migrateStoredCharacter(row.schema_version, row.data);
      card.character = out.status === 'ok' ? out.look : null;
    }
  }
  res.json({ ok: true, profile: card });
});

function characterRow(userId) {
  return db.prepare('SELECT schema_version, data, revision, updated_at FROM user_characters WHERE user_id = ?').get(userId);
}

// Đọc nhân vật của chính mình, có migrate khi đọc. Không ghi lại DB trong GET; lần PUT kế tiếp lưu ở schema mới.
app.get('/api/auth/profile/character', requireFullSession, (req, res) => {
  const me = req.authUser;
  const row = characterRow(me.id);
  if (!row) {
    // Chưa có bản cloud. legacyAppearance (ngoại hình cũ) để client tự chuyển đổi và cho người dùng xem trước;
    // server không tự tạo nhân vật (PROFILE.md mục 5).
    return res.json({ ok: true, character: null, revision: 0, legacyAppearance: readAppearance(me.appearance) });
  }
  const out = migrateStoredCharacter(row.schema_version, row.data);
  if (out.status === 'newer') {
    return res.status(409).json({ ok: false, code: 'schema_newer', error: 'Bản lưu do phiên bản máy chủ mới hơn tạo.', schemaVersion: out.schemaVersion, revision: row.revision });
  }
  if (out.status === 'corrupt') {
    console.error(`[auth] user_characters hỏng cho user ${me.id} (schema ${row.schema_version})`);
    return res.json({ ok: true, character: null, corrupt: true, revision: row.revision, legacyAppearance: readAppearance(me.appearance) });
  }
  res.json({
    ok: true,
    character: out.look,
    schemaVersion: out.schemaVersion,
    migrated: out.migrated,
    revision: row.revision,
    updatedAt: row.updated_at,
  });
});

// Ghi nhân vật của chính mình. Body: { revision, look }. revision là bản client đang có (0 = tạo mới, chỉ khi server
// chưa có bản nào, nên bản cloud không bị ghi đè tự động khi chuyển dữ liệu khách).
app.put('/api/auth/profile/character', requireFullSession, (req, res) => {
  const me = req.authUser;
  const body = jsonBodyOr415(req, res);
  if (!body) return;
  const keys = Object.keys(body);
  if (keys.some((k) => PROFILE_FORBIDDEN.has(k))) {
    return res.status(403).json({ ok: false, code: 'field_forbidden', error: 'Không nhận id hay chủ sở hữu từ client.' });
  }
  const unknown = keys.find((k) => !CHARACTER_BODY_KEYS.has(k));
  if (unknown) return unprocessable(res, new CharacterError('Trường không hợp lệ.', { path: unknown, code: 'unknown_field' }));
  const expected = readRevision(body.revision);
  if (expected === null) {
    return unprocessable(res, new CharacterError('revision phải là số nguyên >= 0.', { path: 'revision', code: 'invalid_revision' }));
  }

  let checked;
  try {
    checked = validateCharacter(body.look);
  } catch (err) {
    if (err instanceof CharacterError) {
      if (err.code === 'too_large') return bad(res, err.message, 413, 'payload_too_large');
      return unprocessable(res, err);
    }
    throw err;
  }
  if (checked.userText.some((t) => findBlocked(t))) {
    return res.status(422).json({ ok: false, code: 'content_rejected', error: 'content_rejected' });
  }
  if (writeThrottled(res, lastCharacterWrite, CHARACTER_WRITE_MS, me.id)) return;

  const now = Date.now();
  const data = JSON.stringify(checked.look);
  const result = db.transaction(() => {
    const row = db.prepare('SELECT revision FROM user_characters WHERE user_id = ?').get(me.id);
    const current = row?.revision ?? 0;
    if (current !== expected) return { conflict: current };
    db.prepare(
      `INSERT INTO user_characters (user_id, schema_version, data, revision, updated_at) VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(user_id) DO UPDATE SET schema_version = excluded.schema_version, data = excluded.data,
         revision = revision + 1, updated_at = excluded.updated_at`,
    ).run(me.id, CHARACTER_SCHEMA_VERSION, data, now);
    return { conflict: null, revision: current + 1 };
  })();
  if (result.conflict !== null) {
    // Không ghi đè: client phải tải bản mới, cho người dùng chọn giữ bản nào.
    return res.status(409).json({ ok: false, code: 'revision_conflict', error: 'Nhân vật đã được lưu ở nơi khác. Tải lại rồi chọn bản muốn giữ.', currentRevision: result.conflict });
  }
  res.json({ ok: true, character: checked.look, schemaVersion: CHARACTER_SCHEMA_VERSION, revision: result.revision, updatedAt: now });
});

// Xóa nhân vật cloud của chính mình. Không giữ bản sao trên server (bản sao lưu app.db theo chính sách backup chung).
app.delete('/api/auth/profile/character', requireFullSession, (req, res) => {
  const info = db.prepare('DELETE FROM user_characters WHERE user_id = ?').run(req.authUser.id);
  res.json({ ok: true, deleted: info.changes === 1 });
});

// So khớp không phân biệt hoa thường và dấu tiếng Việt.
const foldText = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const DIRECTORY_MAX = 50;

// Danh bạ nhân viên cùng tenant, đang hoạt động. Chỉ trả id, name, department.
app.get('/api/auth/directory', requireFullSession, (req, res) => {
  const q = foldText(typeof req.query.query === 'string' ? req.query.query.slice(0, 80) : '');
  const rows = db
    .prepare("SELECT id, name, department FROM users WHERE tenant_id = ? AND status = 'active' ORDER BY name COLLATE NOCASE, id")
    .all(req.authUser.tenant_id);
  const items = [];
  for (const r of rows) {
    if (q && !foldText(r.name).includes(q)) continue;
    items.push({ id: r.id, name: r.name, department: r.department });
    if (items.length >= DIRECTORY_MAX) break;
  }
  res.json({ ok: true, items });
});

// Tra một nhân viên theo id (dịch vụ games dùng để xác minh người được mời).
// Chỉ đọc. Chỉ trả id, name, department; không trả email, vai trò, trạng thái khóa.
// Không có, đã khóa hoặc khác tenant đều trả 404 như nhau.
app.get('/api/auth/directory/:id', requireFullSession, (req, res) => {
  const raw = String(req.params.id ?? '');
  const id = /^[1-9]\d{0,15}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(id)) return bad(res, 'Không tìm thấy nhân viên.', 404, 'not_found');
  const row = db
    .prepare("SELECT id, name, department FROM users WHERE id = ? AND tenant_id = ? AND status = 'active'")
    .get(id, req.authUser.tenant_id);
  if (!row) return bad(res, 'Không tìm thấy nhân viên.', 404, 'not_found');
  res.json({ id: row.id, name: row.name, department: row.department });
});

// ---------- Kiểm duyệt (docs/design/MODERATION.md mục 4 và 5) ----------

const MOD_ROLES = new Set(['moderator', 'admin']);
const MODERATOR_TARGET_ROLES = new Set(['employee', 'it']);
const REPORT_TYPES = new Set(['kudos', 'program', 'event', 'user']);
const REASON_MAX = 300;
const SNAPSHOT_MAX = 500;
const BAN_DAYS_MAX = 3650;
const REPORT_LIMIT_MAX = 20;
const REPORT_WINDOW_MS = 60 * 60e3;
const recentReports = new Map(); // reporterId -> các thời điểm gửi báo cáo (ms)

// Lỗi kiểm duyệt: error là mã chuỗi như hợp đồng; code lặp lại để client dùng chung với các route khác.
const modErr = (res, status, error, extra = {}) => res.status(status).json({ ok: false, code: error, error, ...extra });

function requireModerator(req, res, next) {
  // Vai trò đọc từ DB qua phiên ở máy chủ, không tin gì từ client.
  const row = sessionUser(req);
  if (!row) return modErr(res, 401, 'unauthenticated');
  if (!MOD_ROLES.has(row.role)) return modErr(res, 403, 'forbidden');
  req.authUser = row;
  next();
}

function requireAdminRole(req, res, next) {
  if (req.authUser.role !== 'admin') return modErr(res, 403, 'forbidden');
  next();
}

// Chuỗi bắt buộc, đã trim, độ dài 1..max. Trả null nếu không hợp lệ.
function requiredText(value, max) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length >= 1 && text.length <= max ? text : null;
}

// id trong URL: chỉ chữ số, số nguyên an toàn.
function parseId(raw) {
  if (typeof raw !== 'string' || !/^\d{1,15}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// banDays: số nguyên 1..3650, hoặc null (vĩnh viễn). Trả { ok, days } với days = null nghĩa là vĩnh viễn.
function parseBanDays(body) {
  if (!body || !('banDays' in body)) return { ok: false };
  const v = body.banDays;
  if (v === null) return { ok: true, days: null };
  if (Number.isInteger(v) && v >= 1 && v <= BAN_DAYS_MAX) return { ok: true, days: v };
  return { ok: false };
}

// Quyền khóa theo mục 5. Trả mã lỗi hoặc null nếu được phép.
function banDenied(actor, target) {
  if (target.id === actor.id) return 'cannot_target_self';
  if (actor.role === 'admin') return target.role === 'admin' ? 'forbidden_target' : null;
  return MODERATOR_TARGET_ROLES.has(target.role) ? null : 'forbidden_target';
}

const modUserView = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  status: u.status,
  ban_until: u.ban_until ?? null,
});

// Áp dụng khóa trong transaction của người gọi. Trả banUntil (ISO hoặc null).
function applyBan({ actor, target, reason, days, reportId = null }) {
  const now = new Date();
  const until = days === null ? null : new Date(now.getTime() + days * 86400e3).toISOString();
  db.prepare(
    "UPDATE users SET status = 'banned', ban_reason = ?, ban_until = ?, banned_by = ?, banned_at = ? WHERE id = ?",
  ).run(reason, until, actor.id, now.toISOString(), target.id);
  revokeSessions(target.id);
  logModerationAction({ actorId: actor.id, action: 'ban', targetUserId: target.id, reportId, reason, banUntil: until });
  return until;
}

function loadTarget(id) {
  const row = db.prepare('SELECT id, email, name, role, status, ban_until FROM users WHERE id = ?').get(id);
  if (row) activeBan(row); // khóa tạm đã hết hạn thì tự mở
  return row ?? null;
}

// Báo cáo nội dung hoặc người dùng. Mọi người đăng nhập đều gửi được.
app.post('/api/auth/moderation/reports', requireFullSession, (req, res) => {
  const me = req.authUser;
  const body = req.body ?? {};
  if (!REPORT_TYPES.has(body.contentType)) return modErr(res, 422, 'invalid_input', { field: 'contentType' });

  let contentId = null;
  if (body.contentId !== undefined && body.contentId !== null) {
    if (!(typeof body.contentId === 'string' || Number.isSafeInteger(body.contentId))) {
      return modErr(res, 422, 'invalid_input', { field: 'contentId' });
    }
    contentId = String(body.contentId).trim().slice(0, 100) || null;
  }

  let targetUserId = null;
  if (body.targetUserId !== undefined && body.targetUserId !== null) {
    if (!Number.isSafeInteger(body.targetUserId) || body.targetUserId <= 0) {
      return modErr(res, 422, 'invalid_input', { field: 'targetUserId' });
    }
    targetUserId = body.targetUserId;
  }
  if (body.contentType === 'user' && targetUserId === null) {
    return modErr(res, 422, 'invalid_input', { field: 'targetUserId' });
  }
  if (targetUserId !== null && !db.prepare('SELECT 1 FROM users WHERE id = ?').get(targetUserId)) {
    return modErr(res, 404, 'user_not_found');
  }

  const reason = requiredText(body.reason, REASON_MAX);
  if (!reason) return modErr(res, 422, 'invalid_input', { field: 'reason' });
  // Bản chụp có thể trống (báo cáo người dùng), nhưng không quá 500 ký tự.
  if (body.snapshot !== undefined && typeof body.snapshot !== 'string') {
    return modErr(res, 422, 'invalid_input', { field: 'snapshot' });
  }
  const snapshot = String(body.snapshot ?? '').trim();
  if ([...snapshot].length > SNAPSHOT_MAX) return modErr(res, 422, 'invalid_input', { field: 'snapshot' });

  // Giới hạn tần suất để chống spam hàng đợi (theo instance).
  const now = Date.now();
  const recent = (recentReports.get(me.id) ?? []).filter((t) => now - t < REPORT_WINDOW_MS);
  if (recent.length >= REPORT_LIMIT_MAX) {
    recentReports.set(me.id, recent);
    return modErr(res, 429, 'rate_limited');
  }
  recent.push(now);
  recentReports.set(me.id, recent);

  const info = db
    .prepare(
      `INSERT INTO moderation_reports (created_at, reporter_id, content_type, content_id, target_user_id, reason, snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(new Date(now).toISOString(), me.id, body.contentType, contentId, targetUserId, reason, snapshot);
  const report = db.prepare('SELECT * FROM moderation_reports WHERE id = ?').get(Number(info.lastInsertRowid));
  res.status(201).json({ ok: true, report });
});

app.get('/api/auth/moderation/reports', requireModerator, (req, res) => {
  const status = req.query.status === undefined ? 'open' : req.query.status;
  if (status !== 'open' && status !== 'resolved') return modErr(res, 422, 'invalid_input', { field: 'status' });
  const items = db
    .prepare(
      `SELECT r.id, r.created_at, r.reporter_id, rep.name AS reporter_name, r.content_type, r.content_id,
              r.target_user_id, tu.name AS target_name, tu.role AS target_role, tu.status AS target_status,
              r.reason, r.snapshot, r.status, r.resolved_by, r.resolved_at, r.resolution, r.resolution_reason
       FROM moderation_reports r
       LEFT JOIN users rep ON rep.id = r.reporter_id
       LEFT JOIN users tu ON tu.id = r.target_user_id
       WHERE r.status = ?
       ORDER BY r.id DESC
       LIMIT 200`,
    )
    .all(status);
  res.json({ ok: true, items });
});

app.post('/api/auth/moderation/reports/:id/resolve', requireModerator, (req, res) => {
  const actor = req.authUser;
  const id = parseId(req.params.id);
  if (id === null) return modErr(res, 404, 'not_found');
  const body = req.body ?? {};
  const action = body.action;
  if (action !== 'dismiss' && action !== 'warn' && action !== 'ban') {
    return modErr(res, 422, 'invalid_input', { field: 'action' });
  }

  // Cảnh cáo và khóa bắt buộc có lý do; bỏ qua thì lý do tùy chọn.
  let reason = null;
  if (action === 'dismiss' && (body.reason === undefined || body.reason === null || body.reason === '')) {
    reason = null;
  } else {
    reason = requiredText(body.reason, REASON_MAX);
    if (!reason) return modErr(res, 422, 'invalid_input', { field: 'reason' });
  }
  let days = null;
  if (action === 'ban') {
    const parsed = parseBanDays(body);
    if (!parsed.ok) return modErr(res, 422, 'invalid_input', { field: 'banDays' });
    days = parsed.days;
  }

  const outcome = db.transaction(() => {
    const report = db.prepare('SELECT * FROM moderation_reports WHERE id = ?').get(id);
    if (!report) return { status: 404, error: 'not_found' };
    if (report.status !== 'open') return { status: 409, error: 'already_resolved' };

    let target = null;
    if (action === 'warn' || action === 'ban') {
      if (report.target_user_id === null) return { status: 422, error: 'no_target_user' };
      target = loadTarget(report.target_user_id);
      if (!target) return { status: 404, error: 'user_not_found' };
      if (target.id === actor.id) return { status: 403, error: 'cannot_target_self' };
    }

    let banUntil = null;
    if (action === 'ban') {
      const denied = banDenied(actor, target);
      if (denied) return { status: 403, error: denied };
      if (target.status === 'banned') return { status: 409, error: 'already_banned' };
      banUntil = applyBan({ actor, target, reason, days, reportId: id });
    } else {
      logModerationAction({
        actorId: actor.id,
        action,
        targetUserId: report.target_user_id,
        reportId: id,
        reason,
      });
    }

    db.prepare(
      "UPDATE moderation_reports SET status = 'resolved', resolved_by = ?, resolved_at = ?, resolution = ?, resolution_reason = ? WHERE id = ?",
    ).run(actor.id, new Date().toISOString(), action, reason, id);
    return { report: db.prepare('SELECT * FROM moderation_reports WHERE id = ?').get(id), banUntil };
  })();

  if (outcome.error) return modErr(res, outcome.status, outcome.error);
  res.json({ ok: true, report: outcome.report, banUntil: outcome.banUntil });
});

app.post('/api/auth/moderation/users/:id/ban', requireModerator, (req, res) => {
  const actor = req.authUser;
  const id = parseId(req.params.id);
  if (id === null) return modErr(res, 404, 'not_found');
  const body = req.body ?? {};
  const reason = requiredText(body.reason, REASON_MAX);
  if (!reason) return modErr(res, 422, 'invalid_input', { field: 'reason' });
  const parsed = parseBanDays(body);
  if (!parsed.ok) return modErr(res, 422, 'invalid_input', { field: 'banDays' });

  const outcome = db.transaction(() => {
    const target = loadTarget(id);
    if (!target) return { status: 404, error: 'user_not_found' };
    const denied = banDenied(actor, target);
    if (denied) return { status: 403, error: denied };
    if (target.status === 'banned') return { status: 409, error: 'already_banned' };
    applyBan({ actor, target, reason, days: parsed.days });
    return { user: modUserView(loadTarget(id)) };
  })();

  if (outcome.error) return modErr(res, outcome.status, outcome.error);
  res.json({ ok: true, user: outcome.user });
});

app.post('/api/auth/moderation/users/:id/unban', requireModerator, (req, res) => {
  const actor = req.authUser;
  const id = parseId(req.params.id);
  if (id === null) return modErr(res, 404, 'not_found');
  const reason = requiredText(req.body?.reason, REASON_MAX);
  if (!reason) return modErr(res, 422, 'invalid_input', { field: 'reason' });

  const outcome = db.transaction(() => {
    const target = loadTarget(id);
    if (!target) return { status: 404, error: 'user_not_found' };
    if (target.id === actor.id) return { status: 403, error: 'cannot_target_self' };
    // Moderator chỉ mở khóa người mà mình được phép khóa; admin mở khóa bất kỳ ai.
    if (actor.role !== 'admin' && !MODERATOR_TARGET_ROLES.has(target.role)) {
      return { status: 403, error: 'forbidden_target' };
    }
    if (target.status !== 'banned') return { status: 409, error: 'not_banned' };
    const previousUntil = target.ban_until ?? null;
    db.prepare(
      "UPDATE users SET status = 'active', ban_reason = NULL, ban_until = NULL, banned_by = NULL, banned_at = NULL WHERE id = ?",
    ).run(id);
    logModerationAction({ actorId: actor.id, action: 'unban', targetUserId: id, reason, banUntil: previousUntil });
    return { user: modUserView(loadTarget(id)) };
  })();

  if (outcome.error) return modErr(res, outcome.status, outcome.error);
  res.json({ ok: true, user: outcome.user });
});

app.get('/api/auth/moderation/users', requireModerator, (req, res) => {
  const raw = typeof req.query.query === 'string' ? req.query.query.trim().slice(0, 80) : '';
  if ([...raw].length < 2) return modErr(res, 422, 'invalid_input', { field: 'query' });
  // Thoát ký tự đặc biệt của LIKE để người dùng không tự dựng mẫu.
  const like = `%${raw.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = db
    .prepare(
      `SELECT id, email, name, role, status, ban_until FROM users
       WHERE email LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\'
       ORDER BY name COLLATE NOCASE, id
       LIMIT 25`,
    )
    .all(like, like);
  for (const r of rows) activeBan(r);
  res.json({ ok: true, items: rows.map(modUserView) });
});

app.get('/api/auth/moderation/audit', requireModerator, requireAdminRole, (req, res) => {
  const limit = req.query.limit === undefined ? 100 : Number(req.query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    return modErr(res, 422, 'invalid_input', { field: 'limit' });
  }
  const items = db
    .prepare(
      `SELECT a.id, a.at, a.actor_id, actor.name AS actor_name, a.action, a.target_user_id, tu.name AS target_name,
              a.report_id, a.reason, a.ban_until
       FROM moderation_actions a
       LEFT JOIN users actor ON actor.id = a.actor_id
       LEFT JOIN users tu ON tu.id = a.target_user_id
       ORDER BY a.id DESC
       LIMIT ?`,
    )
    .all(limit);
  res.json({ ok: true, items });
});

for (const provider of ['google', 'microsoft']) {
  const label = OAUTH_LABEL[provider];

  app.get(
    `/api/auth/oauth/${provider}/start`,
    wrap(async (_req, res) => {
      if (!oauthEnabled(provider)) return bad(res, `Chưa cấu hình đăng nhập bằng ${label}.`, 404, 'oauth_disabled');
      if (!config.publicBaseUrl) return bad(res, 'Máy chủ chưa cấu hình PUBLIC_BASE_URL.', 500, 'internal');
      res.redirect(302, await beginOAuth(provider));
    }),
  );

  app.get(
    `/api/auth/oauth/${provider}/callback`,
    wrap(async (req, res) => {
      if (!oauthEnabled(provider)) return bad(res, `Chưa cấu hình đăng nhập bằng ${label}.`, 404, 'oauth_disabled');
      if (!config.publicBaseUrl) return bad(res, 'Máy chủ chưa cấu hình PUBLIC_BASE_URL.', 500, 'internal');
      if (req.query.error) {
        return bad(res, 'Bạn đã hủy đăng nhập hoặc nhà cung cấp từ chối yêu cầu.', 400, 'oauth_cancelled');
      }

      const state = typeof req.query.state === 'string' ? req.query.state : '';
      const code = typeof req.query.code === 'string' ? req.query.code : '';
      if (!state || !code) return bad(res, 'Thiếu thông tin đăng nhập từ nhà cung cấp.', 400, 'oauth_failed');

      const saved = consumeOAuthState(provider, state);
      if (!saved) return bad(res, 'Phiên đăng nhập đã hết hạn. Hãy thử lại.', 400, 'oauth_state');

      let identity;
      try {
        identity =
          provider === 'google'
            ? await exchangeGoogle({
                code,
                state,
                iss: typeof req.query.iss === 'string' ? req.query.iss : undefined,
                nonce: saved.nonce,
                verifier: saved.verifier,
              })
            : await exchangeMicrosoft({ code, nonce: saved.nonce, verifier: saved.verifier });
      } catch (err) {
        if (err instanceof OAuthError) return bad(res, err.message, err.status, 'oauth_failed');
        throw err;
      }

      // Tài khoản Microsoft work/school chưa chắc có email đã xác minh. Không liên kết vào bất kỳ tài khoản sẵn có nào
      // (kể cả tài khoản chỉ có Google), để tránh chiếm tài khoản. Tài khoản cá nhân của Microsoft được coi là đã xác minh.
      if (provider === 'microsoft' && identity.tid !== MS_CONSUMER_TENANT) {
        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(identity.email);
        if (existing) {
          return bad(
            res,
            'Email này đã có tài khoản. Hãy đăng nhập bằng mật khẩu hoặc Google.',
            409,
            'email_exists',
          );
        }
      }

      const userId = signInOAuthUser(identity.email, identity.name);
      const oauthBan = activeBan(loadUser(userId));
      if (oauthBan) {
        return res
          .status(403)
          .json({ ok: false, code: 'account_banned', error: 'account_banned', until: oauthBan.until });
      }
      const token = db.transaction(() => rotateToFullSession(req, userId))();
      res.setHeader('Set-Cookie', [sidCookie(token), clearOsidCookie()]);
      res.redirect(302, '/');
    }),
  );
}

app.use((_req, res) => bad(res, 'Không tìm thấy.', 404, 'not_found'));

app.use((err, _req, res, _next) => {
  if (err.type === 'entity.too.large') return bad(res, 'Dữ liệu gửi lên quá lớn.', 413, 'payload_too_large');
  if (err.type === 'entity.parse.failed') {
    return bad(res, 'Dữ liệu gửi lên không đúng định dạng JSON.', 400, 'invalid_input');
  }
  console.error('[auth] lỗi không xử lý:', err.stack ?? err.message);
  bad(res, 'Lỗi máy chủ.', 500, 'internal');
});

purgeExpired();
// Chỉ lắng nghe loopback: gateway proxy tới 127.0.0.1:3001, và auth không được mở ra mạng ngoài.
const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(
    `Auth service đang chạy ở cổng ${config.port} · mail=${mailMode()} · ` +
      `google=${oauthEnabled('google')} · microsoft=${oauthEnabled('microsoft')}`,
  );
  if ((oauthEnabled('google') || oauthEnabled('microsoft')) && !config.publicBaseUrl) {
    console.warn('[auth] Cảnh báo: đã bật OAuth nhưng thiếu PUBLIC_BASE_URL.');
  }
});

const sweepTimer = setInterval(() => {
  purgeExpired();
  liftAllExpiredBans();
  sweepLoginFails();
  const now = Date.now();
  for (const [userId, at] of lastAppearanceWrite) {
    if (now - at >= APPEARANCE_WRITE_MS) lastAppearanceWrite.delete(userId);
  }
  for (const [map, ms] of [
    [lastProfileWrite, PROFILE_WRITE_MS],
    [lastCharacterWrite, CHARACTER_WRITE_MS],
  ]) {
    for (const [userId, at] of map) if (now - at >= ms) map.delete(userId);
  }
}, 10 * 60e3);
sweepTimer.unref();

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
