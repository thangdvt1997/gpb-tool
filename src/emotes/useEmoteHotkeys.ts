import { useEffect } from 'react';
import { EMOTE_ORDER } from './library';
import { playEmote } from './player';

/** Đang gõ trong ô nhập, vùng soạn thảo hay danh sách chọn thì không nhận phím tắt. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** Gắn phím 1 đến 6 với sáu emote. `enabled=false` để tắt (ví dụ khi đang mở hộp thoại). */
export function useEmoteHotkeys(enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if (isTypingTarget(e.target)) return;
      if (e.key.length !== 1 || e.key < '1' || e.key > '6') return;
      const id = EMOTE_ORDER[Number(e.key) - 1];
      if (id) playEmote(id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
