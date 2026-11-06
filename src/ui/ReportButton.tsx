import { useState } from 'react';
import type { FormEvent } from 'react';
import { ModDialog } from '../moderation/ModDialog';
import { ModNotice } from '../moderation/ModNotice';
import { createReport } from '../moderation/api';
import { MAX_REASON, MAX_SNAPSHOT } from '../moderation/types';
import type { ContentType } from '../moderation/types';

interface Props {
  contentType: ContentType;
  contentId?: string | number;
  targetUserId?: string | number;
  /** Nội dung đang xem. Được cắt còn tối đa 500 ký tự trước khi gửi. */
  snapshot: string;
  /** Nhãn nút. Mặc định "Báo cáo". */
  label?: string;
  /** Mô tả cho trình đọc màn hình, ví dụ tên tiết mục. */
  ariaLabel?: string;
}

/** Cắt tối đa n ký tự, không để lại nửa cặp surrogate (emoji). */
export function clipSnapshot(text: string, n: number = MAX_SNAPSHOT): string {
  const clean = text.trim();
  if (clean.length <= n) return clean;
  const cut = clean.slice(0, n);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/** Nút báo cáo dùng chung: mở hộp xác nhận, gửi kèm bản chụp nội dung. */
export function ReportButton({ contentType, contentId, targetUserId, snapshot, label = 'Báo cáo', ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const clipped = clipSnapshot(snapshot);

  const close = () => {
    setOpen(false);
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('Vui lòng nhập lý do báo cáo.');
      return;
    }
    setBusy(true);
    setError(null);
    const r = await createReport({
      contentType,
      ...(contentId !== undefined ? { contentId } : {}),
      ...(targetUserId !== undefined ? { targetUserId } : {}),
      reason: trimmed,
      snapshot: clipped,
    });
    setBusy(false);
    if (r.ok) {
      setSent(true);
      setReason('');
      close();
    } else {
      setError(r.error);
    }
  };

  return (
    <>
      <button
        type="button"
        className="ui-btn ui-btn-ghost"
        aria-label={ariaLabel ? `${label}: ${ariaLabel}` : undefined}
        onClick={() => {
          setSent(false);
          setOpen(true);
        }}
      >
        {sent ? 'Đã báo cáo' : label}
      </button>
      <span className="ui-banner ui-banner-ok" aria-live="polite">
        {sent ? 'Đã gửi báo cáo. Kiểm duyệt viên sẽ xem xét.' : ''}
      </span>

      {open && (
        <ModDialog title="Báo cáo nội dung" onClose={() => !busy && close()}>
          <form className="mod-form" onSubmit={submit} noValidate>
            <p className="ui-hint">Nội dung sẽ được gửi kèm (tối đa {MAX_SNAPSHOT} ký tự):</p>
            <blockquote className="ui-quote mod-snapshot-preview">{clipped || '(trống)'}</blockquote>
            <label className="ui-field">
              <span className="ui-label">Lý do báo cáo (bắt buộc)</span>
              <textarea
                className="ui-input"
                data-autofocus
                rows={3}
                maxLength={MAX_REASON}
                value={reason}
                aria-required="true"
                onChange={(e) => setReason(e.target.value)}
              />
              <span className="ui-hint">
                {reason.length}/{MAX_REASON}
              </span>
            </label>
            <ModNotice notice={error ? { kind: 'err', text: error } : null} />
            <div className="ui-dialog-actions">
              <button type="button" className="ui-btn" onClick={close} disabled={busy}>
                Hủy
              </button>
              <button type="submit" className="ui-btn ui-btn-primary" disabled={busy}>
                {busy ? 'Đang gửi…' : 'Gửi báo cáo'}
              </button>
            </div>
          </form>
        </ModDialog>
      )}
    </>
  );
}
