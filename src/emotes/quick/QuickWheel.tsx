import { useEffect, useRef, useState } from 'react';
import { EMOTES, LEAD_IN, LEAD_OUT } from '../library';
import { cancelQuick, notifyCause, startQuick } from './controller';
import {
  QUICK_ACTIONS, WHEEL_TOGGLE_KEY, actionForKey, durationSec, normalizeKey,
  wheelIndexFromDigit, wheelIndexFromPointer,
} from './logic';
import type { QuickContext } from './logic';

interface Props {
  /** Host cung cấp ngữ cảnh hiện tại (tốc độ, ngồi, vùng...). */
  getContext: () => QuickContext;
  /** Báo host khóa/mở input nhìn khi bánh xe chiếm con trỏ. */
  onPointerCapture?: (captured: boolean) => void;
  enabled?: boolean;
}

function isTyping(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
}

/** Bánh xe hành động nhanh. Q mở/đóng; chuột chọn ô hoặc phím 1-6 khi đang mở; phím tắt riêng chạy ngay. */
export function QuickWheel({ getContext, onPointerCapture, enabled = true }: Props) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(-1);
  const [msg, setMsg] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const ctxRef = useRef(getContext);
  ctxRef.current = getContext;

  const run = (i: number): void => {
    const a = QUICK_ACTIONS[i];
    if (!a) return;
    const r = startQuick(a.id, ctxRef.current());
    setMsg(r.ok ? '' : `Không thể: ${r.reason}`);
    if (r.ok) setOpen(false);
  };

  useEffect(() => {
    onPointerCapture?.(open);
    return () => onPointerCapture?.(false);
  }, [open, onPointerCapture]);

  useEffect(() => {
    if (!enabled) return undefined;
    const down = (e: KeyboardEvent): void => {
      if (e.repeat || e.isComposing || isTyping(e.target)) return;
      const k = normalizeKey(e.key);
      if (!e.ctrlKey && !e.metaKey && !e.altKey && k === WHEEL_TOGGLE_KEY) {
        if (!open) notifyCause('wheel_open');
        setOpen(!open);
        return;
      }
      if (open && k === 'escape') {
        setOpen(false);
        return;
      }
      if (open) {
        const i = wheelIndexFromDigit(e.key, QUICK_ACTIONS.length);
        if (i >= 0) {
          run(i);
          return;
        }
      }
      const id = actionForKey(e.key, { ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey });
      if (id) run(QUICK_ACTIONS.findIndex((a) => a.id === id));
    };
    const blur = (): void => {
      setOpen(false);
      notifyCause('focus_loss');
    };
    window.addEventListener('keydown', down);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('blur', blur);
    };
  }, [enabled, open]);

  useEffect(() => () => cancelQuick('focus_loss'), []);

  if (!open) return msg ? <div role="status" style={{ position: 'fixed', bottom: 16, left: 16 }}>{msg}</div> : null;

  const R = 110;
  return (
    <div
      ref={box}
      role="menu"
      aria-label="Hành động nhanh"
      style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.35)' }}
      onPointerMove={(e) => {
        const r = box.current?.getBoundingClientRect();
        if (r) setHover(wheelIndexFromPointer(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), QUICK_ACTIONS.length));
      }}
      onPointerDown={() => {
        if (hover >= 0) run(hover);
        else setOpen(false);
      }}
    >
      <div style={{ position: 'relative', width: R * 2 + 120, height: R * 2 + 120 }}>
        {QUICK_ACTIONS.map((a, i) => {
          const ang = (i / QUICK_ACTIONS.length) * Math.PI * 2;
          const d = durationSec(EMOTES[a.emoteId], LEAD_IN, LEAD_OUT);
          return (
            <button
              key={a.id}
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                run(i);
              }}
              style={{
                position: 'absolute', left: '50%', top: '50%', minWidth: 96, minHeight: 44,
                transform: `translate(-50%,-50%) translate(${Math.sin(ang) * R}px, ${-Math.cos(ang) * R}px)`,
                outline: hover === i ? '2px solid #fff' : undefined,
              }}
            >
              {i + 1}. {a.label} [{a.hotkey.toUpperCase()}]{d !== null ? ` ${d.toFixed(1)}s` : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}
