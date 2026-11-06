/** Kiểu dữ liệu của module hiển thị (tivi và bảng vẽ). Khớp hợp đồng với services/display. */

/** Kênh tivi: 1 Thông báo IT, 2 Trạng thái dịch vụ, 3 Lịch sự kiện, 4 Bảng vinh danh, 5 Bảng xếp hạng, 6 Chào mừng. */
export type ChannelId = 1 | 2 | 3 | 4 | 5 | 6;

export type TvId = 'tv_lobby' | 'tv_lounge' | 'tv_meeting';

export type BoardId = 'whiteboard_mr1' | 'design_board';

/** Toạ độ chuẩn hoá [x, y], mỗi giá trị nằm trong [0, 1] theo kích thước bảng. */
export type Point = [number, number];

export interface Channel {
  id: ChannelId;
  name: string;
}

export interface Tv {
  on: boolean;
  channel: ChannelId;
  updatedAt: string;
  updatedBy: string;
}

export interface TvPatch {
  on?: boolean;
  channel?: ChannelId;
}

/** Một nét vẽ. width tính bằng px trên bảng rộng 1024 (xem BOARD_W trong drawStrokes.ts). */
export interface Stroke {
  id?: string;
  points: Point[];
  color: string;
  width: number;
  userName: string;
}

/** Dữ liệu gửi lên khi vẽ một nét. Server gắn userName và version. */
export interface StrokeInput {
  points: Point[];
  color: string;
  width: number;
}

export interface BoardState {
  version: number;
  strokes: Stroke[];
}

export interface VersionResult {
  version: number;
}
