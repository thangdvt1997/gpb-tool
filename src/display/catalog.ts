import type { BoardId, ChannelId, TvId } from './types';

/** Danh sách cố định, khớp với hợp đồng backend. Thêm tivi hoặc bảng thì sửa ở đây và ở services/display. */
export const TV_IDS: readonly TvId[] = ['tv_lobby', 'tv_lounge', 'tv_meeting'];
export const BOARD_IDS: readonly BoardId[] = ['whiteboard_mr1', 'design_board'];
export const CHANNEL_IDS: readonly ChannelId[] = [1, 2, 3, 4, 5, 6];

export const TV_NAMES: Record<TvId, string> = {
  tv_lobby: 'Tivi sảnh',
  tv_lounge: 'Tivi khu nghỉ',
  tv_meeting: 'Tivi phòng họp',
};

export const BOARD_NAMES: Record<BoardId, string> = {
  whiteboard_mr1: 'Bảng trắng phòng họp 1',
  design_board: 'Bảng thiết kế',
};

export const CHANNEL_TITLES: Record<ChannelId, string> = {
  1: 'Thông báo IT',
  2: 'Trạng thái dịch vụ',
  3: 'Lịch sự kiện',
  4: 'Bảng vinh danh',
  5: 'Bảng xếp hạng',
  6: 'Chào mừng',
};

/** Tên văn phòng hiển thị ở kênh 6. Chưa có nguồn cấu hình nên đặt cố định tại đây. */
export const OFFICE_NAME = 'Phòng CNTT';

export function isTvId(value: string): value is TvId {
  return (TV_IDS as readonly string[]).includes(value);
}

export function isBoardId(value: string): value is BoardId {
  return (BOARD_IDS as readonly string[]).includes(value);
}
