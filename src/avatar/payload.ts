import { DEFAULT_APPEARANCE, normalizeAppearance, type Appearance } from './appearance';

/**
 * Chuyển Appearance thành chuỗi JSON để gửi qua mạng (đồng bộ đa người chơi).
 * Chỉ ghi dữ liệu đã làm sạch, không chứa mesh hay hàm.
 */
export function serializeAppearance(a: Appearance): string {
  return JSON.stringify(normalizeAppearance(a));
}

/**
 * Đọc chuỗi JSON nhận từ mạng thành Appearance hợp lệ.
 * Chuỗi lỗi cú pháp hoặc sai kiểu sẽ trả về DEFAULT_APPEARANCE.
 */
export function parseAppearance(s: string): Appearance {
  let parsed: unknown;
  try {
    parsed = JSON.parse(s);
  } catch {
    return { ...DEFAULT_APPEARANCE, accessories: [...DEFAULT_APPEARANCE.accessories] };
  }
  return normalizeAppearance(parsed);
}
