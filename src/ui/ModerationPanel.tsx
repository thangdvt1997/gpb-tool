import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { AuditLog, ReportQueue, UserSearch } from '../moderation';
import type { ModRole } from '../moderation';
import '../moderation/moderation.css';

type TabId = 'queue' | 'users' | 'audit';

/**
 * Vai trò truyền vào là string vì kiểu Role của app (content/types.ts) chưa có 'moderator'.
 * Chỉ 'moderator' và 'admin' thấy nội dung; vai trò khác thấy thông báo không đủ quyền.
 */
export function isModRole(role: string): role is ModRole {
  return role === 'moderator' || role === 'admin';
}

export function ModerationPanel({ role }: { role: string }) {
  const [tab, setTab] = useState<TabId>('queue');

  if (!isModRole(role)) {
    return <p className="ui-banner ui-banner-warn">Chỉ kiểm duyệt viên và quản trị viên được dùng khu này.</p>;
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'queue', label: 'Hàng đợi' },
    { id: 'users', label: 'Người dùng' },
    ...(role === 'admin' ? [{ id: 'audit' as const, label: 'Nhật ký' }] : []),
  ];

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = (index + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
    setTab(tabs[next].id);
    document.getElementById(`mod-tab-${tabs[next].id}`)?.focus();
  };

  return (
    <div className="mod-root">
      <div className="ui-tabs" role="tablist" aria-label="Kiểm duyệt">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            id={`mod-tab-${t.id}`}
            type="button"
            role="tab"
            className="ui-tab"
            aria-selected={tab === t.id}
            aria-controls={`mod-tabpanel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id={`mod-tabpanel-${tab}`} role="tabpanel" aria-labelledby={`mod-tab-${tab}`}>
        {tab === 'queue' && <ReportQueue />}
        {tab === 'users' && <UserSearch role={role} />}
        {tab === 'audit' && role === 'admin' && <AuditLog />}
      </div>
    </div>
  );
}
