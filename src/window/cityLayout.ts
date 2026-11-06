/**
 * Bố cục thành phố ngoài cửa kính (dữ liệu thuần, không dựng mesh).
 *
 * Hệ toạ độ cục bộ của CityView:
 * - Gốc (0, 0, 0) nằm trên sàn văn phòng, ngay dưới góc kính Đông-Nam bên ngoài.
 * - Trục -Z là hướng nhìn ra ngoài. Khi gắn vào scene, quay nhóm bằng rotation.y = -3π/4 để -Z trỏ về hướng Đông-Nam.
 * - Mặt đất thành phố nằm ở y = GROUND_Y (âm, vì toà nhà ở tầng cao).
 * Các con số là ước lượng từ khung video, cần chỉnh khi đối chiếu trực tiếp với cảnh thật.
 */
import type { Pt } from './traffic';
import { createRng } from './traffic';

/** Độ cao mặt đất thành phố so với sàn (m). Ước lượng tầng khoảng 15, mắt người xem cao hơn sàn 1.6 m. */
export const GROUND_Y = -48;

/** Vị trí mắt người xem trong hệ cục bộ, dùng để chia LOD. */
export const VIEW_EYE: readonly [number, number, number] = [0, 1.6, 0];

/** Ngưỡng khoảng cách (m) để chọn mức chi tiết. Dưới ngưỡng là mức gần, trên ngưỡng là mức xa. */
export const LOD = {
  /** Cây: trên ngưỡng này dùng ít lá hơn. */
  treeFar: 160,
  /** Toà nhà chung cư: trên ngưỡng này bỏ ban công. */
  balconyFar: 240,
} as const;

/** Mặt đường: z0 gần người xem, z1 xa. Hai làn ô tô và dải phân cách giữa. */
export const ROAD = { z0: -22, z1: -36, laneA: -25.5, laneB: -32.5, median: -29 } as const;
/** Vỉa hè và quảng trường phía gần (cùng phía người xem). */
export const NEAR_PLAZA = { z0: -6, z1: -21 } as const;
/** Quảng trường phía xa, sát chân toà nhà kính đối diện. */
export const FAR_PLAZA = { z0: -36.5, z1: -52 } as const;
/** Khu cây xanh có cỏ và đường đi, phía Đông của toà nhà đối diện. */
export const PARK = { x0: 40, x1: 140, z0: -70, z1: -120 } as const;

/**
 * Tuyến đường lặp vòng. Các điểm là (x, z). CatmullRom khép kín sẽ làm mượt các góc quay.
 * cars: hai làn, làn A chạy về +X, làn B chạy về -X.
 * bikes: làn xe máy sát vỉa hè gần, hai chiều.
 * walkersNear / walkersFar: lối đi bộ trên quảng trường gần và xa.
 */
export const ROUTES: { cars: Pt[]; bikes: Pt[]; walkersNear: Pt[]; walkersFar: Pt[] } = {
  cars: [
    [-170, ROAD.laneA],
    [170, ROAD.laneA],
    [178, -27],
    [178, -31],
    [170, ROAD.laneB],
    [-170, ROAD.laneB],
    [-178, -31],
    [-178, -27],
  ],
  bikes: [
    [-140, -9],
    [140, -9],
    [144, -10.5],
    [140, -12],
    [-140, -12],
    [-144, -10.5],
  ],
  walkersNear: [
    [-100, -16],
    [100, -16],
    [103, -17.2],
    [100, -18.5],
    [-100, -18.5],
    [-103, -17.2],
  ],
  walkersFar: [
    [-60, -40],
    [30, -40],
    [33, -42],
    [30, -44],
    [-60, -44],
    [-63, -42],
  ],
};

/** Hộp toà nhà. (x, z) là tâm đáy, w theo X, d theo Z, h từ mặt đất lên. */
export interface Block {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

/** Toà nhà kính đối diện: mặt trước tại z = -52, khoảng 30 tầng, xanh xám. */
export const OPPOSITE_TOWER: Block = { x: -10, z: -67, w: 60, d: 30, h: 110 };

/** Mái kính đưa ra trước sảnh: tâm (x, z), độ cao mặt dưới (m trên mặt đất) và kích thước. */
export const CANOPY = { x: -10, z: -48.5, w: 26, d: 7, height: 6 } as const;

/** Chung cư kem hồng nhiều tầng bên trái xa, không có ban công ở mức xa. */
export const MIDRISE: Block = { x: -95, z: -95, w: 46, d: 26, h: 26 };

/** Các toà chung cư cao tầng phía xa bên phải có ban công. */
export const RESIDENTIAL: Block[] = [
  { x: 112, z: -170, w: 18, d: 12, h: 95 },
  { x: 134, z: -190, w: 14, d: 10, h: 120 },
  { x: 162, z: -228, w: 16, d: 12, h: 70 },
];

export interface TreeSpec {
  x: number;
  z: number;
  kind: 'palm' | 'broad';
  /** Chiều cao thân (m). */
  height: number;
  seed: number;
}

function buildTrees(): TreeSpec[] {
  const out: TreeSpec[] = [];
  let seed = 101;
  // Dải phân cách giữa đường: cây tán tròn.
  for (let k = 0; k < 10; k++) {
    out.push({ x: -135 + k * 30, z: ROAD.median, kind: 'broad', height: 7 + (k % 3), seed: seed++ });
  }
  // Lề gần: cọ cao thấp xen kẽ.
  for (let k = 0; k < 10; k++) {
    out.push({ x: -120 + k * 24, z: -20.6, kind: 'palm', height: 10 + (k % 4) * 0.8, seed: seed++ });
  }
  // Quảng trường phía xa, sát chân toà nhà, tránh mái kính.
  for (let k = 0; k < 6; k++) {
    out.push({ x: -60 + (k % 3) * 12, z: k < 3 ? -38.5 : -50.5, kind: 'palm', height: 9 + (k % 2), seed: seed++ });
  }
  // Khu cây xanh: tám cây rải ngẫu nhiên có seed cố định.
  const rng = createRng(555);
  for (let k = 0; k < 8; k++) {
    out.push({
      x: PARK.x0 + 10 + rng() * (PARK.x1 - PARK.x0 - 20),
      z: PARK.z0 - 6 - rng() * (PARK.z0 - PARK.z1 - 12),
      kind: 'broad',
      height: 6 + rng() * 3,
      seed: seed++,
    });
  }
  return out;
}

/** Tổng 34 cây, dưới giới hạn 40. */
export const TREES: TreeSpec[] = buildTrees();

/** Cột đèn đường dọc theo lề xa, 11 cột cách nhau 30 m. */
export const LAMP_XS: number[] = Array.from({ length: 11 }, (_, k) => -150 + k * 30);
export const LAMP_Z = ROAD.z1 - 0.8;

/** Số lượng đối tượng chuyển động. Tổng người và xe máy nằm trong khoảng 10 đến 14 và 12 đến 16. */
export const COUNTS = {
  cars: 7,
  bikesMoving: 3,
  bikesStanding: 9,
  walkersNear: 7,
  walkersFar: 7,
  skyline: 22,
  clouds: 10,
} as const;

/** Vị trí xe máy đứng thành nhóm (tâm, nửa rộng X, nửa rộng Z, hướng gốc). */
export const STANDING_BIKE_GROUPS = [
  { cx: -50, cz: -14.3, hx: 9, hz: 1.1, heading: Math.PI / 2 },
  { cx: 70, cz: -14.3, hx: 4, hz: 1, heading: -Math.PI / 2 },
] as const;

/** Phân bổ số xe máy đứng cho từng nhóm (tổng bằng COUNTS.bikesStanding). */
export const STANDING_BIKE_SPLIT: readonly [number, number] = [6, 3];
