import { OFFICE_L_PLAN_RECTS } from '../officeBounds';
import { toWorldX, toWorldZ } from '../layout';

/**
 * Camera điểm đặt sẵn (room.txt mục 7): toàn cảnh, hành lang trái, hành lang dưới, cụm bàn, phòng họp.
 * Chạy trên chế độ camera 'overview' (trần ẩn, đi và xoay được): preset chỉ đổi điểm bám, góc và khoảng cách.
 * Tọa độ lấy từ hình L (officeBounds.ts, tọa độ bản vẽ m) rồi đổi sang three.js; thoát (Esc, phím preset hết vòng,
 * phím toàn cảnh) thì camera trở lại bám nhân vật. Module thuần (không three), gtaCamera.ts đọc mỗi khung.
 */
export interface CameraPreset {
  id: string;
  label: string;
  /** Điểm nhìn (three.js x, z). */
  x: number;
  z: number;
  /** Hướng nhìn (rad, quy ước playerPose: nhìn = (sin yaw, cos yaw)). */
  yaw: number;
  pitch: number;
  dist: number;
}

const mid = (a: number, b: number): number => (a + b) / 2;
const left = OFFICE_L_PLAN_RECTS[0];
const bottomLeft = OFFICE_L_PLAN_RECTS[1];
const secBand = OFFICE_L_PLAN_RECTS[4];

/** Toàn cảnh: tâm hộp bao của hình L. */
const LX0 = Math.min(...OFFICE_L_PLAN_RECTS.map((r) => r[0]));
const LX1 = Math.max(...OFFICE_L_PLAN_RECTS.map((r) => r[1]));
const LY0 = Math.min(...OFFICE_L_PLAN_RECTS.map((r) => r[2]));
const LY1 = Math.max(...OFFICE_L_PLAN_RECTS.map((r) => r[3]));

export const CAMERA_PRESETS: readonly CameraPreset[] = [
  // Tâm hộp bao nằm ngoài chữ L (khuyết góc Đông-Bắc) nên dời về nhánh dọc/ngang cho nằm trong L.
  { id: 'overview', label: 'Toàn cảnh', x: toWorldX(mid(LX0, LX1) - 5), z: toWorldZ(mid(LY0, LY1) + 3), yaw: Math.PI, pitch: 1.3, dist: 30 },
  // Nhánh dọc bên trái (x bản vẽ 0–14,5): nhìn dọc theo hành lang.
  { id: 'corridor_left', label: 'Hành lang trái', x: toWorldX(mid(left[0], left[1])), z: toWorldZ(mid(left[2], left[3])), yaw: 0, pitch: 1.15, dist: 22 },
  // Nhánh ngang phía dưới (y bản vẽ 18–30, từ sảnh sang đông): nhìn dọc theo hành lang.
  { id: 'corridor_bottom', label: 'Hành lang dưới', x: toWorldX(mid(bottomLeft[0], secBand[1])), z: toWorldZ(mid(18, 30)), yaw: Math.PI / 2, pitch: 1.15, dist: 24 },
  // Dãy bàn desk_B1..B7 (z = 7,2): giữa dãy.
  { id: 'desk_cluster', label: 'Cụm bàn', x: -5, z: 7.2, yaw: 0, pitch: 1.0, dist: 14 },
  // Phòng họp mr1 (-18, -2,15).
  { id: 'meeting_room', label: 'Phòng họp', x: -18, z: -2.15, yaw: 0, pitch: 1.05, dist: 11 },
];

export function getPreset(id: string | null): CameraPreset | null {
  return CAMERA_PRESETS.find((p) => p.id === id) ?? null;
}

/** Preset kế tiếp trong vòng; hết vòng trả null (thoát về camera theo nhân vật). */
export function nextPresetId(cur: string | null): string | null {
  if (cur === null) return CAMERA_PRESETS[0].id;
  const i = CAMERA_PRESETS.findIndex((p) => p.id === cur);
  return i < 0 || i + 1 >= CAMERA_PRESETS.length ? null : CAMERA_PRESETS[i + 1].id;
}

let active: string | null = null;
let applier: ((p: CameraPreset | null) => void) | null = null;
const listeners = new Set<() => void>();

export function getActivePresetId(): string | null {
  return active;
}

export function getActivePreset(): CameraPreset | null {
  return getPreset(active);
}

export function subscribePreset(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Đặt trạng thái preset (không đụng camera). null = không dùng preset. */
export function setActivePresetId(id: string | null): void {
  const next = getPreset(id) ? id : null;
  if (next === active) return;
  active = next;
  listeners.forEach((l) => l());
}

/** useGtaCamera đăng ký hàm áp preset lên camera thật (vào overview, đặt góc). */
export function setPresetApplier(fn: ((p: CameraPreset | null) => void) | null): void {
  applier = fn;
}

/** Chọn preset theo id (null = thoát). Trả false nếu camera chưa sẵn sàng hoặc id không có. */
export function selectPreset(id: string | null): boolean {
  if (id !== null && !getPreset(id)) return false;
  if (!applier) return false;
  applier(getPreset(id));
  return true;
}

/** Phím preset: chuyển sang preset kế tiếp, hết vòng thì thoát. */
export function cyclePreset(): boolean {
  return selectPreset(nextPresetId(active));
}
