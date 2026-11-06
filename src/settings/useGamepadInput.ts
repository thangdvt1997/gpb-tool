import { useEffect, useMemo, useRef } from 'react';
import { getSettings } from './store';
import { emptyActions, mapGamepad, type PadActions, type PadState } from './gamepad';

/** Cùng hình dạng với MoveInput của scene/controls/useGtaControls (khai báo lại để không phụ thuộc scene). */
export interface PadMoveInput {
  forward: number;
  strafe: number;
}

export interface GamepadInput {
  getMoveInput: (out?: PadMoveInput) => PadMoveInput;
  /** Tốc độ nhìn chuẩn hóa (đã nhân độ nhạy). Nhân với dt ở nơi gọi để độc lập FPS. */
  getLook: (out?: { x: number; y: number }) => { x: number; y: number };
  isRunning: () => boolean;
  /** true đúng một lần cho mỗi lần bấm nhảy (cạnh lên). */
  consumeJump: () => boolean;
  /** true đúng một lần cho mỗi lần bấm hành động tương ứng (cạnh lên). */
  consumePress: (a: 'interact' | 'cancel' | 'map' | 'firstPerson') => boolean;
  /** Có tay cầm standard thật đang kết nối. */
  isConnected: () => boolean;
}

/** Chọn tay cầm đầu tiên đang kết nối có mapping standard. */
export function pickPad(pads: ArrayLike<Gamepad | null> | null | undefined): Gamepad | null {
  if (!pads) return null;
  for (let i = 0; i < pads.length; i++) {
    const p = pads[i];
    if (p && p.connected && p.mapping === 'standard') return p;
  }
  return null;
}

/**
 * Polling tay cầm bằng rAF, trả giao diện giống useGtaControls. Chưa được nối vào scene:
 * điều phối viên gộp getMoveInput với bàn phím. Trình duyệt không có getGamepads thì mọi giá trị là 0.
 * Mất focus, tab ẩn hoặc tháo tay cầm sẽ xóa trạng thái giữ.
 */
export function useGamepadInput(enabled: boolean = true): GamepadInput {
  const act = useRef<PadActions>(emptyActions());
  const edge = useRef({ jump: false, interact: false, cancel: false, map: false, firstPerson: false });
  const prev = useRef({ jump: false, interact: false, cancel: false, map: false, firstPerson: false });
  const connected = useRef(false);

  useEffect(() => {
    const clear = (): void => {
      act.current = emptyActions();
      edge.current = { jump: false, interact: false, cancel: false, map: false, firstPerson: false };
      prev.current = { jump: false, interact: false, cancel: false, map: false, firstPerson: false };
      connected.current = false;
    };
    if (!enabled || typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      clear();
      return undefined;
    }
    let raf = 0;
    const tick = (): void => {
      const pad = pickPad(navigator.getGamepads());
      if (!pad) {
        if (connected.current) clear();
        raf = requestAnimationFrame(tick);
        return;
      }
      const s = getSettings();
      const state: PadState = { mapping: pad.mapping, axes: pad.axes, buttons: pad.buttons };
      const a = mapGamepad(state, { deadzone: s.gamepad.deadzone, sensitivity: s.gamepad.sensitivity, invertX: s.mouse.invertX, invertY: s.mouse.invertY });
      if (a) {
        connected.current = true;
        act.current = a;
        for (const k of ['jump', 'interact', 'cancel', 'map', 'firstPerson'] as const) {
          if (a[k] && !prev.current[k]) edge.current[k] = true;
          prev.current[k] = a[k];
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onVis = (): void => {
      if (document.visibilityState !== 'visible') clear();
    };
    window.addEventListener('blur', clear);
    window.addEventListener('gamepaddisconnected', clear);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('blur', clear);
      window.removeEventListener('gamepaddisconnected', clear);
      document.removeEventListener('visibilitychange', onVis);
      clear();
    };
  }, [enabled]);

  return useMemo<GamepadInput>(() => {
    const shared: PadMoveInput = { forward: 0, strafe: 0 };
    const sharedLook = { x: 0, y: 0 };
    return {
      getMoveInput: (out = shared) => {
        out.forward = act.current.move.forward;
        out.strafe = act.current.move.strafe;
        return out;
      },
      getLook: (out = sharedLook) => {
        out.x = act.current.look.x;
        out.y = act.current.look.y;
        return out;
      },
      isRunning: () => act.current.run,
      consumeJump: () => {
        const v = edge.current.jump;
        edge.current.jump = false;
        return v;
      },
      consumePress: (k) => {
        const v = edge.current[k];
        edge.current[k] = false;
        return v;
      },
      isConnected: () => connected.current,
    };
  }, []);
}
