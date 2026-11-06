import * as THREE from 'three';
import { FLOOR, toWorldX, toWorldZ } from '../scene/layout';

/** Bước lưới bắt điểm, mét. */
export const GRID_STEP = 0.5;

/**
 * Quy ước toạ độ trong src/layout:
 * - Thế giới (three.js): gốc ở giữa sàn. Pose.x, Pose.z và ZoneObject.position dùng hệ này.
 * - Bản vẽ CAD: gốc trên-trái, mét (docs/FLOORPLAN_IT.md).
 *   x_bv = worldX + 29, y_bv = worldZ + 15. Ngược lại worldX = x_bv - 29, worldZ = y_bv - 15.
 *   Cột thứ hai của bản vẽ là y_bv, tương ứng với z trong three.js.
 */
export function toDrawing(worldX: number, worldZ: number): { x: number; y: number } {
  return { x: worldX + FLOOR.width / 2, y: worldZ + FLOOR.depth / 2 };
}

/** Bản vẽ sang thế giới. Đi qua toWorldX / toWorldZ của src/scene/layout. */
export function toWorld(drawingX: number, drawingY: number): { x: number; z: number } {
  return { x: toWorldX(drawingX), z: toWorldZ(drawingY) };
}

/** Mặt sàn y = 0, pháp tuyến hướng lên. */
const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitScratch = new THREE.Vector3();

/**
 * Giao điểm tia với mặt sàn y = 0, theo toạ độ thế giới (chưa bắt lưới).
 * Trả null nếu tia không cắt mặt sàn (song song hoặc hướng ra xa sàn).
 * Dùng với event.ray của R3F.
 */
export function worldPointFromRay(ray: THREE.Ray): { x: number; z: number } | null {
  const hit = ray.intersectPlane(FLOOR_PLANE, hitScratch);
  return hit ? { x: hit.x, z: hit.z } : null;
}

/** Làm tròn một toạ độ thế giới về lưới GRID_STEP. */
export function snapToGrid(v: number): number {
  return Math.round(v / GRID_STEP) * GRID_STEP;
}
