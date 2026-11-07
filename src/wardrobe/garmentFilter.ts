import type { GarmentDef, StyleTag } from '../fashion/catalog';

/**
 * Lọc tủ đồ theo phong cách (GarmentDef.styles) và họ màu (suy từ defaultColors). Hàm thuần.
 */
export type ColorFamily = 'black' | 'white' | 'gray' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'brown';

export const COLOR_FAMILY_LABELS: Readonly<Record<ColorFamily, string>> = {
  black: 'Đen',
  white: 'Trắng',
  gray: 'Xám',
  red: 'Đỏ',
  orange: 'Cam',
  yellow: 'Vàng',
  green: 'Lục',
  blue: 'Lam',
  purple: 'Tím',
  pink: 'Hồng',
  brown: 'Nâu',
};

export const COLOR_FAMILIES = Object.keys(COLOR_FAMILY_LABELS) as ColorFamily[];

function rgbOf(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Họ màu của một mã hex (null nếu không đọc được). */
export function colorFamily(hex: string): ColorFamily | null {
  const rgb = rgbOf(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (l < 0.14) return 'black';
  if (l > 0.9 && s < 0.5) return 'white';
  if (s < 0.14) return l > 0.8 ? 'white' : 'gray';
  let h: number;
  if (max === r) h = ((g - b) / d + 6) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 20 || h >= 340) return l > 0.7 ? 'pink' : l < 0.35 ? 'brown' : 'red';
  if (h < 45) return l < 0.5 ? 'brown' : 'orange';
  if (h < 70) return l < 0.35 ? 'brown' : 'yellow';
  if (h < 170) return 'green';
  if (h < 260) return 'blue';
  if (h < 300) return 'purple';
  return 'pink';
}

/** Các họ màu có mặt trong màu mặc định của món đồ. */
export function garmentColorFamilies(g: Pick<GarmentDef, 'defaultColors'>): ColorFamily[] {
  const out = new Set<ColorFamily>();
  for (const hex of Object.values(g.defaultColors)) {
    const f = typeof hex === 'string' ? colorFamily(hex) : null;
    if (f) out.add(f);
  }
  return [...out];
}

export interface GarmentFilter {
  style: StyleTag | null;
  color: ColorFamily | null;
}

export const NO_FILTER: GarmentFilter = { style: null, color: null };

export function filterGarments<T extends Pick<GarmentDef, 'styles' | 'defaultColors'>>(list: readonly T[], f: GarmentFilter): T[] {
  return list.filter((g) => (f.style === null || g.styles.includes(f.style)) && (f.color === null || garmentColorFamilies(g).includes(f.color)));
}

/** Phong cách có trong danh sách (để chỉ hiện lựa chọn có kết quả). */
export function stylesIn(list: readonly Pick<GarmentDef, 'styles'>[]): StyleTag[] {
  return [...new Set(list.flatMap((g) => g.styles))];
}

export function colorsIn(list: readonly Pick<GarmentDef, 'defaultColors'>[]): ColorFamily[] {
  const set = new Set(list.flatMap((g) => garmentColorFamilies(g)));
  return COLOR_FAMILIES.filter((c) => set.has(c));
}
