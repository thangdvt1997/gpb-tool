import { foldVi } from './keys';
import { isEditorRole, type StepCtx } from './steps';

/**
 * Chủ đề trợ giúp tra cứu (HelpCenter). Tên phím lấy từ ctx.keys (theo cài đặt hiện tại).
 * `keywords` là từ đồng nghĩa để ô tìm không dấu bắt được ("ban do", "may in", "doi phim"...).
 */
export interface HelpTopic {
  id: string;
  title: string;
  keywords: string[];
  body: (c: StepCtx) => string;
  when?: (c: StepCtx) => boolean;
}

export const TOPICS: readonly HelpTopic[] = [
  {
    id: 'move',
    title: 'Di chuyển và chạy',
    keywords: ['đi', 'chạy', 'nhảy', 'joystick', 'wasd'],
    body: ({ touch, keys }) =>
      touch
        ? 'Kéo joystick bên trái để đi, giữ nút chạy để đi nhanh, chạm nút nhảy để nhảy.'
        : `Dùng ${keys.move} để đi, giữ ${keys.run} để chạy, nhấn ${keys.jump} để nhảy. Nhấn chuột trái lên sàn để đi tới đó.`,
  },
  {
    id: 'camera',
    title: 'Xoay camera và đổi góc nhìn',
    keywords: ['nhìn', 'góc nhìn', 'ngôi thứ nhất', 'chuột'],
    body: ({ touch, keys }) =>
      touch
        ? 'Kéo một ngón tay trên cảnh để nhìn quanh.'
        : `Giữ ${keys.look} rồi kéo để xoay camera. Nhấn ${keys.view} để đổi giữa góc nhìn thứ nhất và thứ ba.`,
  },
  {
    id: 'overview',
    title: 'Xem tổng thể văn phòng',
    keywords: ['tổng thể', 'toàn cảnh', 'trên cao', 'nhìn từ trên', 'bản vẽ', 'ẩn trần', 'overview'],
    body: ({ touch, keys }) =>
      touch
        ? 'Mở menu tạm dừng rồi chạm Toàn cảnh để nhìn cả văn phòng chữ L từ trên cao, trần tự ẩn. Chạm Thoát toàn cảnh để quay lại góc nhìn cũ.'
        : `Nhấn ${keys.overview} để nhìn cả văn phòng chữ L từ trên cao, trần tự ẩn; vẫn đi và xoay camera được. Nhấn ${keys.overview} lần nữa hoặc ${keys.pause} để quay lại góc nhìn cũ. Nhấn ${keys.cameraPreset} để chuyển qua các camera đặt sẵn (toàn cảnh, hành lang trái, hành lang dưới, cụm bàn, phòng họp), hết vòng thì về camera theo nhân vật. Đổi phím trong Cài đặt.`,
  },
  {
    id: 'interact',
    title: 'Tương tác với đồ vật',
    keywords: ['cửa', 'ghế', 'ngăn kéo', 'cây nước', 'máy in', 'công tắc', 'đèn', 'tv', 'rèm', 'máy tính'],
    body: ({ touch, keys }) =>
      touch
        ? 'Đến gần vật, khi nút tương tác hiện lên thì chạm: mở cửa, ngồi ghế, kéo ngăn kéo, lấy nước ở cây nước, in ở máy in, bật tắt công tắc đèn.'
        : `Đến gần vật rồi nhấn ${keys.interact}: mở cửa, ngồi ghế, kéo ngăn kéo, lấy nước ở cây nước, in ở máy in, bật tắt công tắc đèn.`,
  },
  {
    id: 'map',
    title: 'Bản đồ nhỏ',
    keywords: ['bản đồ', 'minimap', 'vị trí'],
    body: ({ touch, keys }) =>
      touch ? 'Chạm vào bản đồ nhỏ để xem hoặc thu gọn.' : `Nhấn ${keys.map} để mở hoặc thu gọn bản đồ nhỏ.`,
  },
  {
    id: 'photo',
    title: 'Chụp ảnh',
    keywords: ['chụp', 'ảnh', 'camera tự do', 'hẹn giờ', 'lưới'],
    body: () => 'Dùng nút chụp ảnh để vào chế độ chụp: camera tự do trong khu văn phòng, lưới bố cục, hẹn giờ, chụp độ phân giải cao.',
  },
  {
    id: 'emote',
    title: 'Bánh xe biểu cảm',
    keywords: ['biểu cảm', 'vẫy tay', 'emote', 'cười'],
    body: () => 'Mở bánh xe biểu cảm để nhân vật vẫy tay, cười và làm các động tác khác.',
  },
  {
    id: 'settings',
    title: 'Cài đặt và đổi phím',
    keywords: ['đổi phím', 'phím', 'độ nhạy', 'âm lượng', 'cài đặt'],
    body: ({ keys }) =>
      `Mở Cài đặt ở thanh công cụ để đổi phím (đi: ${keys.move}, tương tác: ${keys.interact}, bản đồ: ${keys.map}), độ nhạy chuột, âm lượng, cỡ joystick. Hướng dẫn tự đổi theo phím mới.`,
  },
  {
    id: 'gamepad',
    title: 'Tay cầm',
    keywords: ['tay cầm', 'gamepad', 'joypad', 'xbox'],
    body: ({ gamepad }) =>
      gamepad
        ? 'Tay cầm đang kết nối: cần trái để đi, cần phải để nhìn. Chỉnh vùng chết và độ nhạy trong Cài đặt.'
        : 'Cắm hoặc kết nối tay cầm rồi nhấn một nút bất kỳ để trình duyệt nhận. Chỉnh vùng chết và độ nhạy trong Cài đặt.',
  },
  {
    id: 'library',
    title: 'Thư viện và Sao lưu',
    keywords: ['thư viện', 'asset', 'sao lưu', 'backup', 'khôi phục'],
    body: () => 'Thư viện cho xem các tài nguyên 3D của văn phòng. Sao lưu cho xuất và nhập dữ liệu để khôi phục khi cần. Cả hai ở thanh công cụ.',
  },
  {
    id: 'layout',
    title: 'Sắp xếp nội thất (IT và admin)',
    keywords: ['nội thất', 'sắp xếp', 'bố trí', 'editor', 'chỉnh sửa'],
    when: (c) => isEditorRole(c.role),
    body: ({ keys }) =>
      `Bảng Sắp xếp nội thất ở thanh công cụ, chỉ hiện với tài khoản IT và admin: chọn vật, di chuyển rồi Lưu. Phím mở trình chỉnh sửa: ${keys.editor}.`,
  },
  {
    id: 'pause',
    title: 'Tạm dừng',
    keywords: ['menu', 'dừng', 'esc'],
    body: ({ keys }) => `Nhấn ${keys.pause} để tạm dừng và mở menu, nhấn lần nữa để quay lại.`,
  },
  {
    id: 'help',
    title: 'Mở trợ giúp và xem lại hướng dẫn',
    keywords: ['f1', 'trợ giúp', 'hướng dẫn', 'xem lại'],
    body: () => 'Nhấn F1 hoặc dấu ? để mở trang trợ giúp này. Nút Xem lại hướng dẫn chạy lại các bước từ đầu.',
  },
];

/** Chủ đề áp dụng với ngữ cảnh hiện tại (ẩn mục chỉ dành cho IT/admin với người khác). */
export function availableTopics(c: StepCtx): HelpTopic[] {
  return TOPICS.filter((t) => !t.when || t.when(c));
}

/**
 * Tìm không dấu, không phân biệt hoa thường: mọi từ trong ô tìm phải xuất hiện
 * trong tiêu đề, từ khóa hoặc nội dung. Ô trống trả toàn bộ.
 */
export function searchTopics(query: string, c: StepCtx): HelpTopic[] {
  const all = availableTopics(c);
  const words = foldVi(query).split(' ').filter(Boolean);
  if (words.length === 0) return all;
  return all.filter((t) => {
    const hay = foldVi([t.title, ...t.keywords, t.body(c)].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

/** F1 hoặc dấu ? mở trợ giúp; bỏ qua khi đang gõ trong ô nhập. */
export function isHelpKey(e: { key: string; code?: string; target?: unknown; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.key === 'F1') return true;
  if (e.key !== '?') return false;
  const t = e.target as { tagName?: string; isContentEditable?: boolean } | null | undefined;
  const tag = t?.tagName?.toUpperCase();
  return !(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable === true);
}
