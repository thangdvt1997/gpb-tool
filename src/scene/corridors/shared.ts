// Phần dùng chung của các đoạn hành lang trong src/scene/corridors: vật liệu, độ cao lớp sàn, đổi tọa độ.
//
// Vật liệu dùng màu đỉnh, nên không phụ thuộc theme. Chúng được tạo một lần khi nạp module, dùng chung cho
// NorthCorridor và LoungeLink, không tạo lại khi đổi theme hay khi render, và không dispose (sống cùng ứng dụng).
// Hình học thì đổi theo theme (màu đỉnh), do từng component tạo trong useMemo và dispose khi đổi.

import * as THREE from 'three';
import { UNIT_BOX } from '../../env/shared';
import type { Batch } from '../entry/merge';
import { toWorldX, toWorldZ } from '../layout';

/** Mặt trên lớp sàn hành lang (m). Cùng mức với src/scene/Corridors.tsx (TOP = 0,032), dưới mặt lớp phủ lounge (0,035). */
export const FLOOR_TOP = 0.032;
export const SLAB_THICK = 0.012;

/** Đá sáng đánh bóng nhẹ. Dùng cho sàn, khung kính, ngưỡng cửa. */
export const STONE_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.04 });
/** Không chiếu sáng: kính mờ có đèn hắt phía sau, dải LED. */
export const GLOW_MAT = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

/** Tọa độ bản vẽ (m): x0, x1, y0, y1. */
export type PlanRect = readonly [number, number, number, number];

export interface WorldRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  cx: number;
  cz: number;
  w: number;
  d: number;
}

export function worldRect([x0, x1, y0, y1]: PlanRect): WorldRect {
  const wx0 = toWorldX(x0);
  const wx1 = toWorldX(x1);
  const wz0 = toWorldZ(y0);
  const wz1 = toWorldZ(y1);
  return { x0: wx0, x1: wx1, z0: wz0, z1: wz1, cx: (wx0 + wx1) / 2, cz: (wz0 + wz1) / 2, w: wx1 - wx0, d: wz1 - wz0 };
}

/** Tấm sàn phủ kín r, mặt trên ở FLOOR_TOP. */
export function slab(b: Batch, r: WorldRect, color: string): void {
  b.add(UNIT_BOX, null, [r.cx, FLOOR_TOP - SLAB_THICK / 2, r.cz], [r.w, SLAB_THICK, r.d], color);
}

/** Miếng phẳng nổi trên mặt sàn. lift là độ cao mặt dưới so với FLOOR_TOP (m), thick là bề dày. */
export function inlay(
  b: Batch,
  x: number,
  z: number,
  w: number,
  d: number,
  color: string,
  lift = 0.001,
  thick = 0.001,
): void {
  b.add(UNIT_BOX, null, [x, FLOOR_TOP + lift + thick / 2, z], [w, thick, d], color);
}
