import type { Rect } from '../scene/layout';
import { OFFICE_L_RECTS } from '../scene/officeBounds';

/** Số đoạn tối đa, chặn bước lưới quá nhỏ làm nặng cảnh. */
export const MAX_GRID_SEGMENTS = 4000;

/**
 * Các đoạn thẳng (x1,z1,x2,z2 xen kẽ) của lưới bước `step` mét, cắt theo các hình chữ nhật của chữ L.
 * Đường lưới nằm trên bội số của step theo toạ độ thế giới. Trả mảng rỗng nếu step không hợp lệ.
 */
export function gridSegments(step: number, rects: readonly Rect[] = OFFICE_L_RECTS): Float32Array {
  if (!(step > 0)) return new Float32Array(0);
  const out: number[] = [];
  const eps = 1e-6;
  for (const r of rects) {
    for (let x = Math.ceil((r.minX - eps) / step); x * step <= r.maxX + eps; x++) {
      out.push(x * step, r.minZ, x * step, r.maxZ);
    }
    for (let z = Math.ceil((r.minZ - eps) / step); z * step <= r.maxZ + eps; z++) {
      out.push(r.minX, z * step, r.maxX, z * step);
    }
    if (out.length / 4 > MAX_GRID_SEGMENTS) return new Float32Array(0);
  }
  return Float32Array.from(out);
}
