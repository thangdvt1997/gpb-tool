// Chuyển đổi tọa độ world (three.js, mét) <-> map (pixel màn hình, y hướng xuống).
//
// Quy ước world: x sang Đông, z sang Nam (bản vẽ y xuống dưới, worldZ = y - 15). Bắc là -z.
// Bản đồ hướng Bắc lên trên: u tăng theo x, v tăng theo z.
// Quy ước hướng nhân vật (src/scene/controls/playerPose.ts): hướng nhìn = (sin yaw, cos yaw) theo (x, z),
// yaw = π nhìn về -z (Bắc).

const TAU = Math.PI * 2;

/** Chuẩn hóa góc về (-π, π]. */
export function wrapAngle(a) {
  let r = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  if (r <= -Math.PI) r += TAU;
  return r;
}

/**
 * Bản đồ cố định hướng Bắc, khớp trọn bounds (thường là bounds của đa giác chữ L) vào khung width x height,
 * giữ tỷ lệ 1:1 giữa x và z, căn giữa phần dư, chừa lề padding pixel.
 */
export function createMapTransform({ bounds, width, height, padding = 0 }) {
  const bw = bounds.maxX - bounds.minX;
  const bd = bounds.maxZ - bounds.minZ;
  if (!(bw > 0) || !(bd > 0)) throw new Error('createMapTransform: bounds suy biến');
  const availW = Math.max(1, width - 2 * padding);
  const availH = Math.max(1, height - 2 * padding);
  const scale = Math.min(availW / bw, availH / bd);
  const offsetX = padding + (availW - bw * scale) / 2;
  const offsetY = padding + (availH - bd * scale) / 2;
  return {
    bounds,
    width,
    height,
    scale,
    offsetX,
    offsetY,
    worldToMap(x, z) {
      return { u: offsetX + (x - bounds.minX) * scale, v: offsetY + (z - bounds.minZ) * scale };
    },
    mapToWorld(u, v) {
      return { x: bounds.minX + (u - offsetX) / scale, z: bounds.minZ + (v - offsetY) / scale };
    },
  };
}

/**
 * Góc hướng nhìn trên bản đồ hướng Bắc, đo theo chiều kim đồng hồ từ "lên trên" (radian, (-π, π]).
 * Hướng (sin yaw, cos yaw) trên màn hình (u phải, v xuống) có góc θ = π - yaw.
 */
export function headingAngle(yaw) {
  return wrapAngle(Math.PI - yaw);
}

/**
 * Góc xoay bản đồ (theo chiều kim đồng hồ) cho từng chế độ.
 * - 'north': 0.
 * - 'heading': -headingAngle(yaw), để hướng nhìn luôn chỉ lên trên.
 */
export function mapRotation(mode, yaw) {
  return mode === 'heading' ? wrapAngle(-headingAngle(yaw)) : 0;
}

/** Góc vẽ icon nhân vật (theo chiều kim đồng hồ từ lên trên). 'heading' luôn 0. */
export function iconAngle(mode, yaw) {
  return wrapAngle(headingAngle(yaw) + mapRotation(mode, yaw));
}

/** Góc vẽ mũi tên chỉ Bắc. 'north' luôn 0 (lên trên). */
export function northAngle(mode, yaw) {
  return mapRotation(mode, yaw);
}

/**
 * Khung nhìn quanh một tâm: dùng cho minimap (tâm = nhân vật) và bản đồ lớn đã zoom (tâm tùy chọn).
 * scale: pixel trên mét. rotation: góc xoay bản đồ theo chiều kim đồng hồ (xem mapRotation).
 */
export function createViewTransform({ center, scale, width, height, rotation = 0 }) {
  if (!(scale > 0)) throw new Error('createViewTransform: scale phải dương');
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  const cu = width / 2;
  const cv = height / 2;
  return {
    center,
    scale,
    width,
    height,
    rotation,
    worldToMap(x, z) {
      const du = (x - center.x) * scale;
      const dv = (z - center.z) * scale;
      return { u: cu + du * c - dv * s, v: cv + du * s + dv * c };
    },
    mapToWorld(u, v) {
      const du = u - cu;
      const dv = v - cv;
      // Xoay ngược (ma trận trực giao: nghịch đảo = chuyển vị).
      return { x: center.x + (du * c + dv * s) / scale, z: center.z + (-du * s + dv * c) / scale };
    },
  };
}
