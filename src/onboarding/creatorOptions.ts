import {
  ACCESSORIES,
  BODY_TYPES,
  OUTFITS,
  SHOE_STYLES,
  SKIN_TONES,
  type Accessory,
  type Appearance,
  type BodyType,
  type Outfit,
} from '../avatar/appearance';
import {
  accessories as accessoryCatalog,
  hairStyles as hairCatalog,
  outfitGroups as outfitGroupCatalog,
  outfits as outfitCatalog,
  shoes as shoeCatalog,
  type CatalogItem,
} from '../avatar/catalog';

/** Số phụ kiện tối đa theo ONBOARDING_UX.md mục 6.2.4. */
export const ACCESSORY_LIMIT = 6;
/** Số phụ kiện tối đa khi bấm Ngẫu nhiên. */
export const RANDOM_ACCESSORY_MAX = 3;

export const BODY_LABELS: Readonly<Record<BodyType, string>> = {
  slim: 'Dáng thanh',
  regular: 'Dáng vừa',
  broad: 'Dáng chắc',
};

/** Nhãn tông da, khớp thứ tự SKIN_TONES (6 tông). */
export const SKIN_LABELS: readonly string[] = [
  'Tông 1 (sáng nhất)',
  'Tông 2 (mặc định)',
  'Tông 3',
  'Tông 4',
  'Tông 5',
  'Tông 6 (sẫm nhất)',
];

export interface Swatch {
  hex: string;
  label: string;
}

/*
 * Bảng màu dưới đây theo ONBOARDING_UX.md. Các hex chưa được đội 3D chốt
 * (màu tóc 3 đến 6, màu mắt 2 đến 4, màu áo, màu quần) là giá trị tạm, cần duyệt lại.
 */
export const HAIR_COLORS: readonly Swatch[] = [
  { hex: '#2b1d14', label: 'Nâu rất đậm' },
  { hex: '#3b2a1f', label: 'Nâu đậm' },
  { hex: '#6b4a2b', label: 'Nâu hạt dẻ' },
  { hex: '#9c6b3c', label: 'Nâu vàng' },
  { hex: '#d8b77a', label: 'Vàng nhạt' },
  { hex: '#b8bcc4', label: 'Xám bạc' },
];

export const EYE_COLORS: readonly Swatch[] = [
  { hex: '#3b2a1e', label: 'Nâu' },
  { hex: '#1b1410', label: 'Nâu đen' },
  { hex: '#6e7a86', label: 'Xám' },
  { hex: '#3d6b4f', label: 'Xanh lục' },
];

export const TOP_COLORS: readonly Swatch[] = [
  { hex: '#e8edf3', label: 'Trắng xám' },
  { hex: '#bcd4e6', label: 'Xanh nhạt' },
  { hex: '#e9dcc4', label: 'Be' },
  { hex: '#8c2f39', label: 'Đỏ đô' },
  { hex: '#4a7c59', label: 'Xanh lá' },
  { hex: '#4a4f57', label: 'Xám than' },
];

export const BOTTOM_COLORS: readonly Swatch[] = [
  { hex: '#2e3a4f', label: 'Xanh navy đậm' },
  { hex: '#1f2328', label: 'Đen' },
  { hex: '#4a4f57', label: 'Xám than' },
  { hex: '#b8a88a', label: 'Be' },
  { hex: '#5b4636', label: 'Nâu' },
  { hex: '#5c6b7a', label: 'Xám xanh' },
];

/** Id trang phục có trong OUTFITS nhưng chưa thuộc nhóm nào của catalog. Rỗng nghĩa là đủ. */
export const UNGROUPED_OUTFITS: readonly Outfit[] = OUTFITS.filter(
  (id) => !outfitGroupCatalog.some((g) => g.ids.includes(id)),
);

/**
 * Nhóm trang phục lấy từ outfitGroups của catalog (theo ONBOARDING_UX.md mục 6.2.3).
 * Id nào chưa có nhóm sẽ được gom vào nhóm "Khác" để không bị sót.
 */
export const OUTFIT_GROUPS: readonly { label: string; ids: readonly Outfit[] }[] =
  UNGROUPED_OUTFITS.length > 0
    ? [...outfitGroupCatalog, { label: 'Khác', ids: UNGROUPED_OUTFITS }]
    : outfitGroupCatalog;

export const HAIR_OPTIONS: readonly CatalogItem<Appearance['hairStyle']>[] = hairCatalog;
export const OUTFIT_OPTIONS: readonly CatalogItem<Outfit>[] = outfitCatalog;
export const SHOE_OPTIONS = shoeCatalog;
export const ACCESSORY_OPTIONS: readonly CatalogItem<Accessory>[] = accessoryCatalog;

export function labelOf<T extends string>(items: readonly CatalogItem<T>[], id: T): string {
  const found = items.find((i) => i.id === id);
  return found ? found.label : id;
}

export function swatchLabel(list: readonly Swatch[], hex: string): string {
  const found = list.find((s) => s.hex === hex);
  return found ? found.label : hex;
}

export function accessoryNames(list: readonly Accessory[]): string {
  return list.map((a) => labelOf(accessoryCatalog, a)).join(', ');
}

/** Bản tóm tắt bằng chữ, cho trình đọc màn hình (ONBOARDING_UX.md mục 6.1). */
export function summarize(a: Appearance): string {
  const acc = a.accessories.length > 0 ? accessoryNames(a.accessories) : 'không có';
  return [
    `${BODY_LABELS[a.bodyType]}`,
    `tông da ${a.skinTone + 1}`,
    `${labelOf(hairCatalog, a.hairStyle).toLowerCase()}`,
    `${swatchLabel(HAIR_COLORS, a.hairColor).toLowerCase()}`,
    `${labelOf(outfitCatalog, a.outfit).toLowerCase()}`,
    `phụ kiện: ${acc}`,
  ].join(', ') + '.';
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** Chọn ngẫu nhiên mọi mục, phụ kiện tối đa RANDOM_ACCESSORY_MAX. */
export function randomAppearance(): Appearance {
  const pool: Accessory[] = [...ACCESSORIES];
  const want = Math.floor(Math.random() * (RANDOM_ACCESSORY_MAX + 1));
  const chosen: Accessory[] = [];
  while (chosen.length < want && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length);
    chosen.push(pool.splice(index, 1)[0]);
  }
  return {
    bodyType: pick(BODY_TYPES),
    skinTone: Math.floor(Math.random() * SKIN_TONES.length),
    hairStyle: pick(HAIR_OPTIONS).id,
    hairColor: pick(HAIR_COLORS).hex,
    eyeColor: pick(EYE_COLORS).hex,
    outfit: pick(OUTFITS),
    topColor: pick(TOP_COLORS).hex,
    bottomColor: pick(BOTTOM_COLORS).hex,
    shoes: pick(SHOE_STYLES),
    accessories: ACCESSORIES.filter((a) => chosen.includes(a)),
  };
}
