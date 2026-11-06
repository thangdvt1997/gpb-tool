/**
 * Logic thuần cho chế độ chụp ảnh nâng cao: kẹp camera tự do vào văn phòng, preset góc,
 * hướng nhìn, đếm ngược, kích thước ảnh theo hệ số nhân. Không import runtime nên test trực tiếp được.
 */
import type { Vec3 } from './cameraModes';

/** Hình chữ nhật mặt bằng (x, z) theo hệ three.js, cùng dạng Rect của scene/layout. */
export interface PlanBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Kẹp vị trí camera vào HỢP các hộp mặt bằng (chữ L) và dải độ cao. `margin` (m) lùi vào trong để
 * camera không chạm sát tường. Điểm đã nằm trong một hộp thì giữ nguyên; ngoài thì chọn điểm gần nhất
 * trên các hộp đã co lại. Đây là kẹp vào hộp, không phải raycast mesh: có thể nhìn xuyên vật nội thất.
 */
export function clampToOfficeBoxes(pos: Vec3, boxes: readonly PlanBox[], minY: number, maxY: number, margin = 0.3): Vec3 {
  const y = clamp(pos.y, minY, maxY);
  let best: { x: number; z: number; d: number } | null = null;
  for (const b of boxes) {
    // Hộp quá hẹp thì co về đường giữa thay vì đảo ngược.
    const m = Math.min(margin, (b.maxX - b.minX) / 2, (b.maxZ - b.minZ) / 2);
    const x = clamp(pos.x, b.minX + m, b.maxX - m);
    const z = clamp(pos.z, b.minZ + m, b.maxZ - m);
    const d = (x - pos.x) ** 2 + (z - pos.z) ** 2;
    if (!best || d < best.d) best = { x, z, d };
  }
  return best ? { x: best.x, y, z: best.z } : { x: pos.x, y, z: pos.z };
}

/** Hộp bao ngoài của các hộp mặt bằng, dùng làm Bounds thô cho PhotoCapture. */
export function boundingBox(boxes: readonly PlanBox[]): PlanBox {
  if (boxes.length === 0) return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    minZ: Math.min(...boxes.map((b) => b.minZ)),
    maxZ: Math.max(...boxes.map((b) => b.maxZ)),
  };
}

/** Yaw/pitch (rad) để camera ở `from` nhìn vào `to`. Quy ước: nhìn = (sin yaw, cos yaw), pitch dương là cúi xuống. */
export function lookAngles(from: Vec3, to: Vec3): { yaw: number; pitch: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const h = Math.hypot(dx, dz);
  return { yaw: Math.atan2(dx, dz), pitch: Math.atan2(-dy, h) };
}

export const PITCH_LIMIT = (85 * Math.PI) / 180;

/** Xoay bằng chuột: dx dương quay phải. Kẹp pitch để không lật ngược. */
export function applyLook(yaw: number, pitch: number, dxPx: number, dyPx: number, sensitivity = 0.003): { yaw: number; pitch: number } {
  return { yaw: yaw - dxPx * sensitivity, pitch: clamp(pitch + dyPx * sensitivity, -PITCH_LIMIT, PITCH_LIMIT) };
}

export type PresetId = 'portrait' | 'full' | 'wide' | 'top';

export interface PhotoPreset {
  id: PresetId;
  label: string;
  fov: number;
}

export const PRESETS: readonly PhotoPreset[] = [
  { id: 'portrait', label: 'Chân dung', fov: 35 },
  { id: 'full', label: 'Toàn thân', fov: 45 },
  { id: 'wide', label: 'Góc rộng', fov: 75 },
  { id: 'top', label: 'Từ trên xuống', fov: 60 },
];

export interface PresetPose {
  position: Vec3;
  target: Vec3;
  fov: number;
  yaw: number;
  pitch: number;
}

/**
 * Tính camera cho preset quanh nhân vật (x, z, yaw; chân ở y = 0). Camera đặt phía trước mặt nhân vật
 * (chính diện) cho chân dung/toàn thân; góc rộng đứng sau lưng, cao, lùi xa; từ trên xuống nhìn thẳng gần như đứng.
 */
export function computePresetPose(id: PresetId, player: { x: number; z: number; yaw: number }): PresetPose {
  const p = PRESETS.find((q) => q.id === id) ?? PRESETS[0]!;
  const fx = Math.sin(player.yaw);
  const fz = Math.cos(player.yaw);
  let dist: number;
  let height: number;
  let tgtH: number;
  let side: 1 | -1 = 1; // +1 trước mặt nhân vật, -1 sau lưng
  switch (id) {
    case 'portrait':
      dist = 1.2;
      height = 1.55;
      tgtH = 1.55;
      break;
    case 'full':
      dist = 3.4;
      height = 1.3;
      tgtH = 0.95;
      break;
    case 'wide':
      dist = 5.5;
      height = 2.4;
      tgtH = 1.0;
      side = -1;
      break;
    default:
      // Lệch 0.01 m để lookAt không suy biến khi nhìn thẳng đứng.
      dist = 0.01;
      height = 3.0;
      tgtH = 0;
      break;
  }
  const position = { x: player.x + fx * dist * side, y: height, z: player.z + fz * dist * side };
  const target = { x: player.x, y: tgtH, z: player.z };
  const a = lookAngles(position, target);
  return { position, target, fov: p.fov, yaw: a.yaw, pitch: a.pitch };
}

/** Đầu vào bay: phím giữ -> véc tơ di chuyển đơn vị (forward/right/up, mỗi trục -1..1). */
export function moveFromKeys(keys: ReadonlySet<string>): { forward: number; right: number; up: number } {
  const ax = (pos: string, neg: string): number => (keys.has(pos) ? 1 : 0) - (keys.has(neg) ? 1 : 0);
  return { forward: ax('KeyW', 'KeyS'), right: ax('KeyD', 'KeyA'), up: ax('KeyE', 'KeyQ') };
}

/** Quy đổi véc tơ đơn vị thành mét trong một khung: chéo không nhanh hơn, Shift chạy nhanh. */
export function scaleMove(
  m: { forward: number; right: number; up: number },
  dt: number,
  speed = 3,
  fast = false,
): { forward: number; right: number; up: number } {
  const len = Math.hypot(m.forward, m.right, m.up);
  if (len === 0 || !(dt > 0)) return { forward: 0, right: 0, up: 0 };
  const k = (speed * (fast ? 3 : 1) * Math.min(dt, 0.1)) / len;
  return { forward: m.forward * k, right: m.right * k, up: m.up * k };
}

/** Một bước đếm ngược (giây nguyên). Trả số mới; 0 nghĩa là chụp. */
export function nextCountdown(current: number): number {
  return Math.max(0, Math.floor(current) - 1);
}

export type CaptureScale = 1 | 2;

export interface BufferLimits {
  maxTexture: number;
  maxPixels: number;
}

export interface ScaledBuffer {
  width: number;
  height: number;
  /** Hệ số thực dùng (có thể nhỏ hơn yêu cầu, không dưới 1 trừ khi chính khung gốc đã vượt giới hạn). */
  scale: number;
  reduced: boolean;
  reason: 'none' | 'texture' | 'pixels';
}

/**
 * Kích thước buffer vẽ khi chụp = buffer hiện tại x hệ số (1x hoặc 2x), bị chặn bởi cạnh texture tối đa
 * và tổng pixel tối đa. Nếu vượt giới hạn thì giảm dần hệ số (có thể lẻ) và báo lý do để UI thông báo.
 */
export function computeScaledBuffer(baseW: number, baseH: number, scale: CaptureScale, limits: BufferLimits): ScaledBuffer | null {
  if (!(baseW >= 1) || !(baseH >= 1) || !(scale > 0)) return null;
  let k: number = scale;
  let reason: ScaledBuffer['reason'] = 'none';
  const edge = Math.max(baseW, baseH);
  if (limits.maxTexture >= 1 && edge * k > limits.maxTexture) {
    k = limits.maxTexture / edge;
    reason = 'texture';
  }
  if (limits.maxPixels >= 1 && baseW * baseH * k * k > limits.maxPixels) {
    k = Math.sqrt(limits.maxPixels / (baseW * baseH));
    reason = 'pixels';
  }
  k = Math.max(k, 0.01);
  let width = Math.max(1, Math.floor(baseW * k));
  let height = Math.max(1, Math.floor(baseH * k));
  // Làm tròn xuống có thể vẫn dư do chia số thực: lùi 1 px cho tới khi hợp lệ.
  while (limits.maxPixels >= 1 && width * height > limits.maxPixels && width > 1 && height > 1) {
    width -= 1;
    height = Math.max(1, Math.floor((height * width) / (width + 1)));
  }
  return { width, height, scale: width / baseW, reduced: reason !== 'none', reason };
}

/** Lỗi nghiêng (dutch roll) kẹp -45..45 độ, trả rad. */
export function tiltToRadians(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return (clamp(deg, -45, 45) * Math.PI) / 180;
}
