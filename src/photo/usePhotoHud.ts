import { useEffect } from 'react';

/** Phần tử HUD mặc định bị ẩn khi chụp. Có thể đánh dấu thêm bằng thuộc tính data-hud. */
export const DEFAULT_HUD_SELECTORS: readonly string[] = ['[data-hud]', '.hint', '.hud-duel', '.hud-duel-panel'];

const STYLE_ID = 'photo-hide-hud-style';

/**
 * Ẩn HUD bằng một thẻ style tạm (visibility: hidden), không sửa component HUD.
 * Gỡ thẻ khi hidden = false hoặc khi unmount, nên hủy chụp không để UI ẩn vĩnh viễn.
 */
export function usePhotoHudHidden(hidden: boolean, selectors: readonly string[] = DEFAULT_HUD_SELECTORS): void {
  const key = selectors.join(',');
  useEffect(() => {
    if (!hidden || !key) return undefined;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = `${key}{visibility:hidden !important}`;
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  }, [hidden, key]);
}
