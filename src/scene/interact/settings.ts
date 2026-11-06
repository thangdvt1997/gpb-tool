import { useSyncExternalStore } from 'react';

/**
 * Tùy chọn hiển thị của hệ tương tác, lưu theo trình duyệt (localStorage, bọc try/catch:
 * cửa sổ ẩn danh hoặc bị chặn dữ liệu trang thì dùng mặc định, không lỗi).
 * - highlight: viền sáng quanh vật đang chọn.
 * - keyHints: dòng hướng dẫn phím và ký hiệu "E —" trên gợi ý.
 */
export interface InteractSettings {
  highlight: boolean;
  keyHints: boolean;
}

const KEY = 'gpb.interact.settings.v1';
const DEFAULTS: InteractSettings = { highlight: true, keyHints: true };

function load(): InteractSettings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return DEFAULTS;
    const o = v as Partial<Record<keyof InteractSettings, unknown>>;
    return {
      highlight: typeof o.highlight === 'boolean' ? o.highlight : DEFAULTS.highlight,
      keyHints: typeof o.keyHints === 'boolean' ? o.keyHints : DEFAULTS.keyHints,
    };
  } catch {
    return DEFAULTS;
  }
}

function save(s: InteractSettings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Không lưu được thì chỉ giữ trong phiên.
  }
}

let snap: InteractSettings = load();
const listeners = new Set<() => void>();

export function getInteractSettings(): InteractSettings {
  return snap;
}

export function updateInteractSettings(patch: Partial<InteractSettings>): void {
  const next = { ...snap, ...patch };
  if (next.highlight === snap.highlight && next.keyHints === snap.keyHints) return;
  snap = next;
  save(snap);
  listeners.forEach((l) => l());
}

export function subscribeInteractSettings(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useInteractSettings(): InteractSettings {
  return useSyncExternalStore(subscribeInteractSettings, getInteractSettings, getInteractSettings);
}
