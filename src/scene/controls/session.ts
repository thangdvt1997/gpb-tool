import { useSyncExternalStore } from 'react';
import { AmbientEngine } from '../../audio/engine';

/**
 * Trạng thái phiên điều khiển dùng chung giữa cảnh 3D (trong Canvas) và lớp giao diện (ngoài Canvas):
 * tạm dừng, góc nhìn thứ nhất, đang ngồi, cài đặt (độ nhạy chuột, âm lượng, ẩn bảng phím),
 * đầu vào cảm ứng (joystick, nút chạy, nhảy) và yêu cầu ngồi hoặc đứng dậy.
 * Snapshot chỉ thay khi giá trị đổi, nên useFrame đọc mỗi khung không gây render.
 */

export interface ControlSettings {
  /** Hệ số độ nhạy chuột, 0,2 đến 3. Mặc định 1. */
  sensitivity: number;
  /** Âm lượng, 0 đến 1. Mặc định 0,5 (bằng mức mặc định của âm nền). */
  volume: number;
  /** true: thu gọn bảng hướng dẫn phím. */
  helpHidden: boolean;
}

export interface ControlSnapshot {
  paused: boolean;
  firstPerson: boolean;
  seated: boolean;
  settings: ControlSettings;
}

/** Chỗ ngồi: vị trí khớp hông trên ghế và hướng mặt (quy ước playerPose). */
export interface SeatSpot {
  id: string;
  x: number;
  z: number;
  yaw: number;
}

const STORAGE_KEY = 'gpb.controls.v1';
const DEFAULT_SETTINGS: ControlSettings = { sensitivity: 1, volume: 0.5, helpHidden: false };
export const SENSITIVITY_RANGE = { min: 0.2, max: 3 } as const;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function loadSettings(): ControlSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return { ...DEFAULT_SETTINGS };
    const o = v as Record<string, unknown>;
    return {
      sensitivity:
        typeof o.sensitivity === 'number' && Number.isFinite(o.sensitivity)
          ? clamp(o.sensitivity, SENSITIVITY_RANGE.min, SENSITIVITY_RANGE.max)
          : DEFAULT_SETTINGS.sensitivity,
      volume: typeof o.volume === 'number' && Number.isFinite(o.volume) ? clamp(o.volume, 0, 1) : DEFAULT_SETTINGS.volume,
      helpHidden: typeof o.helpHidden === 'boolean' ? o.helpHidden : DEFAULT_SETTINGS.helpHidden,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s: ControlSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* chế độ riêng tư hoặc bị chặn lưu trữ: bỏ qua */
  }
}

let snap: ControlSnapshot = { paused: false, firstPerson: false, seated: false, settings: loadSettings() };
const listeners = new Set<() => void>();

function emit(next: ControlSnapshot): void {
  snap = next;
  listeners.forEach((l) => l());
}

export function subscribeControls(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getControls(): ControlSnapshot {
  return snap;
}

export function useControlSnapshot(): ControlSnapshot {
  return useSyncExternalStore(subscribeControls, getControls, getControls);
}

export function setPaused(paused: boolean): void {
  if (snap.paused === paused) return;
  if (paused) resetTouchInput();
  emit({ ...snap, paused });
}

export function setFirstPerson(firstPerson: boolean): void {
  if (snap.firstPerson === firstPerson) return;
  emit({ ...snap, firstPerson });
}

export function toggleFirstPerson(): void {
  setFirstPerson(!snap.firstPerson);
}

/** Chỉ module điều khiển gọi: báo nhân vật đang ngồi hay không. */
export function setSeated(seated: boolean): void {
  if (snap.seated === seated) return;
  emit({ ...snap, seated });
}

export function updateSettings(patch: Partial<ControlSettings>): void {
  const next: ControlSettings = { ...snap.settings, ...patch };
  next.sensitivity = clamp(next.sensitivity, SENSITIVITY_RANGE.min, SENSITIVITY_RANGE.max);
  next.volume = clamp(next.volume, 0, 1);
  saveSettings(next);
  emit({ ...snap, settings: next });
  applyVolume();
}

// ---- Đầu vào cảm ứng (ghi từ lớp giao diện, đọc trong useFrame). Không gây render. ----

/** Joystick trái: x sang phải, y tiến lên, độ dài tối đa 1. run: nút chạy đang giữ. */
export const touchInput = { x: 0, y: 0, run: false };
let touchJump = false;

export function requestTouchJump(): void {
  touchJump = true;
}

export function consumeTouchJump(): boolean {
  const v = touchJump;
  touchJump = false;
  return v;
}

export function resetTouchInput(): void {
  touchInput.x = 0;
  touchInput.y = 0;
  touchInput.run = false;
  touchJump = false;
}

// ---- Ngồi và đứng dậy: InteractTracker gửi yêu cầu, useGtaPlayer thực hiện trong khung kế tiếp. ----

let seatRequest: SeatSpot | 'stand' | null = null;

export function requestSit(seat: SeatSpot): void {
  seatRequest = seat;
}

export function requestStand(): void {
  seatRequest = 'stand';
}

export function takeSeatRequest(): SeatSpot | 'stand' | null {
  const r = seatRequest;
  seatRequest = null;
  return r;
}

// ---- Âm lượng: áp lên mọi AmbientEngine đang sống (âm nền, SFX và nhạc chủ đề đi qua master của engine). ----

/** Âm lượng engine ứng với thanh trượt 1,0. Thanh 0,5 cho 0,15, đúng mức mặc định của engine. */
const ENGINE_VOLUME_AT_MAX = 0.3;
const engines = new Set<AmbientEngine>();

function applyVolume(): void {
  const v = snap.settings.volume * ENGINE_VOLUME_AT_MAX;
  engines.forEach((e) => e.setVolume(v));
}

/**
 * Không sửa src/audio: bọc setZone/resume/dispose của AmbientEngine để biết engine nào đang sống
 * và đặt âm lượng theo cài đặt ngay khi engine được dùng. Chỉ bọc một lần.
 */
function hookEngines(): void {
  const proto = AmbientEngine.prototype as AmbientEngine & { __gpbVolumeHook?: boolean };
  if (proto.__gpbVolumeHook) return;
  proto.__gpbVolumeHook = true;
  const origSetZone = proto.setZone;
  const origResume = proto.resume;
  const origDispose = proto.dispose;
  const track = (e: AmbientEngine): void => {
    if (engines.has(e)) return;
    engines.add(e);
    e.setVolume(snap.settings.volume * ENGINE_VOLUME_AT_MAX);
  };
  proto.setZone = function (this: AmbientEngine, ...args: Parameters<AmbientEngine['setZone']>) {
    track(this);
    return origSetZone.apply(this, args);
  };
  proto.resume = function (this: AmbientEngine, ...args: Parameters<AmbientEngine['resume']>) {
    track(this);
    return origResume.apply(this, args);
  };
  proto.dispose = function (this: AmbientEngine, ...args: Parameters<AmbientEngine['dispose']>) {
    engines.delete(this);
    return origDispose.apply(this, args);
  };
}

hookEngines();
