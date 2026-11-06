// Hình học phẳng cho minimap và tìm đường. Hàm thuần, không phụ thuộc DOM hay three.js.
// Hình chữ nhật: { minX, maxX, minZ, maxZ } theo tọa độ three.js (mét), cùng kiểu Rect của src/scene/layout.ts.

export const EPS = 1e-6;

/** Diện tích hình chữ nhật (0 nếu suy biến). */
export function rectArea(r) {
  return Math.max(0, r.maxX - r.minX) * Math.max(0, r.maxZ - r.minZ);
}

/** Diện tích phần giao của hai hình chữ nhật. */
export function overlapArea(a, b) {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const d = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  return w > 0 && d > 0 ? w * d : 0;
}

/** Nới hình chữ nhật m mét về mọi phía (m âm thì thu lại). */
export function inflateRect(r, m) {
  return { minX: r.minX - m, maxX: r.maxX + m, minZ: r.minZ - m, maxZ: r.maxZ + m };
}

/** Hình chữ nhật có tâm (cx, cz), rộng w theo x, sâu d theo z. */
export function rectFromCenter(cx, cz, w, d) {
  return { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 };
}

/** Khoảng cách từ điểm tới hình chữ nhật đặc (0 nếu điểm nằm trong hoặc trên cạnh). */
export function distPointRect(x, z, r) {
  const dx = Math.max(r.minX - x, 0, x - r.maxX);
  const dz = Math.max(r.minZ - z, 0, z - r.maxZ);
  return Math.hypot(dx, dz);
}

/** Điểm nằm trong ít nhất một hình chữ nhật (tính cả cạnh). */
export function pointInRects(x, z, rects, eps = EPS) {
  for (const r of rects) {
    if (x >= r.minX - eps && x <= r.maxX + eps && z >= r.minZ - eps && z <= r.maxZ + eps) return true;
  }
  return false;
}

/**
 * Hình vuông tâm (cx, cz), nửa cạnh half, nằm trọn trong hợp các hình chữ nhật.
 * Yêu cầu: các hình chữ nhật không chồng nhau (như OFFICE_L_RECTS), để tổng diện tích giao là chính xác.
 */
export function squareCovered(cx, cz, half, rects) {
  if (half <= 0) return pointInRects(cx, cz, rects);
  const sq = { minX: cx - half, maxX: cx + half, minZ: cz - half, maxZ: cz + half };
  const area = 4 * half * half;
  let covered = 0;
  for (const r of rects) covered += overlapArea(sq, r);
  return covered >= area * (1 - 1e-9) - 1e-12;
}

/** Hình chữ nhật bao của một danh sách hình chữ nhật. */
export function rectsBounds(rects) {
  if (rects.length === 0) throw new Error('rectsBounds: danh sách rỗng');
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.minX);
    maxX = Math.max(maxX, r.maxX);
    minZ = Math.min(minZ, r.minZ);
    maxZ = Math.max(maxZ, r.maxZ);
  }
  return { minX, maxX, minZ, maxZ };
}

/** Hình chữ nhật bao của đa giác [[x, z], ...]. */
export function polygonBounds(points) {
  if (points.length === 0) throw new Error('polygonBounds: đa giác rỗng');
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}

/**
 * Đoạn thẳng A-B đi qua phần TRONG (mở) của hình chữ nhật. Chạm cạnh không tính.
 * Liang–Barsky trên hình chữ nhật thu nhỏ EPS.
 */
export function segmentIntersectsRect(ax, az, bx, bz, r) {
  const minX = r.minX + EPS;
  const maxX = r.maxX - EPS;
  const minZ = r.minZ + EPS;
  const maxZ = r.maxZ - EPS;
  if (minX >= maxX || minZ >= maxZ) return false;
  const dx = bx - ax;
  const dz = bz - az;
  let t0 = 0;
  let t1 = 1;
  const clip = (p, q) => {
    if (Math.abs(p) < 1e-12) return q > 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  if (!clip(-dx, ax - minX)) return false;
  if (!clip(dx, maxX - ax)) return false;
  if (!clip(-dz, az - minZ)) return false;
  if (!clip(dz, maxZ - az)) return false;
  return t1 > t0;
}

/** Độ dài đường gấp khúc [{x, z}, ...]. */
export function polylineLength(points) {
  let s = 0;
  for (let i = 1; i < points.length; i++) s += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  return s;
}
