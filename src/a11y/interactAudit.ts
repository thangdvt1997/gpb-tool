/**
 * Bộ kiểm tra danh sách vật tương tác: mỗi vật và mỗi hành động phải có nhãn đọc được.
 * Kiểu cấu trúc tối giản, tương thích InteractableDef (scene/interact/registry), không import runtime.
 */

export interface AuditableAction {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  label: string | ((ctx: any) => string);
}

export interface AuditableInteractable {
  id: string;
  kind?: string;
  label: string;
  actions: readonly AuditableAction[];
}

export interface AuditIssue {
  id: string;
  severity: 'error' | 'warn';
  message: string;
}

/** Nhãn tệ: rỗng, quá ngắn, chỉ ký hiệu, trùng id, hoặc dạng mã thô như "chair_03". */
export function isReadableLabel(label: string, id?: string): boolean {
  const t = label.trim();
  if (t.length < 2) return false;
  if (!/[\p{L}\p{N}]/u.test(t)) return false;
  if (id && t.toLowerCase() === id.toLowerCase()) return false;
  if (/^[a-z]+(?:[_-]\d+)+$/i.test(t)) return false;
  return true;
}

export function auditInteractables(list: readonly AuditableInteractable[]): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const seen = new Set<string>();
  const labels = new Map<string, string>();
  for (const it of list) {
    if (!it.id) {
      issues.push({ id: '(không id)', severity: 'error', message: 'Vật không có id' });
      continue;
    }
    if (seen.has(it.id)) issues.push({ id: it.id, severity: 'error', message: 'Trùng id' });
    seen.add(it.id);
    if (!isReadableLabel(it.label ?? '', it.id)) {
      issues.push({ id: it.id, severity: 'error', message: `Nhãn không đọc được: "${it.label ?? ''}"` });
    } else {
      const key = it.label.trim().toLowerCase();
      const prev = labels.get(key);
      if (prev && prev !== it.id) {
        issues.push({
          id: it.id,
          severity: 'warn',
          message: `Nhãn trùng với "${prev}": người dùng trình đọc màn hình khó phân biệt`,
        });
      } else labels.set(key, it.id);
    }
    if (it.actions.length === 0) {
      issues.push({ id: it.id, severity: 'warn', message: 'Không có hành động nào' });
    }
    const actionIds = new Set<string>();
    for (const a of it.actions) {
      if (actionIds.has(a.id)) issues.push({ id: it.id, severity: 'error', message: `Trùng id hành động "${a.id}"` });
      actionIds.add(a.id);
      // Nhãn dạng hàm phụ thuộc trạng thái: không gọi được ở đây, chỉ kiểm nhãn tĩnh.
      if (typeof a.label === 'string' && !isReadableLabel(a.label)) {
        issues.push({ id: it.id, severity: 'error', message: `Hành động "${a.id}" nhãn không đọc được` });
      }
    }
  }
  return issues;
}

export const hasErrors = (issues: readonly AuditIssue[]) => issues.some((i) => i.severity === 'error');
