// Focus trap cho hộp thoại bản đồ lớn: Tab / Shift+Tab xoay vòng trong hộp.

/**
 * Phần tử cần focus khi bấm Tab. Trả null nếu để trình duyệt tự xử lý (focus còn nằm giữa danh sách).
 * - focusables rỗng: trả `fallback` (chính hộp) để focus không rơi ra ngoài.
 * - active ở cuối (Tab) thì về đầu; active ở đầu hoặc ngoài danh sách (Shift+Tab) thì về cuối.
 */
export function trapTabTarget<T>(focusables: readonly T[], active: T | null, shift: boolean, fallback: T): T | null {
  if (focusables.length === 0) return fallback;
  const first = focusables[0]!;
  const last = focusables[focusables.length - 1]!;
  const idx = active === null ? -1 : focusables.indexOf(active);
  if (idx === -1) return shift ? last : first; // focus đã lạc ra ngoài hộp: kéo về
  if (!shift && active === last) return first;
  if (shift && active === first) return last;
  return null;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Các phần tử focus được và đang hiển thị trong root, theo thứ tự DOM. */
export function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true' && el.getClientRects().length > 0,
  );
}

/** Gọi trong onKeyDown của hộp: xử lý Tab. Trả true nếu đã chặn mặc định. */
export function handleTrapKey(e: { key: string; shiftKey: boolean; preventDefault: () => void }, root: HTMLElement | null): boolean {
  if (e.key !== 'Tab' || !root) return false;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const target = trapTabTarget(getFocusable(root), active, e.shiftKey, root);
  if (target === null) return false;
  e.preventDefault();
  target.focus();
  return true;
}
