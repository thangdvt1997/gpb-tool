export type Role = 'employee' | 'it' | 'moderator' | 'admin';

/**
 * Loại vật thể. Kiểu hiển thị theo loại nằm trong src/scene/layout.ts (partsOf).
 * - core: thang máy, thang bộ. meeting, server, room: phòng kính.
 * - counter, board, wall, screen, amenity: khối đặc có nhãn.
 * - desk: khối bàn làm việc đa hàng (instancing). reserved: khu dự phòng (chỉ là sàn).
 */
export type ObjectKind =
  | 'core'
  | 'wc'
  | 'pantry'
  | 'lounge'
  | 'reserved'
  | 'meeting'
  | 'server'
  | 'wall'
  | 'amenity'
  | 'screen'
  | 'counter'
  | 'board'
  | 'desk'
  | 'room'
  // Lối vào tầng 7 (docs/design/CHECKIN_ENTRY.md): cửa thang máy, bàn an ninh, bảng ghi danh.
  // Ba loại này vẽ bằng src/scene/entry (thang, bàn an ninh) và src/env/checkin.tsx (bảng), không vẽ khối hộp.
  | 'elevator'
  | 'security_gate'
  | 'checkin_board';

export interface ZoneObject {
  id: string;
  kind: ObjectKind;
  label: string;
  description?: string;
  /** Tâm vật thể, hệ thế giới three.js (mét). y là độ cao của tâm. */
  position: [number, number, number];
  /** Kích thước [rộng x, cao y, sâu z] (mét). */
  size: [number, number, number];
  /** Hành động khi bấm: noc, service_desk, squad, notice, soc, booking, kudos, info, server_room. */
  action: string;
  /** Vai trò được xem khu này. */
  roles: Role[];
  /** Sức chứa (chỗ) của phòng họp. */
  capacity?: number;
  /** Tên squad của khối bàn. */
  squad?: string;
}

export interface ZoneDef {
  id: string;
  name: string;
  objects: ZoneObject[];
}
