import { useEffect, useState } from 'react';
import { listAudit } from './api';
import { ModNotice } from './ModNotice';
import { ACTION_LABEL } from './types';
import type { AuditEntry } from './types';

function fmt(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN');
}

/** Tab Nhật ký (chỉ admin). Máy chủ trả 403 nếu không phải admin. */
export function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setEntries(null);
    listAudit().then((r) => {
      if (!alive) return;
      if (r.ok) {
        setEntries(r.data);
        setError(null);
      } else {
        setEntries([]);
        setError(r.error);
      }
    });
    return () => {
      alive = false;
    };
  }, [tick]);

  return (
    <div>
      <div className="mod-row">
        <p className="ui-hint">Nhật ký chỉ thêm, không sửa và không xóa.</p>
        <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setTick((t) => t + 1)}>
          Tải lại
        </button>
      </div>
      <ModNotice notice={error ? { kind: 'err', text: error } : null} />
      {!entries && <p className="ui-empty">Đang tải nhật ký…</p>}
      {entries && entries.length === 0 && !error && <p className="ui-empty">Chưa có hành động nào.</p>}
      {entries && entries.length > 0 && (
        <div className="ui-scroll-x">
          <table className="mod-table">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Hành động</th>
                <th>Người thực hiện</th>
                <th>Đối tượng</th>
                <th>Lý do</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((a) => (
                <tr key={a.id}>
                  <td>{fmt(a.at)}</td>
                  <td>
                    {ACTION_LABEL[a.action] ?? a.action}
                    {a.action === 'ban' && (
                      <div className="ui-muted">{a.banUntil ? `đến ${fmt(a.banUntil)}` : 'vĩnh viễn'}</div>
                    )}
                  </td>
                  <td>{a.actorName ?? a.actorId ?? ''}</td>
                  <td>{a.targetName ?? a.targetUserId ?? ''}</td>
                  <td>{a.reason ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
