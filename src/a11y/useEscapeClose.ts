import { useEffect, useRef } from 'react';

// Panel không modal mở sau cùng nhận Esc trước; mỗi lần Esc chỉ đóng một panel.
const stack: symbol[] = [];

/** Esc ở bất kỳ đâu trên trang (kể cả khi focus còn ở nút mở, ví dụ mở bằng chuột) gọi onEscape cho panel trên cùng.
 *  Nhường khi đang có hộp thoại aria-modal (nó có bẫy focus và Esc riêng) hoặc khi phím đã được xử lý. */
export function useEscapeClose(onEscape: (() => void) | undefined): void {
  const cb = useRef(onEscape);
  cb.current = onEscape;
  useEffect(() => {
    const id = Symbol('esc-panel');
    stack.push(id);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented || !cb.current) return;
      if (stack[stack.length - 1] !== id) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      cb.current();
    };
    // Pha bắt: chạy trước phím Esc mở menu tạm dừng (useSessionHotkeys nghe ở pha nổi trên window).
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
    };
  }, []);
}
