import { useEffect, useMemo, useRef } from 'react';
import {
  consumeTouchJump,
  getControls,
  resetTouchInput,
  setPaused,
  subscribeControls,
  toggleFirstPerson,
  touchInput,
} from './session';
import { ARROW_KEYS, isAction, keyFor, RUN_ALIAS, trackedCodes } from './bindings';

/**
 * Đầu vào di chuyển đã chuẩn hóa, tương đối với hướng camera. forward: +1 tiến (W, mũi tên lên), -1 lùi.
 * strafe: +1 sang phải (D, mũi tên phải), -1 sang trái. Phím chỉ di chuyển, không xoay camera hay nhân vật;
 * nhân vật tự quay mặt theo hướng đi (gtaMotion). Joystick cảm ứng cộng vào, độ dài tối đa 1.
 */
export interface MoveInput {
  forward: number;
  strafe: number;
}

export interface GtaControls {
  /** Ghi vào `out` (nếu có) hoặc đối tượng dùng chung, rồi trả về. Không cấp phát mới. */
  getMoveInput: (out?: MoveInput) => MoveInput;
  /** Shift hoặc nút chạy cảm ứng đang giữ. */
  isRunning: () => boolean;
  /** Trả true đúng một lần cho mỗi lần bấm Space (hoặc nút nhảy), rồi xóa yêu cầu. */
  consumeJump: () => boolean;
}

/** Đang gõ trong ô nhập, vùng soạn thảo hay danh sách chọn thì không nhận phím. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

// E thuộc phần tương tác vật thể (InteractionSystem/InteractTracker), V và Esc do useSessionHotkeys xử lý.
// Phím di chuyển, chạy, nhảy đọc từ bindings (settings); mũi tên và Shift phải là phím phụ cố định.

/**
 * Đọc W A S D, phím mũi tên, Shift, Space. Trạng thái nằm trong ref, không gây render.
 * `enabled=false` hoặc đang tạm dừng thì nhả hết phím và bỏ qua phím mới.
 * Mất focus tab (blur, tab ẩn) cũng nhả hết, để nhân vật không tự chạy khi keyup không tới.
 */
export function useGtaControls(enabled: boolean = true): GtaControls {
  const keys = useRef<Set<string>>(new Set());
  const jumpRequested = useRef(false);

  useEffect(() => {
    const held = keys.current;
    const release = (): void => {
      held.clear();
      jumpRequested.current = false;
      resetTouchInput();
    };
    if (!enabled) {
      release();
      return undefined;
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!trackedCodes().has(e.code)) return;
      if (isTypingTarget(e.target)) return;
      if (getControls().paused) return;
      // Chặn cuộn trang và việc Space kích hoạt nút đang focus.
      if (e.code === 'Space' || e.code.startsWith('Arrow') || isAction(e.code, 'jump')) e.preventDefault();
      if (isAction(e.code, 'jump') && !e.repeat) jumpRequested.current = true;
      held.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      held.delete(e.code);
    };
    const onVisibility = (): void => {
      if (document.visibilityState !== 'visible') release();
    };
    // Mở menu tạm dừng: xóa mọi phím đang giữ.
    let wasPaused = getControls().paused;
    const unsub = subscribeControls(() => {
      const p = getControls().paused;
      if (p && !wasPaused) release();
      wasPaused = p;
    });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', onVisibility);
      unsub();
      release();
    };
  }, [enabled]);

  return useMemo<GtaControls>(() => {
    const shared: MoveInput = { forward: 0, strafe: 0 };
    const held = keys.current;
    return {
      getMoveInput: (out: MoveInput = shared): MoveInput => {
        let f = 0;
        let s = 0;
        if (held.has(keyFor('moveForward')) || held.has(ARROW_KEYS.moveForward)) f += 1;
        if (held.has(keyFor('moveBack')) || held.has(ARROW_KEYS.moveBack)) f -= 1;
        if (held.has(keyFor('moveRight')) || held.has(ARROW_KEYS.moveRight)) s += 1;
        if (held.has(keyFor('moveLeft')) || held.has(ARROW_KEYS.moveLeft)) s -= 1;
        f += touchInput.y;
        s += touchInput.x;
        // Phím chéo và joystick cộng phím: giữ độ dài tối đa 1 để đi chéo không nhanh hơn.
        const len = Math.hypot(f, s);
        if (len > 1) {
          f /= len;
          s /= len;
        }
        out.forward = f;
        out.strafe = s;
        return out;
      },
      isRunning: (): boolean => held.has(keyFor('run')) || held.has(RUN_ALIAS) || touchInput.run,
      consumeJump: (): boolean => {
        const k = jumpRequested.current;
        jumpRequested.current = false;
        const t = consumeTouchJump();
        return k || t;
      },
    };
  }, []);
}

/** Có hộp thoại (panel vật thể, emote, kiểm duyệt) đang mở thì Esc thuộc về nó, không mở menu tạm dừng. */
function otherDialogOpen(): boolean {
  return document.querySelector('[role="dialog"]:not(.ctl-pause), [aria-modal="true"]:not(.ctl-pause)') !== null;
}

/**
 * Phím phiên: V đổi góc nhìn thứ ba/thứ nhất, Esc mở hoặc đóng menu tạm dừng.
 * Gọi đúng một lần (trong useGtaPlayer) để V không bị đổi hai lần.
 */
export function useSessionHotkeys(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isAction(e.code, 'cancel')) {
        // Panel đã dùng Esc để đóng (useEscapeClose): không mở menu tạm dừng.
        if (e.defaultPrevented) return;
        if (isTypingTarget(e.target)) return;
        if (getControls().paused) {
          setPaused(false);
          e.preventDefault();
          return;
        }
        if (otherDialogOpen()) return;
        setPaused(true);
        e.preventDefault();
        return;
      }
      if (isAction(e.code, 'firstPerson') && !e.repeat) {
        if (isTypingTarget(e.target) || getControls().paused) return;
        toggleFirstPerson();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      setPaused(false);
    };
  }, [enabled]);
}
