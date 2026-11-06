/** Kiểu dữ liệu kiểm duyệt. Hợp đồng: docs/design/MODERATION.md mục 3, 4, 6. */

/** Vai trò được vào panel kiểm duyệt. */
export type ModRole = 'moderator' | 'admin';

export type ContentType = 'kudos' | 'program' | 'event' | 'user';
export type ReportStatus = 'open' | 'resolved';
export type ResolveAction = 'dismiss' | 'warn' | 'ban';
export type AccountStatus = 'active' | 'banned';

export const CONTENT_TYPE_LABEL: Record<string, string> = {
  kudos: 'Lời vinh danh',
  program: 'Tiết mục',
  event: 'Sự kiện',
  user: 'Người dùng',
};

export const ROLE_LABEL: Record<string, string> = {
  employee: 'Nhân viên',
  it: 'IT',
  moderator: 'Kiểm duyệt viên',
  admin: 'Quản trị viên',
};

export const ACTION_LABEL: Record<string, string> = {
  ban: 'Khóa',
  unban: 'Mở khóa',
  warn: 'Cảnh cáo',
  dismiss: 'Bỏ qua',
  resolve: 'Xử lý báo cáo',
};

/** Giới hạn theo hợp đồng. */
export const MAX_REASON = 300;
export const MAX_SNAPSHOT = 500;
export const MIN_BAN_DAYS = 1;
export const MAX_BAN_DAYS = 3650;

export interface Report {
  id: string;
  contentType: string;
  contentId: string | null;
  targetUserId: string | null;
  targetName: string | null;
  reporterName: string | null;
  reason: string;
  snapshot: string;
  status: ReportStatus;
  createdAt: string | null;
  resolution: string | null;
}

export interface ModUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: AccountStatus;
  /** null khi status là banned nghĩa là khóa vĩnh viễn. */
  banUntil: string | null;
  banReason: string | null;
}

export interface AuditEntry {
  id: string;
  at: string | null;
  actorId: string | null;
  actorName: string | null;
  action: string;
  targetUserId: string | null;
  targetName: string | null;
  reportId: string | null;
  reason: string | null;
  banUntil: string | null;
}

export interface CreateReportInput {
  contentType: ContentType;
  contentId?: string | number;
  targetUserId?: string | number;
  reason: string;
  snapshot: string;
}

export interface ResolveInput {
  action: ResolveAction;
  reason?: string;
  banDays?: number | null;
}
