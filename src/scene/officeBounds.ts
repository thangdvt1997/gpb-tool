// Phạm vi văn phòng hình chữ L theo đường khoanh xanh của người dùng
// (promy_update/ảnh văn phòng/Screenshot 2026-11-06 194350.png, room.txt mục 1).
//
// Hiệu chỉnh ảnh (ảnh 1645 x 923 px): khu dự phòng (reserved, bản vẽ x 14.5–29.9, y 0.2–15.2) nằm ở pixel
// x 445–870, y 78–470, nên x ≈ (px − 45) / 27.6 và y ≈ (py − 73) / 26.1. Lõi core_lift1, core_lift2, core_st3
// và dãy bàn desk_B, phòng mr2..soc_room khớp sai số dưới 0,7 m theo công thức này. Mỗi đỉnh của đường xanh
// được bắt về cạnh vật thể có sẵn gần nhất trong it.json (xem docs/FLOORPLAN_IT.md, mục "Phạm vi hình chữ L").
//
// Đường xanh chỉ đánh dấu phạm vi, không phải tường: không dựng tường hay va chạm theo các cạnh trong của L.
//
// Nới 2026-11-06 (người dùng chốt: lối vào tầng 7 nằm trong L): thêm khu an ninh x 29.9–35.9 từ y 8.1
// (moderation_desk y 9.1 trừ 1 m lề) xuống tới nhánh ngang, gồm trọn core_lift2 (cabin lift7_east, tường
// checkin_board), và hành lang giữa x 18.6–29.9, y 12.4–15.2 (đường chuỗi cảnh y 13.4 ± 1 m, điểm thả
// 20.2, 13.4), nối liền sảnh tại y 15.2.

import type { ZoneObject } from '../content/types';
import { footprint, toWorldX, toWorldZ, type Rect } from './layout';

/** Đỉnh (x, y) theo bản vẽ (m, gốc trên-trái), theo chiều kim đồng hồ khi nhìn từ trên xuống. */
export const OFFICE_L_PLAN: ReadonlyArray<readonly [number, number]> = [
  [0, 0], // góc Tây-Bắc tòa nhà
  [14.5, 0], // mép Tây khu dự phòng, tường Bắc
  [14.5, 15.2], // góc Tây-Nam khu dự phòng
  [18.6, 15.2], // mép Nam khu dự phòng, tới đầu Tây hành lang central
  [18.6, 12.4], // đầu Tây central, lên tới làn chuỗi cảnh y 13.4 trừ 1 m
  [29.9, 12.4], // dọc mép Bắc hành lang giữa, tới mép Đông khu dự phòng
  [29.9, 8.1], // mép Tây khu an ninh, lên tới moderation_desk y 9.1 trừ 1 m
  [35.9, 8.1], // mép Bắc khu an ninh, tới mặt Tây core_lift3 / wc_block
  [35.9, 18.5], // mặt Đông core_lift2, xuống mép Nam các lõi
  [45.1, 18.5], // mép Nam core_st3, tới cạnh Đông khối WC / open_north
  [45.1, 30], // xuống tường Nam
  [0, 30], // góc Tây-Nam tòa nhà
];

/** Tọa độ bản vẽ (m): x0, x1, y0, y1. */
export type PlanRect = readonly [number, number, number, number];

/** Năm hình chữ nhật không chồng nhau, hợp lại đúng bằng OFFICE_L_PLAN. */
export const OFFICE_L_PLAN_RECTS: readonly PlanRect[] = [
  [0, 14.5, 0, 30], // nhánh dọc bên trái
  [14.5, 18.6, 15.2, 30], // nhánh ngang, đoạn core_lift1 phía Tây
  [18.6, 29.9, 12.4, 30], // hành lang giữa, sảnh, service_desk
  [29.9, 35.9, 8.1, 30], // khu an ninh, core_lift2 (cabin lift7_east)
  [35.9, 45.1, 18.5, 30], // nhánh ngang, đoạn dưới core_st3
];

/** Đa giác chữ L theo tọa độ three.js (x, z), cùng hệ với position trong it.json. */
export const OFFICE_L_POLYGON: ReadonlyArray<readonly [number, number]> = OFFICE_L_PLAN.map(
  ([x, y]) => [toWorldX(x), toWorldZ(y)] as const,
);

const toWorldRect = ([x0, x1, y0, y1]: PlanRect): Rect => ({
  minX: toWorldX(x0),
  maxX: toWorldX(x1),
  minZ: toWorldZ(y0),
  maxZ: toWorldZ(y1),
});

/** OFFICE_L_PLAN_RECTS theo tọa độ three.js. */
export const OFFICE_L_RECTS: readonly Rect[] = OFFICE_L_PLAN_RECTS.map(toWorldRect);

const EPS = 1e-6;

/** Điểm (x, z) theo tọa độ three.js nằm trong chữ L (tính cả trên cạnh). */
export function isInsideOffice(x: number, z: number): boolean {
  return OFFICE_L_RECTS.some((r) => x >= r.minX - EPS && x <= r.maxX + EPS && z >= r.minZ - EPS && z <= r.maxZ + EPS);
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const d = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  return w > 0 && d > 0 ? w * d : 0;
}

export type OfficeCoverage = 'inside' | 'partial' | 'outside';

/** Hình chữ nhật (three.js) nằm trong, cắt ngang hay nằm ngoài chữ L. Chỉ chạm cạnh tính là ngoài. */
export function officeCoverage(r: Rect): OfficeCoverage {
  const area = (r.maxX - r.minX) * (r.maxZ - r.minZ);
  if (area <= EPS) return isInsideOffice((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2) ? 'inside' : 'outside';
  const inside = OFFICE_L_RECTS.reduce((s, q) => s + overlapArea(r, q), 0);
  if (inside <= EPS) return 'outside';
  return inside >= area - EPS ? 'inside' : 'partial';
}

/**
 * Vật thể được dựng và tương tác: footprint nằm trọn trong chữ L. Không có ngoại lệ theo id.
 * Vật cắt ngang mép L (reserved, notice_board) không dựng, vì phần ngoài L không có sàn và trần.
 */
export function isObjectInOffice(o: ZoneObject): boolean {
  return officeCoverage(footprint(o)) === 'inside';
}

/**
 * Cắt một hình chữ nhật bản vẽ theo chữ L. Trả về các mảnh nằm trong L (rỗng nếu nằm ngoài),
 * các mảnh cùng dải y và liền nhau theo x được gộp lại.
 */
export function clipPlanRectToOffice([x0, x1, y0, y1]: PlanRect): PlanRect[] {
  const pieces: Array<[number, number, number, number]> = [];
  for (const [a0, a1, b0, b1] of OFFICE_L_PLAN_RECTS) {
    const px0 = Math.max(x0, a0);
    const px1 = Math.min(x1, a1);
    const py0 = Math.max(y0, b0);
    const py1 = Math.min(y1, b1);
    if (px1 - px0 > EPS && py1 - py0 > EPS) pieces.push([px0, px1, py0, py1]);
  }
  pieces.sort((p, q) => p[2] - q[2] || p[3] - q[3] || p[0] - q[0]);
  const out: Array<[number, number, number, number]> = [];
  for (const p of pieces) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[2] - p[2]) < EPS && Math.abs(last[3] - p[3]) < EPS && Math.abs(last[1] - p[0]) < EPS) {
      last[1] = p[1];
    } else {
      out.push([...p]);
    }
  }
  return out;
}
