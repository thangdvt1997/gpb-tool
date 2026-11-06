import type { HintKind } from './helpState';
import type { KeyNames } from './keys';

/**
 * Nội dung hướng dẫn. Tên phím nhận qua ngữ cảnh (StepCtx.keys) do keyNamesFrom(cài đặt) tạo ra,
 * nên đổi phím trong Cài đặt thì hướng dẫn đổi theo.
 * Điều kiện hoàn tất (check) chỉ đọc trạng thái thật: vị trí nhân vật, góc nhìn, ngồi, tạm dừng,
 * trạng thái vật. Bước không có check là bước đọc, người dùng tự bấm "Tiếp".
 * `since`: phiên bản hướng dẫn đã thêm bước; người đã xem bản cũ chỉ thấy bước có since lớn hơn.
 */
export type StepCheck = 'moved' | 'view' | 'interacted' | 'paused';

export interface StepCtx {
  touch: boolean;
  keys: KeyNames;
  /** Vai trò người dùng (it/admin mới có sắp xếp nội thất). */
  role?: string;
  /** Có tay cầm đang kết nối. */
  gamepad: boolean;
}

export interface TourStep {
  id: string;
  title: string;
  body: (c: StepCtx) => string;
  check?: StepCheck;
  doneLabel?: string;
  /** Chỉ có phím tắt, không có nút cảm ứng tương ứng: bỏ qua trên thiết bị cảm ứng. */
  keyboardOnly?: boolean;
  /** Phiên bản hướng dẫn đã thêm bước này (mặc định 1). */
  since?: number;
  /** Điều kiện hiện bước (vai trò, tay cầm...). Không có thì luôn hiện. */
  when?: (c: StepCtx) => boolean;
}

export const isEditorRole = (role?: string): boolean => role === 'it' || role === 'admin';

export const STEPS: readonly TourStep[] = [
  {
    id: 'intro',
    title: 'Chào mừng bạn đến văn phòng',
    body: () => 'Vài bước ngắn giúp bạn đi lại và dùng đồ vật. Có thể bỏ qua bất cứ lúc nào.',
  },
  {
    id: 'move',
    title: 'Di chuyển',
    body: ({ touch, keys }) =>
      touch
        ? 'Kéo joystick bên trái để đi, giữ nút chạy để đi nhanh, chạm nút nhảy để nhảy.'
        : `Dùng ${keys.move} để đi, giữ ${keys.run} để chạy, nhấn ${keys.jump} để nhảy.`,
    check: 'moved',
    doneLabel: 'Bạn đã di chuyển',
  },
  {
    id: 'look',
    title: 'Xoay camera',
    body: ({ touch, keys }) =>
      touch
        ? 'Kéo một ngón tay trên cảnh để nhìn quanh.'
        : `Giữ ${keys.look} rồi kéo để xoay camera, nhấn chuột trái lên sàn để đi tới đó.`,
  },
  {
    id: 'view',
    title: 'Đổi góc nhìn',
    body: ({ keys }) => `Nhấn ${keys.view} để đổi giữa góc nhìn thứ nhất và thứ ba.`,
    keyboardOnly: true,
    check: 'view',
    doneLabel: 'Bạn đã đổi góc nhìn',
  },
  {
    id: 'interact',
    title: 'Tương tác với đồ vật',
    body: ({ touch, keys }) =>
      touch
        ? 'Đến gần cửa, ghế, ngăn kéo, máy in hay công tắc, khi nút tương tác hiện lên thì chạm vào.'
        : `Đến gần cửa, ghế, ngăn kéo, máy in hay công tắc, khi có gợi ý thì nhấn ${keys.interact}.`,
    check: 'interacted',
    doneLabel: 'Bạn đã tương tác với một vật',
  },
  {
    id: 'map',
    title: 'Bản đồ nhỏ',
    since: 2,
    body: ({ touch, keys }) =>
      touch
        ? 'Chạm vào bản đồ nhỏ ở góc màn hình để xem vị trí của bạn và đồ vật trong văn phòng.'
        : `Nhấn ${keys.map} để mở hoặc thu gọn bản đồ nhỏ, xem vị trí của bạn trong văn phòng.`,
  },
  {
    id: 'photo',
    title: 'Chụp ảnh và biểu cảm',
    since: 2,
    body: () =>
      'Dùng nút chụp ảnh để vào chế độ chụp: camera tự do, lưới, hẹn giờ. Bánh xe biểu cảm cho nhân vật vẫy tay, cười.',
  },
  {
    id: 'settings',
    title: 'Cài đặt và đổi phím',
    since: 2,
    body: ({ keys }) =>
      `Mở Cài đặt ở thanh công cụ để đổi phím (hiện đi bằng ${keys.move}, tương tác bằng ${keys.interact}), độ nhạy chuột, âm lượng và cỡ joystick. Thư viện và Sao lưu cũng ở thanh này.`,
  },
  {
    id: 'gamepad',
    title: 'Tay cầm',
    since: 2,
    when: (c) => c.gamepad,
    body: () =>
      'Đã thấy tay cầm: cần trái để đi, cần phải để nhìn. Chỉnh vùng chết và độ nhạy trong Cài đặt, mục Tay cầm.',
  },
  {
    id: 'layout',
    title: 'Sắp xếp nội thất',
    since: 2,
    when: (c) => isEditorRole(c.role),
    body: ({ keys }) =>
      `Tài khoản IT và admin có bảng Sắp xếp nội thất ở thanh công cụ: chọn vật, di chuyển rồi Lưu. Phím mở trình chỉnh sửa hiện là ${keys.editor}, đổi được trong Cài đặt.`,
  },
  {
    id: 'pause',
    title: 'Tạm dừng',
    body: ({ keys }) => `Nhấn ${keys.pause} để tạm dừng và mở menu, nhấn lần nữa để quay lại.`,
    keyboardOnly: true,
    check: 'paused',
    doneLabel: 'Bạn đã mở menu tạm dừng',
  },
  {
    id: 'done',
    title: 'Xong rồi',
    body: () => 'Mở trợ giúp bằng F1 hoặc dấu ?, hoặc nút Xem lại hướng dẫn, bất cứ lúc nào.',
  },
];

/**
 * Lọc các bước áp dụng: theo cảm ứng, điều kiện `when`, và (nếu onlyNewSince > 0) chỉ giữ bước mới hơn.
 * Bước 'done' luôn giữ ở cuối để có điểm kết thúc.
 */
export function visibleSteps(c: StepCtx, onlyNewSince = 0): TourStep[] {
  const base = STEPS.filter((s) => (!c.touch || !s.keyboardOnly) && (!s.when || s.when(c)));
  if (onlyNewSince <= 0) return base;
  const fresh = base.filter((s) => (s.since ?? 1) > onlyNewSince);
  if (fresh.length === 0) return base.filter((s) => s.id === 'done');
  const done = base.find((s) => s.id === 'done');
  return done && !fresh.includes(done) ? [...fresh, done] : fresh;
}

/** Gợi ý ngắn khi lần đầu gặp một loại vật. */
export const HINTS: Record<HintKind, (c: StepCtx) => string> = {
  door: ({ touch, keys }) => (touch ? 'Cửa: chạm nút tương tác để mở hoặc đóng.' : `Cửa: nhấn ${keys.interact} để mở hoặc đóng.`),
  chair: ({ touch, keys }) =>
    touch
      ? 'Ghế: chạm nút tương tác để ngồi, chạm lại để đứng dậy.'
      : `Ghế: nhấn ${keys.interact} để ngồi, nhấn lại để đứng dậy.`,
  computer: ({ touch, keys }) =>
    touch ? 'Máy tính: chạm nút tương tác để sử dụng.' : `Máy tính: nhấn ${keys.interact} để sử dụng.`,
  drawer: ({ touch, keys }) =>
    touch ? 'Ngăn kéo: chạm nút tương tác để kéo ra hoặc đẩy vào.' : `Ngăn kéo: nhấn ${keys.interact} để kéo ra hoặc đẩy vào.`,
  water: ({ touch, keys }) =>
    touch ? 'Cây nước: chạm nút tương tác để lấy nước.' : `Cây nước: nhấn ${keys.interact} để lấy nước.`,
  printer: ({ touch, keys }) =>
    touch ? 'Máy in: chạm nút tương tác để in.' : `Máy in: nhấn ${keys.interact} để in.`,
  switch: ({ touch, keys }) =>
    touch ? 'Công tắc: chạm nút tương tác để bật hoặc tắt đèn.' : `Công tắc: nhấn ${keys.interact} để bật hoặc tắt đèn.`,
};

/**
 * Suy ra loại vật từ dữ liệu của hệ tương tác. Khung mới có sẵn kind; khung cũ chỉ có nhãn và
 * động từ nên dùng nhãn tiếng Việt. Không khớp thì trả null (không hiện gợi ý).
 */
export function hintKindOf(label: string, verb: string | null, kind: string | null): HintKind | null {
  if (kind === 'door' || /(^|\s)cửa(\s|$)/i.test(label)) return 'door';
  if (kind === 'chair' || verb === 'Ngồi xuống' || /(^|\s)ghế(\s|$)/i.test(label)) return 'chair';
  if (kind === 'computer' || /máy tính/i.test(label)) return 'computer';
  if (kind === 'drawer' || /ngăn kéo/i.test(label)) return 'drawer';
  if (kind === 'water' || /cây nước/i.test(label)) return 'water';
  if (kind === 'printer' || /máy in/i.test(label)) return 'printer';
  if (kind === 'switch' || /công tắc/i.test(label)) return 'switch';
  return null;
}
