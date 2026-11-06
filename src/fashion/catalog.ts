/**
 * Danh mục trang phục, họa tiết procedural và phụ kiện (fashion.txt mục 4, 5).
 * Tên và thiết kế nguyên bản, không logo, không tên thương hiệu. Món đồ phù hợp nơi làm việc,
 * thể thao, lễ hội kín đáo. Không có món hở hang.
 * id ổn định: chỉ thêm id mới, không đổi hoặc xoá id đã phát hành (dữ liệu đã lưu tham chiếu tới).
 */
import type {
  AccessorySlot,
  Fit,
  GarmentZone,
  HexColor,
  Material,
  OutfitSlot,
  Side,
  SkinRegion,
  ZoneColors,
  ZoneMaterials,
} from './types';

/* ------------------------------------------------------------------ */
/* Trang phục                                                          */
/* ------------------------------------------------------------------ */

/** Nhóm tủ đồ trùng tên slot. */
export type GarmentGroup = OutfitSlot;

export const GARMENT_GROUP_LABELS: Readonly<Record<GarmentGroup, string>> = {
  inner: 'Áo trong',
  outer: 'Áo ngoài',
  bottom: 'Quần',
  onePiece: 'Bộ liền',
  socks: 'Tất',
  shoes: 'Giày',
  hat: 'Mũ',
};

export type StyleTag = 'office' | 'smart-casual' | 'street' | 'minimal' | 'creative' | 'sport' | 'formal' | 'festive';

export const STYLE_TAG_LABELS: Readonly<Record<StyleTag, string>> = {
  office: 'Công sở',
  'smart-casual': 'Lịch sự thoải mái',
  street: 'Đường phố',
  minimal: 'Tối giản',
  creative: 'Sáng tạo',
  sport: 'Thể thao',
  formal: 'Trang trọng',
  festive: 'Lễ hội',
};

export interface GarmentDef {
  id: string;
  /** Tên tiếng Việt. */
  name: string;
  description: string;
  group: GarmentGroup;
  /** Loại trong nhóm, ví dụ 'shirt-long', 'jeans', 'sneaker'. Dùng để lọc. */
  kind: string;
  fits: readonly Fit[];
  defaultFit: Fit;
  /** Vùng màu theo thứ tự hiển thị. */
  zones: readonly GarmentZone[];
  defaultColors: Readonly<ZoneColors>;
  /** Chất liệu hợp lệ cho từng vùng. Vùng nào cũng có ít nhất một chất liệu. */
  materials: Readonly<Partial<Record<GarmentZone, readonly Material[]>>>;
  defaultMaterials: Readonly<ZoneMaterials>;
  /** Vùng được phép đặt họa tiết/chữ. */
  patternZones: readonly GarmentZone[];
  /** Có biến thể sơ vin/thả áo. */
  tuckable: boolean;
  /** Slot không được mặc cùng món này. */
  excludes: readonly OutfitSlot[];
  /** Vùng da bị che (để ẩn hình xăm/sẹo dưới vải). */
  covers: readonly SkinRegion[];
  styles: readonly StyleTag[];
}

type ZoneSpec = Partial<Record<GarmentZone, readonly [HexColor, readonly Material[]]>>;

interface GarmentInput {
  id: string;
  name: string;
  description: string;
  group: GarmentGroup;
  kind: string;
  fits?: readonly Fit[];
  defaultFit?: Fit;
  zones: ZoneSpec;
  patternZones?: readonly GarmentZone[];
  tuckable?: boolean;
  excludes?: readonly OutfitSlot[];
  covers: readonly SkinRegion[];
  styles: readonly StyleTag[];
}

function garment(input: GarmentInput): GarmentDef {
  const zones: GarmentZone[] = [];
  const defaultColors: ZoneColors = {};
  const materials: Partial<Record<GarmentZone, readonly Material[]>> = {};
  const defaultMaterials: ZoneMaterials = {};
  for (const key of Object.keys(input.zones) as GarmentZone[]) {
    const spec = input.zones[key];
    if (!spec) continue;
    const [color, mats] = spec;
    zones.push(key);
    defaultColors[key] = color;
    materials[key] = mats;
    const first = mats[0];
    if (first) defaultMaterials[key] = first;
  }
  const fits = input.fits ?? ['regular'];
  return {
    id: input.id,
    name: input.name,
    description: input.description,
    group: input.group,
    kind: input.kind,
    fits,
    defaultFit: input.defaultFit ?? fits[0] ?? 'regular',
    zones,
    defaultColors,
    materials,
    defaultMaterials,
    patternZones: input.patternZones ?? [],
    tuckable: input.tuckable ?? false,
    excludes: input.excludes ?? [],
    covers: input.covers,
    styles: input.styles,
  };
}

const ALL_FITS: readonly Fit[] = ['regular', 'slim', 'oversized'];
const RS: readonly Fit[] = ['regular', 'slim'];
const RO: readonly Fit[] = ['regular', 'oversized'];

const SHIRT_FAB: readonly Material[] = ['cotton', 'woven', 'silk'];
const TEE_FAB: readonly Material[] = ['cotton', 'knit'];
const BTN: readonly Material[] = ['plastic', 'metal'];
const TROUSER_FAB: readonly Material[] = ['woven', 'twill', 'cotton'];
const SOLE: readonly Material[] = ['rubber', 'leather'];

const TORSO_LONG: readonly SkinRegion[] = ['chest', 'abdomen', 'back', 'upperArm', 'forearm'];
const TORSO_SHORT: readonly SkinRegion[] = ['chest', 'abdomen', 'back', 'upperArm'];
const LEGS_FULL: readonly SkinRegion[] = ['thigh', 'calf'];

export const GARMENTS: readonly GarmentDef[] = [
  /* ---------- Áo trong ---------- */
  garment({
    id: 'inner-shirt-long',
    name: 'Sơ mi dài tay',
    description: 'Sơ mi cổ bẻ, nẹp cúc, cổ tay măng sét.',
    group: 'inner',
    kind: 'shirt-long',
    fits: ALL_FITS,
    zones: {
      body: ['#f4f4f2', SHIRT_FAB],
      sleeve: ['#f4f4f2', SHIRT_FAB],
      collar: ['#f4f4f2', SHIRT_FAB],
      cuff: ['#f4f4f2', SHIRT_FAB],
      button: ['#efe6d6', BTN],
    },
    patternZones: ['body', 'sleeve'],
    tuckable: true,
    covers: TORSO_LONG,
    styles: ['office', 'smart-casual', 'formal'],
  }),
  garment({
    id: 'inner-shirt-short',
    name: 'Sơ mi ngắn tay',
    description: 'Sơ mi cổ bẻ tay ngắn, mặc mùa nóng.',
    group: 'inner',
    kind: 'shirt-short',
    fits: ALL_FITS,
    zones: {
      body: ['#cfe3ec', SHIRT_FAB],
      sleeve: ['#cfe3ec', SHIRT_FAB],
      collar: ['#cfe3ec', SHIRT_FAB],
      button: ['#efe6d6', BTN],
    },
    patternZones: ['body', 'sleeve'],
    tuckable: true,
    covers: TORSO_SHORT,
    styles: ['office', 'smart-casual', 'creative'],
  }),
  garment({
    id: 'inner-shirt-camp',
    name: 'Sơ mi cổ vest họa tiết',
    description: 'Sơ mi tay ngắn cổ mở, thân suông, hợp họa tiết lớn.',
    group: 'inner',
    kind: 'shirt-short',
    fits: RO,
    zones: {
      body: ['#efe6d6', ['cotton', 'woven', 'silk']],
      sleeve: ['#efe6d6', ['cotton', 'woven', 'silk']],
      collar: ['#efe6d6', ['cotton', 'woven', 'silk']],
      button: ['#3e2a1d', BTN],
    },
    patternZones: ['body', 'sleeve', 'collar'],
    covers: TORSO_SHORT,
    styles: ['creative', 'street', 'smart-casual'],
  }),
  garment({
    id: 'inner-polo',
    name: 'Áo polo',
    description: 'Polo cổ bẻ, nẹp ba cúc, vải đan.',
    group: 'inner',
    kind: 'polo',
    fits: ALL_FITS,
    zones: {
      body: ['#2e3a4f', ['knit', 'cotton']],
      sleeve: ['#2e3a4f', ['knit', 'cotton']],
      collar: ['#2e3a4f', ['knit', 'cotton']],
      cuff: ['#2e3a4f', ['knit']],
      button: ['#efe6d6', BTN],
    },
    patternZones: ['body'],
    tuckable: true,
    covers: TORSO_SHORT,
    styles: ['office', 'smart-casual', 'sport'],
  }),
  garment({
    id: 'inner-polo-office',
    name: 'Áo polo đồng phục',
    description: 'Polo trắng, cổ và bo tay xanh đậm, viền raglan mảnh (REAL_OFFICE_STYLE mục 6, bộ A).',
    group: 'inner',
    kind: 'polo',
    fits: RS,
    zones: {
      body: ['#f4f4f2', ['knit', 'cotton']],
      sleeve: ['#f4f4f2', ['knit', 'cotton']],
      collar: ['#1e2636', ['knit']],
      cuff: ['#1e2636', ['knit']],
      trim: ['#1e2636', ['knit']],
      button: ['#f4f4f2', BTN],
    },
    tuckable: true,
    covers: TORSO_SHORT,
    styles: ['office'],
  }),
  garment({
    id: 'inner-tee',
    name: 'Áo phông trơn',
    description: 'Áo phông cổ tròn, tay ngắn.',
    group: 'inner',
    kind: 'tee',
    fits: ALL_FITS,
    zones: {
      body: ['#ffffff', TEE_FAB],
      sleeve: ['#ffffff', TEE_FAB],
      collar: ['#ffffff', TEE_FAB],
    },
    patternZones: ['body', 'sleeve'],
    tuckable: true,
    covers: TORSO_SHORT,
    styles: ['street', 'minimal', 'smart-casual'],
  }),
  garment({
    id: 'inner-tee-long',
    name: 'Áo phông dài tay',
    description: 'Áo phông cổ tròn tay dài, mặc lót trong áo khoác.',
    group: 'inner',
    kind: 'tee',
    fits: ALL_FITS,
    zones: {
      body: ['#33373d', TEE_FAB],
      sleeve: ['#33373d', TEE_FAB],
      collar: ['#33373d', TEE_FAB],
      cuff: ['#33373d', TEE_FAB],
    },
    patternZones: ['body', 'sleeve'],
    tuckable: true,
    covers: TORSO_LONG,
    styles: ['street', 'minimal'],
  }),
  garment({
    id: 'inner-hoodie',
    name: 'Hoodie chui đầu',
    description: 'Hoodie nỉ có mũ trùm và túi bụng.',
    group: 'inner',
    kind: 'hoodie',
    fits: RO,
    defaultFit: 'oversized',
    zones: {
      body: ['#4a4f57', ['fleece', 'cotton']],
      sleeve: ['#4a4f57', ['fleece', 'cotton']],
      hood: ['#4a4f57', ['fleece', 'cotton']],
      cuff: ['#4a4f57', ['knit']],
      pocket: ['#4a4f57', ['fleece', 'cotton']],
      trim: ['#f4f4f2', ['cotton']],
    },
    patternZones: ['body', 'sleeve', 'hood'],
    covers: [...TORSO_LONG, 'neck'],
    styles: ['street', 'creative', 'sport'],
  }),
  garment({
    id: 'inner-turtleneck',
    name: 'Áo len cổ lọ',
    description: 'Áo len mỏng cổ cao, mặc trong blazer.',
    group: 'inner',
    kind: 'knit',
    fits: RS,
    zones: {
      body: ['#1f2328', ['knit']],
      sleeve: ['#1f2328', ['knit']],
      collar: ['#1f2328', ['knit']],
    },
    tuckable: true,
    covers: [...TORSO_LONG, 'neck'],
    styles: ['minimal', 'office', 'formal'],
  }),
  garment({
    id: 'inner-sweater',
    name: 'Áo len cổ tròn',
    description: 'Áo len dệt kim cổ tròn, bo gấu và tay.',
    group: 'inner',
    kind: 'knit',
    fits: ALL_FITS,
    zones: {
      body: ['#c97b63', ['knit']],
      sleeve: ['#c97b63', ['knit']],
      collar: ['#c97b63', ['knit']],
      cuff: ['#c97b63', ['knit']],
      hem: ['#c97b63', ['knit']],
    },
    patternZones: ['body'],
    covers: TORSO_LONG,
    styles: ['smart-casual', 'office'],
  }),
  garment({
    id: 'inner-jersey',
    name: 'Áo thi đấu',
    description: 'Áo thể thao vải lưới, sọc hai bên sườn.',
    group: 'inner',
    kind: 'jersey',
    fits: RO,
    zones: {
      body: ['#3f6fa3', ['nylon', 'knit']],
      sleeve: ['#3f6fa3', ['nylon', 'knit']],
      collar: ['#f4f4f2', ['knit']],
      trim: ['#f4f4f2', ['nylon']],
    },
    patternZones: ['body', 'sleeve'],
    covers: TORSO_SHORT,
    styles: ['sport'],
  }),

  /* ---------- Áo ngoài ---------- */
  garment({
    id: 'outer-blazer',
    name: 'Blazer',
    description: 'Áo khoác blazer ve bẻ, hai cúc, có túi ngực.',
    group: 'outer',
    kind: 'blazer',
    fits: ALL_FITS,
    zones: {
      body: ['#2e3a4f', ['woven', 'twill']],
      sleeve: ['#2e3a4f', ['woven', 'twill']],
      collar: ['#2e3a4f', ['woven', 'twill', 'silk']],
      lining: ['#4a4f57', ['silk', 'woven']],
      button: ['#1f2328', ['plastic', 'metal']],
      pocket: ['#2e3a4f', ['woven', 'twill']],
    },
    patternZones: ['body', 'sleeve'],
    covers: TORSO_LONG,
    styles: ['office', 'formal', 'smart-casual'],
  }),
  garment({
    id: 'outer-blazer-party',
    name: 'Vest tiệc viền',
    description: 'Vest có viền ve tương phản, dùng cho tiệc cuối năm.',
    group: 'outer',
    kind: 'blazer',
    fits: RS,
    zones: {
      body: ['#5e4a7a', ['woven', 'twill']],
      sleeve: ['#5e4a7a', ['woven', 'twill']],
      collar: ['#1f2328', ['silk', 'woven']],
      trim: ['#c9a85a', ['silk', 'metal']],
      button: ['#c9a85a', ['metal', 'plastic']],
    },
    covers: TORSO_LONG,
    styles: ['festive', 'formal'],
  }),
  garment({
    id: 'outer-tuxedo-jacket',
    name: 'Áo lễ phục',
    description: 'Áo vest đen ve satin dùng cho tiệc tối.',
    group: 'outer',
    kind: 'blazer',
    fits: RS,
    defaultFit: 'slim',
    zones: {
      body: ['#0f1013', ['woven']],
      sleeve: ['#0f1013', ['woven']],
      collar: ['#17191d', ['silk']],
      button: ['#17191d', ['silk', 'plastic']],
    },
    covers: TORSO_LONG,
    styles: ['formal', 'festive'],
  }),
  garment({
    id: 'outer-bomber',
    name: 'Áo khoác bomber',
    description: 'Bomber dáng ngắn, bo cổ tay và gấu, khoá kéo kim loại.',
    group: 'outer',
    kind: 'bomber',
    fits: RO,
    zones: {
      body: ['#4a5236', ['nylon', 'twill', 'suede']],
      sleeve: ['#4a5236', ['nylon', 'twill', 'suede']],
      collar: ['#1f2328', ['knit']],
      cuff: ['#1f2328', ['knit']],
      hem: ['#1f2328', ['knit']],
      lining: ['#ef8a3c', ['nylon']],
      zipper: ['#aeb8c4', ['metal']],
    },
    patternZones: ['body', 'sleeve'],
    covers: TORSO_LONG,
    styles: ['street', 'creative'],
  }),
  garment({
    id: 'outer-denim-jacket',
    name: 'Áo khoác denim',
    description: 'Áo khoác bò cổ bẻ, túi nắp ngực, cúc kim loại.',
    group: 'outer',
    kind: 'denim-jacket',
    fits: ALL_FITS,
    zones: {
      body: ['#5b7fa6', ['denim']],
      sleeve: ['#5b7fa6', ['denim']],
      collar: ['#5b7fa6', ['denim', 'suede']],
      pocket: ['#5b7fa6', ['denim']],
      trim: ['#d9a93f', ['cotton']],
      button: ['#a8714a', ['metal']],
    },
    patternZones: ['body', 'sleeve'],
    covers: TORSO_LONG,
    styles: ['street', 'smart-casual', 'creative'],
  }),
  garment({
    id: 'outer-zip-hoodie',
    name: 'Hoodie khoá kéo',
    description: 'Hoodie nỉ mở trước bằng khoá kéo.',
    group: 'outer',
    kind: 'hoodie',
    fits: RO,
    zones: {
      body: ['#9aa1ab', ['fleece', 'cotton']],
      sleeve: ['#9aa1ab', ['fleece', 'cotton']],
      hood: ['#9aa1ab', ['fleece', 'cotton']],
      cuff: ['#9aa1ab', ['knit']],
      zipper: ['#3a3d42', ['metal', 'plastic']],
    },
    patternZones: ['body', 'sleeve', 'hood'],
    covers: TORSO_LONG,
    styles: ['street', 'sport'],
  }),
  garment({
    id: 'outer-cardigan',
    name: 'Cardigan',
    description: 'Áo len cài cúc mở trước.',
    group: 'outer',
    kind: 'cardigan',
    fits: ALL_FITS,
    zones: {
      body: ['#9aa1ab', ['knit']],
      sleeve: ['#9aa1ab', ['knit']],
      placket: ['#9aa1ab', ['knit']],
      button: ['#3e2a1d', BTN],
    },
    patternZones: ['body'],
    covers: TORSO_LONG,
    styles: ['office', 'smart-casual'],
  }),
  garment({
    id: 'outer-overshirt',
    name: 'Áo sơ mi khoác',
    description: 'Áo khoác dáng sơ mi vải dày, túi hộp ngực.',
    group: 'outer',
    kind: 'overshirt',
    fits: RO,
    zones: {
      body: ['#c9b48f', ['twill', 'canvas', 'woven']],
      sleeve: ['#c9b48f', ['twill', 'canvas', 'woven']],
      collar: ['#c9b48f', ['twill', 'canvas', 'woven']],
      pocket: ['#c9b48f', ['twill', 'canvas']],
      button: ['#3e2a1d', BTN],
    },
    patternZones: ['body', 'sleeve'],
    covers: TORSO_LONG,
    styles: ['smart-casual', 'creative', 'street'],
  }),
  garment({
    id: 'outer-coach-jacket',
    name: 'Áo khoác gió',
    description: 'Áo khoác gió mỏng, cúc bấm, cổ bẻ.',
    group: 'outer',
    kind: 'windbreaker',
    fits: RO,
    zones: {
      body: ['#1f2328', ['nylon']],
      sleeve: ['#1f2328', ['nylon']],
      collar: ['#1f2328', ['nylon']],
      button: ['#aeb8c4', ['metal']],
    },
    patternZones: ['body', 'sleeve'],
    covers: TORSO_LONG,
    styles: ['street', 'minimal'],
  }),
  garment({
    id: 'outer-track-jacket',
    name: 'Áo khoác thể thao',
    description: 'Áo khoác kéo khoá, sọc dọc tay áo.',
    group: 'outer',
    kind: 'track-jacket',
    fits: ALL_FITS,
    zones: {
      body: ['#2e3a4f', ['nylon', 'knit']],
      sleeve: ['#2e3a4f', ['nylon', 'knit']],
      collar: ['#2e3a4f', ['knit']],
      trim: ['#f4f4f2', ['nylon']],
      zipper: ['#aeb8c4', ['metal', 'plastic']],
    },
    covers: TORSO_LONG,
    styles: ['sport', 'street'],
  }),

  /* ---------- Quần ---------- */
  garment({
    id: 'bottom-trousers',
    name: 'Quần âu',
    description: 'Quần tây ống đứng, ly nhẹ, dài chạm giày.',
    group: 'bottom',
    kind: 'trousers',
    fits: ALL_FITS,
    zones: {
      leg: ['#22272e', TROUSER_FAB],
      waistband: ['#22272e', TROUSER_FAB],
      pocket: ['#22272e', TROUSER_FAB],
    },
    patternZones: ['leg'],
    covers: LEGS_FULL,
    styles: ['office', 'formal', 'smart-casual'],
  }),
  garment({
    id: 'bottom-chinos',
    name: 'Quần chinos',
    description: 'Quần kaki ống côn nhẹ, túi chéo.',
    group: 'bottom',
    kind: 'chinos',
    fits: ALL_FITS,
    zones: {
      leg: ['#c9b48f', ['twill', 'cotton']],
      waistband: ['#c9b48f', ['twill', 'cotton']],
      pocket: ['#c9b48f', ['twill', 'cotton']],
    },
    covers: LEGS_FULL,
    styles: ['smart-casual', 'office'],
  }),
  garment({
    id: 'bottom-jeans',
    name: 'Quần jeans',
    description: 'Quần bò năm túi, đinh tán kim loại.',
    group: 'bottom',
    kind: 'jeans',
    fits: ALL_FITS,
    zones: {
      leg: ['#34507a', ['denim']],
      waistband: ['#34507a', ['denim']],
      pocket: ['#34507a', ['denim']],
      trim: ['#d9a93f', ['cotton']],
      button: ['#a8714a', ['metal']],
    },
    patternZones: ['leg'],
    covers: LEGS_FULL,
    styles: ['street', 'smart-casual', 'creative'],
  }),
  garment({
    id: 'bottom-cargo',
    name: 'Quần cargo',
    description: 'Quần túi hộp hai bên đùi, bo ống tuỳ chọn.',
    group: 'bottom',
    kind: 'cargo',
    fits: RO,
    zones: {
      leg: ['#4a5236', ['twill', 'canvas', 'nylon']],
      waistband: ['#4a5236', ['twill', 'canvas', 'nylon']],
      pocket: ['#4a5236', ['twill', 'canvas', 'nylon']],
      hem: ['#4a5236', ['twill', 'knit']],
    },
    patternZones: ['leg', 'pocket'],
    covers: LEGS_FULL,
    styles: ['street', 'creative'],
  }),
  garment({
    id: 'bottom-wide',
    name: 'Quần ống rộng',
    description: 'Quần cạp cao ống suông rộng, xếp ly trước.',
    group: 'bottom',
    kind: 'wide-trousers',
    fits: RO,
    defaultFit: 'oversized',
    zones: {
      leg: ['#e9dcc4', ['woven', 'twill', 'cotton']],
      waistband: ['#e9dcc4', ['woven', 'twill', 'cotton']],
    },
    patternZones: ['leg'],
    covers: LEGS_FULL,
    styles: ['creative', 'minimal', 'smart-casual'],
  }),
  garment({
    id: 'bottom-joggers',
    name: 'Quần jogger',
    description: 'Quần thể thao bo gấu, cạp chun, sọc bên.',
    group: 'bottom',
    kind: 'joggers',
    fits: RO,
    zones: {
      leg: ['#2e3a4f', ['fleece', 'nylon', 'knit']],
      waistband: ['#2e3a4f', ['knit']],
      trim: ['#f4f4f2', ['nylon']],
    },
    covers: LEGS_FULL,
    styles: ['sport', 'street'],
  }),
  garment({
    id: 'bottom-shorts',
    name: 'Quần short dài gối',
    description: 'Quần short ống vừa, dài tới gần gối.',
    group: 'bottom',
    kind: 'shorts',
    fits: RO,
    zones: {
      leg: ['#1f2328', ['cotton', 'twill', 'nylon']],
      waistband: ['#1f2328', ['cotton', 'knit']],
      trim: ['#f4f4f2', ['nylon']],
    },
    patternZones: ['leg'],
    covers: ['thigh'],
    styles: ['sport', 'street'],
  }),
  garment({
    id: 'bottom-skirt-office',
    name: 'Chân váy bút chì dài gối',
    description: 'Chân váy công sở dáng bút chì, dài tới gối.',
    group: 'bottom',
    kind: 'skirt',
    fits: RS,
    zones: {
      leg: ['#22272e', ['woven', 'twill']],
      waistband: ['#22272e', ['woven', 'twill']],
    },
    covers: ['thigh'],
    styles: ['office', 'formal'],
  }),

  /* ---------- Bộ liền ---------- */
  garment({
    id: 'onepiece-ao-dai-nam',
    name: 'Áo dài nam',
    description: 'Áo dài nam cổ đứng, cài cúc bên, kèm quần ống rộng. Dùng cho dịp lễ.',
    group: 'onePiece',
    kind: 'ao-dai',
    zones: {
      body: ['#2e3a4f', ['silk', 'woven']],
      sleeve: ['#2e3a4f', ['silk', 'woven']],
      collar: ['#2e3a4f', ['silk', 'woven']],
      leg: ['#f4f4f2', ['silk', 'woven']],
      button: ['#c9a85a', ['metal', 'plastic']],
    },
    patternZones: ['body', 'sleeve'],
    excludes: ['inner', 'outer', 'bottom'],
    covers: [...TORSO_LONG, 'neck', 'thigh', 'calf'],
    styles: ['festive'],
  }),
  garment({
    id: 'onepiece-ao-dai-nu',
    name: 'Áo dài nữ',
    description: 'Áo dài nữ tà dài, cổ đứng, tay dài, quần ống rộng. Dùng cho dịp lễ.',
    group: 'onePiece',
    kind: 'ao-dai',
    zones: {
      body: ['#c23b3b', ['silk', 'woven']],
      sleeve: ['#c23b3b', ['silk', 'woven']],
      collar: ['#c23b3b', ['silk', 'woven']],
      leg: ['#f4f4f2', ['silk', 'woven']],
    },
    patternZones: ['body', 'sleeve'],
    excludes: ['inner', 'outer', 'bottom'],
    covers: [...TORSO_LONG, 'neck', 'thigh', 'calf'],
    styles: ['festive'],
  }),
  garment({
    id: 'onepiece-ao-dai',
    name: 'Áo dài truyền thống',
    description: 'Áo dài kiểu chung, giữ cho dữ liệu cũ (id ao-dai).',
    group: 'onePiece',
    kind: 'ao-dai',
    zones: {
      body: ['#c23b3b', ['silk', 'woven']],
      sleeve: ['#c23b3b', ['silk', 'woven']],
      collar: ['#c23b3b', ['silk', 'woven']],
      leg: ['#f4f4f2', ['silk', 'woven']],
    },
    patternZones: ['body'],
    excludes: ['inner', 'outer', 'bottom'],
    covers: [...TORSO_LONG, 'neck', 'thigh', 'calf'],
    styles: ['festive'],
  }),
  garment({
    id: 'onepiece-ao-ba-ba',
    name: 'Bộ bà ba',
    description: 'Áo bà ba cài cúc giữa với quần lụa ống rộng, trang phục miền Nam.',
    group: 'onePiece',
    kind: 'ao-ba-ba',
    zones: {
      body: ['#efe6d6', ['silk', 'cotton']],
      sleeve: ['#efe6d6', ['silk', 'cotton']],
      leg: ['#1f2328', ['silk', 'cotton']],
      button: ['#efe6d6', ['plastic']],
    },
    patternZones: ['body'],
    excludes: ['inner', 'bottom'],
    covers: [...TORSO_LONG, 'thigh', 'calf'],
    styles: ['festive'],
  }),
  garment({
    id: 'onepiece-dress-office',
    name: 'Váy liền công sở',
    description: 'Váy liền tay lửng, cổ tròn, dài qua gối.',
    group: 'onePiece',
    kind: 'dress',
    fits: RS,
    zones: {
      body: ['#2e3a4f', ['woven', 'knit']],
      sleeve: ['#2e3a4f', ['woven', 'knit']],
      collar: ['#2e3a4f', ['woven', 'knit']],
      waistband: ['#1f2328', ['woven', 'leather']],
    },
    patternZones: ['body'],
    excludes: ['inner', 'bottom'],
    covers: [...TORSO_SHORT, 'thigh'],
    styles: ['office', 'formal'],
  }),
  garment({
    id: 'onepiece-evening-gown',
    name: 'Đầm dạ hội kín',
    description: 'Đầm dài chấm đất, cổ kín, tay dài, thắt eo.',
    group: 'onePiece',
    kind: 'gown',
    fits: RS,
    zones: {
      body: ['#5e4a7a', ['silk', 'woven']],
      sleeve: ['#5e4a7a', ['silk', 'woven']],
      waistband: ['#c9a85a', ['silk', 'metal']],
    },
    excludes: ['inner', 'bottom'],
    covers: [...TORSO_LONG, 'thigh', 'calf'],
    styles: ['formal', 'festive'],
  }),
  garment({
    id: 'onepiece-jumpsuit',
    name: 'Bộ liền công nhân',
    description: 'Bộ áo liền quần vải dày, túi ngực, khoá kéo trước.',
    group: 'onePiece',
    kind: 'jumpsuit',
    fits: RO,
    zones: {
      body: ['#4a5236', ['canvas', 'twill', 'denim']],
      sleeve: ['#4a5236', ['canvas', 'twill', 'denim']],
      leg: ['#4a5236', ['canvas', 'twill', 'denim']],
      pocket: ['#4a5236', ['canvas', 'twill']],
      zipper: ['#aeb8c4', ['metal']],
    },
    patternZones: ['body', 'leg'],
    excludes: ['bottom'],
    covers: [...TORSO_LONG, 'thigh', 'calf'],
    styles: ['creative', 'street'],
  }),
  garment({
    id: 'onepiece-security',
    name: 'Đồng phục bảo vệ',
    description: 'Áo và quần xanh đậm, huy hiệu hình học, cầu vai, thắt lưng bản rộng.',
    group: 'onePiece',
    kind: 'uniform',
    zones: {
      body: ['#1e2636', ['twill', 'woven']],
      sleeve: ['#1e2636', ['twill', 'woven']],
      collar: ['#1e2636', ['twill', 'woven']],
      leg: ['#1e2636', ['twill', 'woven']],
      trim: ['#c9a85a', ['metal', 'woven']],
      waistband: ['#1f2328', ['leather', 'nylon']],
    },
    excludes: ['inner', 'bottom'],
    covers: [...TORSO_SHORT, 'thigh', 'calf'],
    styles: ['office'],
  }),
  garment({
    id: 'onepiece-stage-uniform',
    name: 'Đồng phục văn nghệ',
    description: 'Bộ đồng phục đi hát và sự kiện nội bộ, áo cổ đứng và quần cùng màu.',
    group: 'onePiece',
    kind: 'uniform',
    zones: {
      body: ['#8c2f39', ['woven', 'silk']],
      sleeve: ['#8c2f39', ['woven', 'silk']],
      collar: ['#c9a85a', ['woven', 'silk']],
      leg: ['#1f2328', ['woven']],
      button: ['#c9a85a', ['metal']],
    },
    excludes: ['inner', 'bottom'],
    covers: [...TORSO_LONG, 'thigh', 'calf'],
    styles: ['festive'],
  }),

  /* ---------- Tất ---------- */
  garment({
    id: 'socks-crew',
    name: 'Tất cổ vừa',
    description: 'Tất cotton cổ cao tới bắp chân dưới.',
    group: 'socks',
    kind: 'crew',
    zones: { body: ['#ffffff', ['cotton', 'knit']], band: ['#ffffff', ['knit']] },
    patternZones: ['body'],
    covers: ['foot', 'calf'],
    styles: ['street', 'sport', 'smart-casual'],
  }),
  garment({
    id: 'socks-ankle',
    name: 'Tất cổ ngắn',
    description: 'Tất cổ thấp ngang mắt cá.',
    group: 'socks',
    kind: 'ankle',
    zones: { body: ['#1f2328', ['cotton', 'knit']] },
    covers: ['foot'],
    styles: ['minimal', 'sport', 'street'],
  }),
  garment({
    id: 'socks-dress',
    name: 'Tất công sở',
    description: 'Tất mỏng màu trơn đi cùng giày da.',
    group: 'socks',
    kind: 'dress',
    zones: { body: ['#22272e', ['knit', 'silk']] },
    covers: ['foot', 'calf'],
    styles: ['office', 'formal'],
  }),
  garment({
    id: 'socks-stripe',
    name: 'Tất sọc thể thao',
    description: 'Tất cổ cao có hai sọc ngang ở cổ.',
    group: 'socks',
    kind: 'crew',
    zones: { body: ['#ffffff', ['cotton', 'knit']], band: ['#3f6fa3', ['knit']] },
    covers: ['foot', 'calf'],
    styles: ['sport', 'street', 'creative'],
  }),

  /* ---------- Giày ---------- */
  garment({
    id: 'shoes-sneaker-low',
    name: 'Sneaker cổ thấp',
    description: 'Giày thể thao cổ thấp, đế cao su dày.',
    group: 'shoes',
    kind: 'sneaker',
    zones: {
      upper: ['#ffffff', ['leather', 'canvas', 'suede']],
      toe: ['#ffffff', ['leather', 'canvas', 'suede']],
      lace: ['#ffffff', ['cotton']],
      sole: ['#f4f4f2', ['rubber']],
      trim: ['#ffffff', ['leather', 'suede']],
    },
    patternZones: ['upper'],
    covers: ['foot'],
    styles: ['street', 'smart-casual', 'office', 'minimal'],
  }),
  garment({
    id: 'shoes-sneaker-high',
    name: 'Sneaker cổ cao',
    description: 'Giày thể thao cổ cao qua mắt cá.',
    group: 'shoes',
    kind: 'sneaker',
    zones: {
      upper: ['#1f2328', ['canvas', 'leather', 'suede']],
      toe: ['#f4f4f2', ['rubber', 'leather']],
      lace: ['#f4f4f2', ['cotton']],
      sole: ['#f4f4f2', ['rubber']],
    },
    patternZones: ['upper'],
    covers: ['foot'],
    styles: ['street', 'creative'],
  }),
  garment({
    id: 'shoes-runner',
    name: 'Giày chạy bộ',
    description: 'Giày chạy bộ lưới thoáng, đế đệm.',
    group: 'shoes',
    kind: 'sneaker',
    zones: {
      upper: ['#9aa1ab', ['nylon', 'knit']],
      trim: ['#ef8a3c', ['nylon', 'rubber']],
      lace: ['#f4f4f2', ['nylon']],
      sole: ['#ffffff', ['rubber']],
    },
    covers: ['foot'],
    styles: ['sport', 'street', 'creative'],
  }),
  garment({
    id: 'shoes-loafer',
    name: 'Giày lười',
    description: 'Giày lười da, mũi tròn, quai ngang.',
    group: 'shoes',
    kind: 'loafer',
    zones: {
      upper: ['#3e2a1d', ['leather', 'suede']],
      trim: ['#3e2a1d', ['leather', 'metal']],
      sole: ['#17191d', SOLE],
    },
    covers: ['foot'],
    styles: ['office', 'formal', 'smart-casual'],
  }),
  garment({
    id: 'shoes-oxford',
    name: 'Giày da buộc dây',
    description: 'Giày da đen buộc dây, mũi tròn, đế mỏng, hơi bóng.',
    group: 'shoes',
    kind: 'leather-shoe',
    zones: {
      upper: ['#17191d', ['leather']],
      toe: ['#17191d', ['leather']],
      lace: ['#17191d', ['cotton']],
      sole: ['#17191d', SOLE],
    },
    covers: ['foot'],
    styles: ['office', 'formal'],
  }),
  garment({
    id: 'shoes-derby',
    name: 'Giày da derby',
    description: 'Giày da buộc dây kiểu mở, mũi tròn, đế dày hơn.',
    group: 'shoes',
    kind: 'leather-shoe',
    zones: {
      upper: ['#7a5232', ['leather', 'suede']],
      lace: ['#3e2a1d', ['cotton']],
      sole: ['#3e2a1d', SOLE],
    },
    covers: ['foot'],
    styles: ['office', 'smart-casual'],
  }),
  garment({
    id: 'shoes-boots-chelsea',
    name: 'Boots cổ chun',
    description: 'Boots da cổ lửng, hai bên chun co giãn.',
    group: 'shoes',
    kind: 'boots',
    zones: {
      upper: ['#1f2328', ['leather', 'suede']],
      band: ['#33373d', ['knit']],
      sole: ['#17191d', SOLE],
    },
    covers: ['foot'],
    styles: ['minimal', 'smart-casual', 'street'],
  }),
  garment({
    id: 'shoes-boots-work',
    name: 'Boots buộc dây',
    description: 'Boots cổ cao buộc dây, đế răng cưa.',
    group: 'shoes',
    kind: 'boots',
    zones: {
      upper: ['#7a5232', ['leather', 'suede', 'canvas']],
      lace: ['#3e2a1d', ['cotton']],
      sole: ['#3e2a1d', ['rubber']],
    },
    covers: ['foot'],
    styles: ['street', 'creative'],
  }),
  garment({
    id: 'shoes-block-heel',
    name: 'Giày gót vuông thấp',
    description: 'Giày bít mũi gót vuông thấp, đi với váy hoặc quần âu.',
    group: 'shoes',
    kind: 'heel',
    zones: {
      upper: ['#17191d', ['leather', 'suede']],
      sole: ['#17191d', ['leather', 'rubber']],
    },
    covers: ['foot'],
    styles: ['office', 'formal'],
  }),

  /* ---------- Mũ ---------- */
  garment({
    id: 'hat-cap',
    name: 'Mũ lưỡi trai',
    description: 'Mũ lưỡi trai sáu mảnh, lưỡi cong.',
    group: 'hat',
    kind: 'cap',
    zones: {
      crown: ['#1f2328', ['cotton', 'twill', 'nylon']],
      brim: ['#1f2328', ['cotton', 'twill', 'nylon']],
      button: ['#1f2328', ['cotton', 'metal']],
    },
    patternZones: ['crown'],
    covers: [],
    styles: ['street', 'sport'],
  }),
  garment({
    id: 'hat-beanie',
    name: 'Mũ len',
    description: 'Mũ len ôm đầu, gập mép.',
    group: 'hat',
    kind: 'beanie',
    zones: { crown: ['#4a4f57', ['knit']], band: ['#4a4f57', ['knit']] },
    patternZones: ['band'],
    covers: [],
    styles: ['street', 'minimal'],
  }),
  garment({
    id: 'hat-bucket',
    name: 'Mũ tai bèo',
    description: 'Mũ vành tròn mềm.',
    group: 'hat',
    kind: 'bucket',
    zones: { crown: ['#c9b48f', ['cotton', 'canvas', 'denim']], brim: ['#c9b48f', ['cotton', 'canvas', 'denim']] },
    patternZones: ['crown', 'brim'],
    covers: [],
    styles: ['street', 'creative'],
  }),
  garment({
    id: 'hat-beret',
    name: 'Mũ nồi',
    description: 'Mũ nồi dạ mềm.',
    group: 'hat',
    kind: 'beret',
    zones: { crown: ['#8c2f39', ['knit', 'woven']] },
    covers: [],
    styles: ['creative', 'minimal'],
  }),
  garment({
    id: 'hat-party',
    name: 'Mũ tiệc',
    description: 'Mũ giấy nhọn đội dịp tiệc (giữ cho dữ liệu cũ hat-party).',
    group: 'hat',
    kind: 'party',
    zones: { crown: ['#d9a93f', ['plastic']], trim: ['#c23b3b', ['plastic']] },
    patternZones: ['crown'],
    covers: [],
    styles: ['festive'],
  }),
];

const GARMENT_BY_ID: ReadonlyMap<string, GarmentDef> = new Map(GARMENTS.map((g) => [g.id, g]));

export function getGarment(id: string): GarmentDef | undefined {
  return GARMENT_BY_ID.get(id);
}

export function garmentsInGroup(group: GarmentGroup): GarmentDef[] {
  return GARMENTS.filter((g) => g.group === group);
}

/* ------------------------------------------------------------------ */
/* Họa tiết procedural                                                 */
/* ------------------------------------------------------------------ */

export type PatternKind =
  | 'stripes'
  | 'pinstripe'
  | 'check'
  | 'gingham'
  | 'dots'
  | 'chevron'
  | 'triangles'
  | 'waves'
  | 'grid'
  | 'camo-abstract'
  | 'color-block'
  | 'leaf-outline'
  | 'text';

export interface PatternDef {
  id: string;
  name: string;
  kind: PatternKind;
  /** Tham số dựng shader/texture procedural. Đơn vị: số vạch hoặc hệ số trên 1 đơn vị UV. */
  params: Readonly<Record<string, number>>;
  /** Có ô nhập chữ (tối đa PATTERN_TEXT_MAX ký tự). */
  allowsText: boolean;
}

export const PATTERN_TEXT_MAX = 16;

export const PATTERNS: readonly PatternDef[] = [
  { id: 'pt-stripes', name: 'Sọc ngang', kind: 'stripes', params: { lines: 10, width: 0.5 }, allowsText: false },
  { id: 'pt-pinstripe', name: 'Sọc chỉ', kind: 'pinstripe', params: { lines: 28, width: 0.08 }, allowsText: false },
  { id: 'pt-check', name: 'Kẻ ô', kind: 'check', params: { cells: 8, width: 0.15 }, allowsText: false },
  { id: 'pt-gingham', name: 'Ca rô nhỏ', kind: 'gingham', params: { cells: 16, width: 0.5 }, allowsText: false },
  { id: 'pt-dots', name: 'Chấm bi', kind: 'dots', params: { cells: 12, radius: 0.22 }, allowsText: false },
  { id: 'pt-chevron', name: 'Răng cưa', kind: 'chevron', params: { lines: 8, amplitude: 0.3 }, allowsText: false },
  { id: 'pt-triangles', name: 'Tam giác', kind: 'triangles', params: { cells: 10, fill: 0.6 }, allowsText: false },
  { id: 'pt-waves', name: 'Sóng', kind: 'waves', params: { lines: 9, amplitude: 0.25, frequency: 3 }, allowsText: false },
  { id: 'pt-grid', name: 'Lưới mảnh', kind: 'grid', params: { cells: 14, width: 0.06 }, allowsText: false },
  { id: 'pt-camo', name: 'Mảng loang', kind: 'camo-abstract', params: { blobs: 5, seed: 7, softness: 0.4 }, allowsText: false },
  { id: 'pt-block', name: 'Phối mảng', kind: 'color-block', params: { split: 0.5, angle: 0 }, allowsText: false },
  { id: 'pt-leaf', name: 'Lá nét mảnh', kind: 'leaf-outline', params: { cells: 5, stroke: 0.04, seed: 3 }, allowsText: false },
  { id: 'pt-text', name: 'Chữ tự nhập', kind: 'text', params: { size: 0.3, tracking: 0.05 }, allowsText: true },
];

const PATTERN_BY_ID: ReadonlyMap<string, PatternDef> = new Map(PATTERNS.map((p) => [p.id, p]));

export function getPattern(id: string): PatternDef | undefined {
  return PATTERN_BY_ID.get(id);
}

/* ------------------------------------------------------------------ */
/* Phụ kiện                                                            */
/* ------------------------------------------------------------------ */

/** Xương gắn phụ kiện (tên theo humanoid VRM để khớp rig chung). */
export type AttachBone = 'head' | 'neck' | 'upperChest' | 'chest' | 'hips' | 'lowerArm' | 'hand' | 'finger';

/** Slot phụ kiện gồm cả nhẫn (nhẫn lưu thành danh sách riêng). */
export type AccessoryCatalogSlot = AccessorySlot | 'ring';

export const ACCESSORY_SLOT_LABELS: Readonly<Record<AccessoryCatalogSlot, string>> = {
  eyewear: 'Kính',
  earrings: 'Khuyên tai',
  mask: 'Khẩu trang',
  headphones: 'Tai nghe',
  necklace: 'Dây chuyền',
  tie: 'Cà vạt',
  badge: 'Thẻ nhân viên',
  crossbodyBag: 'Túi đeo chéo',
  backpack: 'Balo',
  watch: 'Đồng hồ',
  bracelet: 'Vòng tay',
  phone: 'Điện thoại',
  belt: 'Thắt lưng',
  keychain: 'Móc khoá',
  cufflinks: 'Khuy măng sét',
  scarf: 'Khăn quàng',
  ring: 'Nhẫn',
};

/** Xương gắn mặc định cho từng slot. Điện thoại: 'hips' khi cất, 'hand' khi cầm/sử dụng. */
export const ACCESSORY_SLOT_ATTACH: Readonly<Record<AccessoryCatalogSlot, AttachBone>> = {
  eyewear: 'head',
  earrings: 'head',
  mask: 'head',
  headphones: 'head',
  necklace: 'neck',
  tie: 'upperChest',
  badge: 'upperChest',
  crossbodyBag: 'chest',
  backpack: 'upperChest',
  watch: 'lowerArm',
  bracelet: 'lowerArm',
  phone: 'hand',
  belt: 'hips',
  keychain: 'hips',
  cufflinks: 'lowerArm',
  scarf: 'neck',
  ring: 'finger',
};

export type SideOption = Side | 'both';

export interface AccessoryDef {
  id: string;
  name: string;
  slot: AccessoryCatalogSlot;
  materials: readonly Material[];
  defaultMaterial: Material;
  defaultColor: HexColor;
  /** Bên đeo cho phép; phần tử đầu là mặc định. */
  sides: readonly SideOption[];
  styles: readonly StyleTag[];
}

const METALS: readonly Material[] = ['metal'];
const BOTH: readonly SideOption[] = ['both'];

function acc(
  id: string,
  name: string,
  slot: AccessoryCatalogSlot,
  materials: readonly Material[],
  defaultColor: HexColor,
  styles: readonly StyleTag[],
  sides: readonly SideOption[] = BOTH,
): AccessoryDef {
  return { id, name, slot, materials, defaultMaterial: materials[0] ?? 'plastic', defaultColor, sides, styles };
}

export const ACCESSORIES_CATALOG: readonly AccessoryDef[] = [
  acc('eyewear-round', 'Kính cận gọng tròn', 'eyewear', ['metal', 'plastic'], '#3a3d42', ['office', 'creative']),
  acc('eyewear-rect', 'Kính cận gọng chữ nhật', 'eyewear', ['plastic', 'metal'], '#1f2328', ['office', 'minimal']),
  acc('eyewear-browline', 'Kính nửa gọng', 'eyewear', ['plastic', 'metal'], '#3e2a1d', ['office', 'smart-casual']),
  acc('eyewear-sun-square', 'Kính râm vuông', 'eyewear', ['plastic', 'metal'], '#0f1013', ['street', 'minimal']),
  acc('eyewear-sun-pilot', 'Kính râm giọt nước', 'eyewear', ['metal'], '#aeb8c4', ['street']),
  acc('earring-stud', 'Khuyên tai đinh', 'earrings', METALS, '#aeb8c4', ['street', 'minimal'], ['left', 'right', 'both']),
  acc('earring-hoop', 'Khuyên tai vòng nhỏ', 'earrings', METALS, '#aeb8c4', ['street', 'creative'], ['left', 'right', 'both']),
  acc('mask-cloth', 'Khẩu trang vải', 'mask', ['cotton', 'knit'], '#1f2328', ['street', 'minimal']),
  acc('mask-pleated', 'Khẩu trang xếp ly', 'mask', ['woven'], '#bcd4e6', ['office']),
  acc('headphones-over', 'Tai nghe chụp tai', 'headphones', ['plastic', 'leather', 'metal'], '#1f2328', ['creative', 'street']),
  acc('headphones-studio', 'Tai nghe phòng thu', 'headphones', ['plastic', 'metal'], '#d3d6db', ['creative', 'minimal']),
  acc('necklace-chain-thin', 'Dây chuyền mảnh', 'necklace', METALS, '#aeb8c4', ['minimal', 'street']),
  acc('necklace-chain-bold', 'Dây xích bản vừa', 'necklace', METALS, '#aeb8c4', ['street']),
  acc('necklace-tag', 'Dây chuyền mặt thẻ', 'necklace', METALS, '#8b939e', ['street', 'minimal']),
  acc('tie-classic', 'Cà vạt bản vừa', 'tie', ['silk', 'woven'], '#8c2f39', ['office', 'formal']),
  acc('tie-slim', 'Cà vạt bản nhỏ', 'tie', ['silk', 'woven'], '#1e2636', ['office', 'minimal']),
  acc('tie-knit', 'Cà vạt len', 'tie', ['knit'], '#4a5236', ['smart-casual', 'creative']),
  acc('tie-bow', 'Nơ bướm', 'tie', ['silk', 'woven'], '#0f1013', ['formal', 'festive']),
  acc('badge-lanyard', 'Dây đeo thẻ', 'badge', ['nylon', 'woven'], '#e8502e', ['office']),
  acc('badge-clip', 'Thẻ kẹp ngực', 'badge', ['plastic', 'metal'], '#f4f4f2', ['office']),
  acc('badge-pin', 'Ghim cài áo', 'badge', METALS, '#c9a85a', ['formal', 'festive']),
  acc('bag-sling', 'Túi đeo chéo nhỏ', 'crossbodyBag', ['nylon', 'canvas', 'leather'], '#1f2328', ['street', 'creative']),
  acc('bag-messenger', 'Túi đưa thư', 'crossbodyBag', ['canvas', 'leather'], '#7a5232', ['creative', 'smart-casual']),
  acc('backpack-daypack', 'Balo thường ngày', 'backpack', ['nylon', 'canvas'], '#33373d', ['street', 'office']),
  acc('backpack-rolltop', 'Balo nắp cuộn', 'backpack', ['canvas', 'nylon', 'leather'], '#4a5236', ['street', 'creative']),
  acc('watch-metal', 'Đồng hồ dây kim loại', 'watch', METALS, '#aeb8c4', ['office', 'formal', 'minimal'], ['left', 'right']),
  acc('watch-leather', 'Đồng hồ dây da', 'watch', ['leather'], '#3e2a1d', ['office', 'smart-casual'], ['left', 'right']),
  acc('watch-digital', 'Đồng hồ điện tử', 'watch', ['plastic', 'rubber'], '#1f2328', ['sport', 'street'], ['left', 'right']),
  acc('bracelet-bead', 'Vòng hạt', 'bracelet', ['plastic', 'woven'], '#3e2a1d', ['street', 'creative'], ['right', 'left', 'both']),
  acc('bracelet-chain', 'Lắc tay xích', 'bracelet', METALS, '#aeb8c4', ['street', 'minimal'], ['right', 'left', 'both']),
  acc('bracelet-cord', 'Vòng dây dù', 'bracelet', ['nylon', 'leather'], '#1f2328', ['street', 'sport'], ['right', 'left', 'both']),
  acc('ring-band', 'Nhẫn trơn', 'ring', METALS, '#aeb8c4', ['minimal', 'street']),
  acc('ring-signet', 'Nhẫn mặt phẳng', 'ring', METALS, '#c9a85a', ['street', 'formal']),
  acc('phone-slab', 'Điện thoại', 'phone', ['plastic', 'metal'], '#1f2328', ['office', 'street'], ['right', 'left']),
  acc('belt-leather', 'Thắt lưng da', 'belt', ['leather'], '#17191d', ['office', 'formal']),
  acc('belt-webbing', 'Thắt lưng vải dù', 'belt', ['nylon', 'canvas'], '#1f2328', ['street', 'creative']),
  acc('keychain-carabiner', 'Móc khoá carabiner', 'keychain', METALS, '#aeb8c4', ['street']),
  acc('keychain-ring', 'Móc khoá vòng', 'keychain', METALS, '#8b939e', ['minimal', 'street']),
  acc('cufflinks-round', 'Khuy măng sét tròn', 'cufflinks', METALS, '#aeb8c4', ['formal', 'office']),
  acc('scarf-knit', 'Khăn len', 'scarf', ['knit'], '#9aa1ab', ['smart-casual', 'minimal']),
  acc('scarf-light', 'Khăn vải mỏng', 'scarf', ['silk', 'woven', 'cotton'], '#e9dcc4', ['creative', 'formal']),
];

const ACCESSORY_BY_ID: ReadonlyMap<string, AccessoryDef> = new Map(ACCESSORIES_CATALOG.map((a) => [a.id, a]));

export function getAccessory(id: string): AccessoryDef | undefined {
  return ACCESSORY_BY_ID.get(id);
}

export function accessoriesInSlot(slot: AccessoryCatalogSlot): AccessoryDef[] {
  return ACCESSORIES_CATALOG.filter((a) => a.slot === slot);
}

/** Giới hạn kích thước phụ kiện. */
export const ACCESSORY_SIZE_MIN = 0.85;
export const ACCESSORY_SIZE_MAX = 1.15;
/** Số nhẫn tối đa. */
export const MAX_RINGS = 4;
