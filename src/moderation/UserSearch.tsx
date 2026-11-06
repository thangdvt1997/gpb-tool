import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Notice } from '../ui/api';
import { banUser, searchUsers, unbanUser } from './api';
import { ModNotice } from './ModNotice';
import { ReasonDialog } from './ReasonDialog';
import type { ReasonValue } from './ReasonDialog';
import { ROLE_LABEL } from './types';
import type { ModRole, ModUser } from './types';

function fmt(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN');
}

/** Gợi ý giao diện theo MODERATION.md mục 5. Máy chủ vẫn là nơi quyết định (403). */
function canBan(viewer: ModRole, target: ModUser): boolean {
  if (target.role === 'admin') return false;
  if (target.role === 'moderator') return viewer === 'admin';
  return true;
}

function banText(u: ModUser): string {
  if (u.status !== 'banned') return 'Đang hoạt động';
  return u.banUntil ? `Bị khóa đến ${fmt(u.banUntil)}` : 'Bị khóa vĩnh viễn';
}

interface Pending {
  user: ModUser;
  kind: 'ban' | 'unban';
}

/** Tab Người dùng: tìm theo email hoặc tên, khóa hoặc mở khóa. */
export function UserSearch({ role }: { role: ModRole }) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<ModUser[] | null>(null);
  const [searched, setSearched] = useState('');
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const run = async (q: string) => {
    setSearching(true);
    const r = await searchUsers(q);
    setSearching(false);
    if (r.ok) {
      setUsers(r.data);
      setSearched(q);
      return true;
    }
    setNotice({ kind: 'err', text: r.error });
    return false;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      setNotice({ kind: 'err', text: 'Nhập ít nhất 2 ký tự của email hoặc tên.' });
      return;
    }
    setNotice(null);
    await run(q);
  };

  const closeDialog = () => {
    setPending(null);
    setDialogError(null);
  };

  const confirm = async (v: ReasonValue) => {
    if (!pending) return;
    setBusy(true);
    setDialogError(null);
    const r =
      pending.kind === 'ban'
        ? await banUser(pending.user.id, v.reason, v.banDays)
        : await unbanUser(pending.user.id, v.reason);
    setBusy(false);
    if (!r.ok) {
      setDialogError(r.error);
      return;
    }
    const name = pending.user.name || pending.user.email;
    setNotice({ kind: 'ok', text: pending.kind === 'ban' ? `Đã khóa ${name}.` : `Đã mở khóa ${name}.` });
    closeDialog();
    await run(searched);
  };

  return (
    <div>
      <form className="mod-form" onSubmit={submit} role="search">
        <label className="ui-field">
          <span className="ui-label">Tìm theo email hoặc tên</span>
          <input
            className="ui-input"
            type="search"
            value={query}
            maxLength={100}
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button type="submit" className="ui-btn ui-btn-primary" disabled={searching}>
          {searching ? 'Đang tìm…' : 'Tìm'}
        </button>
      </form>

      <ModNotice notice={notice} />

      {users && users.length === 0 && <p className="ui-empty">Không tìm thấy người dùng nào.</p>}

      <ul className="ui-list">
        {users?.map((u) => (
          <li key={u.id} className="ui-list-item">
            <div className="ui-list-item-main">
              <strong className="ui-list-item-title mod-clip">{u.name || '(chưa có tên)'}</strong>
              <span className="ui-list-item-meta mod-clip">{u.email}</span>
              <span className="mod-user-status">
                <span className="ui-list-item-meta">{ROLE_LABEL[u.role] ?? u.role}</span>
                <span className={u.status === 'banned' ? 'ui-badge ui-badge-danger' : 'ui-badge ui-badge-ok'}>
                  {banText(u)}
                </span>
              </span>
              {u.status === 'banned' && u.banReason && (
                <span className="ui-list-item-meta">Lý do: {u.banReason}</span>
              )}
            </div>
            {u.status === 'banned' ? (
              <button type="button" className="ui-btn" onClick={() => setPending({ user: u, kind: 'unban' })}>
                Mở khóa
              </button>
            ) : (
              <button
                type="button"
                className="ui-btn ui-btn-danger"
                disabled={!canBan(role, u)}
                title={canBan(role, u) ? undefined : 'Bạn không có quyền khóa tài khoản này'}
                onClick={() => setPending({ user: u, kind: 'ban' })}
              >
                Khóa
              </button>
            )}
          </li>
        ))}
      </ul>

      {pending && (
        <ReasonDialog
          title={pending.kind === 'ban' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
          description={`${pending.user.name || pending.user.email} (${pending.user.email})`}
          confirmLabel={pending.kind === 'ban' ? 'Khóa tài khoản' : 'Mở khóa'}
          withDuration={pending.kind === 'ban'}
          danger={pending.kind === 'ban'}
          busy={busy}
          error={dialogError}
          onConfirm={confirm}
          onCancel={closeDialog}
        />
      )}
    </div>
  );
}
