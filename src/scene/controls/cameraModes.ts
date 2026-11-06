/**
 * Bộ điều khiển chế độ camera và tùy chọn dễ chịu (giảm chuyển động, rung).
 * Module thuần: không import React, three hay DOM, để chạy được bằng node:test (tests/camera).
 *
 * Mô hình:
 * - Một chế độ nền (base): thirdPerson hoặc firstPerson, người chơi đổi bằng phím V.
 * - Các lớp phủ (overlay) seated, overview, inspect do nguồn khác yêu cầu (ngồi ghế, người chơi mở toàn cảnh,
 *   dùng máy tính). Mỗi yêu cầu có `source`; một nguồn chỉ giữ một yêu cầu.
 * - Chế độ đang chạy = yêu cầu có ưu tiên cao nhất (bằng nhau thì yêu cầu mới hơn thắng), không có thì base.
 * - Đổi chế độ gọi exit(cũ, mới) rồi enter(mới, cũ, trạng thái đã lưu của mới). exit trả trạng thái để lưu,
 *   lần sau vào lại chế độ đó enter nhận lại trạng thái này.
 * - Esc chỉ gỡ yêu cầu escapable đang chạy (overview). seated và inspect thuộc hệ tương tác (E đứng dậy,
 *   giao diện tự đóng), camera không tự gỡ để không lệch với trạng thái nhân vật.
 */

export type BaseMode = 'thirdPerson' | 'firstPerson';
export type OverlayMode = 'seated' | 'inspect' | 'overview';
export type CameraMode = BaseMode | OverlayMode;

export const CAMERA_MODES: readonly CameraMode[] = ['thirdPerson', 'firstPerson', 'seated', 'overview', 'inspect'];

/** Ưu tiên: inspect (UI đang giữ input) > overview (người chơi chủ động) > seated > nền. */
export const MODE_PRIORITY: Readonly<Record<CameraMode, number>> = {
  thirdPerson: 0,
  firstPerson: 0,
  seated: 10,
  overview: 20,
  inspect: 30,
};

export interface ModePolicy {
  /** Cho xoay camera bằng chuột/cảm ứng. */
  orbit: boolean;
  /** Cho đổi khoảng cách bằng cuộn chuột. */
  zoom: boolean;
  /** Camera đặt ở mắt (không có khoảng cách, không quét va chạm). */
  eye: boolean;
  minDist: number;
  maxDist: number;
  /** Khoảng cách khi vào chế độ lần đầu (chưa có trạng thái lưu). */
  startDist: number;
  minPitch: number;
  maxPitch: number;
  startPitch: number;
}

/** Giới hạn mỗi chế độ (m, rad). thirdPerson khớp CAM trong gtaCamera.ts. */
export const MODE_POLICY: Readonly<Record<CameraMode, ModePolicy>> = {
  thirdPerson: {
    orbit: true,
    zoom: true,
    eye: false,
    minDist: 2.5,
    maxDist: 20,
    startDist: 7.5,
    minPitch: 0.05,
    maxPitch: 1.25,
    startPitch: 0.5,
  },
  firstPerson: {
    orbit: true,
    zoom: false,
    eye: true,
    minDist: 0,
    maxDist: 0,
    startDist: 0,
    minPitch: -1.2,
    maxPitch: 1.3,
    startPitch: 0.1,
  },
  seated: {
    orbit: true,
    zoom: true,
    eye: false,
    minDist: 1.6,
    maxDist: 5,
    startDist: 2.8,
    minPitch: 0.05,
    maxPitch: 1.1,
    startPitch: 0.35,
  },
  overview: {
    orbit: true,
    zoom: true,
    eye: false,
    minDist: 10,
    maxDist: 30,
    startDist: 18,
    minPitch: 0.9,
    maxPitch: 1.4,
    startPitch: 1.2,
  },
  inspect: {
    // UI (máy tính, bảng) đang giữ chuột: không xoay, không zoom.
    orbit: false,
    zoom: false,
    eye: true,
    minDist: 0,
    maxDist: 0,
    startDist: 0,
    minPitch: 0.3,
    maxPitch: 0.3,
    startPitch: 0.3,
  },
};

export function isOverlay(m: CameraMode): m is OverlayMode {
  return m === 'seated' || m === 'inspect' || m === 'overview';
}

export function clampToPolicy(m: CameraMode, pitch: number, dist: number): { pitch: number; dist: number } {
  const p = MODE_POLICY[m];
  return {
    pitch: Math.min(p.maxPitch, Math.max(p.minPitch, pitch)),
    dist: Math.min(p.maxDist, Math.max(p.minDist, dist)),
  };
}

/** Trạng thái lưu khi rời một chế độ (giá trị mục tiêu, không phải giá trị đã làm mượt). */
export interface ModeState {
  yaw: number;
  pitch: number;
  dist: number;
}

export type ModeChangeReason = 'base' | 'request' | 'release' | 'escape' | 'reset';

export interface ModeChange {
  from: CameraMode;
  to: CameraMode;
  reason: ModeChangeReason;
}

export interface ModeHooks {
  /** Rời `from` sang `to`. Trả trạng thái muốn lưu cho `from` (hoặc undefined). */
  exit?: (from: CameraMode, to: CameraMode) => ModeState | undefined;
  /** Vào `to` từ `from`. `saved` là trạng thái đã lưu lần trước rời `to`. */
  enter?: (to: CameraMode, from: CameraMode, saved: ModeState | undefined) => void;
}

export interface RequestOptions {
  /** Esc gỡ được yêu cầu này. Mặc định: chỉ overview. */
  escapable?: boolean;
}

interface Req {
  mode: OverlayMode;
  source: string;
  escapable: boolean;
  seq: number;
}

export interface CameraModeController {
  getMode(): CameraMode;
  /** Chế độ ngay trước chế độ hiện tại. */
  getPrevious(): CameraMode | null;
  getBase(): BaseMode;
  getPolicy(): ModePolicy;
  setBase(base: BaseMode): boolean;
  /** Thêm hoặc thay yêu cầu của `source`. Trả true nếu chế độ đang chạy đổi. */
  request(mode: OverlayMode, source: string, opts?: RequestOptions): boolean;
  /** Gỡ yêu cầu của `source`. Trả true nếu chế độ đang chạy đổi. */
  release(source: string): boolean;
  has(source: string): boolean;
  /** Gỡ yêu cầu đang chạy nếu escapable. Trả true nếu đã xử lý Esc (bên gọi nên chặn Esc lan tiếp). */
  escape(): boolean;
  /** Chế độ đang chạy có thể thoát bằng Esc. */
  canEscape(): boolean;
  getSaved(mode: CameraMode): ModeState | undefined;
  setHooks(hooks: ModeHooks | null): void;
  /** Bỏ mọi yêu cầu và trạng thái lưu, về base thirdPerson. */
  reset(): void;
  subscribe(cb: (c: ModeChange) => void): () => void;
}

export function createCameraModeController(initialHooks: ModeHooks | null = null): CameraModeController {
  let hooks: ModeHooks | null = initialHooks;
  let base: BaseMode = 'thirdPerson';
  let reqs: Req[] = [];
  let active: CameraMode = 'thirdPerson';
  let previous: CameraMode | null = null;
  let seq = 0;
  const saved = new Map<CameraMode, ModeState>();
  const listeners = new Set<(c: ModeChange) => void>();

  const top = (): Req | null => {
    let best: Req | null = null;
    for (const r of reqs) {
      if (
        best === null ||
        MODE_PRIORITY[r.mode] > MODE_PRIORITY[best.mode] ||
        (MODE_PRIORITY[r.mode] === MODE_PRIORITY[best.mode] && r.seq > best.seq)
      ) {
        best = r;
      }
    }
    return best;
  };

  const resolve = (): CameraMode => top()?.mode ?? base;

  const apply = (reason: ModeChangeReason): boolean => {
    const next = resolve();
    if (next === active) return false;
    const from = active;
    const st = hooks?.exit?.(from, next);
    if (st !== undefined) saved.set(from, { ...st });
    previous = from;
    active = next;
    hooks?.enter?.(next, from, saved.get(next));
    const change: ModeChange = { from, to: next, reason };
    listeners.forEach((l) => l(change));
    return true;
  };

  return {
    getMode: () => active,
    getPrevious: () => previous,
    getBase: () => base,
    getPolicy: () => MODE_POLICY[active],
    setBase(b) {
      if (b === base) return false;
      base = b;
      return apply('base');
    },
    request(mode, source, opts) {
      const escapable = opts?.escapable ?? mode === 'overview';
      const cur = reqs.find((r) => r.source === source);
      if (cur !== undefined && cur.mode === mode && cur.escapable === escapable) return false;
      reqs = reqs.filter((r) => r.source !== source);
      reqs.push({ mode, source, escapable, seq: ++seq });
      return apply('request');
    },
    release(source) {
      const n = reqs.length;
      reqs = reqs.filter((r) => r.source !== source);
      if (reqs.length === n) return false;
      return apply('release');
    },
    has: (source) => reqs.some((r) => r.source === source),
    escape() {
      const t = top();
      if (t === null || !t.escapable || t.mode !== active) return false;
      reqs = reqs.filter((r) => r !== t);
      apply('escape');
      return true;
    },
    canEscape() {
      const t = top();
      return t !== null && t.escapable && t.mode === active;
    },
    getSaved: (mode) => saved.get(mode),
    setHooks(h) {
      hooks = h;
    },
    reset() {
      reqs = [];
      base = 'thirdPerson';
      apply('reset');
      saved.clear();
      previous = null;
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}

// ---- Tùy chọn dễ chịu ----

export interface CameraComfort {
  /** Giảm chuyển động: cắt thẳng khi đổi chế độ, không trễ theo chiều cao, tắt rung. */
  reduceMotion: boolean;
  /** Hệ số rung camera 0..1. Mặc định thấp (0,25), không bật rung mạnh. */
  shakeScale: number;
}

export const DEFAULT_SHAKE_SCALE = 0.25;
export const COMFORT_STORAGE_KEY = 'gpb.camera.comfort.v1';

/** Đọc giá trị lưu (không tin dữ liệu). prefersReduced: hệ điều hành đang bật giảm chuyển động. */
export function sanitizeComfort(raw: unknown, prefersReduced = false): CameraComfort {
  const o = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const reduceMotion = typeof o.reduceMotion === 'boolean' ? o.reduceMotion : prefersReduced;
  const s = o.shakeScale;
  const shakeScale = typeof s === 'number' && Number.isFinite(s) ? Math.min(1, Math.max(0, s)) : DEFAULT_SHAKE_SCALE;
  return { reduceMotion, shakeScale };
}

/** Biên độ rung thực tế sau tùy chọn. */
export function effectiveShake(amount: number, c: CameraComfort): number {
  if (c.reduceMotion || !Number.isFinite(amount) || amount <= 0) return 0;
  return amount * c.shakeScale;
}

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export interface ComfortStore {
  get(): CameraComfort;
  update(patch: Partial<CameraComfort>): CameraComfort;
  subscribe(cb: () => void): () => void;
}

export function createComfortStore(storage: StorageLike | null, prefersReduced = false): ComfortStore {
  let raw: unknown = null;
  try {
    const s = storage?.getItem(COMFORT_STORAGE_KEY);
    raw = s ? JSON.parse(s) : null;
  } catch {
    raw = null;
  }
  let cur = sanitizeComfort(raw, prefersReduced);
  const listeners = new Set<() => void>();
  return {
    get: () => cur,
    update(patch) {
      cur = sanitizeComfort({ ...cur, ...patch }, prefersReduced);
      try {
        storage?.setItem(COMFORT_STORAGE_KEY, JSON.stringify(cur));
      } catch {
        /* bị chặn lưu trữ: chỉ giữ trong phiên */
      }
      listeners.forEach((l) => l());
      return cur;
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
