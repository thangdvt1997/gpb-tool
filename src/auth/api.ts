import type { Role } from '../content/types';
import { normalizeAppearance, type Appearance } from '../avatar/appearance';

export type Provider = 'google' | 'microsoft';

export interface Tenant {
  id: string;
  type: 'personal' | 'business';
  name: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  department: string | null;
  role: Role;
  tenant: Tenant;
}

export interface Providers {
  google: boolean;
  microsoft: boolean;
}

/** Bước onboarding do server giữ (ONBOARDING_API.md mục 2.1). */
export type OnboardingStep = 'password' | 'appearance' | 'tour' | 'done';

const ONBOARDING_STEPS: readonly string[] = ['password', 'appearance', 'tour', 'done'];

/** Phiên đầy đủ (cookie sid) kèm bước onboarding và appearance đã lưu (null nếu chưa có). */
export interface Session {
  user: AuthUser;
  onboardingStep: OnboardingStep;
  appearance: Appearance | null;
}

export interface RegisterResult {
  email: string;
  expiresInSeconds: number | null;
  resendInSeconds: number | null;
}

export interface VerifyResult {
  email: string;
  onboardingStep: OnboardingStep;
}

/** Phiên tạm (cookie osid) để đặt mật khẩu. */
export interface OnboardingSession {
  email: string;
  onboardingStep: OnboardingStep;
  expiresAt: number | null;
}

export type LoginResult =
  | { kind: 'signed_in'; session: Session }
  | { kind: 'password_setup'; email: string; resendInSeconds: number | null };

/**
 * Lỗi từ API. `message` là nội dung tiếng Việt lấy từ trường error (hoặc câu mặc định).
 * `code` là mã ổn định từ server (ví dụ invalid_code, step_conflict), rỗng nếu không có.
 * `data` là toàn bộ body lỗi, dùng để đọc các trường phụ như attemptsLeft, retryAfter.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly needsVerification: boolean;
  readonly code: string;
  readonly data: Record<string, unknown> | null;

  constructor(
    message: string,
    status: number,
    needsVerification = false,
    code = '',
    data: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.needsVerification = needsVerification;
    this.code = code;
    this.data = data;
  }
}

const ROLES: readonly string[] = ['employee', 'it', 'moderator', 'admin'];

type RawUser = Omit<AuthUser, 'role'> & { role?: string };

/** Vai trò không hợp lệ hoặc thiếu thì coi là 'employee' (quyền thấp nhất). */
function toUser(raw: RawUser): AuthUser {
  const role: Role = raw.role && ROLES.includes(raw.role) ? (raw.role as Role) : 'employee';
  return { ...raw, role };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Bước không hợp lệ hoặc thiếu thì dùng fallback. Mặc định 'done' để không chặn văn phòng. */
function stepOf(value: unknown, fallback: OnboardingStep = 'done'): OnboardingStep {
  return typeof value === 'string' && ONBOARDING_STEPS.includes(value) ? (value as OnboardingStep) : fallback;
}

function toSession(raw: { user: RawUser; onboardingStep?: unknown; appearance?: unknown }): Session {
  return {
    user: toUser(raw.user),
    onboardingStep: stepOf(raw.onboardingStep),
    appearance: isRecord(raw.appearance) ? normalizeAppearance(raw.appearance) : null,
  };
}

function fallbackMessage(status: number): string {
  if (status === 0) return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
  if (status === 429) return 'Bạn thao tác quá nhiều lần. Thử lại sau ít phút.';
  if (status >= 500) return 'Máy chủ đang gặp lỗi. Thử lại sau.';
  return 'Yêu cầu chưa thành công. Thử lại.';
}

/** Thông báo khi tài khoản bị khóa. `until` là ISO hoặc null (khóa vĩnh viễn). */
function bannedMessage(until: unknown): string {
  if (typeof until === 'string' && until !== '') {
    const d = new Date(until);
    if (!Number.isNaN(d.getTime())) {
      return `Tài khoản đã bị khóa tạm thời đến ${d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.`;
    }
  }
  return 'Tài khoản đã bị khóa. Liên hệ quản trị viên nếu cần hỗ trợ.';
}

type Method = 'GET' | 'POST' | 'PUT';

async function request<T>(path: string, method: Method, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(fallbackMessage(0), 0);
  }

  const data: unknown = await res.json().catch(() => null);
  const record = isRecord(data) ? data : null;

  if (!res.ok) {
    const code = record && typeof record.code === 'string' ? record.code : '';
    // Backend kiểm duyệt trả error là mã (ví dụ account_banned), không phải câu hiển thị được.
    const serverMessage =
      code === 'account_banned'
        ? bannedMessage(record?.until)
        : code === 'content_rejected'
          ? 'Tên chứa từ ngữ không phù hợp. Hãy dùng tên khác.'
          : record && typeof record.error === 'string'
          ? record.error
          : '';
    throw new ApiError(
      serverMessage || fallbackMessage(res.status),
      res.status,
      record?.needsVerification === true,
      code,
      record,
    );
  }
  return data as T;
}

/** Phiên đầy đủ (sid). Lỗi 401 với code 'onboarding_session' nghĩa là chỉ có phiên tạm osid. */
export async function getSession(): Promise<Session> {
  const data = await request<{ ok: boolean; user: RawUser; onboardingStep?: unknown; appearance?: unknown }>(
    '/api/auth/me',
    'GET',
  );
  return toSession(data);
}

/** Giữ lại cho chỗ gọi cũ: chỉ trả về người dùng. */
export async function getMe(): Promise<AuthUser> {
  const session = await getSession();
  return session.user;
}

export async function getProviders(): Promise<Providers> {
  const data = await request<Partial<Record<Provider, unknown>>>('/api/auth/providers', 'GET');
  return { google: data.google === true, microsoft: data.microsoft === true };
}

/** Đăng ký không gửi mật khẩu (ONBOARDING_API mục 3.1). */
export async function register(input: { email: string; name: string }): Promise<RegisterResult> {
  const data = await request<{
    ok: boolean;
    email?: unknown;
    expiresInSeconds?: unknown;
    resendInSeconds?: unknown;
  }>('/api/auth/register', 'POST', { email: input.email, name: input.name });
  return {
    email: typeof data.email === 'string' && data.email ? data.email : input.email,
    expiresInSeconds: numberOrNull(data.expiresInSeconds),
    resendInSeconds: numberOrNull(data.resendInSeconds),
  };
}

/** Xác minh OTP. Thành công thì server cấp phiên tạm osid, chưa cấp sid. */
export async function verifyOtp(email: string, code: string): Promise<VerifyResult> {
  const data = await request<{ ok: boolean; email?: unknown; onboardingStep?: unknown }>(
    '/api/auth/verify',
    'POST',
    { email, code },
  );
  return {
    email: typeof data.email === 'string' && data.email ? data.email : email,
    onboardingStep: stepOf(data.onboardingStep, 'password'),
  };
}

/** Gửi lại mã. Server luôn trả 200 để không lộ email. */
export async function resendOtp(email: string): Promise<{ resendInSeconds: number | null }> {
  const data = await request<{ ok: boolean; resendInSeconds?: unknown }>('/api/auth/resend', 'POST', { email });
  return { resendInSeconds: numberOrNull(data.resendInSeconds) };
}

/**
 * Đăng nhập. Trả 'password_setup' khi tài khoản đã xác minh nhưng chưa có mật khẩu
 * (409 password_setup_required). Các lỗi khác vẫn ném ApiError, kể cả 403 needsVerification.
 */
export async function login(email: string, password: string): Promise<LoginResult> {
  try {
    const data = await request<{ ok: boolean; user: RawUser; onboardingStep?: unknown; appearance?: unknown }>(
      '/api/auth/login',
      'POST',
      { email, password },
    );
    return { kind: 'signed_in', session: toSession(data) };
  } catch (err) {
    if (
      err instanceof ApiError &&
      err.status === 409 &&
      (err.code === 'password_setup_required' || err.data?.onboardingStep === 'password')
    ) {
      return { kind: 'password_setup', email, resendInSeconds: numberOrNull(err.data?.resendInSeconds) };
    }
    throw err;
  }
}

/** Đặt mật khẩu bằng phiên tạm osid. Thành công thì server đổi sang sid. */
export async function setPassword(password: string): Promise<Session> {
  const data = await request<{ ok: boolean; user: RawUser; onboardingStep?: unknown }>(
    '/api/auth/password',
    'POST',
    { password },
  );
  return toSession({ user: data.user, onboardingStep: data.onboardingStep ?? 'appearance' });
}

/** Trạng thái phiên tạm osid, dùng khi tải lại trang ở bước đặt mật khẩu. */
export async function getOnboarding(): Promise<OnboardingSession> {
  const data = await request<{ ok: boolean; email?: unknown; onboardingStep?: unknown; expiresAt?: unknown }>(
    '/api/auth/onboarding',
    'GET',
  );
  return {
    email: typeof data.email === 'string' ? data.email : '',
    onboardingStep: stepOf(data.onboardingStep, 'password'),
    expiresAt: numberOrNull(data.expiresAt),
  };
}

export async function getAppearance(): Promise<{ appearance: Appearance | null; onboardingStep: OnboardingStep }> {
  const data = await request<{ ok: boolean; appearance?: unknown; onboardingStep?: unknown }>(
    '/api/auth/profile/appearance',
    'GET',
  );
  return {
    appearance: isRecord(data.appearance) ? normalizeAppearance(data.appearance) : null,
    onboardingStep: stepOf(data.onboardingStep),
  };
}

/** Lưu appearance của chính người dùng. Trả về bản đã chuẩn hóa. */
export async function putAppearance(appearance: Appearance): Promise<Appearance> {
  const data = await request<{ ok: boolean; appearance?: unknown }>('/api/auth/profile/appearance', 'PUT', appearance);
  return isRecord(data.appearance) ? normalizeAppearance(data.appearance) : normalizeAppearance(appearance);
}

/** Chuyển bước appearance sang tour. Cần đã lưu appearance (409 appearance_missing nếu chưa). */
export async function completeOnboarding(): Promise<void> {
  await request<{ ok: boolean }>('/api/auth/profile/onboarding/complete', 'POST', {});
}

/** Đánh dấu đã xem hướng dẫn (tour sang done). Gọi lại khi đã done thì server trả 200. */
export async function markTourDone(): Promise<void> {
  await request<{ ok: boolean }>('/api/auth/profile/onboarding/tour-done', 'POST', {});
}

/** Tùy chọn của chính người dùng. reactBump: có hiện phản ứng khi bị va chạm hay không (mặc định bật). */
export interface Preferences {
  reactBump: boolean;
}

export async function getPreferences(): Promise<Preferences> {
  const data = await request<{ ok: boolean; reactBump?: unknown; preferences?: unknown }>(
    '/api/auth/profile/preferences',
    'GET',
  );
  const src = isRecord(data.preferences) ? data.preferences : data;
  return { reactBump: src.reactBump !== false };
}

/** Bật hoặc tắt phản ứng khi bị va chạm. Trả về giá trị server đã lưu. */
export async function setReactBump(enabled: boolean): Promise<Preferences> {
  const data = await request<{ ok: boolean; reactBump?: unknown; preferences?: unknown }>(
    '/api/auth/profile/preferences',
    'POST',
    { reactBump: enabled },
  );
  const src = isRecord(data.preferences) ? data.preferences : data;
  return { reactBump: typeof src.reactBump === 'boolean' ? src.reactBump : enabled };
}

export async function logout(): Promise<void> {
  await request<{ ok: boolean }>('/api/auth/logout', 'POST', {});
}

/** Đường dẫn bắt đầu OAuth; trình duyệt chuyển hướng tới đó bằng window.location.href. */
export function oauthStartUrl(provider: Provider): string {
  return `/api/auth/oauth/${provider}/start`;
}
