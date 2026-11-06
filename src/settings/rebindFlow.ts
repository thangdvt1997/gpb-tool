import { ACTION_CONTEXT, DEFAULT_BINDINGS, findConflicts, isValidKeyCode, rebind, swapBindings, type ActionId, type Bindings } from './schema';

/** Luồng đổi phím thuần: "Đổi" -> nhấn phím -> (xung đột thì hỏi hoán đổi). */

export type CaptureOutcome =
  | { kind: 'cancelled' }
  | { kind: 'invalid'; code: string }
  | { kind: 'unchanged' }
  | { kind: 'applied'; bindings: Bindings }
  | { kind: 'conflict'; code: string; with: ActionId };

/** Xử lý một phím nhấn khi đang chờ đổi phím của `action`. Esc huỷ việc đổi (không gán Esc). */
export function resolveCapture(b: Bindings, action: ActionId, code: string): CaptureOutcome {
  if (code === 'Escape') return { kind: 'cancelled' };
  if (b[action] === code) return { kind: 'unchanged' };
  const r = rebind(b, action, code);
  if (r.ok) return { kind: 'applied', bindings: r.bindings };
  if (r.error === 'conflict' && r.conflictWith) return { kind: 'conflict', code, with: r.conflictWith };
  return { kind: 'invalid', code };
}

/** Người dùng đồng ý hoán đổi: action nhận phím mới, action kia nhận phím cũ của action này. */
export function confirmSwap(b: Bindings, action: ActionId, other: ActionId): Bindings {
  return swapBindings(b, action, other);
}

/**
 * Đặt lại một phím về mặc định. Nếu phím mặc định đang bị action khác cùng ngữ cảnh giữ thì hoán đổi
 * để không sinh trùng; trả về bindings luôn không có xung đột.
 */
export function resetOne(b: Bindings, action: ActionId): Bindings {
  const def = DEFAULT_BINDINGS[action];
  if (b[action] === def) return b;
  const holder = (Object.keys(b) as ActionId[]).find((id) => id !== action && ACTION_CONTEXT[id] === ACTION_CONTEXT[action] && b[id] === def);
  const next = holder ? swapBindings(b, action, holder) : { ...b, [action]: def };
  return findConflicts(next).length ? { ...DEFAULT_BINDINGS } : next;
}

export function resetAll(): Bindings {
  return { ...DEFAULT_BINDINGS };
}

const LABELS: Record<string, string> = {
  Space: 'Space', ShiftLeft: 'Shift trái', ShiftRight: 'Shift phải', ControlLeft: 'Ctrl trái', ControlRight: 'Ctrl phải',
  AltLeft: 'Alt trái', AltRight: 'Alt phải', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace',
  ArrowUp: 'Mũi tên lên', ArrowDown: 'Mũi tên xuống', ArrowLeft: 'Mũi tên trái', ArrowRight: 'Mũi tên phải',
};

/** Nhãn hiển thị cho mã phím vật lý (KeyW -> W, Digit1 -> 1, Numpad1 -> Num 1). */
export function keyLabel(code: string): string {
  if (LABELS[code]) return LABELS[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return `Num ${code.slice(6)}`;
  return code;
}

export { isValidKeyCode };
