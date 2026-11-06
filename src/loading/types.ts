export type Priority = 'critical' | 'high' | 'normal' | 'low';
export type AssetStatus = 'queued' | 'loading' | 'retrying' | 'loaded' | 'failed' | 'cancelled' | 'fallback';

export type LoadErrorCode =
  | 'network' | 'timeout' | 'http' | 'decode' | 'unsupported' | 'cors' | 'expired' | 'cancelled' | 'unknown';

export interface LoadError {
  code: LoadErrorCode;
  /** HTTP status nếu có. */
  status?: number;
  /** Thông điệp đã làm sạch (không chứa query/signed URL). */
  message: string;
  retryable: boolean;
}

export interface FetchProgress { loaded: number; total?: number }

export interface FetchContext {
  signal: AbortSignal;
  attempt: number;
  /** Fetcher báo tiến độ byte nếu biết. */
  onProgress: (p: FetchProgress) => void;
}

export type Fetcher<T = unknown> = (req: AssetRequest<T>, ctx: FetchContext) => Promise<T>;

export interface AssetRequest<T = unknown> {
  key: string;
  /** Version/hash; cache và dedupe theo key+version. */
  version?: string;
  url: string;
  priority?: Priority;
  /** Critical: lỗi thì không fallback, phải có màn hình phục hồi. */
  critical?: boolean;
  /** Placeholder nhận diện được cho asset tùy chọn lỗi. */
  fallback?: T;
  /** Nhóm "chỉ một đang hiệu lực" (vd slot áo): request mới hủy request cũ cùng group. */
  group?: string;
  /** Ghi đè cho fetcher/adapter (vd URL hết hạn). */
  meta?: Record<string, unknown>;
}

export type LoadResult<T> =
  | { status: 'loaded'; value: T; fromCache: boolean }
  | { status: 'fallback'; value: T; error: LoadError }
  | { status: 'failed'; error: LoadError }
  | { status: 'cancelled' };

export interface AssetState {
  key: string;
  id: string;
  status: AssetStatus;
  attempt: number;
  critical: boolean;
  error?: LoadError;
  bytes?: FetchProgress;
  /** thời điểm (ms) retry kế tiếp nếu status = retrying. */
  retryAt?: number;
}

export interface Progress {
  total: number;
  done: number; // loaded + fallback + failed + cancelled
  loaded: number;
  failed: number;
  /** null nếu không biết tổng byte: UI hiển thị theo số mục/không xác định. */
  bytePercent: number | null;
  criticalPending: number;
}
