import { useSyncExternalStore } from 'react';

/**
 * Trạng thái lớp hướng dẫn: đang mở hay không, bước hiện tại, và những gì đã xem (lưu localStorage,
 * bọc try/catch: cửa sổ ẩn danh hoặc bị chặn dữ liệu trang thì chỉ giữ trong phiên).
 * Không có số liệu hay sự kiện giả: nơi khác chỉ gọi openTour, closeTour, markHintSeen.
 */

/** Tăng khi nội dung hướng dẫn đổi đủ lớn để người đã xem cần xem lại. */
export const TUTORIAL_VERSION = 1;

export type HintKind = 'door' | 'chair' | 'computer';

interface Stored {
  version: number;
  completed: boolean;
  hints: Partial<Record<HintKind, true>>;
}

export interface HelpSnapshot {
  open: boolean;
  step: number;
  completed: boolean;
}

const KEY = 'gpb.help.v1';

function load(): Stored {
  const empty: Stored = { version: TUTORIAL_VERSION, completed: false, hints: {} };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return empty;
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return empty;
    const o = v as Record<string, unknown>;
    // Khác phiên bản: giới thiệu lại các bước, giữ nguyên các gợi ý ngữ cảnh đã xem.
    const sameVersion = o.version === TUTORIAL_VERSION;
    const hints: Stored['hints'] = {};
    const h = typeof o.hints === 'object' && o.hints !== null ? (o.hints as Record<string, unknown>) : {};
    for (const k of ['door', 'chair', 'computer'] as const) if (h[k] === true) hints[k] = true;
    return { version: TUTORIAL_VERSION, completed: sameVersion && o.completed === true, hints };
  } catch {
    return empty;
  }
}

function save(): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // Không lưu được thì chỉ giữ trong phiên.
  }
}

let stored: Stored = load();
let snap: HelpSnapshot = { open: !stored.completed, step: 0, completed: stored.completed };
const listeners = new Set<() => void>();

function emit(next: HelpSnapshot): void {
  snap = next;
  listeners.forEach((l) => l());
}

export function getHelp(): HelpSnapshot {
  return snap;
}

export function subscribeHelp(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useHelp(): HelpSnapshot {
  return useSyncExternalStore(subscribeHelp, getHelp, getHelp);
}

/** Mở lại các bước từ đầu (nút "Xem lại hướng dẫn"). */
export function openTour(): void {
  emit({ ...snap, open: true, step: 0 });
}

export function setStep(step: number): void {
  if (step === snap.step) return;
  emit({ ...snap, step });
}

/** Đóng (bỏ qua hoặc xong): ghi nhớ đã xem để phiên sau không tự mở. */
export function closeTour(): void {
  if (!stored.completed) {
    stored = { ...stored, completed: true };
    save();
  }
  emit({ ...snap, open: false, completed: true });
}

export function hasSeenHint(kind: HintKind): boolean {
  return stored.hints[kind] === true;
}

export function markHintSeen(kind: HintKind): void {
  if (stored.hints[kind]) return;
  stored = { ...stored, hints: { ...stored.hints, [kind]: true } };
  save();
}
