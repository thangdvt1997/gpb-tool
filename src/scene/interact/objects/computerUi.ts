import { getObjectState, setObjectState } from '../objectStates';
import { computerOf, computerSleep, NOTE_MAX } from './computer';

/**
 * Trạng thái giao diện máy tính (panel HTML ở ComputerPanel.tsx). Chỉ nhớ máy nào đang mở;
 * dữ liệu máy (bật, ghi chú, hình nền) nằm trong objectStates như các vật khác.
 */
let openId: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getComputerUi = (): string | null => openId;
export function subscribeComputerUi(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Nối vào `openUi` của computerInteractable. Mở máy khác khi đang mở thì máy cũ về nghỉ. */
export function openComputerUi(id: string): void {
  if (openId === id) return;
  if (openId !== null) closeComputerUi();
  openId = id;
  emit();
}

/** Đóng panel: máy về nghỉ (tắt màn hình, đăng xuất). Không làm gì nếu chưa mở. */
export function closeComputerUi(): void {
  const id = openId;
  if (id === null) return;
  openId = null;
  const patch = computerSleep(computerOf(getObjectState(id)));
  if (patch) {
    setObjectState(id, patch);
  }
  emit();
}

/** Khóa lưu ghi chú theo máy. */
export const noteStorageKey = (id: string): string => `gpb.computer.note.${id}`;

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Đọc ghi chú đã lưu (cắt NOTE_MAX). Lỗi truy cập localStorage (chế độ riêng tư) thì trả ''. */
export function loadNote(id: string, storage: StorageLike | null = defaultStorage()): string {
  try {
    return (storage?.getItem(noteStorageKey(id)) ?? '').slice(0, NOTE_MAX);
  } catch {
    return '';
  }
}

/** Lưu ghi chú; trả false nếu không lưu được. */
export function saveNote(id: string, text: string, storage: StorageLike | null = defaultStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(noteStorageKey(id), text.slice(0, NOTE_MAX));
    return true;
  } catch {
    return false;
  }
}

const two = (n: number) => String(n).padStart(2, '0');

/** Đồng hồ trên màn hình: HH:MM:SS và ngày dd/mm/yyyy theo giờ máy. */
export function formatClock(d: Date): { time: string; date: string } {
  return {
    time: `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`,
    date: `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`,
  };
}
