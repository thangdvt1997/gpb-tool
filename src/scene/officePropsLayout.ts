// Vị trí đạo cụ văn phòng thật (docs/design/REAL_OFFICE_STYLE.md mục 5 và 8). Chỉ là decor, không có id,
// không nằm trong src/content/zones/it.json và không đổi toạ độ vật thể nào.
//
// Toạ độ bản vẽ (m, gốc trên-trái, như docs/FLOORPLAN_IT.md). Mỗi đạo cụ đặt sát tường hoặc sát lõi, ngoài mọi
// đoạn hành lang (Corridors.tsx, corridors/*) và không chồng footprint vật thể nào trong it.json, decor lounge,
// pantry, PLANT_SPOTS hay TV_FIXTURES. Footprint đã kiểm bằng script (xem báo cáo).
//
// face: hướng mặt trước của đạo cụ. N là về phía y nhỏ (tường Bắc ở sau lưng thì mặt hướng S).

import type { ShadowSpot } from '../env/contactShadow';
import { toWorldX, toWorldZ, type Rect } from './layout';

export type Face = 'N' | 'S' | 'E' | 'W';
/** tv: TV đen treo tường (không chiếm sàn). lowcab: tủ thấp hai cánh gỗ sáng. */
export type PropKind = 'fire' | 'water' | 'cabinet' | 'plant' | 'bin' | 'tv' | 'lowcab';

export interface PropSpot {
  kind: PropKind;
  /** Tâm footprint, toạ độ bản vẽ (m). */
  x: number;
  y: number;
  face: Face;
  /** Số khoang tủ (chỉ cho cabinet). */
  bays?: number;
}

/** TV treo tường: rộng 1,68 m (75 inch), cao 0,97 m, dày 0,06 m, tâm cao 1,55 m. */
export const TV = { width: 1.68, height: 0.97, depth: 0.06, centerY: 1.55 } as const;

/** Bề ngang (dọc tường) và chiều sâu (vuông góc tường) của footprint, mét. */
export function propSize(s: PropSpot): { w: number; d: number } {
  switch (s.kind) {
    case 'fire':
      return { w: 0.5, d: 0.25 };
    case 'water':
      return { w: 1.0, d: 0.34 };
    case 'cabinet':
      return { w: 0.9 * (s.bays ?? 1), d: 0.45 };
    case 'plant':
      return { w: 0.6, d: 0.6 };
    case 'bin':
      return { w: 0.3, d: 0.3 };
    case 'tv':
      return { w: TV.width, d: TV.depth };
    case 'lowcab':
      return { w: 0.8, d: 0.45 };
  }
}

/** Góc quay quanh Y: mặt trước local +z quay về hướng face (bản vẽ y tăng = world +z). */
export function faceRotation(face: Face): number {
  switch (face) {
    case 'S':
      return 0;
    case 'N':
      return Math.PI;
    case 'E':
      return Math.PI / 2;
    case 'W':
      return -Math.PI / 2;
  }
}

export const PROP_SPOTS: readonly PropSpot[] = [
  // Bình chữa cháy đôi trên giá đỏ: cạnh 5 lõi, giữa hành lang Nam (mặt Nam core_lift1) và tường Nam.
  { kind: 'fire', x: 8.625, y: 2.5, face: 'E' }, // mặt Đông core_st1
  { kind: 'fire', x: 45.375, y: 2.0, face: 'W' }, // mặt Tây core_st2
  { kind: 'fire', x: 15.375, y: 17.0, face: 'W' }, // mặt Tây core_lift1
  { kind: 'fire', x: 18.0, y: 18.625, face: 'S' }, // mặt Nam core_lift1, nhìn ra hành lang Nam
  { kind: 'fire', x: 33.0, y: 18.625, face: 'S' }, // mặt Nam core_lift2
  { kind: 'fire', x: 41.5, y: 18.625, face: 'S' }, // mặt Nam core_st3
  { kind: 'fire', x: 34.0, y: 29.575, face: 'N' }, // tường Nam, sau desk_B6

  // Máy lọc nước kèm 2 bình 19 L dự phòng.
  { kind: 'water', x: 49.5, y: 29.51, face: 'N' }, // tường Nam, cạnh pantry
  { kind: 'water', x: 44.77, y: 22.2, face: 'E' }, // đầu Đông desk_B7, gần đầu Đông hành lang Nam
  { kind: 'water', x: 1.2, y: 0.49, face: 'S' }, // góc Tây Bắc, đầu Bắc dãy desk_L

  // Tủ hồ sơ cao cửa kính, sát tường Nam.
  { kind: 'cabinet', x: 38.25, y: 29.455, face: 'N', bays: 5 }, // sau desk_B6, desk_B7
  { kind: 'cabinet', x: 17.05, y: 29.455, face: 'N', bays: 5 }, // giữa mr3 và server_room
  { kind: 'cabinet', x: 2.4, y: 29.455, face: 'N', bays: 4 }, // góc Tây Nam, cuối dãy bàn Tây

  // Cây lá lớn chậu sứ trắng: cạnh máy lọc nước, cuối mỗi dãy tủ, góc phòng.
  { kind: 'plant', x: 50.6, y: 29.3, face: 'N' },
  { kind: 'plant', x: 2.1, y: 0.7, face: 'S' },
  { kind: 'plant', x: 41.0, y: 29.3, face: 'N' },
  { kind: 'plant', x: 13.0, y: 18.4, face: 'S' },
  { kind: 'plant', x: 31.6, y: 29.3, face: 'N' },
  { kind: 'plant', x: 20.1, y: 29.3, face: 'N' },
  { kind: 'plant', x: 44.85, y: 23.2, face: 'E' },

  // Thùng rác túi đỏ: cạnh máy lọc nước, cạnh pantry và util_coffee. Thùng dưới gầm bàn vẽ trong src/env/desk.tsx.
  { kind: 'bin', x: 48.6, y: 29.5, face: 'N' },
  { kind: 'bin', x: 40.2, y: 14.3, face: 'E' },
  { kind: 'bin', x: 50.7, y: 23.0, face: 'W' },
  { kind: 'bin', x: 0.6, y: 1.1, face: 'E' },

  // TV 75 inch đen treo tường cạnh dãy tủ hồ sơ và cây lớn (ảnh 19-01-24, 18-58-31): tường Nam sau desk_B7,
  // giữa cây x 41,0 và máy lọc nước x 49,5. Treo cao 1,1–2,0 m, không chiếm sàn (không tạo ô chặn).
  { kind: 'tv', x: 43.6, y: 29.66, face: 'N' },

  // Tủ thấp hai cánh gỗ sáng cạnh máy lọc nước (ảnh 19-01-02, mép phải): tường Nam giữa thùng rác x 48,6 và
  // tủ cao x 38,25; đầu Đông desk_B7, cách mép bàn 0,075 m, cạnh cây x 44,85.
  { kind: 'lowcab', x: 47.85, y: 29.455, face: 'N' },
  { kind: 'lowcab', x: 44.8, y: 24.35, face: 'E' },
];

/** Footprint của đạo cụ, toạ độ three.js. */
export function propRect(s: PropSpot): Rect {
  const { w, d } = propSize(s);
  const alongX = s.face === 'N' || s.face === 'S';
  const hw = (alongX ? w : d) / 2;
  const hd = (alongX ? d : w) / 2;
  const cx = toWorldX(s.x);
  const cz = toWorldZ(s.y);
  return { minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd };
}

/** Ô chặn đi lại của đạo cụ đứng dưới sàn. Gộp vào decorBlockersOf (src/env/index.ts). */
export const OFFICE_PROP_BLOCKERS: readonly Rect[] = PROP_SPOTS.filter((s) => s.kind !== 'tv').map(propRect);

/** Độ đậm bóng tiếp xúc theo loại đạo cụ đứng trên sàn. TV treo tường không có bóng. */
const SHADOW_ALPHA: Partial<Record<PropKind, number>> = {
  cabinet: 0.55,
  lowcab: 0.5,
  plant: 0.45,
  water: 0.4,
  fire: 0.35,
  bin: 0.35,
};

/**
 * Bóng tiếp xúc dưới đạo cụ (room.txt mục 6), toạ độ thế giới. Vẽ chung mesh bóng với khu bàn
 * (DeskDecorField extraShadows trong src/scene/ITOffice.tsx), không tốn draw call riêng.
 */
export const OFFICE_PROP_SHADOWS: readonly ShadowSpot[] = PROP_SPOTS.flatMap((s): ShadowSpot[] => {
  const a = SHADOW_ALPHA[s.kind];
  if (a === undefined) return [];
  const { w, d } = propSize(s);
  const k = s.kind === 'plant' || s.kind === 'bin' ? 0.9 : 1;
  return [{ x: toWorldX(s.x), z: toWorldZ(s.y), w: w * k + 0.15, d: d * k + 0.15, yaw: faceRotation(s.face), a }];
});


/** Băng rôn treo trần, chạy dọc hành lang (trục x), mặt hướng ±z. text là chỉ số khẩu hiệu. */
export interface BannerSpot {
  x: number;
  y: number;
  text: number;
}

/** Khẩu hiệu tự soạn, tối đa 6 chữ, không chép nguyên văn ảnh, không logo. */
export const BANNER_TEXTS: readonly string[] = [
  'Vững bước cùng nhau',
  'Đổi mới mỗi ngày',
  'Khách hàng là trung tâm',
  'Bảo mật là trên hết',
  'Làm đúng ngay từ đầu',
  'Học hỏi không ngừng',
];

/**
 * Mép dưới băng rôn 2,35 m, cao 0,6 m, dài 3 m; mép trên 2,95 m, dưới trần CEILING_Y 2,97 m, dây treo lên trần.
 * Hành lang chỉ rộng 1 m nên băng dài 3 m treo dọc theo hành lang (song song trục x, mặt hướng ±z),
 * không chắn ngang lối đi và tia nhìn camera phía sau.
 */
export const BANNER = { bottom: 2.35, height: 0.6, width: 3 } as const;

/** Trần thả (m). Cao hơn mọi mảnh phát sáng của rigs.tsx (tối đa 2,95 m), thấp hơn tường ngoài 3,2 m. */
export const CEILING_Y = 2.97;

export const BANNER_SPOTS: readonly BannerSpot[] = [
  // Hành lang Nam (x 2.5–46.5, y 18.9–19.9): một tuyến dọc tâm hành lang, cách 3,6 m.
  ...Array.from({ length: 12 }, (_, k) => ({ x: 4.0 + 3.6 * k, y: 19.4, text: k % BANNER_TEXTS.length })),
  // Hành lang giữa (x 18.6–29.9, y 12.9–13.9): so le nửa bước với tuyến Nam.
  ...[20.4, 24.0, 27.6].map((x, k) => ({ x, y: 13.4, text: (k + 3) % BANNER_TEXTS.length })),
];

/**
 * Trần thả (room.txt mục 2): tấm 600 x 600 mm, texture lặp mỗi periodTiles ô. Toạ độ thành phần là [cột, hàng] ô
 * trong một chu kỳ 8 x 8 ô (4,8 m). Đèn panel vuông 600 x 600 cách tâm 2,4 m theo hai trục (4 đèn mỗi 23 m², khoảng
 * 17 đèn trên 100 m², REAL_OFFICE_STYLE.md mục 4). Cửa gió vuông và khe gió dài xen giữa các đèn, đầu báo khói và
 * đầu phun ở tâm ô.
 */
export const CEILING: {
  tile: number;
  periodTiles: number;
  lights: ReadonlyArray<readonly [number, number]>;
  squareVents: ReadonlyArray<readonly [number, number]>;
  /** [cột đầu, hàng, số ô chiều dài]. */
  slotVents: ReadonlyArray<readonly [number, number, number]>;
  smoke: ReadonlyArray<readonly [number, number]>;
  sprinklers: ReadonlyArray<readonly [number, number]>;
  /** Cường độ phát sáng của texture trần (đèn trắng, tấm trần xám nhạt để trần không tối). */
  emissive: number;
} = {
  tile: 0.6,
  periodTiles: 8,
  lights: [
    [1, 1],
    [5, 1],
    [1, 5],
    [5, 5],
  ],
  squareVents: [
    [3, 3],
    [7, 7],
  ],
  slotVents: [[5, 3, 2]],
  smoke: [[3, 7]],
  sprinklers: [
    [3, 1],
    [7, 3],
    [1, 3],
    [7, 5],
  ],
  emissive: 1.35,
};

/**
 * Bảng tên bộ phận treo dưới trần (ảnh 19-01-02): nửa trên đỏ chuyển cam có tên, dải trắng dưới có phụ đề.
 * Treo trên tâm mỗi cụm bàn. axis: pháp tuyến mặt biển. Nhánh dưới (desk_B*) có lối đi Nam chạy theo trục x nên
 * biển quay theo x (đọc được khi đi dọc lối); nhánh trái (desk_L*) có lối đi Tây chạy theo trục z nên quay theo z.
 * Toạ độ bản vẽ (m) = tâm khối bàn trong it.json cộng (29, 15). Nội dung chỉnh tự do; tên squad lấy từ nhãn it.json.
 */
export interface ZoneSign {
  x: number;
  y: number;
  axis: 'x' | 'z';
  title: string;
  subtitle: string;
}

/** Kích thước và độ cao bảng tên (m). Mép dưới 2,4 m, cao hơn đầu nhân vật; mép trên 2,85 m, dây treo lên trần. */
export const ZONE_SIGN = { width: 1.2, height: 0.45, bottom: 2.4 } as const;

export const ZONE_SIGNS: readonly ZoneSign[] = [
  { x: 5.5, y: 7.2, axis: 'z', title: 'Core integration', subtitle: 'Khối CNTT · L1' },
  { x: 5.5, y: 12.2, axis: 'z', title: 'Data & BI', subtitle: 'Khối CNTT · L2' },
  { x: 5.5, y: 17.4, axis: 'z', title: 'Security (SOC)', subtitle: 'Khối CNTT · L3' },
  { x: 5.2, y: 22.2, axis: 'x', title: 'Mobile', subtitle: 'Khối CNTT · B1' },
  { x: 11.2, y: 22.2, axis: 'x', title: 'Backend & API', subtitle: 'Khối CNTT · B2' },
  { x: 17.55, y: 22.2, axis: 'x', title: 'Core integration', subtitle: 'Khối CNTT · B3' },
  { x: 22.8, y: 22.2, axis: 'x', title: 'Data & BI', subtitle: 'Khối CNTT · B4' },
  { x: 28.8, y: 22.2, axis: 'x', title: 'Hạ tầng', subtitle: 'Khối CNTT · B5' },
  { x: 34.8, y: 22.2, axis: 'x', title: 'Vận hành', subtitle: 'Khối CNTT · B6' },
  { x: 41.5, y: 22.2, axis: 'x', title: 'Product / QA', subtitle: 'Khối CNTT · B7' },
];
