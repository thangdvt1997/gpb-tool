// @ts-ignore tsconfig không có kiểu node; vitest chạy trong node.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { actionsFor, canManage, modErrorText, sortMembers } from './memberLogic';
import type { MemberInfo } from './protocol';

const m = (id: string, role: MemberInfo['role'], name = id): MemberInfo => ({ id, name, role, muted: false });

describe('memberLogic', () => {
  it('chỉ owner được quản lý', () => {
    expect(canManage('owner')).toBe(true);
    for (const r of ['editor', 'member', 'guest', 'x']) expect(canManage(r)).toBe(false);
  });
  it('không có nút cho chính mình hoặc owner khác', () => {
    expect(actionsFor('owner', 'o', m('o', 'owner')).kick).toBe(false);
    expect(actionsFor('owner', 'o', m('p', 'owner')).setRole).toBe(false);
    expect(actionsFor('owner', 'o', m('a', 'member'))).toEqual({ kick: true, mute: true, setRole: true, transfer: true });
    expect(actionsFor('editor', 'e', m('a', 'member')).kick).toBe(false);
  });
  it('sắp xếp owner trước, rồi theo tên', () => {
    expect(sortMembers([m('1', 'member', 'B'), m('2', 'owner', 'Z'), m('3', 'member', 'A')]).map((x) => x.id)).toEqual(['2', '3', '1']);
  });
  it('thông báo lỗi tiếng Việt', () => {
    expect(modErrorText('cannot_target_owner')).toMatch(/chủ phòng/);
    expect(modErrorText(undefined)).toMatch(/không thành công/);
  });
  it('MemberPanel: dialog có aria-modal, nhãn, dùng focus trap (Esc, trả focus)', () => {
    const s = readFileSync('src/net/MemberPanel.tsx', 'utf8');
    expect(s).toMatch(/role="dialog"/);
    expect(s).toMatch(/aria-modal="true"/);
    expect(s).toMatch(/aria-labelledby="member-panel-title"/);
    expect(s).toMatch(/useFocusTrap/);
  });
});
