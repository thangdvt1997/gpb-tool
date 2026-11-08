import { useSyncExternalStore } from 'react';
import { AmbientEngine } from '../../audio/engine';
import { getSettings, subscribeSettings, updateSettings as updateCentralSettings, type Settings } from '../../settings';

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
  /** Tạm dừng do menu Esc (không tính phòng thay đồ, chụp ảnh...). Bảng an toàn camera chỉ hiện khi này bật. */
  menuPaused: boolean;
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

export const SENSITIVITY_RANGE = { min: 0.2, max: 3 } as const;

/**
 * Cài đặt thật nằm ở src/settings (khóa gpb.settings.v2, tự migrate từ gpb.controls.v1 khi chưa có v2;
 * khóa cũ không bị ghi hay xóa). ControlSettings chỉ là bản nhìn: helpHidden = !hintsEnabled.
 */
export function controlSettingsOf(s: Settings): ControlSettings {
  return { sensitivity: s.mouse.sensitivity, volume: s.volume, helpHidden: !s.hintsEnabled };
}

let snap: ControlSnapshot = { paused: false, menuPaused: false, firstPerson: false, seated: false, settings: controlSettingsOf(getSettings()) };
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

/** Tạm dừng do menu Esc (bật/tắt trực tiếp). */
let menuPaused = false;
/** Các lý do tạm dừng đang giữ (chụp ảnh, phòng thay đồ, mất ngữ cảnh WebGL...). */
const pauseHolds = new Set<symbol>();

function syncPaused(): void {
  const paused = menuPaused || pauseHolds.size > 0;
  if (snap.paused === paused && snap.menuPaused === menuPaused) return;
  if (paused && !snap.paused) resetTouchInput();
  emit({ ...snap, paused, menuPaused });
}

/** Menu tạm dừng (Esc). Không gỡ các lý do khác đang giữ: đóng menu khi phòng thay đồ mở vẫn giữ dừng. */
export function setPaused(paused: boolean): void {
  menuPaused = paused;
  syncPaused();
}

/**
 * Giữ trạng thái tạm dừng cho tới khi gọi hàm trả về. Nhiều nơi cùng giữ thì chỉ hết dừng khi mọi nơi nhả,
 * nên đóng chế độ chụp ảnh khi phòng thay đồ còn mở không mở khóa nhân vật. Gọi hàm nhả nhiều lần vô hại.
 */
export function holdPause(reason: string): () => void {
  const token = Symbol(reason);
  pauseHolds.add(token);
  syncPaused();
  return () => {
    if (pauseHolds.delete(token)) syncPaused();
  };
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
  const cur = getSettings();
  // Kết quả qua sanitize của kho trung tâm (kẹp khoảng); subscribeSettings bên dưới phát lại snapshot.
  updateCentralSettings({
    mouse: { ...cur.mouse, sensitivity: patch.sensitivity ?? cur.mouse.sensitivity },
    volume: patch.volume ?? cur.volume,
    hintsEnabled: patch.helpHidden === undefined ? cur.hintsEnabled : !patch.helpHidden,
  });
}

function syncFromCentral(): void {
  const next = controlSettingsOf(getSettings());
  const cur = snap.settings;
  if (next.sensitivity === cur.sensitivity && next.volume === cur.volume && next.helpHidden === cur.helpHidden) return;
  emit({ ...snap, settings: next });
  applyVolume();
}
subscribeSettings(syncFromCentral);

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
 * Không sửa src/audio: bọc resume/dispose của AmbientEngine để biết engine nào đang sống
 * và đặt âm lượng theo cài đặt ngay khi engine được dùng. Chỉ bọc một lần.
 */
function hookEngines(): void {
  const proto = AmbientEngine.prototype as AmbientEngine & { __gpbVolumeHook?: boolean };
  if (proto.__gpbVolumeHook) return;
  proto.__gpbVolumeHook = true;
  const origResume = proto.resume;
  const origDispose = proto.dispose;
  const track = (e: AmbientEngine): void => {
    if (engines.has(e)) return;
    engines.add(e);
    e.setVolume(snap.settings.volume * ENGINE_VOLUME_AT_MAX);
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
