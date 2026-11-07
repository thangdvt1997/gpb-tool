// Chặn camera xuyên qua băng rôn và biển treo trần.
//
// Băng rôn (OfficeProps.hangings) là mặt phẳng hai mặt không có độ dày, treo ở độ cao 2,35–2,95 m. Vật cản 2D của
// camera (Rect) không có chiều cao nên bỏ qua chúng; camera đi qua mặt phẳng làm cả khung hình thành một màu đỏ.
// Module này kiểm đoạn thẳng từ điểm nhìn (mắt nhân vật) tới camera: nếu đoạn cắt một biển, camera được kéo lại
// ngay trước biển trên cùng đoạn đó.

import { BANNER, BANNER_SPOTS, ZONE_SIGN, ZONE_SIGNS } from '../officePropsLayout';
import { toWorldX, toWorldZ } from '../layout';

interface HangingPlane {
  /** true: mặt phẳng vuông góc trục x (biển xoay 90°). false: vuông góc trục z (băng rôn thường). */
  normalX: boolean;
  /** Toạ độ mặt phẳng trên trục pháp tuyến. */
  c: number;
  /** Khoảng trên trục nằm trong mặt phẳng (x nếu normalZ, z nếu normalX). */
  a0: number;
  a1: number;
  y0: number;
  y1: number;
}

function buildPlanes(): HangingPlane[] {
  const out: HangingPlane[] = [];
  for (const b of BANNER_SPOTS) {
    const x = toWorldX(b.x);
    const z = toWorldZ(b.y);
    const half = BANNER.width / 2;
    out.push({ normalX: false, c: z, a0: x - half, a1: x + half, y0: BANNER.bottom, y1: BANNER.bottom + BANNER.height });
  }
  for (const sg of ZONE_SIGNS) {
    const x = toWorldX(sg.x);
    const z = toWorldZ(sg.y);
    const half = ZONE_SIGN.width / 2;
    const y0 = ZONE_SIGN.bottom;
    const y1 = ZONE_SIGN.bottom + ZONE_SIGN.height;
    if (sg.axis === 'x') out.push({ normalX: true, c: x, a0: z - half, a1: z + half, y0, y1 });
    else out.push({ normalX: false, c: z, a0: x - half, a1: x + half, y0, y1 });
  }
  return out;
}

const PLANES: readonly HangingPlane[] = buildPlanes();

/** Biên mở rộng quanh mặt phẳng (m): camera không được sát biển quá mức này. */
const MARGIN = 0.06;
/** Nhân vật đứng sát mặt phẳng (dưới băng rôn) thì bỏ qua mặt đó, nếu không camera co về sát nhân vật. */
const STANDING_NEAR = 0.15;
/** Khoảng lùi thêm (tỷ lệ trên đoạn) để camera nằm hẳn trước biển, không đúng trên mặt phẳng. */
const PULL_BACK = 0.03;
const MIN_SCALE = 0.02;

/**
 * Tỷ lệ s (0 < s <= 1) để camera = điểm nhìn + s * (camera - điểm nhìn) không cắt biển treo.
 * 1 nghĩa là đoạn thẳng không cắt biển nào. Không cấp phát.
 */
export function hangingCameraScale(tx: number, ty: number, tz: number, cx: number, cy: number, cz: number): number {
  let tMin = 1;
  for (const p of PLANES) {
    const dt = p.normalX ? tx - p.c : tz - p.c;
    const dc = p.normalX ? cx - p.c : cz - p.c;
    if (Math.abs(dt) < STANDING_NEAR) continue;
    if (dt * dc >= 0) continue;
    const t = dt / (dt - dc);
    const x = tx + t * (cx - tx);
    const y = ty + t * (cy - ty);
    const z = tz + t * (cz - tz);
    const along = p.normalX ? z : x;
    if (along < p.a0 - MARGIN || along > p.a1 + MARGIN) continue;
    if (y < p.y0 - MARGIN || y > p.y1 + MARGIN) continue;
    if (t < tMin) tMin = t;
  }
  if (tMin >= 1) return 1;
  return Math.max(MIN_SCALE, tMin - PULL_BACK);
}
