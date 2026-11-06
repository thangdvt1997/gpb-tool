// Cấu hình bộ bàn mẫu theo ảnh văn phòng thật (promy_update/room.txt mục 3, REAL_OFFICE_STYLE.md mục 5).
// Mọi kích thước là mét, giá trị ước lượng theo đồ nội thất tiêu chuẩn, chỉnh tại đây. Không đổi footprint khối bàn
// trong it.json: chỗ ngồi chỉ được xếp bên trong footprint đó (src/env/desk.tsx, seatsOf).

import type { DeskVariant } from './desk';

export const DESK_CONFIG = {
  /** Chiều ngang một bàn (dọc dãy). Các bàn đặt sát nhau thành dãy bench. */
  width: 1.2,
  /** Chiều sâu mặt bàn. */
  depth: 0.65,
  /** Độ cao mặt bàn mặc định. Khối bàn trong it.json có size[1] thì dùng giá trị đó. */
  height: 0.75,
  /** Độ dày mặt gỗ. */
  topThickness: 0.025,
  /**
   * Bước lưới chỗ ngồi theo hai trục và vị trí ghế. Phải khớp lưới ghế của hệ tương tác
   * (src/scene/interact/geometry.ts, SEAT: pitch 1,2, chairOffset 0,55, người ngồi quay về -z), để nhân vật ngồi
   * đúng vào ghế đã vẽ. Đổi ở đây thì phải đổi ở đó.
   */
  pitch: 1.2,
  chairOffset: 0.55,
  /**
   * Ghế kéo ra hoặc đẩy vào quanh chairOffset (m). Giữ nhỏ: khối sâu 3 m (desk_L3) có ghế hàng cuối tới
   * 0,6 + 0,55 + 0,02 + 0,326 (bán kính chân sao) = 1,496 m, vừa trong nửa footprint 1,5 m.
   */
  chairPullJitter: 0.02,
  /** Tỉ lệ khối bàn có tấm chắn gỗ phía trước (mặt sau bàn, dưới mặt gỗ). */
  modestyPanelChance: 0.55,
  /** Biên độ xoay ghế (rad) thường gặp; ghế xoay lệch hẳn thì quay về phía không có hộc tủ. */
  chairYaw: 0.22,
  chairYawWide: 0.5,
  chairYawWideChance: 0.2,
  /** Lệch ngang của ghế (m). */
  chairShift: 0.05,
  /** Hộc tủ di động: rộng, cao (không kể bánh), sâu. */
  pedestal: { w: 0.4, h: 0.56, d: 0.5 },
  /** Tỉ lệ hộc tủ đặt bên phải người ngồi. */
  pedestalRightChance: 0.75,
} as const;

/** Ba kiểu chỗ ngồi tối thiểu: một màn, hai màn, laptop kèm cốc và giấy. */
export type SeatSetup = 'single' | 'dual' | 'laptop';

/** Trọng số kiểu chỗ ngồi theo kiểu khối bàn (it.json → DESK_VARIANT trong src/env/index.ts). */
export const SETUP_WEIGHTS: Record<DeskVariant, Record<SeatSetup, number>> = {
  dev: { single: 0.35, dual: 0.45, laptop: 0.2 },
  design: { single: 0.6, dual: 0.15, laptop: 0.25 },
  ops: { single: 0.3, dual: 0.55, laptop: 0.15 },
};

/** Xác suất có từng đồ dùng trên một chỗ (mỗi món chiếm một ô góc bàn, hết ô thì bỏ). */
export const ACCESSORY_CHANCE = {
  bottle: 0.35,
  mug: 0.35,
  headphones: 0.15,
  fan: 0.2,
  plant: 0.15,
  penCup: 0.2,
  deskMat: 0.3,
  /** Tỉ lệ màn hình đang tắt (đen bóng). */
  screenOff: 0.18,
  /** Tỉ lệ chỗ hai màn dùng tay đỡ kẹp bàn thay vì chân đế. */
  monitorArm: 0.4,
} as const;

/** Màu đồ dùng chung (không logo, không chữ). */
export const ACCESSORY_COLORS = {
  bottles: ['#e7b7c3', '#9cc3d8', '#3e4a5c', '#d9dde2', '#8fb59a'],
  mugs: ['#f4f1ea', '#e9e2d4', '#8fb3c9', '#2f3a4a'],
  fans: ['#f2f3f4', '#e8c9d2', '#d9e6ee'],
  headphones: ['#1f2227', '#e9e6e1', '#e2a9b8'],
  pots: ['#f3f3f1', '#c9c4ba'],
} as const;
