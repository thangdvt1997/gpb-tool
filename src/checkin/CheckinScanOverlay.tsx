import { useEffect, useRef } from 'react';
import './checkin.css';
import { formatTime } from './time';

export interface CheckinScanOverlayProps {
  phase: 'scanning' | 'done' | 'already' | 'error';
  name: string;
  at?: string;
  onSkip: () => void;
  onRetry?: () => void;
}

/** Lớp phủ góc dưới khi ghi danh. Không che nhân vật ở giữa màn hình. */
export function CheckinScanOverlay({ phase, name, at, onSkip, onRetry }: CheckinScanOverlayProps) {
  // Giữ onSkip mới nhất mà không gắn lại listener mỗi lần render.
  const skipRef = useRef(onSkip);
  skipRef.current = onSkip;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        skipRef.current();
      } else if (e.key === 'Enter') {
        // Enter trên nút (ví dụ Thử lại) giữ nguyên hành vi của nút đó.
        const t = e.target;
        if (t instanceof HTMLElement && (t.tagName === 'BUTTON' || t.tagName === 'A')) return;
        skipRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const time = formatTime(at);
  let title: string;
  let detail: string;
  if (phase === 'scanning') {
    title = 'Đang ghi danh…';
    detail = name ? `Xác nhận huy hiệu của ${name}` : 'Xác nhận huy hiệu';
  } else if (phase === 'done') {
    title = time ? `Đã ghi danh lúc ${time}` : 'Đã ghi danh';
    detail = name ? `Chào ${name}, mời bạn vào tầng 7.` : 'Mời bạn vào tầng 7.';
  } else if (phase === 'already') {
    title = time ? `Bạn đã ghi danh hôm nay lúc ${time}` : 'Bạn đã ghi danh hôm nay';
    detail = 'Không cần ghi danh lại.';
  } else {
    title = 'Chưa ghi danh được';
    detail = 'Lỗi kết nối hoặc máy chủ. Bạn vẫn vào tầng được, có thể thử lại.';
  }

  const tone = phase === 'error' ? 'ui-banner-danger' : phase === 'scanning' ? 'ui-banner-info' : 'ui-banner-ok';

  return (
    <div className="ci-overlay" data-phase={phase}>
      <section className={`ui-banner ${tone} ci-card`} aria-label="Ghi danh cổng tầng 7">
        <div className="ci-status">
          <span className="ci-icon" aria-hidden="true">
            {phase === 'scanning' && <span className="ui-spinner" />}
            {(phase === 'done' || phase === 'already') && '✓'}
            {phase === 'error' && '!'}
          </span>
          {/* Chữ hiển thị không nằm trong vùng live; trình đọc màn hình nhận một chuỗi duy nhất mỗi pha
              (NVDA 07/11 đọc "Đã ghi danh…, mời bạn vào tầng 7" hai lần khi hai đoạn cùng đổi trong vùng live). */}
          <div className="ci-text" aria-hidden="true">
            <p className="ci-title">{title}</p>
            <p className="ci-detail">{detail}</p>
          </div>
          <span className="ci-sr" role={phase === 'error' ? 'alert' : 'status'} aria-atomic="true">
            {`${title}. ${detail}`}
          </span>
        </div>
        <div className="ui-actions">
          {phase === 'error' && onRetry && (
            <button type="button" className="ui-btn ui-btn-primary" onClick={onRetry}>
              Thử lại
            </button>
          )}
          <button type="button" className="ui-btn" onClick={onSkip}>
            Bỏ qua
          </button>
        </div>
        <p className="ui-hint">Phím Esc hoặc Enter để bỏ qua</p>
      </section>
    </div>
  );
}
