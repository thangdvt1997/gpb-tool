import { useEffect, useState, useSyncExternalStore } from 'react';
import { getSocialAction, remainingSec } from './logic';
import type { SocialSession } from './session';

interface Props {
  session: SocialSession;
  /** Tên hiển thị của người mời. Mặc định dùng id. */
  nameOf?: (id: string) => string;
  now?: () => number;
  enabled?: boolean;
}

function isTyping(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
}

/** Lời mời xã hội đến: nút Chấp nhận/Từ chối, phím Y/N, vùng aria-live báo cho trình đọc màn hình. */
export function SocialPrompt({ session, nameOf = (id) => id, now = () => performance.now(), enabled = true }: Props) {
  const invite = useSyncExternalStore(
    (cb) => session.subscribe(cb),
    () => session.getIncoming(),
    () => null,
  );
  const [, setTick] = useState(0);

  // Cập nhật đếm ngược mỗi giây và để session tự hết hạn/hủy khi đi xa.
  useEffect(() => {
    if (!invite) return undefined;
    const t = window.setInterval(() => { session.tick(); setTick((n) => n + 1); }, 1000);
    return () => window.clearInterval(t);
  }, [invite, session]);

  useEffect(() => {
    if (!enabled || !invite) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'y') { e.preventDefault(); session.accept(); }
      else if (k === 'n') { e.preventDefault(); session.decline(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, invite, session]);

  const action = invite ? getSocialAction(invite.actionId) : undefined;
  const text = invite && action
    ? `${nameOf(invite.from)} muốn ${action.label.toLowerCase()} với bạn (còn ${remainingSec(invite, now())} giây)`
    : '';

  return (
    <div className="social-prompt" role="status" aria-live="polite" aria-atomic="true">
      {invite && action ? (
        <div className="ui-panel social-prompt-box">
          <p className="social-prompt-text">{text}</p>
          <div className="social-prompt-actions">
            <button type="button" className="ui-btn ui-btn-primary" onClick={() => session.accept()}>
              Chấp nhận <kbd className="ui-kbd">Y</kbd>
            </button>
            <button type="button" className="ui-btn ui-btn-ghost" onClick={() => session.decline()}>
              Từ chối <kbd className="ui-kbd">N</kbd>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
