import { useSyncExternalStore } from 'react';
import { getSettings, subscribeSettings } from './store';

const QUERY = '(prefers-reduced-motion: reduce)';

/** Hệ điều hành/trình duyệt có yêu cầu giảm chuyển động không. */
export function systemPrefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches === true;
  } catch {
    return false;
  }
}

/** Gộp: bật nếu cài đặt người dùng (display.reducedMotion) hoặc hệ thống bật (cùng cách camera). */
export function mergeReducedMotion(settingsReduced: boolean, systemReduced: boolean): boolean {
  return settingsReduced === true || systemReduced === true;
}

/** Đọc tức thời (dùng ngoài React, ví dụ âm thanh). */
export function isReducedMotion(): boolean {
  return mergeReducedMotion(getSettings().display.reducedMotion, systemPrefersReducedMotion());
}

function subscribeSystem(cb: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  let mq: MediaQueryList;
  try { mq = window.matchMedia(QUERY); } catch { return () => {}; }
  mq.addEventListener?.('change', cb);
  return () => mq.removeEventListener?.('change', cb);
}

/** Hook: theo dõi cả cài đặt người dùng lẫn prefers-reduced-motion. */
export function useReducedMotion(): boolean {
  const user = useSyncExternalStore(subscribeSettings, () => getSettings().display.reducedMotion, () => false);
  const sys = useSyncExternalStore(subscribeSystem, systemPrefersReducedMotion, () => false);
  return mergeReducedMotion(user, sys);
}
