/**
 * Bảng "lớp vỏ" cho từng loại món (group:kind): vùng che, độ dày, thứ tự lớp, mức hỗ trợ.
 * Thuần dữ liệu, không phụ thuộc three. Mọi số đo là phân số của đoạn xương (t) hoặc độ cao chuẩn hoá (u,
 * 0 tại xương chậu, 1 tại gốc cổ, xem regions.ts); độ dày tính bằng mét ở cỡ mesh người lớn (cao 1,8 m)
 * và được co theo chiều cao mesh thật khi dựng.
 */
import type { GarmentDef } from '../../fashion/catalog';
import type { Fit, OutfitSlot } from '../../fashion/types';

/** Tên lớp theo yêu cầu TASK 04: base (tất, giày), shirt (áo, quần, bộ liền), jacket (áo ngoài), accessory (không dựng vỏ). */
export type LayerId = 'base' | 'shirt' | 'jacket' | 'accessory';

/** Thứ tự lớp tăng dần từ trong ra ngoài. */
export const LAYER_ORDER: readonly LayerId[] = ['base', 'shirt', 'jacket', 'accessory'];

/** Mức hỗ trợ: supported có luật che và độ dày riêng; limited là xấp xỉ (váy, đầm); unsupported chưa có vỏ. */
export type SupportLevel = 'supported' | 'limited' | 'unsupported';

export type ShellPart = 'top' | 'bottom' | 'full' | 'socks' | 'shoes';

export interface ShellClass {
  /** Khoá group:kind. */
  key: string;
  part: ShellPart | null;
  support: SupportLevel;
  /** Giải thích bằng tiếng Việt cho mức hỗ trợ (hiện trong UI và docs). */
  note: string;
  /** Độ cao chuẩn hoá tối đa của cổ áo: thân và cổ có u <= neckU được che. Dưới 1: hở cổ; trên 1: cổ cao. */
  neckU: number;
  /** Gấu áo (u tối thiểu của vùng chậu/đùi được che) khi thả áo; chỉ cho top. */
  hemU: number;
  /** Gấu áo khi sơ vin (nằm trong cạp quần). */
  hemTuckedU: number;
  /** Đầu tay áo trên và dưới theo t; 0 là không có. */
  sleeveUpper: number;
  sleeveFore: number;
  /** Cạp quần/váy: thân và chậu có u <= waistU. */
  waistU: number;
  /** Độ dài ống: đùi và cẳng chân theo t; 0 là không che. */
  thigh: number;
  calf: number;
  /** Giày/tất: che bàn chân và cẳng chân từ t này trở lên. */
  calfFrom: number;
  /** Độ dày cơ bản (m, cỡ 1,8 m). */
  thickness: number;
  /** Độ loe thêm cho váy/đầm (m, cỡ 1,8 m), tăng dần xuống dưới. */
  flare: number;
  layer: LayerId;
  /** Thứ tự chi tiết trong cùng cơ thể: số lớn nằm ngoài. */
  order: number;
}

const NONE = 0;

function cls(key: string, part: ShellPart | null, o: Partial<ShellClass>): ShellClass {
  return {
    key,
    part,
    support: part ? 'supported' : 'unsupported',
    note: '',
    neckU: 0.96,
    hemU: -0.25,
    hemTuckedU: -0.1,
    sleeveUpper: NONE,
    sleeveFore: NONE,
    waistU: 0.1,
    thigh: NONE,
    calf: NONE,
    calfFrom: 2,
    thickness: 0.003,
    flare: 0,
    layer: 'shirt',
    order: 40,
    ...o,
  };
}

const LONG = { sleeveUpper: 1, sleeveFore: 0.95 } as const;
const SHORT = { sleeveUpper: 0.55, sleeveFore: NONE } as const;

const TABLE: readonly ShellClass[] = [
  // Áo trong
  cls('inner:shirt-long', 'top', { ...LONG, neckU: 1.0, thickness: 0.003, hemU: -0.26, hemTuckedU: -0.1 }),
  cls('inner:shirt-short', 'top', { ...SHORT, neckU: 1.0, thickness: 0.003, hemU: -0.26 }),
  cls('inner:polo', 'top', { ...SHORT, sleeveUpper: 0.5, neckU: 1.0, thickness: 0.0032, hemU: -0.22 }),
  cls('inner:tee', 'top', { ...SHORT, sleeveUpper: 0.5, thickness: 0.0028, hemU: -0.22 }),
  cls('inner:hoodie', 'top', { ...LONG, neckU: 1.02, thickness: 0.0085, hemU: -0.25 }),
  cls('inner:knit', 'top', { ...LONG, neckU: 1.1, thickness: 0.0055, hemU: -0.2 }),
  cls('inner:jersey', 'top', { sleeveUpper: 0.45, neckU: 0.98, thickness: 0.003, hemU: -0.3 }),
  // Áo ngoài
  cls('outer:blazer', 'top', { ...LONG, neckU: 1.0, thickness: 0.0075, hemU: -0.3, layer: 'jacket', order: 60 }),
  cls('outer:bomber', 'top', { ...LONG, neckU: 1.02, thickness: 0.0085, hemU: -0.1, layer: 'jacket', order: 60 }),
  cls('outer:denim-jacket', 'top', { ...LONG, neckU: 1.0, thickness: 0.0075, hemU: -0.15, layer: 'jacket', order: 60 }),
  cls('outer:hoodie', 'top', { ...LONG, neckU: 1.02, thickness: 0.0085, hemU: -0.25, layer: 'jacket', order: 60 }),
  cls('outer:cardigan', 'top', { ...LONG, neckU: 1.0, thickness: 0.006, hemU: -0.3, layer: 'jacket', order: 60 }),
  cls('outer:overshirt', 'top', { ...LONG, neckU: 1.0, thickness: 0.006, hemU: -0.28, layer: 'jacket', order: 60 }),
  cls('outer:windbreaker', 'top', { ...LONG, neckU: 1.02, thickness: 0.005, hemU: -0.2, layer: 'jacket', order: 60 }),
  cls('outer:track-jacket', 'top', { ...LONG, neckU: 1.02, thickness: 0.0055, hemU: -0.25, layer: 'jacket', order: 60 }),
  // Quần, váy
  cls('bottom:trousers', 'bottom', { thigh: 1, calf: 0.97, thickness: 0.004, order: 30 }),
  cls('bottom:chinos', 'bottom', { thigh: 1, calf: 0.97, thickness: 0.0042, order: 30 }),
  cls('bottom:jeans', 'bottom', { thigh: 1, calf: 0.97, thickness: 0.005, waistU: 0.08, order: 30 }),
  cls('bottom:cargo', 'bottom', { thigh: 1, calf: 0.97, thickness: 0.0055, waistU: 0.08, order: 30 }),
  cls('bottom:wide-trousers', 'bottom', { thigh: 1, calf: 0.97, thickness: 0.005, order: 30 }),
  cls('bottom:joggers', 'bottom', { thigh: 1, calf: 0.97, thickness: 0.005, order: 30 }),
  cls('bottom:shorts', 'bottom', { thigh: 0.5, thickness: 0.004, order: 30 }),
  cls('bottom:skirt', 'bottom', {
    thigh: 0.45,
    thickness: 0.004,
    flare: 0.045,
    order: 30,
    support: 'limited',
    note: 'Váy là vỏ bám đùi và loe ra theo pháp tuyến, chưa phải mảng váy rời; hai đùi có thể chạm nhau khi bước dài.',
  }),
  // Bộ liền
  cls('onePiece:ao-dai', 'full', {
    ...LONG,
    neckU: 1.04,
    thigh: 1,
    calf: 0.97,
    thickness: 0.0035,
    order: 35,
    support: 'limited',
    note: 'Áo dài dựng thành vỏ liền thân và quần; tà áo rời chưa có.',
  }),
  cls('onePiece:ao-ba-ba', 'full', { ...LONG, neckU: 0.98, thigh: 1, calf: 0.9, thickness: 0.0035, order: 35 }),
  cls('onePiece:dress', 'full', {
    sleeveUpper: 0.25,
    neckU: 0.95,
    thigh: 0.6,
    thickness: 0.004,
    flare: 0.04,
    order: 35,
    support: 'limited',
    note: 'Đầm là vỏ bám thân, loe xuống đùi; chưa có váy rời.',
  }),
  cls('onePiece:gown', 'full', {
    neckU: 0.9,
    thigh: 1,
    calf: 0.85,
    thickness: 0.0045,
    flare: 0.04,
    order: 35,
    support: 'limited',
    note: 'Đầm dài là vỏ ôm chân và loe nhẹ; chưa có đuôi váy.',
  }),
  cls('onePiece:jumpsuit', 'full', { ...SHORT, sleeveUpper: 0.5, neckU: 0.98, thigh: 1, calf: 0.97, thickness: 0.0045, order: 35 }),
  cls('onePiece:uniform', 'full', { ...LONG, neckU: 1.0, thigh: 1, calf: 0.97, thickness: 0.0045, order: 35 }),
  // Tất
  cls('socks:crew', 'socks', { calfFrom: 0.6, thickness: 0.0015, layer: 'base', order: 10 }),
  cls('socks:ankle', 'socks', { calfFrom: 0.93, thickness: 0.0015, layer: 'base', order: 10 }),
  cls('socks:dress', 'socks', { calfFrom: 0.5, thickness: 0.0015, layer: 'base', order: 10 }),
  // Giày
  cls('shoes:sneaker', 'shoes', { calfFrom: 0.93, thickness: 0.0055, layer: 'base', order: 20 }),
  cls('shoes:loafer', 'shoes', { calfFrom: 0.96, thickness: 0.0045, layer: 'base', order: 20 }),
  cls('shoes:leather-shoe', 'shoes', { calfFrom: 0.95, thickness: 0.005, layer: 'base', order: 20 }),
  cls('shoes:boots', 'shoes', { calfFrom: 0.7, thickness: 0.007, layer: 'base', order: 20 }),
  cls('shoes:heel', 'shoes', {
    calfFrom: 0.95,
    thickness: 0.005,
    layer: 'base',
    order: 20,
    support: 'limited',
    note: 'Giày cao gót dùng vỏ bàn chân phẳng; gót cao chưa có hình học.',
  }),
  // Mũ: chưa có mesh rời nên không dựng vỏ từ thân.
  cls('hat:cap', null, { layer: 'accessory', order: 80, note: 'Mũ cần mesh rời gắn xương head; vỏ từ thân không dựng được.' }),
  cls('hat:beanie', null, { layer: 'accessory', order: 80, note: 'Mũ cần mesh rời gắn xương head.' }),
  cls('hat:bucket', null, { layer: 'accessory', order: 80, note: 'Mũ cần mesh rời gắn xương head.' }),
  cls('hat:beret', null, { layer: 'accessory', order: 80, note: 'Mũ cần mesh rời gắn xương head.' }),
  cls('hat:party', null, { layer: 'accessory', order: 80, note: 'Mũ cần mesh rời gắn xương head.' }),
];

const BY_KEY: ReadonlyMap<string, ShellClass> = new Map(TABLE.map((c) => [c.key, c]));

/** Toàn bộ bảng (cho test và docs). */
export const SHELL_CLASSES: readonly ShellClass[] = TABLE;

/** Lớp vỏ của một món; undefined nếu group:kind chưa có trong bảng (món mới thêm vào catalog). */
export function shellClassOf(def: Pick<GarmentDef, 'group' | 'kind'>): ShellClass | undefined {
  // 'ao-dai' ở mọi nhóm onePiece; 'sneaker' ... khoá thẳng group:kind.
  return BY_KEY.get(`${def.group}:${def.kind}`);
}

/** Hệ số độ dày theo phom: ôm mỏng hơn một chút, rộng dày hơn một chút. */
export const FIT_THICKNESS: Readonly<Record<Fit, number>> = { slim: 0.8, regular: 1, oversized: 1.15 };

/** Độ rộng thêm (m, cỡ 1,8 m) của phom, đẩy vỏ ra khỏi thân; slim bám sát. Chỉ áp cho áo và quần, không cho giày/tất. */
export const FIT_LOOSENESS: Readonly<Record<Fit, number>> = { slim: 0, regular: 0.003, oversized: 0.014 };

/** Lớp của slot khi không có món cụ thể. */
export function layerOfSlot(slot: OutfitSlot): LayerId {
  switch (slot) {
    case 'socks':
    case 'shoes':
      return 'base';
    case 'outer':
      return 'jacket';
    case 'hat':
      return 'accessory';
    default:
      return 'shirt';
  }
}
