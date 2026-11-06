import { useSyncExternalStore } from 'react';

/**
 * Kho trạng thái vật thể dùng chung (cửa đóng/mở, đèn bật/tắt, ngăn kéo...).
 * - Mỗi vật có giá trị mặc định (khai báo khi đăng ký hoặc qua setObjectDefaults).
 * - getObjectState trả bản đã gộp: mặc định + phần đã đặt. Không bao giờ trả undefined.
 * - Snapshot của từng vật là object bất biến: chỉ đổi tham chiếu khi giá trị thật sự đổi,
 *   nên dùng an toàn với useSyncExternalStore và so sánh nông.
 * Chưa lưu xuống localStorage/máy chủ: giai đoạn sau tự lưu qua subscribeObjectStates.
 */
export type ObjectStateValue = string | number | boolean | null;
export type ObjectState = Readonly<Record<string, ObjectStateValue>>;
export type ObjectStatePatch = Readonly<Record<string, ObjectStateValue>>;

const EMPTY: ObjectState = Object.freeze({});

const defaults = new Map<string, ObjectState>();
const current = new Map<string, ObjectState>();
const listeners = new Set<(id: string | null) => void>();

function emit(id: string | null): void {
  listeners.forEach((l) => l(id));
}

function shallowEqual(a: ObjectState, b: ObjectState): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && a[k] === b[k]);
}

/** Đặt giá trị mặc định của một vật. Vật chưa bị đổi trạng thái thì nhận ngay giá trị mới. */
export function setObjectDefaults(id: string, state: ObjectStatePatch): void {
  const next = Object.freeze({ ...state });
  const prev = defaults.get(id);
  if (prev && shallowEqual(prev, next)) return;
  defaults.set(id, next);
  if (!current.has(id)) emit(id);
}

export function getObjectDefaults(id: string): ObjectState {
  return defaults.get(id) ?? EMPTY;
}

/** Trạng thái hiện tại của vật (mặc định nếu chưa từng đặt). */
export function getObjectState(id: string): ObjectState {
  return current.get(id) ?? defaults.get(id) ?? EMPTY;
}

/** Gộp patch vào trạng thái hiện tại. Nhận object hoặc hàm (trạng thái cũ) => patch. Không đổi gì thì không phát sự kiện. */
export function setObjectState(id: string, patch: ObjectStatePatch | ((prev: ObjectState) => ObjectStatePatch)): void {
  const prev = getObjectState(id);
  const p = typeof patch === 'function' ? patch(prev) : patch;
  const next = Object.freeze({ ...prev, ...p });
  if (shallowEqual(prev, next)) return;
  current.set(id, next);
  emit(id);
}

/** Đặt lại về mặc định: một vật (truyền id) hoặc toàn bộ (không truyền). */
export function resetObjectStates(id?: string): void {
  if (id !== undefined) {
    if (current.delete(id)) emit(id);
    return;
  }
  if (current.size === 0) return;
  current.clear();
  emit(null);
}

/** Danh sách id có trạng thái khác mặc định (để lưu hoặc hiển thị nút đặt lại). */
export function changedObjectIds(): string[] {
  return [...current.keys()];
}

/** Nghe mọi thay đổi trạng thái vật. id = null nghĩa là đặt lại toàn bộ. Trả hàm hủy. */
export function subscribeObjectStates(cb: (id: string | null) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Hook React đọc trạng thái một vật, render lại khi vật đó đổi. */
export function useObjectState(id: string): ObjectState {
  return useSyncExternalStore(
    (cb) => subscribeObjectStates((changed) => (changed === null || changed === id) && cb()),
    () => getObjectState(id),
    () => getObjectState(id),
  );
}
