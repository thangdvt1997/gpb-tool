import type { LoadError } from './types';

export interface BackoffOptions { baseMs: number; maxMs: number; factor: number }
export const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 500, maxMs: 15000, factor: 2 };

/** "Equal jitter": nửa cố định + nửa ngẫu nhiên. random() trả [0,1), inject để test. */
export function computeBackoff(attempt: number, opt: BackoffOptions, random: () => number): number {
  const exp = Math.min(opt.maxMs, opt.baseMs * Math.pow(opt.factor, Math.max(0, attempt)));
  const r = Math.min(0.999999, Math.max(0, random()));
  return Math.round(exp / 2 + (exp / 2) * r);
}

/** Bỏ query/hash (có thể là signed URL) trước khi ghi log/hiển thị. */
export function redactUrl(url: string): string {
  const i = url.search(/[?#]/);
  return i < 0 ? url : url.slice(0, i);
}

export function classifyHttp(status: number): LoadError {
  if (status === 401 || status === 403 || status === 410) {
    return { code: 'expired', status, message: `HTTP ${status}: quyền truy cập/URL hết hạn`, retryable: false };
  }
  const retryable = status === 408 || status === 425 || status === 429 || status >= 500;
  return { code: 'http', status, message: `HTTP ${status}`, retryable };
}

/** Chuẩn hóa lỗi bất kỳ thành LoadError; chỉ lỗi tạm thời mới retryable. */
export function normalizeError(e: unknown): LoadError {
  if (e && typeof e === 'object') {
    const o = e as { code?: string; status?: number; name?: string; message?: string; retryable?: boolean };
    if (o.code && ['network', 'timeout', 'http', 'decode', 'unsupported', 'cors', 'expired', 'cancelled', 'unknown'].includes(o.code)) {
      const code = o.code as LoadError['code'];
      const retryable = o.retryable ?? (code === 'network' || code === 'timeout');
      return { code, status: o.status, message: sanitize(o.message ?? code), retryable };
    }
    if (typeof o.status === 'number') return classifyHttp(o.status);
    if (o.name === 'AbortError') return { code: 'cancelled', message: 'cancelled', retryable: false };
    if (o.name === 'TypeError') return { code: 'network', message: 'network error', retryable: true };
    if (o.message) return { code: 'unknown', message: sanitize(o.message), retryable: false };
  }
  return { code: 'unknown', message: 'unknown error', retryable: false };
}

function sanitize(m: string): string {
  return m.replace(/https?:\/\/[^\s)]+/g, (u) => redactUrl(u));
}
