import type { HintKind } from './helpState';

/**
 * Nội dung hướng dẫn. Tên phím lấy từ một chỗ duy nhất (KEYS): bộ điều khiển hiện tại cố định
 * W A S D, Shift, Space, E, V, Esc và chuột phải (xem useGtaControls). Khi có trang đổi phím,
 * chỉ cần thay nguồn của KEYS, không phải sửa từng câu.
 * Điều kiện hoàn tất (check) chỉ đọc trạng thái thật: vị trí nhân vật, góc nhìn, ngồi, tạm dừng,
 * trạng thái vật. Bước không có check là bước đọc, người dùng tự bấm "Tiếp".
 */
export const KEYS = {
  move: 'W A S D',
  run: 'Shift',
  jump: 'Space',
  interact: 'E',
  view: 'V',
  pause: 'Esc',
  look: 'chuột phải',
} as const;

export type StepCheck = 'moved' | 'view' | 'interacted' | 'paused';

export interface TourStep {
  id: string;
  title: string;
  body: (touch: boolean) => string;
  check?: StepCheck;
  doneLabel?: string;
  /** Chỉ có phím tắt, không có nút cảm ứng tương ứng: bỏ qua trên thiết bị cảm ứng. */
  keyboardOnly?: boolean;
}

export const STEPS: readonly TourStep[] = [
  {
    id: 'intro',
    title: 'Chào mừng bạn đến văn phòng',
    body: () => 'Vài bước ngắn giúp bạn đi lại và dùng đồ vật. Có thể bỏ qua bất cứ lúc nào.',
  },
  {
    id: 'move',
    title: 'Di chuyển',
    body: (touch) =>
      touch
        ? 'Kéo joystick bên trái để đi, giữ nút chạy để đi nhanh, chạm nút nhảy để nhảy.'
        : `Dùng ${KEYS.move} để đi, giữ ${KEYS.run} để chạy, nhấn ${KEYS.jump} để nhảy.`,
    check: 'moved',
    doneLabel: 'Bạn đã di chuyển',
  },
  {
    id: 'look',
    title: 'Xoay camera',
    body: (touch) =>
      touch
        ? 'Kéo một ngón tay trên cảnh để nhìn quanh.'
        : `Giữ ${KEYS.look} rồi kéo để xoay camera, nhấn chuột trái lên sàn để đi tới đó.`,
  },
  {
    id: 'view',
    title: 'Đổi góc nhìn',
    body: () => `Nhấn ${KEYS.view} để đổi giữa góc nhìn thứ nhất và thứ ba.`,
    keyboardOnly: true,
    check: 'view',
    doneLabel: 'Bạn đã đổi góc nhìn',
  },
  {
    id: 'interact',
    title: 'Tương tác với đồ vật',
    body: (touch) =>
      touch
        ? 'Đến gần cửa hoặc ghế, khi nút tương tác hiện lên thì chạm vào.'
        : `Đến gần cửa hoặc ghế, khi có gợi ý thì nhấn ${KEYS.interact}.`,
    check: 'interacted',
    doneLabel: 'Bạn đã tương tác với một vật',
  },
  {
    id: 'pause',
    title: 'Tạm dừng',
    body: () => `Nhấn ${KEYS.pause} để tạm dừng và mở menu, nhấn lần nữa để quay lại.`,
    keyboardOnly: true,
    check: 'paused',
    doneLabel: 'Bạn đã mở menu tạm dừng',
  },
  {
    id: 'done',
    title: 'Xong rồi',
    body: () => 'Bạn có thể xem lại hướng dẫn bất cứ lúc nào bằng nút Xem lại hướng dẫn.',
  },
];

/** Gợi ý ngắn khi lần đầu gặp một loại vật. */
export const HINTS: Record<HintKind, (touch: boolean) => string> = {
  door: (touch) => (touch ? 'Cửa: chạm nút tương tác để mở hoặc đóng.' : `Cửa: nhấn ${KEYS.interact} để mở hoặc đóng.`),
  chair: (touch) =>
    touch
      ? 'Ghế: chạm nút tương tác để ngồi, chạm lại để đứng dậy.'
      : `Ghế: nhấn ${KEYS.interact} để ngồi, nhấn lại để đứng dậy.`,
  computer: (touch) =>
    touch ? 'Máy tính: chạm nút tương tác để sử dụng.' : `Máy tính: nhấn ${KEYS.interact} để sử dụng.`,
};

/**
 * Suy ra loại vật từ dữ liệu của hệ tương tác. Khung mới có sẵn kind; khung cũ chỉ có nhãn và
 * động từ nên dùng nhãn tiếng Việt. Không khớp thì trả null (không hiện gợi ý).
 */
export function hintKindOf(label: string, verb: string | null, kind: string | null): HintKind | null {
  if (kind === 'door' || /(^|\s)cửa(\s|$)/i.test(label)) return 'door';
  if (kind === 'chair' || verb === 'Ngồi xuống' || /(^|\s)ghế(\s|$)/i.test(label)) return 'chair';
  if (kind === 'computer' || /máy tính/i.test(label)) return 'computer';
  return null;
}
