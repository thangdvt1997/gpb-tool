/**
 * Va chạm camera tự do của chế độ chụp ảnh: không đi vào đồ nội thất lớn, không xuyên băng rôn/biển treo.
 * Dùng lại bộ lọc vật cản của camera chính (cameraBlockers, bỏ qua props nhỏ) và hangingCameraScale; chỉ thêm
 * phần "trượt" dọc vật cản khi di chuyển. Thuần, không cấp phát lớn mỗi khung.
 */
import type { Rect } from '../scene/layout';
import { CAM, cameraBlockers } from '../scene/controls/gtaCamera';
import { hangingCameraScale } from '../scene/controls/hangingClearance';
import type { Vec3 } from './cameraModes';

/** Bán kính camera chụp ảnh (m): khoảng giữ cách tới mặt vật cản. */
export const PHOTO_CAM_RADIUS = 0.2;

function insideAny(x: number, y: number, z: number, blockers: readonly Rect[], radius: number): boolean {
  // Vật cản 2D không có chiều cao: tính cao tới obstacleTop như camera chính (trên mức đó camera bay qua).
  if (y >= CAM.obstacleTop) return false;
  for (let i = 0; i < blockers.length; i++) {
    const r = blockers[i]!;
    if (x > r.minX - radius && x < r.maxX + radius && z > r.minZ - radius && z < r.maxZ + radius) return true;
  }
  return false;
}

/** Điểm (x, y, z) có nằm trong vật cản camera (đã nở theo bán kính) không. */
export function isInsideCameraBlocker(p: Vec3, obstacles: readonly Rect[], radius = PHOTO_CAM_RADIUS): boolean {
  return insideAny(p.x, p.y, p.z, cameraBlockers(obstacles), radius);
}

/**
 * Đẩy điểm đang nằm trong vật cản ra mép gần nhất (lặp vài vòng vì có thể rơi vào vật cản kế bên).
 * Điểm đã tự do thì giữ nguyên. Dùng khi vào chế độ bay hoặc đặt preset.
 */
export function escapeBlockers(p: Vec3, obstacles: readonly Rect[], radius = PHOTO_CAM_RADIUS): Vec3 {
  const blockers = cameraBlockers(obstacles);
  let x = p.x;
  let z = p.z;
  if (p.y >= CAM.obstacleTop) return p;
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (let i = 0; i < blockers.length; i++) {
      const r = blockers[i]!;
      const x0 = r.minX - radius;
      const x1 = r.maxX + radius;
      const z0 = r.minZ - radius;
      const z1 = r.maxZ + radius;
      if (!(x > x0 && x < x1 && z > z0 && z < z1)) continue;
      const dl = x - x0;
      const dr = x1 - x;
      const dn = z - z0;
      const df = z1 - z;
      const m = Math.min(dl, dr, dn, df);
      if (m === dl) x = x0;
      else if (m === dr) x = x1;
      else if (m === dn) z = z0;
      else z = z1;
      moved = true;
    }
    if (!moved) break;
  }
  return x === p.x && z === p.z ? p : { x, y: p.y, z };
}

/**
 * Bước di chuyển camera từ `from` tới `to` có chặn và trượt. Thử lần lượt: đích; chỉ thành phần x; chỉ thành phần z;
 * chỉ độ cao; đứng yên. Một ứng viên được nhận khi không nằm trong vật cản và đoạn from -> ứng viên không cắt
 * băng rôn. Điểm xuất phát đã nằm trong vật cản (lỡ đặt vào) thì được phép đi tiếp để thoát ra.
 */
export function slideCamera(from: Vec3, to: Vec3, obstacles: readonly Rect[], radius = PHOTO_CAM_RADIUS): Vec3 {
  const blockers = cameraBlockers(obstacles);
  const stuck = insideAny(from.x, from.y, from.z, blockers, radius);
  const ok = (x: number, y: number, z: number): boolean => {
    if (!stuck && insideAny(x, y, z, blockers, radius)) return false;
    return hangingCameraScale(from.x, from.y, from.z, x, y, z) >= 1;
  };
  if (ok(to.x, to.y, to.z)) return to;
  if (to.x !== from.x && ok(to.x, to.y, from.z)) return { x: to.x, y: to.y, z: from.z };
  if (to.z !== from.z && ok(from.x, to.y, to.z)) return { x: from.x, y: to.y, z: to.z };
  if (to.y !== from.y && ok(from.x, to.y, from.z)) return { x: from.x, y: to.y, z: from.z };
  return from;
}

/**
 * Vật cản của camera chụp ảnh = bố trí tĩnh + vật cản động theo bố trí người dùng (cùng nguồn với nhân vật:
 * editor.blockers). Chưa có bố trí người dùng thì extra rỗng và trả đúng bố trí tĩnh.
 */
export function buildPhotoObstacles(staticRects: readonly Rect[], extra: readonly Rect[] = []): readonly Rect[] {
  return extra.length === 0 ? staticRects : [...staticRects, ...extra];
}
