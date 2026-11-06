// Hàm thuần cho hình học mặt bằng (mặt phẳng x-z, đơn vị mét). Không đụng tới DB hay HTTP.

// Sai số số thực: hai cạnh chênh nhau dưới EPS được coi là bằng nhau.
export const EPS = 1e-6;

// size = [w, h, d] theo quy ước của scene: w đi theo trục x, d đi theo trục z (xem src/scene/layout.ts).
// Xoay 90 hoặc 270 độ thì đổi chỗ w và d. h không ảnh hưởng footprint.
export function rotatedSize(size, rotation) {
  const w = size[0];
  const d = size[2];
  return rotation === 90 || rotation === 270 ? [d, w] : [w, d];
}

// Hình chữ nhật trục (AABB) của vật đặt tại tâm (x, z) sau khi xoay.
export function footprintOf({ x, z, rotation = 0, size }) {
  const [w, d] = rotatedSize(size, rotation);
  return {
    minX: x - w / 2,
    maxX: x + w / 2,
    minZ: z - d / 2,
    maxZ: z + d / 2,
  };
}

// true nếu hai hình chữ nhật chồng lên nhau, sau khi mở rộng b thêm margin ở mỗi phía.
// Với margin = 0,6 nghĩa là khoảng cách giữa hai mép phải đạt tối thiểu 0,6 m. Đúng 0,6 m vẫn đạt.
export function rectsOverlap(a, b, margin = 0) {
  return (
    a.minX < b.maxX + margin - EPS &&
    a.maxX > b.minX - margin + EPS &&
    a.minZ < b.maxZ + margin - EPS &&
    a.maxZ > b.minZ - margin + EPS
  );
}

// Khoảng cách từ điểm (cx, cz) tới hình chữ nhật gần nhất. Bằng 0 nếu điểm nằm trong hình.
export function distanceToRect(cx, cz, rect) {
  const nx = Math.min(Math.max(cx, rect.minX), rect.maxX);
  const nz = Math.min(Math.max(cz, rect.minZ), rect.maxZ);
  return Math.hypot(cx - nx, cz - nz);
}
