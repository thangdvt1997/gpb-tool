/** Góc xoay quanh trục đứng, độ. Chỉ bốn giá trị. */
export type Rotation = 0 | 90 | 180 | 270;

/**
 * Vị trí và hướng của một vật thể. x, z là toạ độ THẾ GIỚI three.js: tâm sàn là gốc, đơn vị mét,
 * cùng hệ với ZoneObject.position. Không có độ cao: y lấy từ chính vật thể.
 */
export interface Pose {
  x: number;
  z: number;
  rotation: Rotation;
}

/** Vật đã được di chuyển (có trong items của bố cục). */
export interface LayoutItem extends Pose {
  movedBy: string | null;
  movedAt?: string | null;
}

/**
 * Toàn bộ bố cục. items: vị trí đã đổi. defaults: vị trí gốc của mọi vật di chuyển được.
 * version tăng sau mỗi thay đổi, dùng để bỏ qua bản cũ đến muộn.
 */
export interface LayoutState {
  items: Record<string, LayoutItem>;
  defaults: Record<string, Pose>;
  version: number;
}

/** Dữ liệu sự kiện SSE 'move'. */
export interface MoveEvent extends Pose {
  id: string;
  version: number;
  movedBy: string | null;
}

/** Dữ liệu sự kiện SSE 'reset'. Chỉ có version, nên client tải lại toàn bộ bố cục. */
export interface ResetEvent {
  version: number;
}
