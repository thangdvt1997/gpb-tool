// Lối vào lounge từ khu trưng bày (gallery). Theo docs/FLOORPLAN_IT.md, tọa độ bản vẽ (m).
//
// Cửa mở ở mép chung gallery / lounge (x 46.5), dải y 14.9–17.0 (rộng 2.1 m). Đây là khe trống rộng nhất
// dọc mép Tây lounge:
//   kệ sách lounge   x 46.5–46.9, y 10.85–14.85  (lounge.tsx SHELF, tâm lounge 52.2, 12.85)
//   plant_lounge_b   x 47.4–48.2, y 17.1–17.9    (itFixtures.ts PLANT_SPOTS)
//   games_corner     x 48.0–51.2, y 10.5–12.7
// Phía trong lounge từ cửa đi thẳng Đông tới cụm sofa (x ≥ 53.4) không vướng gì.
//
// Toàn bộ vật thể nằm trong dải gallery x 45.1–46.5 (không vào footprint lounge trong it.json), chỉ là miếng
// lát nổi 1–3 mm trên sàn gallery của Corridors.tsx, không có vùng va chạm, nên không chắn lối đi chính
// Bắc–Nam của gallery.
//
// Phong cách: lát gỗ ấm (cùng tông lounge ban ngày) viền đá sáng, ba vạch mũi tên màu theme hướng về lounge,
// ngưỡng đồng ở mép cửa.
//
// Draw call: 0 riêng. Hình học gộp vào mesh sàn của src/scene/Corridors.tsx để giảm draw call.

import { palettes } from '../../env/palette';
import { UNIT_BOX } from '../../env/shared';
import { THEME_TOKENS, type ThemeName } from '../../theme/tokens';
import { mix } from '../entry/colors';
import { Batch } from '../entry/merge';
import { FLOOR_TOP, inlay, worldRect, type PlanRect } from './shared';

/** Phần lối vào nằm trong gallery. Mép Đông x 46.5 là cửa vào lounge. */
export const LOUNGE_LINK_RECT: PlanRect = [45.3, 46.5, 14.9, 17.0];

const BASE = THEME_TOKENS['office-day'];

function linkColors(theme: ThemeName) {
  const t = THEME_TOKENS[theme];
  const p = palettes[theme];
  return {
    border: mix(BASE.bg, BASE.line, 0.3),
    wood: p.wood,
    seam: mix(p.wood, p.ink, 0.3),
    arrow: mix(t.sceneAccent, BASE.panel, 0.2),
    sill: mix(p.wood, THEME_TOKENS.tet.accent, 0.5),
  };
}

/** Hình học lối vào lounge (vật liệu đá). Corridors.tsx gộp và dispose. */
export function buildLoungeLink(theme: ThemeName) {
  const c = linkColors(theme);
  const r = worldRect(LOUNGE_LINK_RECT);
  const b = new Batch();

  // Viền đá sáng, bên trong lát gỗ. Mặt trên viền 2 mm, gỗ 2,5 mm trên sàn gallery (mạch gallery cao 1 mm).
  inlay(b, r.cx, r.cz, r.w, r.d, c.border, 0.001, 0.001);
  const iw = r.w - 0.16;
  const id = r.d - 0.16;
  inlay(b, r.cx, r.cz, iw, id, c.wood, 0.001, 0.0015);
  // Mạch ván chạy Đông–Tây, mỗi 0.2 m.
  const rows = Math.max(1, Math.round(id / 0.2));
  const pw = id / rows;
  for (let i = 1; i < rows; i++) inlay(b, r.cx, r.z0 + 0.08 + i * pw, iw, 0.008, c.seam, 0.0025, 0.0005);

  // Ba vạch mũi tên (hai nét chéo) hướng Đông, vào lounge. Nổi trên mạch ván (mặt 0,035) để không z-fight.
  // Xoay quanh Y góc θ đưa trục +x thành (cos θ, -sin θ) trên (x, z): nét phía Bắc (z âm) xoay -ang.
  const arm = 0.32;
  const ang = Math.PI / 5;
  const dx = (Math.cos(ang) * arm) / 2;
  const dz = (Math.sin(ang) * arm) / 2;
  const y = FLOOR_TOP + 0.0036;
  [-0.35, 0, 0.35].forEach((off) => {
    const tipX = r.cx + off + 0.12;
    b.add(UNIT_BOX, null, [tipX - dx, y, r.cz - dz], [arm, 0.0006, 0.035], c.arrow, [0, -ang, 0]);
    b.add(UNIT_BOX, null, [tipX - dx, y, r.cz + dz], [arm, 0.0006, 0.035], c.arrow, [0, ang, 0]);
  });

  // Ngưỡng đồng sát mép cửa (x 46.42–46.5).
  inlay(b, r.x1 - 0.04, r.cz, 0.08, r.d, c.sill, 0.001, 0.0025);

  return b.build();
}

/** Giữ để tương thích với nơi gọi cũ (ITOffice). Không vẽ gì: đã gộp vào Corridors (buildLoungeLink), tiết kiệm 1 draw call. */
export function LoungeLink(_props: { theme: ThemeName }) {
  return null;
}
