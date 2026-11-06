// Hành lang phía Bắc: dải giữa mép Nam của open_north và tường Bắc khối WC, nối khu an ninh (Tây) với
// khu trưng bày (Đông). Theo docs/FLOORPLAN_IT.md, tọa độ bản vẽ (m):
//
//   north     x 35.9–45.1, y 5.2–5.9
//     Bắc   open_north  (30.5–45.1 × 0.5–5.2)  khu bàn mở, không có vách
//     Nam   wc_block    (35.9–45.1 × 5.9–11.9) tường Bắc, có 3 cửa WC
//     Tây   security    (29.9–35.9 × 5.2–15.1) đoạn trong Corridors.tsx
//     Đông  gallery     (45.1–46.5 × 3.5–18.9) đoạn trong Corridors.tsx
//
// Cửa: ba cửa WC trên tường Bắc khối WC, tâm x 38.0 / 40.5 / 43.0, rộng 0.9 m (layout.ts, partsOf 'wc':
// cx ± 2.5, mặt minZ). Hai đầu hành lang để mở, có ngưỡng đá tối.
//
// Phong cách: đá sáng khổ dài (mạch ngang 0.9 m), chỉ nhấn màu theme dọc mép Bắc, thảm đá tối trước mỗi cửa WC,
// bốn tấm kính mờ có đèn hắt trên tường WC, đặt giữa các cửa, khung kim loại mảnh, dải LED hắt sàn.
//
// Chỉ vẽ lớp sàn và tấm ốp sát tường (dày 3 cm, nằm trong dải hành lang), không thêm vùng va chạm, không chồng
// footprint nào trong src/content/zones/it.json (chỉ chạm cạnh).
//
// Draw call: 0 riêng. Hình học gộp vào hai mesh của src/scene/Corridors.tsx (sàn, kính mờ và LED) để giảm draw call.

import { palettes } from '../../env/palette';
import { UNIT_BOX } from '../../env/shared';
import { THEME_TOKENS, type ThemeName } from '../../theme/tokens';
import { mix } from '../entry/colors';
import { Batch } from '../entry/merge';
import { toWorldX } from '../layout';
import { FLOOR_TOP, inlay, slab, worldRect, type PlanRect } from './shared';

export const NORTH_CORRIDOR_RECT: PlanRect = [35.9, 45.1, 5.2, 5.9];

/** Tâm cửa WC theo x bản vẽ: tâm wc_block (40.5) ± 2.5, rộng 0.9 m. */
const WC_DOORS_X: readonly number[] = [38.0, 40.5, 43.0];
const DOOR_W = 0.9;

/** Tấm kính mờ giữa các cửa (x bản vẽ), cách mép cửa 0.15 m, cách đầu hành lang 0.2 m. */
const PANELS: ReadonlyArray<readonly [number, number]> = [
  [36.1, 37.4],
  [38.6, 39.9],
  [41.1, 42.4],
  [43.6, 44.9],
];
const PANEL_Y0 = 0.25;
const PANEL_Y1 = 2.25; // tường WC cao 2.4 m

const BASE = THEME_TOKENS['office-day'];

function northColors(theme: ThemeName) {
  const t = THEME_TOKENS[theme];
  const p = palettes[theme];
  // Đá sáng giữ cùng tông ở mọi theme; màu nhấn, kính và đèn đi theo theme.
  const stone = mix(BASE.bg, BASE.line, 0.3);
  return {
    stone,
    joint: mix(stone, BASE.muted, 0.28),
    sill: mix(BASE.line, BASE.muted, 0.45),
    mat: mix(t.sceneFloor, BASE.muted, 0.45),
    inlay: mix(t.sceneAccent, BASE.panel, 0.25),
    frame: p.metal,
    frost: mix(p.glass, BASE.panel, 0.55),
    led: mix(t.sceneAccent, BASE.panel, 0.45),
  };
}

/** Hình học hành lang Bắc: sàn (vật liệu đá) và kính mờ, LED (vật liệu phát sáng). Corridors.tsx gộp và dispose. */
export function buildNorthCorridor(theme: ThemeName) {
  const c = northColors(theme);
  const r = worldRect(NORTH_CORRIDOR_RECT);
  const floor = new Batch();
  const glow = new Batch();

  // Sàn đá sáng, mạch ngang mỗi 0.9 m.
  slab(floor, r, c.stone);
  for (let x = r.x0 + 0.9; x < r.x1 - 0.1; x += 0.9) inlay(floor, x, r.cz, 0.01, r.d, c.joint, 0, 0.001);

  // Chỉ nhấn màu theme dọc mép Bắc (phía open_north).
  inlay(floor, r.cx, r.z0 + 0.08, r.w - 0.3, 0.03, c.inlay, 0, 0.0015);

  // Ngưỡng đá tối ở hai đầu: Tây (sang khu an ninh), Đông (sang khu trưng bày).
  inlay(floor, r.x0 + 0.06, r.cz, 0.12, r.d, c.sill, 0, 0.002);
  inlay(floor, r.x1 - 0.06, r.cz, 0.12, r.d, c.sill, 0, 0.002);

  // Thảm đá tối trước mỗi cửa WC: y bản vẽ 5.3–5.8, cách mặt cánh cửa (5.84) 4 cm.
  for (const dx of WC_DOORS_X) inlay(floor, toWorldX(dx), r.z1 - 0.35, DOOR_W + 0.2, 0.5, c.mat, 0, 0.002);

  // Kính mờ có đèn hắt trên tường Bắc khối WC (mặt tường ở z1), mặt hướng Bắc.
  const ph = PANEL_Y1 - PANEL_Y0;
  const pcy = (PANEL_Y0 + PANEL_Y1) / 2;
  const fz = r.z1 - 0.015; // khung dày 3 cm, áp sát tường
  for (const [a, b] of PANELS) {
    const x0 = toWorldX(a);
    const x1 = toWorldX(b);
    const cx = (x0 + x1) / 2;
    const len = x1 - x0;
    glow.add(UNIT_BOX, null, [cx, pcy, r.z1 - 0.015], [len, ph, 0.01], c.frost);
    floor.add(UNIT_BOX, null, [cx, PANEL_Y1 + 0.015, fz], [len + 0.06, 0.03, 0.03], c.frame);
    floor.add(UNIT_BOX, null, [cx, PANEL_Y0 - 0.015, fz], [len + 0.06, 0.03, 0.03], c.frame);
    floor.add(UNIT_BOX, null, [x0 - 0.015, pcy, fz], [0.03, ph, 0.03], c.frame);
    floor.add(UNIT_BOX, null, [x1 + 0.015, pcy, fz], [0.03, ph, 0.03], c.frame);
    // Dải LED hắt sàn dưới chân tấm kính.
    glow.add(UNIT_BOX, null, [cx, FLOOR_TOP + 0.003, r.z1 - 0.06], [len, 0.002, 0.03], c.led);
  }

  return { floor: floor.build(), glow: glow.build() };
}

/**
 * Giữ để tương thích với nơi gọi cũ (ITOffice). Không vẽ gì: hành lang Bắc đã gộp vào Corridors
 * (buildNorthCorridor), tiết kiệm 2 draw call.
 */
export function NorthCorridor(_props: { theme: ThemeName }) {
  return null;
}
