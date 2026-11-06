import { useEffect } from 'react';
import type { RefObject } from 'react';
import { checkContrast, checkTouchTarget, isLargeText } from './contrast';

export interface A11yIssue {
  kind: 'contrast' | 'touch-target';
  element: HTMLElement;
  detail: string;
}

/** Màu nền đặc đầu tiên đi lên cây DOM; không có thì null (không đoán). */
function solidBackground(el: HTMLElement): string | null {
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    const bg = getComputedStyle(n).backgroundColor;
    if (bg && bg !== 'transparent' && !/,\s*0\)$/.test(bg)) return bg;
  }
  return null;
}

/** Quét container: tương phản chữ và kích thước vùng chạm của control. Chỉ đo được khi có layout thật. */
export function auditContainer(root: HTMLElement): A11yIssue[] {
  const issues: A11yIssue[] = [];
  root
    .querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,[role="button"]')
    .forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      if (!checkTouchTarget(r.width, r.height).pass) {
        issues.push({
          kind: 'touch-target',
          element: el,
          detail: `${Math.round(r.width)}x${Math.round(r.height)}px, dưới 24x24`,
        });
      }
    });
  root.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent?.trim());
    if (!own) return;
    const cs = getComputedStyle(el);
    const bg = solidBackground(el);
    if (!bg) return;
    const large = isLargeText(parseFloat(cs.fontSize), parseInt(cs.fontWeight, 10) >= 700);
    const res = checkContrast(cs.color, bg, large ? 'large-text' : 'text');
    if (res && !res.pass) {
      issues.push({
        kind: 'contrast',
        element: el,
        detail: `tương phản ${res.ratio}:1, cần ${res.required}:1`,
      });
    }
  });
  return issues;
}

/**
 * Hook kiểm tra lúc phát triển: quét container sau khi mount, báo console.warn.
 * Mặc định chỉ chạy ở bản dev; không thay thế kiểm tra thủ công.
 */
export function useA11yAudit(ref: RefObject<HTMLElement>, enabled: boolean = import.meta.env.DEV): void {
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    const id = window.setTimeout(() => {
      const issues = auditContainer(el);
      if (issues.length) {
        console.warn(`[a11y] ${issues.length} vấn đề`, issues.map((i) => `${i.kind}: ${i.detail}`));
      }
    }, 300);
    return () => window.clearTimeout(id);
  }, [ref, enabled]);
}
