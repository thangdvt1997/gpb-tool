// Quản lý thành viên phòng (TASK 26): chỉ hiện khi bật ?world=1 (mount trong ChatPanel) và vai trò cho phép (owner).
// Danh sách lấy từ server (member.list); kick/mute/đổi vai trò dùng mod.kick, mod.mute, role.set có sẵn.
// Hộp thoại: aria-modal, nhãn, Esc đóng, trả focus về nút mở (useFocusTrap -> trapFocus).
import { useCallback, useEffect, useState, type KeyboardEvent } from 'react';
import { useFocusTrap } from '../a11y';
import type { MemberInfo, ServerMessage } from './protocol';
import { ASSIGNABLE, ROLE_LABEL, actionsFor, canManage, modErrorText, sortMembers } from './memberLogic';
import type { WorldApi } from './useWorld';

export function MemberPanel({ world }: { world: Pick<WorldApi, 'client' | 'role' | 'state'> }) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [notice, setNotice] = useState('');
  const client = world.client.current;
  const allowed = canManage(world.role) && world.state === 'connected';

  const refresh = useCallback(() => {
    client?.send({ type: 'member.list', requestId: client.newId('m') });
  }, [client]);

  useEffect(() => {
    if (!open || !client) return undefined;
    refresh();
    return client.onMessage((m: ServerMessage) => {
      if (m.type === 'member.list') setMembers(sortMembers(m.members));
      else if (m.type === 'mod.result') {
        setNotice(m.ok ? 'Đã thực hiện' : modErrorText(m.error));
        refresh();
      } else if (m.type === 'join' || m.type === 'leave') refresh();
    });
  }, [open, client, refresh]);

  // Mất quyền hoặc mất kết nối thì đóng.
  useEffect(() => {
    if (!allowed) setOpen(false);
  }, [allowed]);

  const close = useCallback(() => setOpen(false), []);
  const ref = useFocusTrap<HTMLDivElement>({ id: 'panel:members', active: open, onClose: close });

  if (!canManage(world.role)) return null;
  const stop = (e: KeyboardEvent) => e.stopPropagation(); // phím trong hộp thoại không điều khiển nhân vật

  return (
    <>
      <button type="button" aria-haspopup="dialog" disabled={!allowed} onClick={() => setOpen(true)} style={{ marginTop: 6 }}>
        Thành viên phòng
      </button>
      {open ? (
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby="member-panel-title"
          onKeyDown={stop}
          onKeyUp={stop}
          style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 60, width: 'min(460px, 92vw)', maxHeight: '80vh', overflowY: 'auto', background: '#1c1c22', color: '#fff', borderRadius: 10, padding: 14, font: '14px system-ui, sans-serif' }}
        >
          <h2 id="member-panel-title" style={{ margin: '0 0 8px', fontSize: 16 }}>Thành viên phòng</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {members.map((m) => {
              const a = actionsFor(world.role, client?.selfId ?? null, m);
              return (
                <li key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', flexWrap: 'wrap' }}>
                  <span style={{ flex: 1 }}>
                    <strong>{m.name || m.id}</strong> ({ROLE_LABEL[m.role] ?? m.role}){m.muted ? ' - đang tắt tiếng' : ''}
                  </span>
                  {a.setRole ? (
                    <select
                      aria-label={`Vai trò của ${m.name || m.id}`}
                      value={ASSIGNABLE.includes(m.role) ? m.role : ''}
                      onChange={(e) => client?.send({ type: 'role.set', target: m.id, role: e.target.value, requestId: client.newId('m') })}
                    >
                      {ASSIGNABLE.includes(m.role) ? null : <option value="" disabled>{ROLE_LABEL[m.role]}</option>}
                      {ASSIGNABLE.map((r) => (
                        <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                      ))}
                    </select>
                  ) : null}
                  {a.mute ? (
                    <button type="button" aria-label={`${m.muted ? 'Bật tiếng' : 'Tắt tiếng'} ${m.name || m.id}`} onClick={() => client?.send({ type: 'mod.mute', target: m.id, on: !m.muted, requestId: client.newId('m') })}>
                      {m.muted ? 'Bật tiếng' : 'Tắt tiếng'}
                    </button>
                  ) : null}
                  {a.transfer ? (
                    <button
                      type="button"
                      aria-label={`Chuyển quyền chủ phòng cho ${m.name || m.id}`}
                      onClick={() => {
                        if (window.confirm(`Chuyển quyền chủ phòng cho ${m.name || m.id}? Bạn sẽ trở thành người biên tập.`)) {
                          client?.send({ type: 'owner.transfer', target: m.id, confirm: true, requestId: client.newId('m') });
                        }
                      }}
                    >
                      Chuyển quyền
                    </button>
                  ) : null}
                  {a.kick ? (
                    <button type="button" aria-label={`Mời ${m.name || m.id} ra khỏi phòng`} onClick={() => client?.send({ type: 'mod.kick', target: m.id, requestId: client.newId('m') })}>
                      Mời ra
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p role="status" aria-live="polite" style={{ minHeight: 18, margin: '8px 0' }}>{notice}</p>
          <button type="button" onClick={close}>Đóng</button>
        </div>
      ) : null}
    </>
  );
}
