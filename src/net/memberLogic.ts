// Logic thuần cho UI quản lý thành viên (TASK 26). Bản sao ma trận quyền của services/world/src/roles.js,
// CHỈ để ẩn/hiện nút; server vẫn kiểm bằng can() mỗi message nên client sửa cũng không vượt quyền.
import type { MemberInfo, Role } from './protocol';

export const ROLE_LABEL: Record<Role, string> = { guest: 'Khách', member: 'Thành viên', editor: 'Biên tập', owner: 'Chủ phòng' };

/** Vai trò mà owner được gán (không cấp owner, khớp cannot_grant_owner). */
export const ASSIGNABLE: readonly Role[] = ['member', 'editor'];

const MANAGE: readonly Role[] = ['owner'];

/** Có hiện UI quản lý không: chỉ owner (member.list, member.kick, member.mute, role.set). */
export function canManage(role: string): boolean {
  return (MANAGE as readonly string[]).includes(role);
}

export interface MemberActions {
  kick: boolean;
  mute: boolean;
  setRole: boolean;
  /** Chuyển quyền chủ phòng (owner.transfer). */
  transfer: boolean;
}

/** Nút nào dùng được cho một thành viên: không với chính mình hoặc owner khác. */
export function actionsFor(selfRole: string, selfId: string | null, m: MemberInfo): MemberActions {
  const ok = canManage(selfRole) && m.id !== selfId && m.role !== 'owner';
  return { kick: ok, mute: ok, setRole: ok, transfer: ok };
}

/** Owner trước, rồi theo tên (không phân biệt hoa thường) để danh sách ổn định. */
export function sortMembers(list: readonly MemberInfo[]): MemberInfo[] {
  const rank: Record<string, number> = { owner: 0, editor: 1, member: 2, guest: 3 };
  return [...list].sort((a, b) => (rank[a.role] ?? 9) - (rank[b.role] ?? 9) || a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' }));
}

const ERR: Record<string, string> = {
  forbidden: 'Bạn không có quyền này',
  target_not_found: 'Người này đã rời phòng',
  cannot_target_self: 'Không thể tác động lên chính mình',
  cannot_target_owner: 'Không thể tác động lên chủ phòng',
  cannot_grant_owner: 'Không thể cấp vai trò chủ phòng',
  invalid_role: 'Vai trò không hợp lệ',
  confirm_required: 'Cần xác nhận để chuyển quyền',
  rate_limited: 'Thao tác quá nhanh, thử lại sau',
};

export function modErrorText(code: string | undefined): string {
  return (code && ERR[code]) || 'Thao tác không thành công';
}
