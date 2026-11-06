import { useState } from 'react';
import type { FormEvent } from 'react';
import { ModDialog } from './ModDialog';
import { ModNotice } from './ModNotice';
import { MAX_BAN_DAYS, MAX_REASON, MIN_BAN_DAYS } from './types';

export interface ReasonValue {
  reason: string;
  /** null = vĩnh viễn. Chỉ có nghĩa khi withDuration. */
  banDays: number | null;
}

interface Props {
  title: string;
  description?: string;
  confirmLabel: string;
  reasonLabel?: string;
  /** Mặc định true. Khóa, mở khóa, cảnh cáo bắt buộc có lý do. */
  reasonRequired?: boolean;
  /** Hiện lựa chọn khóa tạm (số ngày) hoặc vĩnh viễn. */
  withDuration?: boolean;
  danger?: boolean;
  busy: boolean;
  /** Lỗi từ máy chủ, đã là tiếng Việt. */
  error: string | null;
  onConfirm: (value: ReasonValue) => void;
  onCancel: () => void;
}

/** Hộp xác nhận có ô lý do và (tùy chọn) thời hạn khóa. */
export function ReasonDialog({
  title,
  description,
  confirmLabel,
  reasonLabel = 'Lý do',
  reasonRequired = true,
  withDuration = false,
  danger = false,
  busy,
  error,
  onConfirm,
  onCancel,
}: Props) {
  const [reason, setReason] = useState('');
  const [permanent, setPermanent] = useState(false);
  const [days, setDays] = useState('7');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (reasonRequired && trimmed === '') {
      setLocalError('Vui lòng nhập lý do.');
      return;
    }
    let banDays: number | null = null;
    if (withDuration && !permanent) {
      const n = Number(days);
      if (!Number.isInteger(n) || n < MIN_BAN_DAYS || n > MAX_BAN_DAYS) {
        setLocalError(`Số ngày khóa phải là số nguyên từ ${MIN_BAN_DAYS} đến ${MAX_BAN_DAYS}.`);
        return;
      }
      banDays = n;
    }
    setLocalError(null);
    onConfirm({ reason: trimmed, banDays });
  };

  const shown = localError ?? error;

  return (
    <ModDialog title={title} onClose={() => !busy && onCancel()}>
      {description && <p className="ui-hint">{description}</p>}
      <form className="mod-form" onSubmit={submit} noValidate>
        <label className="ui-field">
          <span className="ui-label">
            {reasonLabel}
            {reasonRequired ? ' (bắt buộc)' : ' (tùy chọn)'}
          </span>
          <textarea
            className="ui-input"
            data-autofocus
            rows={3}
            maxLength={MAX_REASON}
            value={reason}
            aria-required={reasonRequired}
            onChange={(e) => setReason(e.target.value)}
          />
          <span className="ui-hint">
            {reason.length}/{MAX_REASON}
          </span>
        </label>

        {withDuration && (
          <fieldset className="ui-fieldset">
            <legend>Thời hạn khóa</legend>
            <label className="ui-check">
              <input type="radio" name="mod-duration" checked={!permanent} onChange={() => setPermanent(false)} />
              <span>Khóa tạm</span>
            </label>
            <label className="ui-field mod-indent">
              <span className="ui-label">Số ngày ({MIN_BAN_DAYS} đến {MAX_BAN_DAYS})</span>
              <input
                className="ui-input"
                type="number"
                min={MIN_BAN_DAYS}
                max={MAX_BAN_DAYS}
                step={1}
                value={days}
                disabled={permanent}
                onChange={(e) => setDays(e.target.value)}
              />
            </label>
            <label className="ui-check">
              <input type="radio" name="mod-duration" checked={permanent} onChange={() => setPermanent(true)} />
              <span>Khóa vĩnh viễn</span>
            </label>
          </fieldset>
        )}

        <ModNotice notice={shown ? { kind: 'err', text: shown } : null} />

        <div className="ui-dialog-actions">
          <button type="button" className="ui-btn" onClick={onCancel} disabled={busy}>
            Hủy
          </button>
          <button type="submit" className={`ui-btn ${danger ? 'ui-btn-danger' : 'ui-btn-primary'}`} disabled={busy}>
            {busy ? 'Đang xử lý…' : confirmLabel}
          </button>
        </div>
      </form>
    </ModDialog>
  );
}
