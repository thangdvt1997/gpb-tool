import { useEffect, useState } from 'react';

const TOUCH_QUERY = '(pointer: coarse)';

export function detectTouch(): boolean {
  try {
    if (window.matchMedia(TOUCH_QUERY).matches) return true;
    return navigator.maxTouchPoints > 0 && !window.matchMedia('(any-pointer: fine)').matches;
  } catch {
    return false;
  }
}

/** Thiết bị cảm ứng chính (pointer coarse); cập nhật khi đổi. */
export function useTouch(): boolean {
  const [touch, setTouch] = useState(detectTouch);
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia(TOUCH_QUERY);
    } catch {
      return undefined;
    }
    const on = (): void => setTouch(detectTouch());
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return touch;
}

function padPresent(): boolean {
  try {
    return Array.from(navigator.getGamepads?.() ?? []).some((p) => p !== null && p !== undefined && p.connected);
  } catch {
    return false;
  }
}

/** Có tay cầm đang kết nối (nghe gamepadconnected / gamepaddisconnected). */
export function useGamepadConnected(): boolean {
  const [on, setOn] = useState(padPresent);
  useEffect(() => {
    const update = (): void => setOn(padPresent());
    window.addEventListener('gamepadconnected', update);
    window.addEventListener('gamepaddisconnected', update);
    return () => {
      window.removeEventListener('gamepadconnected', update);
      window.removeEventListener('gamepaddisconnected', update);
    };
  }, []);
  return on;
}
