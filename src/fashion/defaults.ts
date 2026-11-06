/**
 * Giá trị mặc định và hàm dựng nhanh dùng chung cho presets, rules và migrate.
 * Cơ thể mặc định: bodyStyle 'realistic', người trưởng thành khoảng 7,5 đầu; nam 170 cm, nữ 160 cm (user.txt).
 * Kiểu 'chibi' là lựa chọn riêng: khoảng 3 đầu, nam 110 cm, nữ 105 cm (đơn vị cảnh).
 */
import { getAccessory, getGarment } from './catalog';
import { FACE_DEFAULTS } from './face';
import { DEFAULT_HAIR_STYLE } from './hair';
import type {
  AccessoryLook,
  ArmShape,
  BodyFrame,
  BodyShape,
  BodyStyle,
  CharacterLook,
  FaceLook,
  FaceStructure,
  Fit,
  GarmentPattern,
  HairLook,
  HexColor,
  LegShape,
  Material,
  OutfitLook,
  Side,
  SkinLook,
  WornAccessory,
  WornGarment,
  ZoneColors,
  ZoneMaterials,
} from './types';
import { LOOK_SCHEMA_VERSION } from './types';

/** Chiều cao mặc định theo kiểu tạo hình và mesh gốc, cm. */
export const DEFAULT_HEIGHT_CM: Readonly<Record<BodyStyle, Readonly<Record<BodyFrame, number>>>> = {
  realistic: { male: 170, female: 160 },
  chibi: { male: 110, female: 105 },
};
/** Số đầu mặc định theo kiểu tạo hình. */
export const DEFAULT_HEADS_TALL: Readonly<Record<BodyStyle, number>> = { realistic: 7.5, chibi: 3 };

export const NEUTRAL_ARM: Readonly<ArmShape> = { upperArm: 0, forearm: 0, length: 0, hand: 0 };
export const NEUTRAL_LEG: Readonly<LegShape> = { thigh: 0, calf: 0, length: 0, foot: 0 };

export function makeBody(
  frame: BodyFrame = 'male',
  patch: Partial<Omit<BodyShape, 'frame'>> = {},
  style: BodyStyle = 'realistic',
): BodyShape {
  return {
    frame,
    heightCm: DEFAULT_HEIGHT_CM[style][frame],
    headsTall: DEFAULT_HEADS_TALL[style],
    weight: 0,
    bodyFat: 0,
    muscle: 0,
    torso: { shoulderWidth: 0, neckLength: 0, chest: 0, waist: 0, belly: 0, back: 0, hips: 0 },
    symmetric: true,
    arms: { left: { ...NEUTRAL_ARM }, right: { ...NEUTRAL_ARM } },
    legs: { left: { ...NEUTRAL_LEG }, right: { ...NEUTRAL_LEG } },
    ...patch,
  };
}

export const NEUTRAL_FACE_STRUCTURE: Readonly<FaceStructure> = {
  headSize: 0,
  forehead: 0,
  cheekbones: 0,
  cheeks: 0,
  jaw: 0,
  chin: 0,
  ears: 0,
  eyeSpacing: 0,
  eyeSize: 0,
  noseBridge: 0,
  noseWidth: 0,
  lipFullness: 0,
};

export function makeFace(patch: Partial<FaceLook> = {}): FaceLook {
  return {
    shape: FACE_DEFAULTS.shape,
    eyes: FACE_DEFAULTS.eyes,
    brows: FACE_DEFAULTS.brows,
    nose: FACE_DEFAULTS.nose,
    mouth: FACE_DEFAULTS.mouth,
    ears: FACE_DEFAULTS.ears,
    structure: { ...NEUTRAL_FACE_STRUCTURE },
    eyeColor: '#3b2a1e',
    facialHair: FACE_DEFAULTS.facialHair,
    facialHairColor: null,
    expression: FACE_DEFAULTS.expression,
    ...patch,
  };
}

export function makeHair(patch: Partial<HairLook> = {}): HairLook {
  return { style: DEFAULT_HAIR_STYLE, color: '#2b1d14', highlight: null, ...patch };
}

export function makeSkin(patch: Partial<SkinLook> = {}): SkinLook {
  return { tone: 1, unevenness: 0.25, freckles: 0, stretchMarks: 0, moles: [], ...patch };
}

export interface WearOptions {
  colors?: ZoneColors;
  materials?: ZoneMaterials;
  patterns?: GarmentPattern[];
  fit?: Fit;
  tucked?: boolean;
}

/**
 * Dựng WornGarment từ món trong danh mục với giá trị mặc định của món.
 * Ném lỗi nếu id không có trong danh mục (chỉ dùng cho dữ liệu viết tay như presets).
 */
export function wear(garmentId: string, opts: WearOptions = {}): WornGarment {
  const def = getGarment(garmentId);
  if (!def) throw new Error(`Không có món đồ "${garmentId}" trong danh mục.`);
  return {
    garmentId,
    colors: { ...def.defaultColors, ...opts.colors },
    materials: { ...def.defaultMaterials, ...opts.materials },
    patterns: opts.patterns ? opts.patterns.map((p) => ({ ...p })) : [],
    fit: opts.fit ?? def.defaultFit,
    tucked: opts.tucked ?? false,
  };
}

export interface AccOptions {
  color?: HexColor;
  material?: Material;
  size?: number;
  side?: Side | 'both';
}

/** Dựng WornAccessory từ danh mục phụ kiện. Ném lỗi nếu id không có. */
export function wearAcc(itemId: string, opts: AccOptions = {}): WornAccessory {
  const def = getAccessory(itemId);
  if (!def) throw new Error(`Không có phụ kiện "${itemId}" trong danh mục.`);
  return {
    itemId,
    color: opts.color ?? def.defaultColor,
    material: opts.material ?? def.defaultMaterial,
    size: opts.size ?? 1,
    side: opts.side ?? def.sides[0] ?? 'both',
  };
}

export function emptyOutfit(): OutfitLook {
  return { inner: null, outer: null, bottom: null, onePiece: null, socks: null, shoes: null, hat: null };
}

export function emptyAccessories(): AccessoryLook {
  return {
    eyewear: null,
    earrings: null,
    mask: null,
    headphones: null,
    necklace: null,
    tie: null,
    badge: null,
    crossbodyBag: null,
    backpack: null,
    watch: null,
    bracelet: null,
    phone: null,
    belt: null,
    keychain: null,
    cufflinks: null,
    scarf: null,
    rings: [],
  };
}

/** Bộ mặc định: polo đồng phục, quần âu, giày da, dây đeo thẻ (REAL_OFFICE_STYLE mục 6, bộ A). */
export function makeDefaultLook(): CharacterLook {
  return {
    version: LOOK_SCHEMA_VERSION,
    meta: { name: 'Mặc định', presetId: null, legacyOutfit: null },
    bodyStyle: 'realistic',
    body: makeBody('male'),
    face: makeFace(),
    hair: makeHair(),
    skin: makeSkin(),
    tattoos: [],
    scars: [],
    outfit: {
      ...emptyOutfit(),
      inner: wear('inner-polo-office'),
      bottom: wear('bottom-trousers'),
      socks: wear('socks-dress'),
      shoes: wear('shoes-oxford'),
    },
    accessories: {
      ...emptyAccessories(),
      badge: wearAcc('badge-lanyard'),
      belt: wearAcc('belt-leather'),
    },
  };
}

/** Bản đóng băng nông để tham chiếu; dùng makeDefaultLook() hoặc cloneLook() khi cần sửa. */
export const DEFAULT_LOOK: Readonly<CharacterLook> = Object.freeze(makeDefaultLook());

/** Sao chép sâu (dữ liệu thuần JSON). */
export function cloneLook(look: CharacterLook): CharacterLook {
  return JSON.parse(JSON.stringify(look)) as CharacterLook;
}
