// Dựng dải mỏng trên sàn dọc tuyến: một BufferGeometry, một draw call. Hàm thuần (không import three) để test.
// Mỗi đoạn là một hình chữ nhật rộng `width`, kéo dài thêm width / 2 ở hai đầu để phủ khớp nối.

export interface StripData {
  /** x, y, z liên tiếp, 4 đỉnh mỗi đoạn. */
  positions: Float32Array;
  /** 6 chỉ số mỗi đoạn (hai tam giác). */
  indices: Uint32Array;
}

export function buildRouteStrip(
  points: ReadonlyArray<{ x: number; z: number }>,
  opts: { width?: number; y?: number } = {},
): StripData {
  const width = opts.width ?? 0.14;
  const y = opts.y ?? 0.03;
  const half = width / 2;
  const segs: Array<[number, number, number, number]> = [];
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    if (Math.hypot(b.x - a.x, b.z - a.z) > 1e-6) segs.push([a.x, a.z, b.x, b.z]);
  }
  const positions = new Float32Array(segs.length * 12);
  const indices = new Uint32Array(segs.length * 6);
  segs.forEach(([ax, az, bx, bz], s) => {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const ux = dx / len;
    const uz = dz / len;
    // Pháp tuyến trong mặt phẳng sàn.
    const nx = -uz * half;
    const nz = ux * half;
    const sx = ax - ux * half;
    const sz = az - uz * half;
    const ex = bx + ux * half;
    const ez = bz + uz * half;
    const o = s * 12;
    positions.set([sx + nx, y, sz + nz, sx - nx, y, sz - nz, ex + nx, y, ez + nz, ex - nx, y, ez - nz], o);
    const v = s * 4;
    indices.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], s * 6);
  });
  return { positions, indices };
}
