import { useEffect, useState } from 'react';
import { forfeitDuel, leaveDuel } from './api';
import { DUEL_MAX_HP } from './types';
import type { Duel } from './types';
import './duel.css';

/** Đồng hồ giây cho đếm ngược; chỉ chạy khi active = true. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

/** Số giây còn lại (làm tròn lên), tối thiểu 0. */
export function secondsLeft(iso: string | null, now: number): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : Math.max(0, Math.ceil((t - now) / 1000));
}

export interface DuelBannerProps {
  duel: Duel;
  currentUserId: string;
  /** Tên hiển thị theo id người dùng (nếu có). */
  names?: Record<string, string>;
  /** Gọi khi server trả trận đã cập nhật sau khi đầu hàng hoặc rời. */
  onChange?: (duel: Duel) => void;
}

function HpBar({ label, hp, side, down }: { label: string; hp: number; side: 'me' | 'foe'; down: boolean }) {
  const pct = Math.max(0, Math.min(100, Math.round((hp / DUEL_MAX_HP) * 100)));
  return (
    <div className={`duel-hp duel-hp-${side}${down ? ' duel-hp-down' : ''}`}>
      <div className="duel-hp-label">
        <span className="duel-hp-name">{label}</span>
        <span className="duel-hp-num">{hp}/{DUEL_MAX_HP}</span>
      </div>
      <div
        className="duel-hp-track"
        role="progressbar"
        aria-label={`Máu của ${label}`}
        aria-valuemin={0}
        aria-valuemax={DUEL_MAX_HP}
        aria-valuenow={hp}
      >
        <div className="duel-hp-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function DuelBanner({ duel, currentUserId, names, onChange }: DuelBannerProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const now = useNow(duel.downUntil !== null && duel.status === 'active');

  const iAmInviter = duel.inviterId === currentUserId;
  const foeId = iAmInviter ? duel.inviteeId : duel.inviterId;
  const myName = 'Bạn';
  const foeName = names?.[foeId] ?? (iAmInviter ? duel.inviteeName : duel.inviterName) ?? 'Đối thủ';
  const myHp = iAmInviter ? duel.hpInviter : duel.hpInvitee;
  const foeHp = iAmInviter ? duel.hpInvitee : duel.hpInviter;
  const isFight = duel.mode === 'fight';
  const active = duel.status === 'active';

  const downSecs = secondsLeft(duel.downUntil, now);
  const downIsMe = duel.downUserId === currentUserId;
  const downName = downIsMe ? myName : foeName;

  async function act() {
    setBusy(true);
    setError('');
    const r = isFight ? await forfeitDuel(duel.id) : await leaveDuel(duel.id);
    setBusy(false);
    if (r.ok) onChange?.(r.data);
    else setError(r.error);
  }

  let result = '';
  if (duel.status === 'finished' && duel.winnerId) {
    result = duel.winnerId === currentUserId ? 'Bạn đã thắng trận này.' : `${foeName} đã thắng trận này.`;
  } else if (duel.status === 'finished') {
    result = 'Trận đã kết thúc.';
  } else if (duel.status === 'expired' || duel.status === 'cancelled') {
    result = 'Trận đã bị hủy hoặc hết hạn.';
  }

  return (
    <section className="ui-panel ui-panel-float duel-banner" aria-label={isFight ? 'Trận đấu' : 'Trận nhảy'}>
      <div className="ui-panel-header">
        <h2 className="ui-panel-title">Bạn và {foeName}</h2>
        <span className="ui-badge ui-badge-info">{isFight ? 'Đấu' : 'Nhảy'}</span>
      </div>

      {isFight && (
        <div className="duel-hp-row">
          <HpBar label={myName} hp={myHp} side="me" down={duel.downUserId === currentUserId} />
          <HpBar label={foeName} hp={foeHp} side="foe" down={duel.downUserId === foeId} />
        </div>
      )}

      {isFight && active && duel.downUserId && downSecs > 0 && (
        <p className="ui-banner ui-banner-warn duel-down" role="status">
          {downIsMe ? 'Bạn đang nằm đỡ' : `${downName} đang nằm đỡ`}: còn <strong>{downSecs}</strong> giây rồi trận kết thúc.
        </p>
      )}

      {result && (
        <p className="ui-banner ui-banner-warn" role="status">
          {result}
        </p>
      )}

      {active && (
        <div className="ui-actions duel-actions">
          <button type="button" className="ui-btn ui-btn-danger" onClick={act} disabled={busy}>
            {isFight ? 'Đầu hàng' : 'Rời điệu nhảy'}
          </button>
        </div>
      )}

      <div aria-live="assertive" aria-atomic="true">
        {error && <p className="ui-banner ui-banner-danger">{error}</p>}
      </div>
    </section>
  );
}
