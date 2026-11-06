import { useSyncExternalStore } from 'react';

/**
 * Trạng thái lớp hướng dẫn: đang mở hay không, bước hiện tại, và những gì đã xem (lưu localStorage,
 * bọc try/catch: cửa sổ ẩn danh hoặc bị chặn dữ liệu trang thì chỉ giữ trong phiên).
 * Không có số liệu hay sự kiện giả: nơi khác chỉ gọi openTour, closeTour, markHintSeen.
 */

/** Tăng khi thêm bước hướng dẫn mới: người đã xem bản cũ chỉ thấy các bước có `since` lớn hơn. */
export const TUTORIAL_VERSION = 2;

export const HINT_KINDS = ['door', 'chair', 'computer', 'drawer', 'water', 'printer', 'switch'] as const;
export type HintKind = (typeof HINT_KINDS)[number];

export interface Stored {
  /** Phiên bản hướng dẫn lần gần nhất đã xem xong hoặc bỏ qua (0 = chưa xem). */
  seenVersion: number;
  hints: Partial<Record<HintKind, true>>;
}

export interface HelpSnapshot {
  open: boolean;
  step: number;
  /** Đã xem đủ phiên bản hiện tại. */
  completed: boolean;
  /** > 0: chỉ hiện bước có since lớn hơn giá trị này (người dùng cũ). 0: hiện tất cả. */
  onlyNewSince: number;
}

export const STORAGE_KEY = 'gpb.help.v1';

/**
 * Đọc dữ liệu lưu (hàm thuần, test được). Chấp nhận dạng cũ { version, completed, hints }:
 * completed=true nghĩa là đã xem phiên bản `version`. Dữ liệu hỏng thì coi như chưa xem.
 */
export function parseStored(raw: string | null): Stored {
  const empty: Stored = { seenVersion: 0, hints: {} };
  if (!raw) return empty;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return empty;
    const o = v as Record<string, unknown>;
    let seen = 0;
    if (typeof o.seenVersion === 'number' && Number.isFinite(o.seenVersion)) seen = Math.max(0, Math.floor(o.seenVersion));
    else if (o.completed === true && typeof o.version === 'number' && Number.isFinite(o.version)) seen = Math.max(0, Math.floor(o.version));
    seen = Math.min(seen, TUTORIAL_VERSION);
    const hints: Stored['hints'] = {};
    const h = typeof o.hints === 'object' && o.hints !== null ? (o.hints as Record<string, unknown>) : {};
    for (const k of HINT_KINDS) if (h[k] === true) hints[k] = true;
    return { seenVersion: seen, hints };
  } catch {
    return empty;
  }
}

/** Trạng thái khởi đầu từ dữ liệu lưu: chưa xem hết bản hiện tại thì tự mở. */
export function initialSnapshot(st: Stored): HelpSnapshot {
  const completed = st.seenVersion >= TUTORIAL_VERSION;
  return {
    open: !completed,
    step: 0,
    completed,
    onlyNewSince: !completed && st.seenVersion > 0 ? st.seenVersion : 0,
  };
}

function load(): Stored {
  try {
    return parseStored(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return { seenVersion: 0, hints: {} };
  }
}

function save(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: TUTORIAL_VERSION, ...stored }));
  } catch {
    // Không lưu được thì chỉ giữ trong phiên.
  }
}

let stored: Stored = load();
let snap: HelpSnapshot = initialSnapshot(stored);
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
  // Xem lại thủ công: hiện đủ mọi bước, không chỉ bước mới.
  emit({ ...snap, open: true, step: 0, onlyNewSince: 0 });
}

export function setStep(step: number): void {
  if (step === snap.step) return;
  emit({ ...snap, step });
}

/** Đóng (bỏ qua hoặc xong): ghi nhớ đã xem để phiên sau không tự mở. */
export function closeTour(): void {
  if (stored.seenVersion !== TUTORIAL_VERSION) {
    stored = { ...stored, seenVersion: TUTORIAL_VERSION };
    save();
  }
  emit({ ...snap, open: false, completed: true, onlyNewSince: 0 });
}

export function hasSeenHint(kind: HintKind): boolean {
  return stored.hints[kind] === true;
}

export function markHintSeen(kind: HintKind): void {
  if (stored.hints[kind]) return;
  stored = { ...stored, hints: { ...stored.hints, [kind]: true } };
  save();
}
