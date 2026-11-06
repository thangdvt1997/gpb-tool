import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { trapFocus } from './focusTrap';

/**
 * Gắn bẫy focus cho hộp thoại/panel khi active = true.
 * Dùng: const ref = useFocusTrap<HTMLElement>({ id: 'panel:x', onClose });
 *       <aside ref={ref} role="dialog" aria-modal="true" ...>
 */
export function useFocusTrap<T extends HTMLElement>(opts: {
  id: string;
  active?: boolean;
  onClose?: () => void;
  isLocked?: () => boolean;
}): RefObject<T> {
  const ref = useRef<T>(null);
  const onClose = useRef(opts.onClose);
  const isLocked = useRef(opts.isLocked);
  onClose.current = opts.onClose;
  isLocked.current = opts.isLocked;
  const active = opts.active ?? true;
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    return trapFocus(el, {
      id: opts.id,
      onClose: () => onClose.current?.(),
      isLocked: () => isLocked.current?.() ?? false,
    });
  }, [active, opts.id]);
  return ref;
}
