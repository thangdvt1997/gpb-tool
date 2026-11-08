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
  /** Chỉ dùng cho tường ngăn do trình biên tập thêm: true khi có cửa ở giữa đoạn tường. */
  door?: boolean;
}

/** Vật do trình biên tập thêm (bàn, ghế, tường ngăn...). kind thuộc PROP_CATALOG (src/editor/props.ts). */
export interface PropRecord extends Pose {
  kind: string;
  movedBy?: string | null;
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
  /** Vật thêm bằng trình biên tập. Máy chủ cũ không có trường này. */
  props?: Record<string, PropRecord>;
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
