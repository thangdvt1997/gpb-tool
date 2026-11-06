import { useSyncExternalStore } from 'react';

/**
 * Cầu nối giữa cảnh 3D (InteractTracker, trong Canvas) và thẻ hướng dẫn (InteractPrompt, ngoài Canvas).
 * Snapshot chỉ thay khi đổi vật hoặc đổi trạng thái chuột, nên useFrame ghi mỗi khung hình không gây render.
 */
export interface InteractFocus {
  id: string;
  label: string;
  /** Động từ theo loại vật: "Mở cửa", "Ngồi xuống", "Xem thông tin phòng", "Sử dụng", "Đứng dậy". */
  verb: string;
}

export interface InteractSnapshot {
  /** Vật đang đủ điều kiện dùng ngay. null = ẩn hướng dẫn. */
  focus: InteractFocus | null;
  /** Chuột đang nằm trên đúng vật đó. */
  pointer: boolean;
}

const EMPTY: InteractSnapshot = { focus: null, pointer: false };
let snap: InteractSnapshot = EMPTY;
let activator: (() => void) | null = null;
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): InteractSnapshot {
  return snap;
}

export function setInteractFocus(focus: InteractFocus | null, pointer: boolean): void {
  const p = focus !== null && pointer;
  if (
    snap.focus?.id === focus?.id &&
    snap.focus?.label === focus?.label &&
    snap.focus?.verb === focus?.verb &&
    snap.pointer === p
  ) {
    return;
  }
  snap = focus === null ? EMPTY : { focus, pointer: p };
  listeners.forEach((l) => l());
}

/** InteractTracker đăng ký hàm dùng vật đang focus, để nút trên thẻ hướng dẫn gọi được. */
export function setInteractActivator(fn: (() => void) | null): void {
  activator = fn;
}

export function activateInteractFocus(): void {
  activator?.();
}

export function useInteractSnapshot(): InteractSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
