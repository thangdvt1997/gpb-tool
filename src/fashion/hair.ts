/**
 * Kiểu tóc người trưởng thành tỷ lệ thật (fashion.txt mục 2, user.txt mục 1).
 * id cũ của src/avatar/appearance.ts (short, bob, long, bun, spiky, curly, buzz, ponytail) giữ nguyên
 * để dữ liệu đã lưu dùng lại được. Màu tóc nằm trong HAIR_PALETTE (palette.ts).
 */

export type HairLength = 'very-short' | 'short' | 'medium' | 'long';

export interface HairStyleDef {
  id: string;
  name: string;
  description: string;
  length: HairLength;
  /** Cho phép highlight (một số kiểu quá ngắn không hiện highlight rõ). */
  supportsHighlight: boolean;
  /** Đội mũ được không (tóc búi cao, xoăn bồng va chạm mũ). */
  hatCompatible: boolean;
  /** Kiểu cũ của Appearance. */
  legacy: boolean;
}

export const HAIR_STYLES: readonly HairStyleDef[] = [
  { id: 'side-part', name: 'Rẽ ngôi lệch', description: 'Tóc ngắn rẽ ngôi một bên, chải gọn.', length: 'short', supportsHighlight: true, hatCompatible: true, legacy: false },
  { id: 'undercut', name: 'Undercut', description: 'Hai bên cạo sát, phần đỉnh dài vuốt ra sau.', length: 'short', supportsHighlight: true, hatCompatible: true, legacy: false },
  { id: 'textured-crop', name: 'Tóc ngắn tỉa lớp', description: 'Mái ngắn tỉa lớp, hai bên mỏng dần.', length: 'short', supportsHighlight: true, hatCompatible: true, legacy: false },
  { id: 'slick-back', name: 'Vuốt ngược', description: 'Tóc vuốt ngược ra sau, bóng nhẹ.', length: 'short', supportsHighlight: true, hatCompatible: true, legacy: false },
  { id: 'quiff', name: 'Mái dựng', description: 'Mái trước dựng phồng, hai bên gọn.', length: 'short', supportsHighlight: true, hatCompatible: false, legacy: false },
  { id: 'buzz', name: 'Tóc húi cua', description: 'Cắt sát đều da đầu.', length: 'very-short', supportsHighlight: false, hatCompatible: true, legacy: true },
  { id: 'short', name: 'Tóc ngắn gọn', description: 'Tóc ngắn tự nhiên, phù hợp công sở.', length: 'short', supportsHighlight: true, hatCompatible: true, legacy: true },
  { id: 'spiky', name: 'Tóc vuốt dựng', description: 'Tóc ngắn vuốt dựng nhẹ có kết cấu.', length: 'short', supportsHighlight: true, hatCompatible: false, legacy: true },
  { id: 'curly', name: 'Tóc xoăn', description: 'Tóc xoăn tự nhiên độ dài vừa.', length: 'medium', supportsHighlight: true, hatCompatible: false, legacy: true },
  { id: 'curly-short', name: 'Tóc xoăn ngắn', description: 'Lọn xoăn nhỏ sát đầu.', length: 'short', supportsHighlight: true, hatCompatible: true, legacy: false },
  { id: 'wavy-medium', name: 'Tóc gợn sóng ngang tai', description: 'Tóc lượn sóng nhẹ dài ngang tai.', length: 'medium', supportsHighlight: true, hatCompatible: true, legacy: false },
  { id: 'bob', name: 'Tóc bob', description: 'Tóc ngang cằm, cắt bằng.', length: 'medium', supportsHighlight: true, hatCompatible: true, legacy: true },
  { id: 'long', name: 'Tóc dài thẳng', description: 'Tóc dài qua vai, thẳng tự nhiên.', length: 'long', supportsHighlight: true, hatCompatible: true, legacy: true },
  { id: 'long-wavy', name: 'Tóc dài gợn sóng', description: 'Tóc dài qua vai, gợn sóng lớn.', length: 'long', supportsHighlight: true, hatCompatible: true, legacy: false },
  { id: 'ponytail', name: 'Tóc buộc đuôi ngựa', description: 'Tóc dài buộc thấp sau gáy.', length: 'long', supportsHighlight: true, hatCompatible: true, legacy: true },
  { id: 'bun', name: 'Tóc búi', description: 'Tóc dài búi gọn sau đầu.', length: 'long', supportsHighlight: true, hatCompatible: false, legacy: true },
  { id: 'man-bun', name: 'Búi nửa đầu', description: 'Nửa trên búi gọn, hai bên ngắn.', length: 'medium', supportsHighlight: true, hatCompatible: false, legacy: false },
];

const BY_ID: ReadonlyMap<string, HairStyleDef> = new Map(HAIR_STYLES.map((h) => [h.id, h]));

export function getHairStyle(id: string): HairStyleDef | undefined {
  return BY_ID.get(id);
}

export const DEFAULT_HAIR_STYLE = 'side-part';
