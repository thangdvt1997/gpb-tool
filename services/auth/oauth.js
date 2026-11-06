import { createHash } from 'node:crypto';
import openidClient from 'openid-client';
import { config } from './config.js';
import { db } from './db.js';
import { EMAIL_RE, normEmail, randomToken, sha256 } from './auth.js';

const { Issuer } = openidClient;

export const OAUTH_STATE_MS = 10 * 60e3;
// Tenant cố định của tài khoản Microsoft cá nhân (Outlook, Hotmail, Live).
export const MS_CONSUMER_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad';
const MS_ISS_RE = /^https:\/\/login\.microsoftonline\.com\/([0-9a-f-]{36})\/v2\.0$/i;

export class OAuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.status = status;
  }
}

// Chỉ bật khi có cả client ID và secret trong env.
export function oauthEnabled(provider) {
  const c = config[provider];
  return Boolean(c.clientId && c.clientSecret);
}

export function redirectUri(provider) {
  return `${config.publicBaseUrl}/api/auth/oauth/${provider}/callback`;
}

let googleClientPromise = null;
function googleClient() {
  if (!googleClientPromise) {
    googleClientPromise = Issuer.discover('https://accounts.google.com')
      .then(
        (issuer) =>
          new issuer.Client({
            client_id: config.google.clientId,
            client_secret: config.google.clientSecret,
            redirect_uris: [redirectUri('google')],
            response_types: ['code'],
          }),
      )
      .catch((err) => {
        googleClientPromise = null;
        throw err;
      });
  }
  return googleClientPromise;
}

function microsoftClient() {
  const base = `https://login.microsoftonline.com/${config.microsoft.tenant}`;
  // Khai báo endpoint trực tiếp thay vì discovery: với tenant 'common', issuer trong discovery là mẫu {tenantid}.
  const issuer = new Issuer({
    issuer: `${base}/v2.0`,
    authorization_endpoint: `${base}/oauth2/v2.0/authorize`,
    token_endpoint: `${base}/oauth2/v2.0/token`,
  });
  return new issuer.Client({
    client_id: config.microsoft.clientId,
    client_secret: config.microsoft.clientSecret,
    redirect_uris: [redirectUri('microsoft')],
    response_types: ['code'],
  });
}

// Tạo state, nonce, PKCE verifier. Lưu vào DB (state đã băm) rồi trả về URL chuyển hướng tới nhà cung cấp.
export async function beginOAuth(provider) {
  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken(48);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const client = provider === 'google' ? await googleClient() : microsoftClient();
  const url = client.authorizationUrl({
    scope: 'openid email profile',
    redirect_uri: redirectUri(provider),
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  db.prepare(
    'INSERT INTO oauth_states (state_hash, provider, nonce, code_verifier, expires_at) VALUES (?, ?, ?, ?, ?)',
  ).run(sha256(state), provider, nonce, verifier, Date.now() + OAUTH_STATE_MS);
  return url;
}

// Mỗi state chỉ dùng được một lần: xóa và trả về trong cùng một câu lệnh.
export function consumeOAuthState(provider, state) {
  const row = db
    .prepare(
      'DELETE FROM oauth_states WHERE state_hash = ? AND provider = ? AND expires_at > ? RETURNING nonce, code_verifier',
    )
    .get(sha256(state), provider, Date.now());
  return row ? { nonce: row.nonce, verifier: row.code_verifier } : null;
}

// Google: openid-client kiểm tra đầy đủ (chữ ký JWKS, iss, aud, nonce, exp).
export async function exchangeGoogle({ code, state, iss, nonce, verifier }) {
  let claims;
  try {
    const client = await googleClient();
    // Google gửi kèm iss trong callback. openid-client bắt buộc iss khi metadata có khai báo.
    const params = { code, state };
    if (typeof iss === 'string' && iss !== '') params.iss = iss;
    const tokenSet = await client.callback(redirectUri('google'), params, {
      state,
      nonce,
      code_verifier: verifier,
    });
    claims = tokenSet.claims();
  } catch (err) {
    console.error('[oauth] google: xác thực thất bại:', err.message);
    throw new OAuthError('Không xác thực được tài khoản Google. Hãy thử lại.');
  }
  if (claims.email_verified !== true && claims.email_verified !== 'true') {
    throw new OAuthError('Email Google này chưa được xác minh.', 403);
  }
  const email = normEmail(claims.email);
  if (!EMAIL_RE.test(email)) {
    throw new OAuthError('Google không trả về email hợp lệ cho tài khoản này.');
  }
  return { email, name: claims.name, tid: null };
}

// Microsoft: đổi code trực tiếp với token endpoint qua TLS, rồi kiểm tra claims thủ công.
// Lý do: với tenant 'common', iss của token là GUID của từng tenant nên openid-client từ chối.
// OIDC Core 3.1.3.7 cho phép bỏ kiểm tra chữ ký khi token nhận trực tiếp từ token endpoint qua TLS.
export async function exchangeMicrosoft({ code, nonce, verifier }) {
  const endpoint = `https://login.microsoftonline.com/${config.microsoft.tenant}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri('microsoft'),
    code_verifier: verifier,
    client_id: config.microsoft.clientId,
    client_secret: config.microsoft.clientSecret,
  });
  let tokens;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    tokens = await res.json();
    if (!res.ok) throw new Error(`token endpoint trả HTTP ${res.status}`);
  } catch (err) {
    console.error('[oauth] microsoft: đổi token thất bại:', err.message);
    throw new OAuthError('Không đổi được mã đăng nhập Microsoft. Hãy thử lại.');
  }
  if (typeof tokens?.id_token !== 'string') {
    throw new OAuthError('Microsoft không trả về ID token. Hãy thử lại.');
  }
  const claims = decodeJwtPayload(tokens.id_token);
  checkMicrosoftClaims(claims, nonce);
  const email = normEmail(claims.email || claims.preferred_username);
  if (!EMAIL_RE.test(email)) {
    throw new OAuthError(
      'Tài khoản Microsoft này không có email. Hãy dùng tài khoản có email hoặc đăng nhập bằng mật khẩu.',
    );
  }
  return { email, name: claims.name, tid: claims.tid.toLowerCase() };
}

function decodeJwtPayload(jwt) {
  const parts = jwt.split('.');
  try {
    const payload = JSON.parse(Buffer.from(parts[1] ?? '', 'base64url').toString('utf8'));
    if (parts.length === 3 && payload && typeof payload === 'object') return payload;
  } catch {
    // Rơi xuống lỗi bên dưới.
  }
  throw new OAuthError('ID token của Microsoft không đọc được. Hãy thử lại.');
}

function checkMicrosoftClaims(c, nonce) {
  const audiences = Array.isArray(c.aud) ? c.aud : [c.aud];
  const issMatch = typeof c.iss === 'string' ? MS_ISS_RE.exec(c.iss) : null;
  const tid = typeof c.tid === 'string' ? c.tid.toLowerCase() : '';
  // Nếu MICROSOFT_TENANT là GUID cụ thể thì chỉ chấp nhận đúng tenant đó.
  const pinned = /^[0-9a-f-]{36}$/i.test(config.microsoft.tenant) ? config.microsoft.tenant.toLowerCase() : null;
  const valid =
    audiences.includes(config.microsoft.clientId) &&
    c.nonce === nonce &&
    typeof c.exp === 'number' &&
    c.exp * 1000 > Date.now() &&
    issMatch !== null &&
    tid !== '' &&
    issMatch[1].toLowerCase() === tid &&
    (pinned === null || pinned === tid);
  if (!valid) {
    throw new OAuthError('Phản hồi đăng nhập Microsoft không hợp lệ. Hãy thử lại.');
  }
}
