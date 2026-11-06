import { useEffect, useState } from 'react';
import type { Notice } from '../ui/api';
import { listReports, resolveReport } from './api';
import { ModNotice } from './ModNotice';
import { ReasonDialog } from './ReasonDialog';
import type { ReasonValue } from './ReasonDialog';
import { ACTION_LABEL, CONTENT_TYPE_LABEL } from './types';
import type { Report, ReportStatus, ResolveAction } from './types';

function fmt(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN');
}

const STATUS_TABS: { value: ReportStatus; label: string }[] = [
  { value: 'open', label: 'Chưa xử lý' },
  { value: 'resolved', label: 'Đã xử lý' },
];

const DIALOGS: Record<
  ResolveAction,
  { title: string; confirm: string; required: boolean; danger: boolean; duration: boolean; text: string }
> = {
  warn: {
    title: 'Cảnh cáo người bị báo cáo',
    confirm: 'Gửi cảnh cáo',
    required: true,
    danger: false,
    duration: false,
    text: 'Báo cáo sẽ chuyển sang đã xử lý và hành động được ghi vào nhật ký.',
  },
  dismiss: {
    title: 'Bỏ qua báo cáo',
    confirm: 'Bỏ qua báo cáo',
    required: false,
    danger: false,
    duration: false,
    text: 'Báo cáo được đóng mà không xử lý người dùng.',
  },
  ban: {
    title: 'Khóa tài khoản người bị báo cáo',
    confirm: 'Khóa tài khoản',
    required: true,
    danger: true,
    duration: true,
    text: 'Người bị khóa sẽ bị đăng xuất ở yêu cầu kế tiếp. Lý do được ghi vào nhật ký.',
  },
};

/** Tab Hàng đợi: danh sách báo cáo, xem chi tiết, cảnh cáo, bỏ qua hoặc khóa. */
export function ReportQueue() {
  const [status, setStatus] = useState<ReportStatus>('open');
  const [reports, setReports] = useState<Report[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [action, setAction] = useState<ResolveAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let alive = true;
    setReports(null);
    listReports(status).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setReports(r.data);
        setLoadError(null);
      } else {
        setReports([]);
        setLoadError(r.error);
      }
    });
    return () => {
      alive = false;
    };
  }, [status, tick]);

  const selected = reports?.find((r) => r.id === selectedId) ?? null;

  const changeStatus = (s: ReportStatus) => {
    setStatus(s);
    setSelectedId(null);
    setNotice(null);
  };

  const closeDialog = () => {
    setAction(null);
    setDialogError(null);
  };

  const confirm = async (v: ReasonValue) => {
    if (!selected || !action) return;
    setBusy(true);
    setDialogError(null);
    const r = await resolveReport(selected.id, {
      action,
      ...(v.reason ? { reason: v.reason } : {}),
      ...(action === 'ban' ? { banDays: v.banDays } : {}),
    });
    setBusy(false);
    if (r.ok) {
      setNotice({ kind: 'ok', text: `Đã xử lý báo cáo: ${ACTION_LABEL[action]}.` });
      closeDialog();
      setSelectedId(null);
      setTick((t) => t + 1);
    } else {
      setDialogError(r.error);
    }
  };

  const cfg = action ? DIALOGS[action] : null;

  return (
    <div>
      <div className="mod-row">
        <div className="ui-actions" role="group" aria-label="Lọc báo cáo">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              className="ui-btn"
              aria-pressed={status === t.value}
              onClick={() => changeStatus(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setTick((t) => t + 1)}>
          Tải lại
        </button>
      </div>

      <ModNotice notice={loadError ? { kind: 'err', text: loadError } : notice} />

      {!reports && <p className="ui-empty">Đang tải báo cáo…</p>}
      {reports && reports.length === 0 && !loadError && <p className="ui-empty">Không có báo cáo nào.</p>}

      <ul className="ui-list">
        {reports?.map((r) => (
          <li key={r.id} className="mod-report-row">
            <button
              type="button"
              className="ui-list-item"
              aria-current={r.id === selectedId ? 'true' : undefined}
              aria-expanded={r.id === selectedId}
              onClick={() => setSelectedId(r.id === selectedId ? null : r.id)}
            >
              <span className="ui-list-item-main">
                <strong className="ui-list-item-title">{CONTENT_TYPE_LABEL[r.contentType] ?? r.contentType}</strong>
                <span className="ui-list-item-meta mod-clip">{r.reason}</span>
              </span>
              <span className="ui-list-item-meta">{fmt(r.createdAt)}</span>
            </button>

            {r.id === selectedId && (
              <div className="ui-list-item-detail mod-detail">
                <dl className="mod-dl">
                  {r.reporterName && (
                    <>
                      <dt>Người báo cáo</dt>
                      <dd>{r.reporterName}</dd>
                    </>
                  )}
                  {r.targetName && (
                    <>
                      <dt>Người bị báo cáo</dt>
                      <dd>{r.targetName}</dd>
                    </>
                  )}
                  <dt>Lý do báo cáo</dt>
                  <dd>{r.reason}</dd>
                </dl>
                <p className="ui-hint">Bản chụp nội dung tại thời điểm báo cáo:</p>
                <blockquote className="ui-quote">{r.snapshot || '(không có bản chụp)'}</blockquote>

                {r.status === 'open' ? (
                  <div className="ui-actions">
                    <button type="button" className="ui-btn" onClick={() => setAction('warn')}>
                      Cảnh cáo
                    </button>
                    <button type="button" className="ui-btn" onClick={() => setAction('dismiss')}>
                      Bỏ qua
                    </button>
                    <button
                      type="button"
                      className="ui-btn ui-btn-danger"
                      disabled={!r.targetUserId}
                      onClick={() => setAction('ban')}
                    >
                      Khóa
                    </button>
                  </div>
                ) : (
                  <p className="ui-hint">
                    Đã xử lý{r.resolution ? `: ${ACTION_LABEL[r.resolution] ?? r.resolution}` : ''}.
                  </p>
                )}
                {r.status === 'open' && !r.targetUserId && (
                  <p className="ui-hint">Báo cáo này không gắn với người dùng nên không thể khóa.</p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {cfg && selected && (
        <ReasonDialog
          title={cfg.title}
          description={cfg.text}
          confirmLabel={cfg.confirm}
          reasonRequired={cfg.required}
          withDuration={cfg.duration}
          danger={cfg.danger}
          busy={busy}
          error={dialogError}
          onConfirm={confirm}
          onCancel={closeDialog}
        />
      )}
    </div>
  );
}
