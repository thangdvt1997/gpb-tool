import { restoreFocusLater } from './restoreFocus';
import { useEffect } from 'react';

/** Quyết định có trả focus không: chỉ khi phần tử mở còn trong DOM và focus hiện không nằm ở chỗ khác có ý nghĩa. */
export function shouldRestoreFocus(
  opener: { isConnected: boolean } | null,
  active: { tagName?: string } | null,
  stillInPanel: boolean,
): boolean {
  if (!opener || !opener.isConnected) return false;
  if (stillInPanel) return true;
  return !active || active.tagName === 'BODY';
}

/**
 * Panel không bẫy focus (không modal) vẫn phải trả focus về nút đã mở khi đóng.
 * Gọi một lần trong component panel; ghi nhớ phần tử đang focus lúc mở, trả lại khi tháo panel.
 */
export function useReturnFocus(): void {
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => {
      const active = document.activeElement as HTMLElement | null;
      // Lúc cleanup, nút đóng đang bị tháo nên activeElement thường đã là body.
      if (shouldRestoreFocus(opener, active, false)) restoreFocusLater(opener);
    };
  }, []);
}
