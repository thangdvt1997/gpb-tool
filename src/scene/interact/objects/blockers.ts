import type { Rect } from '../../layout';
import type { Footprint } from '../registry';
import { leafEnd, type DoorState } from './door';

/**
 * Vật cản va chạm theo trạng thái vật tương tác (dữ liệu thuần, nối vào danh sách obstacles của Player).
 * Cửa: đóng/khóa/đang chạy thì lá nằm ở vị trí đóng (chặn lối); mở hẳn thì lá thành vật cản ở góc đã xoay, lối thông.
 */
export const DOOR_COLLIDER_THICKNESS = 0.08;

/** Hộp bao thẳng trục của đoạn [a,b] nở thêm t mỗi phía. */
export function segmentRect(a: { x: number; z: number }, b: { x: number; z: number }, t: number): Rect {
  return {
    minX: Math.min(a.x, b.x) - t,
    maxX: Math.max(a.x, b.x) + t,
    minZ: Math.min(a.z, b.z) - t,
    maxZ: Math.max(a.z, b.z) + t,
  };
}

/** Góc lá cửa dùng cho va chạm. Đang mở/đóng coi như đóng (lối vẫn chặn đến khi mở hẳn). */
export function doorColliderAngle(s: Pick<DoorState, 'phase' | 'angle' | 'dir'>, maxAngle: number): number {
  return s.phase === 'open' ? (s.angle !== 0 ? s.angle : s.dir * maxAngle) : 0;
}

export function doorBlocker(
  hinge: { x: number; z: number },
  yaw: number,
  length: number,
  s: Pick<DoorState, 'phase' | 'angle' | 'dir'>,
  maxAngle: number,
  thickness = DOOR_COLLIDER_THICKNESS,
): Rect {
  const e = leafEnd(hinge, yaw, doorColliderAngle(s, maxAngle), length);
  return segmentRect(hinge, e, thickness / 2);
}

export const footprintRect = (f: Footprint): Rect => ({ minX: f.cx - f.hx, maxX: f.cx + f.hx, minZ: f.cz - f.hz, maxZ: f.cz + f.hz });

/** Bàn đặt máy tính chặn đi xuyên: hộp bằng footprint bàn. */
export const deskBlocker = footprintRect;

export const rectsOverlap = (a: Rect, b: Rect): boolean => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

/** Rect chiếm chỗ của đối tượng đặt vào cảnh không được chồng bất kỳ rect nào trong danh sách. */
export const placementFree = (r: Rect, others: readonly Rect[]): boolean => !others.some((o) => rectsOverlap(r, o));

export interface FramePart {
  /** Tâm trong hệ cục bộ của cửa sổ (x ngang, y cao tính từ đáy khung, z độ sâu), và kích thước hộp. */
  pos: [number, number, number];
  size: [number, number, number];
  kind: 'frame' | 'glass';
}

/** Mesh khung cửa sổ đơn giản đặt sau rèm: bốn thanh khung, một thanh giữa và kính. */
export function windowFrameParts(width: number, height: number, bar = 0.06, depth = 0.08): FramePart[] {
  const sill = 0.9;
  const top = Math.max(sill + 0.3, height - 0.2);
  const wh = top - sill;
  const w = width + 0.2;
  const cy = sill + wh / 2;
  return [
    { kind: 'glass', pos: [0, cy, 0], size: [w - 2 * bar, wh - 2 * bar, 0.01] },
    { kind: 'frame', pos: [0, sill + bar / 2, 0], size: [w, bar, depth] },
    { kind: 'frame', pos: [0, top - bar / 2, 0], size: [w, bar, depth] },
    { kind: 'frame', pos: [-w / 2 + bar / 2, cy, 0], size: [bar, wh, depth] },
    { kind: 'frame', pos: [w / 2 - bar / 2, cy, 0], size: [bar, wh, depth] },
    { kind: 'frame', pos: [0, cy, 0], size: [bar, wh, depth] },
  ];
}

/** Vị trí cửa sổ phía sau rèm: lùi về phía tường (ngược hướng mặt rèm) `behind` mét. */
export function windowPlacement(curtain: { x: number; z: number; yaw: number }, behind = 0.04): { x: number; z: number } {
  return { x: curtain.x - Math.sin(curtain.yaw) * behind, z: curtain.z - Math.cos(curtain.yaw) * behind };
}

/** Rect của cửa sổ trên tường (để kiểm tra không chồng vật khác). */
export function windowRect(curtain: { x: number; z: number; yaw: number }, width: number, behind = 0.04, depth = 0.08): Rect {
  const p = windowPlacement(curtain, behind);
  const alongX = Math.abs(Math.cos(curtain.yaw)) > 0.5;
  const hx = (alongX ? width + 0.2 : depth) / 2;
  const hz = (alongX ? depth : width + 0.2) / 2;
  return { minX: p.x - hx, maxX: p.x + hx, minZ: p.z - hz, maxZ: p.z + hz };
}
