import { api } from '../ui/api';
import type { ApiResult } from '../ui/api';
import type { AuditEntry, CreateReportInput, ModUser, Report, ReportStatus, ResolveInput } from './types';

const BASE = '/api/auth/moderation';

/**
 * Đổi mã lỗi HTTP và mã lỗi của server (ví dụ cannot_target_self) sang câu tiếng Việt.
 * Mã 403, 404, 409, 422 theo MODERATION.md mục 4 và 5.
 */
export function describeError(status: number, code: string): string {
  switch (status) {
    case 0:
      return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
    case 401:
      return 'Phiên đăng nhập đã hết hạn hoặc tài khoản đã bị khóa. Hãy đăng nhập lại.';
    case 403:
      if (code === 'cannot_target_self') return 'Bạn không thể thao tác lên chính tài khoản của mình.';
      if (code === 'account_banned') return 'Tài khoản đã bị khóa.';
      return 'Bạn không đủ quyền với thao tác hoặc đối tượng này. Kiểm duyệt viên chỉ khóa được nhân viên và IT.';
    case 404:
      return 'Không tìm thấy báo cáo hoặc người dùng. Có thể mục này đã bị xóa, hãy tải lại danh sách.';
    case 409:
      return 'Tài khoản này đã bị khóa từ trước hoặc báo cáo đã được xử lý. Hãy tải lại danh sách.';
    case 422:
      if (code === 'content_rejected') return 'Nội dung chứa từ ngữ không phù hợp. Hãy sửa lại.';
      return 'Dữ liệu chưa hợp lệ. Lý do bắt buộc (tối đa 300 ký tự), thời hạn khóa từ 1 đến 3650 ngày.';
    case 429:
      return 'Bạn thao tác quá nhanh. Thử lại sau ít phút.';
    default:
      return status >= 500 ? 'Máy chủ đang gặp lỗi. Thử lại sau.' : 'Yêu cầu chưa thành công. Thử lại.';
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Lấy chuỗi từ nhiều tên khóa (camelCase hoặc snake_case). */
function str(o: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v !== '') return v;
    if (typeof v === 'number') return String(v);
  }
  return null;
}

/** Danh sách có thể là mảng trần hoặc bọc trong một khóa. */
function listOf(data: unknown, ...keys: string[]): Record<string, unknown>[] {
  let arr: unknown = data;
  if (isRecord(data)) {
    arr = undefined;
    for (const k of keys) {
      if (Array.isArray(data[k])) {
        arr = data[k];
        break;
      }
    }
  }
  return Array.isArray(arr) ? arr.filter(isRecord) : [];
}

function toReport(o: Record<string, unknown>): Report {
  const status = str(o, 'status') === 'resolved' ? 'resolved' : 'open';
  return {
    id: str(o, 'id') ?? '',
    contentType: str(o, 'contentType', 'content_type') ?? 'user',
    contentId: str(o, 'contentId', 'content_id'),
    targetUserId: str(o, 'targetUserId', 'target_user_id'),
    targetName: str(o, 'targetName', 'target_name'),
    reporterName: str(o, 'reporterName', 'reporter_name'),
    reason: str(o, 'reason') ?? '',
    snapshot: str(o, 'snapshot') ?? '',
    status,
    createdAt: str(o, 'createdAt', 'created_at', 'at'),
    resolution: str(o, 'resolution', 'resolvedAction', 'resolved_action'),
  };
}

function toUser(o: Record<string, unknown>): ModUser {
  return {
    id: str(o, 'id') ?? '',
    email: str(o, 'email') ?? '',
    name: str(o, 'name') ?? '',
    role: str(o, 'role') ?? 'employee',
    status: str(o, 'status') === 'banned' ? 'banned' : 'active',
    banUntil: str(o, 'banUntil', 'ban_until'),
    banReason: str(o, 'banReason', 'ban_reason'),
  };
}

function toAudit(o: Record<string, unknown>): AuditEntry {
  return {
    id: str(o, 'id') ?? '',
    at: str(o, 'at', 'createdAt', 'created_at'),
    actorId: str(o, 'actorId', 'actor_id'),
    actorName: str(o, 'actorName', 'actor_name'),
    action: str(o, 'action') ?? '',
    targetUserId: str(o, 'targetUserId', 'target_user_id'),
    targetName: str(o, 'targetName', 'target_name'),
    reportId: str(o, 'reportId', 'report_id'),
    reason: str(o, 'reason'),
    banUntil: str(o, 'banUntil', 'ban_until'),
  };
}

/** Gọi API và đổi lỗi sang tiếng Việt: trường error của kết quả lỗi là câu hiển thị được. */
async function call<T, R>(path: string, init: RequestInit | undefined, map: (data: T) => R): Promise<ApiResult<R>> {
  const r = await api<T>(`${BASE}${path}`, { credentials: 'same-origin', ...init });
  if (r.ok) return { ok: true, data: map(r.data) };
  return { ok: false, status: r.status, error: describeError(r.status, r.error) };
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export function listReports(status: ReportStatus): Promise<ApiResult<Report[]>> {
  return call<unknown, Report[]>(`/reports?status=${status}`, undefined, (d) => listOf(d, 'reports', 'items').map(toReport));
}

export function createReport(input: CreateReportInput): Promise<ApiResult<null>> {
  const body: Record<string, unknown> = {
    contentType: input.contentType,
    reason: input.reason,
    snapshot: input.snapshot,
  };
  if (input.contentId !== undefined) body.contentId = String(input.contentId);
  if (input.targetUserId !== undefined) {
    // Backend auth yêu cầu targetUserId là số nguyên (id người dùng là INTEGER), chuỗi bị từ chối 422.
    const n = Number(input.targetUserId);
    body.targetUserId = Number.isSafeInteger(n) && n > 0 ? n : input.targetUserId;
  }
  return call<unknown, null>('/reports', post(body), () => null);
}

export function resolveReport(id: string, input: ResolveInput): Promise<ApiResult<null>> {
  return call<unknown, null>(`/reports/${encodeURIComponent(id)}/resolve`, post(input), () => null);
}

export function searchUsers(query: string): Promise<ApiResult<ModUser[]>> {
  return call<unknown, ModUser[]>(`/users?query=${encodeURIComponent(query)}`, undefined, (d) =>
    listOf(d, 'users', 'items').map(toUser),
  );
}

/** banDays null = khóa vĩnh viễn. */
export function banUser(id: string, reason: string, banDays: number | null): Promise<ApiResult<null>> {
  return call<unknown, null>(`/users/${encodeURIComponent(id)}/ban`, post({ reason, banDays }), () => null);
}

export function unbanUser(id: string, reason: string): Promise<ApiResult<null>> {
  return call<unknown, null>(`/users/${encodeURIComponent(id)}/unban`, post({ reason }), () => null);
}

export function listAudit(): Promise<ApiResult<AuditEntry[]>> {
  return call<unknown, AuditEntry[]>('/audit', undefined, (d) => listOf(d, 'actions', 'entries', 'items').map(toAudit));
}
