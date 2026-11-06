import {
  createFocusStack,
  initialFocusTarget,
  nextFocusIndex,
  shouldCloseOnKey,
} from './focusLogic';

/** Lớp trình duyệt: gắn vào DOM. Logic quyết định nằm ở focusLogic.ts. */

const TABBABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

const stack = createFocusStack<HTMLElement>();

/** Nhả Pointer Lock trước khi dùng form (yêu cầu task 12). An toàn khi gọi ngoài trình duyệt. */
export function releasePointerLock(): void {
  if (typeof document !== 'undefined' && document.pointerLockElement) {
    document.exitPointerLock();
  }
}

export function getTabbables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (el) =>
      !el.hasAttribute('disabled') &&
      el.getAttribute('aria-hidden') !== 'true' &&
      !el.closest('[hidden],[inert]') &&
      (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0),
  );
}

export interface TrapOptions {
  /** Id duy nhất của lớp (ví dụ 'panel:meeting'). */
  id: string;
  onClose?: () => void;
  /** Phần tử nhận focus đầu tiên; mặc định phần tử tabbable đầu tiên. */
  initialFocus?: HTMLElement | null;
  /** Khóa đóng bằng Esc (ví dụ đang lưu). */
  isLocked?: () => boolean;
  /** Nhả Pointer Lock khi mở. Mặc định true. */
  releasePointer?: boolean;
}

/** Bẫy focus trong container; trả hàm gỡ, sẽ trả focus về phần tử đã mở lớp. */
export function trapFocus(container: HTMLElement, opts: TrapOptions): () => void {
  const opener = (document.activeElement as HTMLElement | null) ?? null;
  stack.push(opts.id, opener);
  if (opts.releasePointer !== false) releasePointerLock();

  const hadTabIndex = container.hasAttribute('tabindex');
  if (!hadTabIndex) container.setAttribute('tabindex', '-1');

  const tabbables = getTabbables(container);
  const ids = tabbables.map((_, i) => String(i));
  const pi = opts.initialFocus ? tabbables.indexOf(opts.initialFocus) : -1;
  const target = initialFocusTarget(ids, pi >= 0 ? String(pi) : undefined);
  (target.kind === 'item' ? tabbables[Number(target.id)] : container).focus();

  const onKey = (e: KeyboardEvent) => {
    if (!stack.isTop(opts.id)) return;
    if (
      shouldCloseOnKey(e.key, {
        isTop: true,
        composing: e.isComposing,
        locked: opts.isLocked?.(),
      })
    ) {
      e.preventDefault();
      opts.onClose?.();
      return;
    }
    if (e.key !== 'Tab') return;
    const list = getTabbables(container);
    if (list.length === 0) {
      e.preventDefault();
      container.focus();
      return;
    }
    const cur = list.indexOf(document.activeElement as HTMLElement);
    const atEdge = e.shiftKey ? cur <= 0 : cur === list.length - 1;
    // Chỉ chặn ở mép hoặc khi focus lạc ra ngoài; giữa danh sách để trình duyệt tự xử lý.
    if (atEdge || cur < 0) {
      e.preventDefault();
      list[nextFocusIndex(list.length, cur, e.shiftKey)].focus();
    }
  };
  document.addEventListener('keydown', onKey, true);

  return () => {
    document.removeEventListener('keydown', onKey, true);
    if (!hadTabIndex) container.removeAttribute('tabindex');
    const back = stack.remove(opts.id)?.restoreTo;
    if (back && back.isConnected) back.focus();
  };
}
