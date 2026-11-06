import { useSyncExternalStore } from 'react';

/**
 * Máy trạng thái nhân vật người chơi.
 * - walking: đi lại tự do (mặc định).
 * - interacting: đang chạy một thao tác ngắn (với tay mở cửa, kéo ngăn kéo...).
 * - seated: đang ngồi ghế.
 * - holding: đang cầm một đồ nhỏ.
 * - using_ui: đang dùng giao diện trong ứng dụng (máy tính, bảng điều khiển máy in...).
 * - arranging: chế độ sắp xếp nội thất.
 * Chỉ chuyển theo bảng TRANSITIONS. Ngoài walking thì khóa đi bộ (isWalkLocked).
 */
export type CharacterState = 'walking' | 'interacting' | 'seated' | 'holding' | 'using_ui' | 'arranging';

export const CHARACTER_STATES: readonly CharacterState[] = [
  'walking',
  'interacting',
  'seated',
  'holding',
  'using_ui',
  'arranging',
];

const TRANSITIONS: Readonly<Record<CharacterState, readonly CharacterState[]>> = {
  walking: ['interacting', 'seated', 'holding', 'using_ui', 'arranging'],
  // Thao tác ngắn kết thúc: về đi lại, hoặc dẫn tới ngồi / cầm đồ / mở giao diện.
  interacting: ['walking', 'seated', 'holding', 'using_ui'],
  // Đứng dậy, dùng máy tính khi đang ngồi, hoặc thao tác ngắn tại chỗ (mở ngăn kéo bàn).
  seated: ['walking', 'using_ui', 'interacting'],
  // Đặt đồ xuống (thao tác ngắn) hoặc thả/trả về.
  holding: ['walking', 'interacting'],
  // Thoát giao diện: về chỗ cũ (đứng hoặc ngồi).
  using_ui: ['walking', 'seated'],
  arranging: ['walking'],
};

/** Trạng thái khóa đi bộ. Theo yêu cầu: mọi trạng thái ngoài walking đều khóa. */
const WALK_LOCKED: Readonly<Record<CharacterState, boolean>> = {
  walking: false,
  interacting: true,
  seated: true,
  holding: true,
  using_ui: true,
  arranging: true,
};

/** Trạng thái được phép chọn vật để tương tác (E). Các trạng thái khác do hệ thống riêng của nó xử lý phím. */
const CAN_FOCUS: Readonly<Record<CharacterState, boolean>> = {
  walking: true,
  interacting: false,
  seated: true,
  holding: true,
  using_ui: false,
  arranging: false,
};

export interface CharacterSnapshot {
  state: CharacterState;
  previous: CharacterState | null;
  /** Lý do chuyển gần nhất (ví dụ id vật), để gỡ lỗi. */
  reason: string | null;
}

let snap: CharacterSnapshot = { state: 'walking', previous: null, reason: null };
const listeners = new Set<() => void>();

export function getCharacterState(): CharacterState {
  return snap.state;
}

export function getCharacterSnapshot(): CharacterSnapshot {
  return snap;
}

export function canTransition(to: CharacterState, from: CharacterState = snap.state): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Chuyển trạng thái. Trả false (không đổi gì) nếu chuyển không hợp lệ.
 * Chuyển sang chính trạng thái hiện tại coi như thành công, không phát sự kiện.
 */
export function transitionCharacter(to: CharacterState, reason: string | null = null): boolean {
  if (to === snap.state) return true;
  if (!canTransition(to)) {
    if (import.meta.env.DEV) console.warn(`[characterState] bỏ qua chuyển không hợp lệ ${snap.state} → ${to}`);
    return false;
  }
  snap = { state: to, previous: snap.state, reason };
  listeners.forEach((l) => l());
  return true;
}

/** Thoát khẩn cấp về walking (mất kết nối, đổi khu, lỗi). Không kiểm tra bảng chuyển. */
export function resetCharacterState(reason: string | null = 'reset'): void {
  if (snap.state === 'walking' && snap.previous === null) return;
  snap = { state: 'walking', previous: null, reason };
  listeners.forEach((l) => l());
}

/** true khi điều khiển di chuyển phải bỏ qua phím/joystick đi bộ. Gọi mỗi khung được, không cấp phát. */
export function isWalkLocked(): boolean {
  return WALK_LOCKED[snap.state];
}

/** true khi hệ tương tác được chọn vật và nhận E. */
export function canFocusInState(state: CharacterState = snap.state): boolean {
  return CAN_FOCUS[state];
}

export function subscribeCharacterState(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useCharacterState(): CharacterSnapshot {
  return useSyncExternalStore(subscribeCharacterState, getCharacterSnapshot, getCharacterSnapshot);
}
