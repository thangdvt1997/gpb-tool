import type { BoardId, TvId } from '../display/types';

/**
 * Vị trí mặc định của vật di chuyển được không có trong src/content/zones/it.json: tivi, bảng vẽ, cây.
 *
 * Toạ độ thế giới (mét). position là tâm vật. Các số này phải khớp với services/layout/data/zone.json
 * (position và size). Đổi ở đây thì đổi ở đó.
 *
 * rotationY chỉ dùng 0 hoặc π (mặt hướng theo trục z). services/layout không lưu góc quay trong zone.json,
 * nên footprint mặc định chỉ đúng khi chiều rộng đi theo trục x.
 */
export type Vec3 = [number, number, number];

export interface ScreenFixture {
  position: Vec3;
  /** Quay quanh trục y, đơn vị rad. 0: mặt hướng +z. π: mặt hướng -z. */
  rotationY: number;
  /** [rộng, cao] của mặt hiển thị, đơn vị mét. */
  size: [number, number];
  /** Bề dày, mét. Dùng làm chiều sâu footprint trong services/layout. */
  depth: number;
}

export const TV_FIXTURES: Record<TvId, ScreenFixture> = {
  // Tường Bắc của sảnh, mặt hướng Nam vào sảnh.
  tv_lobby: { position: [-1.0, 1.5, 0.05], rotationY: 0, size: [1.2, 0.7], depth: 0.1 },
  // Tường Nam của lounge, mặt hướng Bắc vào lounge.
  tv_lounge: { position: [24.5, 1.5, 5.85], rotationY: Math.PI, size: [1.45, 0.83], depth: 0.1 },
  // Tường Bắc trong phòng họp 1, mặt hướng Nam vào phòng.
  tv_meeting: { position: [-18.0, 1.5, -4.4], rotationY: 0, size: [1.2, 0.7], depth: 0.1 },
};

export const BOARD_FIXTURES: Record<BoardId, ScreenFixture> = {
  // Tường Nam trong phòng họp 1, mặt hướng Bắc vào phòng.
  whiteboard_mr1: { position: [-17.6, 1.4, 0.1], rotationY: Math.PI, size: [2.0, 1.2], depth: 0.1 },
  // Tường Nam của lounge, cạnh tivi lounge.
  design_board: { position: [27.0, 1.4, 5.9], rotationY: Math.PI, size: [2.0, 1.2], depth: 0.1 },
};

/** Kích thước footprint của cây (rộng, cao, sâu), đơn vị mét. */
export const PLANT_SIZE: Vec3 = [0.8, 1.2, 0.8];

/** Chỗ đặt chân chậu (y = 0). Mỗi cây một chỗ, không chắn lối đi và không đè vật có sẵn. */
export const PLANT_SPOTS: Record<string, Vec3> = {
  plant_lobby: [-7.4, 0, 4.1],
  plant_lounge_a: [28.1, 0, -7.5],
  plant_lounge_b: [18.8, 0, 2.5],
  plant_meeting: [-20.0, 0, -0.9],
  plant_north: [-1.0, 0, -12.2],
};

export const PLANT_IDS: readonly string[] = Object.keys(PLANT_SPOTS);
