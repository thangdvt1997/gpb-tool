import { useEffect, useRef } from 'react';
import { normalizeAppearance, type Appearance } from '../avatar/appearance';
import type { ServerMessage } from './protocol';

// Gửi ngoại hình của mình lên world: khi vào phòng (mỗi snapshot, kể cả sau kết nối lại) và khi đổi.
// Giới hạn tần suất phía client khớp server (nạp 1 tin/5 giây, tối đa 3 liên tiếp): đổi dồn thì chỉ gửi bản cuối.

/** Giãn cách tối thiểu giữa hai lần gửi khi đổi liên tục. */
export const APPEARANCE_MIN_INTERVAL_MS = 5_000;

export interface AppearanceSenderDeps {
  send: (msg: Record<string, unknown>) => boolean;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
  minIntervalMs?: number;
}

export interface AppearanceSender {
  /** Đặt ngoại hình hiện tại (đổi thì gửi, có giãn cách). */
  set(a: Appearance | null | undefined): void;
  /** Vừa vào phòng (snapshot mới): gửi lại ngay dù không đổi. */
  joined(): void;
  dispose(): void;
}

export function createAppearanceSender(d: AppearanceSenderDeps): AppearanceSender {
  const now = d.now ?? Date.now;
  const setTimer = d.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = d.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const gap = d.minIntervalMs ?? APPEARANCE_MIN_INTERVAL_MS;
  let current: Appearance | null = null;
  let sentJson: string | null = null;
  let lastAt = -Infinity;
  let timer: unknown = null;
  let connected = false;

  function flush(force = false): void {
    timer = null;
    if (!current || !connected) return;
    const json = JSON.stringify(current);
    if (json === sentJson) return;
    const wait = lastAt + gap - now();
    if (!force && wait > 0) {
      timer = setTimer(() => flush(), wait);
      return;
    }
    if (d.send({ type: 'appearance', appearance: current })) {
      sentJson = json;
      lastAt = now();
    }
  }

  return {
    set(a) {
      current = a ? normalizeAppearance(a) : null;
      if (timer === null) flush();
    },
    joined() {
      connected = true;
      // Phiên mới: server có thể đã mất ngoại hình, gửi lại.
      sentJson = null;
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      flush(true);
    },
    dispose() {
      connected = false;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}

interface WorldLike {
  client: { current: { send(m: Record<string, unknown>): boolean } | null };
  subscribe: (fn: (m: ServerMessage) => void) => () => void;
  state?: string;
}

/** Gắn bộ gửi ngoại hình vào world. Không render gì. */
export function useAppearanceSync(world: WorldLike, appearance: Appearance | null | undefined): void {
  const sender = useRef<AppearanceSender | null>(null);
  const latest = useRef(appearance);
  latest.current = appearance;
  const { client, subscribe } = world;
  // Phụ thuộc vào client (ref) và subscribe (useCallback) thay vì cả object world: useWorld trả object mới mỗi lần render,
  // effect chạy lại sẽ tạo bộ gửi mới chưa "vào phòng" và ngoại hình không bao giờ được gửi.
  useEffect(() => {
    const s = createAppearanceSender({ send: (m) => client.current?.send(m) ?? false });
    sender.current = s;
    s.set(latest.current);
    const off = subscribe((m) => {
      if (m.type === 'snapshot') s.joined();
    });
    return () => {
      off();
      s.dispose();
      sender.current = null;
    };
  }, [client, subscribe]);
  // Snapshot có thể đến trước khi effect trên đăng ký: khi đã kết nối thì coi như đã vào phòng.
  useEffect(() => {
    if (world.state === 'connected') sender.current?.joined();
  }, [world.state]);
  useEffect(() => {
    sender.current?.set(appearance);
  }, [appearance]);
}
