import { ACTION_IDS, DEFAULT_BINDINGS, getSettings, type ActionId } from '../../settings';

/** Mã phím (KeyboardEvent.code) hiện gán cho một action, đọc từ cài đặt trung tâm. Mặc định: DEFAULT_BINDINGS. */
export function keyFor(action: ActionId): string {
  return getSettings().bindings[action] ?? DEFAULT_BINDINGS[action];
}

/** true nếu code là phím của action. */
export function isAction(code: string, action: ActionId): boolean {
  return code === keyFor(action);
}

/** Phím cố định đi kèm phím di chuyển (mũi tên) và phím chạy phụ (Shift phải): không đổi được. */
export const ARROW_KEYS = {
  moveForward: 'ArrowUp',
  moveBack: 'ArrowDown',
  moveLeft: 'ArrowLeft',
  moveRight: 'ArrowRight',
} as const;
export const RUN_ALIAS = 'ShiftRight';

/** Action gameplay mà useGtaControls theo dõi giữ phím. */
export const HELD_ACTIONS = ['moveForward', 'moveBack', 'moveLeft', 'moveRight', 'run', 'jump'] as const satisfies readonly ActionId[];

/** Mọi code mà useGtaControls cần theo dõi theo cài đặt hiện tại. */
export function trackedCodes(): Set<string> {
  const out = new Set<string>(Object.values(ARROW_KEYS));
  out.add(RUN_ALIAS);
  for (const a of HELD_ACTIONS) out.add(keyFor(a));
  return out;
}

export { ACTION_IDS };
