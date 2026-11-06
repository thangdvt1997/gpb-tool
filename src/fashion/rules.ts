/**
 * Kiểm tra và sửa CharacterLook (fashion.txt mục 4 "quy tắc tương thích", mục 9; user.txt mục 2 "giới hạn
 * biến dạng theo giải phẫu"). validate() nhận dữ liệu bất kỳ (kể cả JSON nhập từ ngoài) và luôn trả về
 * một look hợp lệ cùng danh sách cảnh báo tiếng Việt. Không ném lỗi.
 *
 * Quy tắc chính:
 * - Mọi số bị kẹp vào giới hạn giải phẫu (BODY_LIMITS, FACE_STRUCTURE_LIMITS) hoặc giới hạn lớp.
 * - Chế độ đối xứng: bên phải chép bên trái. Chế độ từng bên: chênh lệch hai bên có giới hạn.
 * - Món đồ phải có trong danh mục và đúng nhóm của slot (giày phải thuộc nhóm giày...).
 * - Bộ liền loại trừ quần (và các slot khác ghi trong excludes của món).
 * - Thân trên và thân dưới luôn được che: thiếu thì tự thêm áo phông/quần âu mặc định.
 * - fit phải nằm trong fits của món; sơ vin chỉ khi món hỗ trợ và có quần.
 * - Màu kéo về bảng màu cho phép; chất liệu phải hợp lệ theo vùng.
 * - Tối đa 12 lớp hình xăm, 12 lớp sẹo, 12 nốt ruồi, 4 họa tiết mỗi món, 4 nhẫn.
 * - Xung đột phụ kiện: cà vạt và khuy măng sét cần sơ mi; thắt lưng, móc khoá cần quần hoặc bộ liền;
 *   mũ bị bỏ khi kiểu tóc không đội mũ được.
 */
import { OUTFITS as LEGACY_OUTFITS } from '../avatar/appearance';
import {
  ACCESSORY_SIZE_MAX,
  ACCESSORY_SIZE_MIN,
  MAX_RINGS,
  PATTERN_TEXT_MAX,
  getAccessory,
  getGarment,
  getPattern,
  type GarmentDef,
} from './catalog';
import { emptyAccessories, emptyOutfit, makeBody, makeDefaultLook, NEUTRAL_FACE_STRUCTURE, wear } from './defaults';
import {
  BROW_SHAPES,
  EAR_SHAPES,
  EXPRESSIONS,
  EYE_SHAPES,
  FACE_DEFAULTS,
  FACE_SHAPES,
  FACIAL_HAIR,
  MOUTH_SHAPES,
  NOSE_SHAPES,
  hasOption,
  type FaceOption,
} from './face';
import { getHairStyle } from './hair';
import { EYE_PALETTE, GARMENT_PALETTE, HAIR_PALETTE, INK_PALETTE, SCAR_PALETTE, inPalette, isHex, snapToPalette, type Swatch } from './palette';
import { MOLE_LIMITS, SCAR_LIMITS, getScarStyle } from './scars';
import { TATTOO_LIMITS, TATTOO_TEXT_MAX, getTattooTemplate } from './tattoos';
import {
  ACCESSORY_SLOTS,
  BODY_FRAMES,
  BODY_STYLES,
  FITS,
  LOOK_SCHEMA_VERSION,
  OUTFIT_SLOTS,
  PHONE_STATES,
  type AccessoryLook,
  type AccessorySlot,
  type ArmShape,
  type BodyFrame,
  type BodyShape,
  type BodyStyle,
  type CharacterLook,
  type FaceLook,
  type FaceStructure,
  type GarmentPattern,
  type GarmentZone,
  type HairLook,
  type HexColor,
  type LegShape,
  type LookMeta,
  type LookWarning,
  type Material,
  type MoleMark,
  type OutfitLook,
  type OutfitSlot,
  type RingFinger,
  type ScarLayer,
  type Side,
  type SkinLook,
  type SkinRegion,
  type TattooLayer,
  type TorsoShape,
  type ValidationResult,
  type WarningCode,
  type WornAccessory,
  type WornGarment,
  type WornRing,
  type ZoneColors,
  type ZoneMaterials,
} from './types';

/* ------------------------------------------------------------------ */
/* Giới hạn                                                            */
/* ------------------------------------------------------------------ */

export interface Range {
  readonly min: number;
  readonly max: number;
}

const R1: Range = { min: -1, max: 1 };
const HALF: Range = { min: -0.5, max: 0.5 };
const UNIT: Range = { min: 0, max: 1 };

export interface BodyLimits {
  readonly heightCm: Readonly<Record<BodyFrame, Range>>;
  readonly headsTall: Range;
  readonly weight: Range;
  readonly bodyFat: Range;
  readonly muscle: Range;
  readonly torso: Readonly<Record<keyof TorsoShape, Range>>;
  readonly arm: Readonly<Record<keyof ArmShape, Range>>;
  readonly leg: Readonly<Record<keyof LegShape, Range>>;
  /** Chênh lệch tối đa giữa hai bên khi chỉnh từng bên (độ đầy). */
  readonly maxAsymmetry: number;
  /** Chênh lệch tối đa giữa hai bên với chiều dài chi và cỡ bàn tay/chân (giữ dáng đi, giày đúng chân). */
  readonly maxLengthAsymmetry: number;
}

const ARM_LIMITS: BodyLimits['arm'] = { upperArm: R1, forearm: R1, length: HALF, hand: HALF };
const LEG_LIMITS: BodyLimits['leg'] = { thigh: R1, calf: R1, length: HALF, foot: HALF };
const R06: Range = { min: -0.6, max: 0.6 };

/**
 * Giới hạn theo kiểu tạo hình. Trọng số morph -1 đến 1; chiều dài chi và kích thước bàn tay/chân biên độ hẹp
 * hơn vì đổi độ dài xương.
 * - realistic (mặc định): giải phẫu người trưởng thành, 7 đến 8 đầu, không phóng to đầu.
 * - chibi (lựa chọn riêng): đầu lớn, thân ngắn, 2,5 đến 4 đầu; cổ chỉ được ngắn lại; chiều cao theo đơn vị cảnh.
 */
export const BODY_LIMITS_BY_STYLE: Readonly<Record<BodyStyle, BodyLimits>> = {
  realistic: {
    heightCm: { male: { min: 155, max: 200 }, female: { min: 145, max: 190 } },
    headsTall: { min: 7, max: 8 },
    weight: R1,
    bodyFat: R1,
    muscle: R1,
    torso: { shoulderWidth: R1, neckLength: R06, chest: R1, waist: R1, belly: R1, back: R1, hips: R1 },
    arm: ARM_LIMITS,
    leg: LEG_LIMITS,
    maxAsymmetry: 0.3,
    maxLengthAsymmetry: 0.1,
  },
  chibi: {
    heightCm: { male: { min: 90, max: 130 }, female: { min: 85, max: 125 } },
    headsTall: { min: 2.5, max: 4 },
    weight: R1,
    bodyFat: { min: -1, max: 0.6 },
    muscle: { min: -1, max: 0.5 },
    torso: { shoulderWidth: R06, neckLength: { min: -0.8, max: 0.1 }, chest: R06, waist: R06, belly: R06, back: R06, hips: R06 },
    arm: ARM_LIMITS,
    leg: LEG_LIMITS,
    maxAsymmetry: 0.3,
    maxLengthAsymmetry: 0.1,
  },
};

/** Giới hạn của kiểu realistic (mặc định). */
export const BODY_LIMITS: BodyLimits = BODY_LIMITS_BY_STYLE.realistic;

const FACE_REALISTIC: Readonly<Record<keyof FaceStructure, Range>> = {
  headSize: { min: -0.35, max: 0.35 },
  forehead: R1,
  cheekbones: R1,
  cheeks: R1,
  jaw: R1,
  chin: R1,
  ears: R06,
  eyeSpacing: R06,
  eyeSize: HALF,
  noseBridge: R1,
  noseWidth: R1,
  lipFullness: R1,
};

export const FACE_STRUCTURE_LIMITS_BY_STYLE: Readonly<Record<BodyStyle, Readonly<Record<keyof FaceStructure, Range>>>> = {
  realistic: FACE_REALISTIC,
  chibi: { ...FACE_REALISTIC, headSize: { min: -0.2, max: 0.6 }, eyeSize: { min: -0.3, max: 1 } },
};

/** Giới hạn mặt của kiểu realistic (mặc định). */
export const FACE_STRUCTURE_LIMITS = FACE_REALISTIC;

export const MAX_PATTERNS_PER_GARMENT = 4;
export const MAX_NAME_LENGTH = 40;

const SKIN_REGIONS: readonly SkinRegion[] = [
  'face',
  'neck',
  'chest',
  'abdomen',
  'back',
  'upperArm',
  'forearm',
  'hand',
  'thigh',
  'calf',
  'foot',
];
const SIDES: readonly Side[] = ['left', 'right'];
const RING_FINGERS: readonly RingFinger[] = ['index', 'middle', 'ring', 'little'];
const SKIN_TONE_COUNT = 6;

/* ------------------------------------------------------------------ */
/* Tiện ích                                                            */
/* ------------------------------------------------------------------ */

type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function rec(v: unknown): Rec {
  return isRec(v) ? v : {};
}

/** Ký tự điều khiển, ký tự độ rộng 0 và ký tự đổi hướng chữ. */
function isHiddenChar(c: number): boolean {
  return (
    c < 0x20 ||
    (c >= 0x7f && c <= 0x9f) ||
    (c >= 0x200b && c <= 0x200f) ||
    (c >= 0x202a && c <= 0x202e) ||
    (c >= 0x2066 && c <= 0x2069) ||
    c === 0xfeff
  );
}

class Ctx {
  readonly warnings: LookWarning[] = [];
  warn(code: WarningCode, path: string, message: string): void {
    this.warnings.push({ code, path, message });
  }

  num(value: unknown, range: Range, fallback: number, path: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      if (value !== undefined) this.warn('invalid_input', path, 'Giá trị không phải số, dùng mặc định.');
      return fallback;
    }
    if (value < range.min || value > range.max) {
      const c = Math.min(range.max, Math.max(range.min, value));
      this.warn('clamped', path, `Giá trị ${value} ngoài giới hạn ${range.min} đến ${range.max}, đã kẹp về ${c}.`);
      return c;
    }
    return value;
  }

  bool(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
  }

  oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T, path: string): T {
    if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
    if (value !== undefined) this.warn('unknown_id', path, `Giá trị "${String(value)}" không hợp lệ, dùng "${fallback}".`);
    return fallback;
  }

  option(value: unknown, list: readonly FaceOption[], fallback: string, path: string): string {
    if (hasOption(list, value)) return value;
    if (value !== undefined) this.warn('unknown_id', path, `Lựa chọn "${String(value)}" không có trong danh sách, dùng "${fallback}".`);
    return fallback;
  }

  color(value: unknown, palette: readonly Swatch[], fallback: HexColor, path: string): HexColor {
    if (!isHex(value)) {
      if (value !== undefined) this.warn('invalid_input', path, 'Màu không đúng dạng #rrggbb, dùng mặc định.');
      return fallback;
    }
    const snapped = snapToPalette(value, palette, fallback);
    if (!inPalette(value, palette)) {
      this.warn('color_snapped', path, `Màu ${value.toLowerCase()} không có trong bảng màu, đổi sang ${snapped}.`);
    }
    return snapped;
  }

  text(value: unknown, max: number, path: string): string {
    if (typeof value !== 'string') return '';
    // Bỏ ký tự điều khiển và ký tự định dạng ẩn (chống chèn hướng chữ), gộp khoảng trắng.
    const cleaned = Array.from(value)
      .filter((ch) => !isHiddenChar(ch.codePointAt(0) ?? 0))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    const chars = Array.from(cleaned);
    if (chars.length > max) {
      this.warn('text_trimmed', path, `Chữ dài quá ${max} ký tự, đã cắt bớt.`);
      return chars.slice(0, max).join('');
    }
    return cleaned;
  }
}

const UID_RE = /^[A-Za-z0-9_-]{1,32}$/;

function uniqueUid(value: unknown, used: Set<string>, prefix: string, path: string, ctx: Ctx): string {
  let uid = typeof value === 'string' && UID_RE.test(value) ? value : '';
  if (uid && used.has(uid)) {
    ctx.warn('duplicate_uid', path, `Mã lớp "${uid}" bị trùng, đã cấp mã mới.`);
    uid = '';
  }
  if (!uid) {
    let i = used.size + 1;
    while (used.has(`${prefix}${i}`)) i += 1;
    uid = `${prefix}${i}`;
  }
  used.add(uid);
  return uid;
}

function limitList(value: unknown, max: number, path: string, label: string, ctx: Ctx): unknown[] {
  if (!Array.isArray(value)) return [];
  if (value.length > max) {
    ctx.warn('too_many_layers', path, `Tối đa ${max} ${label}; đã bỏ ${value.length - max} lớp cuối.`);
    return value.slice(0, max);
  }
  return value;
}

/* ------------------------------------------------------------------ */
/* Cơ thể                                                              */
/* ------------------------------------------------------------------ */

function limitAsym(left: number, right: number, maxDiff: number, path: string, ctx: Ctx): number {
  if (Math.abs(right - left) <= maxDiff) return right;
  const fixed = right > left ? left + maxDiff : left - maxDiff;
  ctx.warn('clamped', path, `Hai bên chênh lệch quá ${maxDiff}, đã kéo bên phải về ${fixed.toFixed(2)}.`);
  return fixed;
}

function arm(v: unknown, L: BodyLimits['arm'], path: string, ctx: Ctx): ArmShape {
  const s = rec(v);
  return {
    upperArm: ctx.num(s.upperArm, L.upperArm, 0, `${path}.upperArm`),
    forearm: ctx.num(s.forearm, L.forearm, 0, `${path}.forearm`),
    length: ctx.num(s.length, L.length, 0, `${path}.length`),
    hand: ctx.num(s.hand, L.hand, 0, `${path}.hand`),
  };
}

function leg(v: unknown, L: BodyLimits['leg'], path: string, ctx: Ctx): LegShape {
  const s = rec(v);
  return {
    thigh: ctx.num(s.thigh, L.thigh, 0, `${path}.thigh`),
    calf: ctx.num(s.calf, L.calf, 0, `${path}.calf`),
    length: ctx.num(s.length, L.length, 0, `${path}.length`),
    foot: ctx.num(s.foot, L.foot, 0, `${path}.foot`),
  };
}

function validateBody(v: unknown, style: BodyStyle, ctx: Ctx): BodyShape {
  const s = rec(v);
  const LIM = BODY_LIMITS_BY_STYLE[style];
  const frame = ctx.oneOf<BodyFrame>(s.frame, BODY_FRAMES, 'male', 'body.frame');
  const d = makeBody(frame, {}, style);
  const t = rec(s.torso);
  const TL = LIM.torso;
  const symmetric = ctx.bool(s.symmetric, true);
  const armsIn = rec(s.arms);
  const legsIn = rec(s.legs);
  const leftArm = arm(armsIn.left, LIM.arm, 'body.arms.left', ctx);
  let rightArm = arm(armsIn.right, LIM.arm, 'body.arms.right', ctx);
  const leftLeg = leg(legsIn.left, LIM.leg, 'body.legs.left', ctx);
  let rightLeg = leg(legsIn.right, LIM.leg, 'body.legs.right', ctx);

  if (symmetric) {
    rightArm = { ...leftArm };
    rightLeg = { ...leftLeg };
  } else {
    const A = LIM.maxAsymmetry;
    const AL = LIM.maxLengthAsymmetry;
    rightArm = {
      upperArm: limitAsym(leftArm.upperArm, rightArm.upperArm, A, 'body.arms.right.upperArm', ctx),
      forearm: limitAsym(leftArm.forearm, rightArm.forearm, A, 'body.arms.right.forearm', ctx),
      length: limitAsym(leftArm.length, rightArm.length, AL, 'body.arms.right.length', ctx),
      hand: limitAsym(leftArm.hand, rightArm.hand, AL, 'body.arms.right.hand', ctx),
    };
    rightLeg = {
      thigh: limitAsym(leftLeg.thigh, rightLeg.thigh, A, 'body.legs.right.thigh', ctx),
      calf: limitAsym(leftLeg.calf, rightLeg.calf, A, 'body.legs.right.calf', ctx),
      length: limitAsym(leftLeg.length, rightLeg.length, AL, 'body.legs.right.length', ctx),
      foot: limitAsym(leftLeg.foot, rightLeg.foot, AL, 'body.legs.right.foot', ctx),
    };
  }

  return {
    frame,
    heightCm: ctx.num(s.heightCm, LIM.heightCm[frame], d.heightCm, 'body.heightCm'),
    headsTall: ctx.num(s.headsTall, LIM.headsTall, d.headsTall, 'body.headsTall'),
    weight: ctx.num(s.weight, LIM.weight, 0, 'body.weight'),
    bodyFat: ctx.num(s.bodyFat, LIM.bodyFat, 0, 'body.bodyFat'),
    muscle: ctx.num(s.muscle, LIM.muscle, 0, 'body.muscle'),
    torso: {
      shoulderWidth: ctx.num(t.shoulderWidth, TL.shoulderWidth, 0, 'body.torso.shoulderWidth'),
      neckLength: ctx.num(t.neckLength, TL.neckLength, 0, 'body.torso.neckLength'),
      chest: ctx.num(t.chest, TL.chest, 0, 'body.torso.chest'),
      waist: ctx.num(t.waist, TL.waist, 0, 'body.torso.waist'),
      belly: ctx.num(t.belly, TL.belly, 0, 'body.torso.belly'),
      back: ctx.num(t.back, TL.back, 0, 'body.torso.back'),
      hips: ctx.num(t.hips, TL.hips, 0, 'body.torso.hips'),
    },
    symmetric,
    arms: { left: leftArm, right: rightArm },
    legs: { left: leftLeg, right: rightLeg },
  };
}

/* ------------------------------------------------------------------ */
/* Mặt, tóc, da                                                        */
/* ------------------------------------------------------------------ */

function validateFace(v: unknown, style: BodyStyle, ctx: Ctx): FaceLook {
  const s = rec(v);
  const st = rec(s.structure);
  const FL = FACE_STRUCTURE_LIMITS_BY_STYLE[style];
  const structure: FaceStructure = { ...NEUTRAL_FACE_STRUCTURE };
  for (const key of Object.keys(FL) as (keyof FaceStructure)[]) {
    structure[key] = ctx.num(st[key], FL[key], 0, `face.structure.${key}`);
  }
  return {
    shape: ctx.option(s.shape, FACE_SHAPES, FACE_DEFAULTS.shape, 'face.shape'),
    eyes: ctx.option(s.eyes, EYE_SHAPES, FACE_DEFAULTS.eyes, 'face.eyes'),
    brows: ctx.option(s.brows, BROW_SHAPES, FACE_DEFAULTS.brows, 'face.brows'),
    nose: ctx.option(s.nose, NOSE_SHAPES, FACE_DEFAULTS.nose, 'face.nose'),
    mouth: ctx.option(s.mouth, MOUTH_SHAPES, FACE_DEFAULTS.mouth, 'face.mouth'),
    ears: ctx.option(s.ears, EAR_SHAPES, FACE_DEFAULTS.ears, 'face.ears'),
    structure,
    eyeColor: ctx.color(s.eyeColor, EYE_PALETTE, '#3b2a1e', 'face.eyeColor'),
    facialHair: ctx.option(s.facialHair, FACIAL_HAIR, FACE_DEFAULTS.facialHair, 'face.facialHair'),
    facialHairColor:
      s.facialHairColor === null || s.facialHairColor === undefined
        ? null
        : ctx.color(s.facialHairColor, HAIR_PALETTE, '#2b1d14', 'face.facialHairColor'),
    expression: ctx.option(s.expression, EXPRESSIONS, FACE_DEFAULTS.expression, 'face.expression'),
  };
}

function validateHair(v: unknown, ctx: Ctx): HairLook {
  const s = rec(v);
  let style = typeof s.style === 'string' ? s.style : '';
  let def = getHairStyle(style);
  if (!def) {
    if (s.style !== undefined) ctx.warn('unknown_id', 'hair.style', `Kiểu tóc "${String(s.style)}" không có, dùng mặc định.`);
    style = 'side-part';
    def = getHairStyle(style);
  }
  const color = ctx.color(s.color, HAIR_PALETTE, '#2b1d14', 'hair.color');
  let highlight: HairLook['highlight'] = null;
  if (isRec(s.highlight)) {
    if (def && !def.supportsHighlight) {
      ctx.warn('slot_conflict', 'hair.highlight', 'Kiểu tóc này quá ngắn để hiện highlight, đã bỏ highlight.');
    } else {
      highlight = {
        color: ctx.color(s.highlight.color, HAIR_PALETTE, '#9c6b3c', 'hair.highlight.color'),
        amount: ctx.num(s.highlight.amount, UNIT, 0.3, 'hair.highlight.amount'),
      };
    }
  }
  return { style, color, highlight };
}

function placementBase(s: Rec, path: string, ctx: Ctx) {
  return {
    side: ctx.oneOf<Side>(s.side, SIDES, 'left', `${path}.side`),
    mirrored: ctx.bool(s.mirrored, false),
    u: ctx.num(s.u, UNIT, 0.5, `${path}.u`),
    v: ctx.num(s.v, UNIT, 0.5, `${path}.v`),
    rotation: ctx.num(s.rotation, { min: -180, max: 180 }, 0, `${path}.rotation`),
  };
}

function region(value: unknown, allowed: readonly SkinRegion[], path: string, ctx: Ctx): SkinRegion | null {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as SkinRegion;
  ctx.warn('region_not_allowed', path, `Vùng "${String(value)}" không được phép cho mẫu này, đã bỏ lớp.`);
  return null;
}

function validateMoles(v: unknown, ctx: Ctx): MoleMark[] {
  const list = limitList(v, MOLE_LIMITS.maxMarks, 'skin.moles', 'nốt ruồi', ctx);
  const used = new Set<string>();
  const out: MoleMark[] = [];
  list.forEach((item, i) => {
    const s = rec(item);
    const path = `skin.moles[${i}]`;
    const r = region(s.region, SKIN_REGIONS, `${path}.region`, ctx);
    if (!r) return;
    out.push({
      uid: uniqueUid(s.uid, used, 'm', `${path}.uid`, ctx),
      region: r,
      side: ctx.oneOf<Side>(s.side, SIDES, 'left', `${path}.side`),
      u: ctx.num(s.u, UNIT, 0.5, `${path}.u`),
      v: ctx.num(s.v, UNIT, 0.5, `${path}.v`),
      size: ctx.num(s.size, MOLE_LIMITS.size, 1, `${path}.size`),
    });
  });
  return out;
}

function validateSkin(v: unknown, ctx: Ctx): SkinLook {
  const s = rec(v);
  let tone = 1;
  if (typeof s.tone === 'number' && Number.isFinite(s.tone)) {
    const r = Math.round(Math.min(SKIN_TONE_COUNT - 1, Math.max(0, s.tone)));
    if (r !== s.tone) ctx.warn('clamped', 'skin.tone', `Tông da phải là số nguyên 0 đến ${SKIN_TONE_COUNT - 1}, đã đổi thành ${r}.`);
    tone = r;
  } else if (s.tone !== undefined) {
    ctx.warn('invalid_input', 'skin.tone', 'Tông da không hợp lệ, dùng mặc định.');
  }
  return {
    tone,
    unevenness: ctx.num(s.unevenness, UNIT, 0.25, 'skin.unevenness'),
    freckles: ctx.num(s.freckles, UNIT, 0, 'skin.freckles'),
    stretchMarks: ctx.num(s.stretchMarks, { min: 0, max: 0.6 }, 0, 'skin.stretchMarks'),
    moles: validateMoles(s.moles, ctx),
  };
}

/* ------------------------------------------------------------------ */
/* Hình xăm, sẹo                                                       */
/* ------------------------------------------------------------------ */

function validateTattoos(v: unknown, ctx: Ctx): TattooLayer[] {
  const list = limitList(v, TATTOO_LIMITS.maxLayers, 'tattoos', 'lớp hình xăm', ctx);
  const used = new Set<string>();
  const out: TattooLayer[] = [];
  list.forEach((item, i) => {
    const s = rec(item);
    const path = `tattoos[${i}]`;
    const tpl = typeof s.templateId === 'string' ? getTattooTemplate(s.templateId) : undefined;
    if (!tpl) {
      ctx.warn('unknown_id', `${path}.templateId`, `Mẫu hình xăm "${String(s.templateId)}" không có, đã bỏ lớp.`);
      return;
    }
    const r = region(s.region, tpl.regions, `${path}.region`, ctx);
    if (!r) return;
    let text = '';
    if (tpl.params.kind === 'text') {
      text = ctx.text(s.text, TATTOO_TEXT_MAX, `${path}.text`) || tpl.params.defaultText;
    }
    out.push({
      uid: uniqueUid(s.uid, used, 't', `${path}.uid`, ctx),
      templateId: tpl.id,
      region: r,
      ...placementBase(s, path, ctx),
      scale: ctx.num(s.scale, TATTOO_LIMITS.scale, 1, `${path}.scale`),
      color: ctx.color(s.color, INK_PALETTE, '#1a1c20', `${path}.color`),
      opacity: ctx.num(s.opacity, TATTOO_LIMITS.opacity, 0.9, `${path}.opacity`),
      text,
      visible: ctx.bool(s.visible, true),
    });
  });
  return out;
}

function validateScars(v: unknown, ctx: Ctx): ScarLayer[] {
  const list = limitList(v, SCAR_LIMITS.maxLayers, 'scars', 'lớp sẹo', ctx);
  const used = new Set<string>();
  const out: ScarLayer[] = [];
  list.forEach((item, i) => {
    const s = rec(item);
    const path = `scars[${i}]`;
    const style = typeof s.styleId === 'string' ? getScarStyle(s.styleId) : undefined;
    if (!style) {
      ctx.warn('unknown_id', `${path}.styleId`, `Kiểu sẹo "${String(s.styleId)}" không có, đã bỏ lớp.`);
      return;
    }
    const r = region(s.region, style.regions, `${path}.region`, ctx);
    if (!r) return;
    out.push({
      uid: uniqueUid(s.uid, used, 's', `${path}.uid`, ctx),
      styleId: style.id,
      region: r,
      ...placementBase(s, path, ctx),
      length: ctx.num(s.length, SCAR_LIMITS.length, 1, `${path}.length`),
      color: ctx.color(s.color, SCAR_PALETTE, '#d8a994', `${path}.color`),
      relief: ctx.num(s.relief, SCAR_LIMITS.relief, 0.1, `${path}.relief`),
      visible: ctx.bool(s.visible, true),
    });
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Trang phục                                                          */
/* ------------------------------------------------------------------ */

function validatePatterns(v: unknown, def: GarmentDef, path: string, ctx: Ctx): GarmentPattern[] {
  const list = limitList(v, MAX_PATTERNS_PER_GARMENT, path, 'họa tiết mỗi món', ctx);
  const out: GarmentPattern[] = [];
  list.forEach((item, i) => {
    const s = rec(item);
    const p = `${path}[${i}]`;
    const pat = typeof s.patternId === 'string' ? getPattern(s.patternId) : undefined;
    if (!pat) {
      ctx.warn('unknown_id', `${p}.patternId`, `Họa tiết "${String(s.patternId)}" không có, đã bỏ.`);
      return;
    }
    if (typeof s.zone !== 'string' || !(def.patternZones as readonly string[]).includes(s.zone)) {
      ctx.warn('zone_not_allowed', `${p}.zone`, `Món "${def.name}" không cho đặt họa tiết ở vùng "${String(s.zone)}", đã bỏ.`);
      return;
    }
    out.push({
      patternId: pat.id,
      zone: s.zone as GarmentZone,
      color: ctx.color(s.color, GARMENT_PALETTE, '#1f2328', `${p}.color`),
      scale: ctx.num(s.scale, { min: 0.25, max: 4 }, 1, `${p}.scale`),
      rotation: ctx.num(s.rotation, { min: -180, max: 180 }, 0, `${p}.rotation`),
      offsetX: ctx.num(s.offsetX, R1, 0, `${p}.offsetX`),
      offsetY: ctx.num(s.offsetY, R1, 0, `${p}.offsetY`),
      text: pat.allowsText ? ctx.text(s.text, PATTERN_TEXT_MAX, `${p}.text`) : '',
    });
  });
  return out;
}

function validateGarment(v: unknown, slot: OutfitSlot, ctx: Ctx): WornGarment | null {
  if (v === null || v === undefined) return null;
  const s = rec(v);
  const path = `outfit.${slot}`;
  const def = typeof s.garmentId === 'string' ? getGarment(s.garmentId) : undefined;
  if (!def) {
    ctx.warn('unknown_id', `${path}.garmentId`, `Món đồ "${String(s.garmentId)}" không có trong danh mục, đã bỏ.`);
    return null;
  }
  if (def.group !== slot) {
    ctx.warn('wrong_group', `${path}.garmentId`, `"${def.name}" thuộc nhóm ${def.group}, không mặc ở slot ${slot}, đã bỏ.`);
    return null;
  }

  const fit = typeof s.fit === 'string' && (def.fits as readonly string[]).includes(s.fit) ? (s.fit as WornGarment['fit']) : def.defaultFit;
  if (s.fit !== undefined && fit !== s.fit) {
    const valid = typeof s.fit === 'string' && (FITS as readonly string[]).includes(s.fit);
    ctx.warn(
      valid ? 'fit_not_allowed' : 'invalid_input',
      `${path}.fit`,
      `"${def.name}" không có phom "${String(s.fit)}", dùng "${def.defaultFit}".`,
    );
  }

  const colorsIn = rec(s.colors);
  const materialsIn = rec(s.materials);
  const colors: ZoneColors = {};
  const materials: ZoneMaterials = {};
  for (const zone of def.zones) {
    const fallbackColor = def.defaultColors[zone] ?? '#f4f4f2';
    colors[zone] = ctx.color(colorsIn[zone], GARMENT_PALETTE, fallbackColor, `${path}.colors.${zone}`);
    const allowed = def.materials[zone] ?? [];
    const m = materialsIn[zone];
    const fallbackMat = def.defaultMaterials[zone];
    if (typeof m === 'string' && (allowed as readonly string[]).includes(m)) {
      materials[zone] = m as Material;
    } else {
      if (m !== undefined) {
        ctx.warn('material_not_allowed', `${path}.materials.${zone}`, `Chất liệu "${String(m)}" không hợp lệ cho vùng này, dùng mặc định.`);
      }
      if (fallbackMat) materials[zone] = fallbackMat;
    }
  }
  for (const key of Object.keys(colorsIn)) {
    if (!(def.zones as readonly string[]).includes(key)) {
      ctx.warn('zone_not_allowed', `${path}.colors.${key}`, `"${def.name}" không có vùng "${key}", đã bỏ màu này.`);
    }
  }

  return {
    garmentId: def.id,
    colors,
    materials,
    patterns: validatePatterns(s.patterns, def, `${path}.patterns`, ctx),
    fit,
    tucked: ctx.bool(s.tucked, false),
  };
}

/** Thứ tự ưu tiên khi xử lý loại trừ: món đứng trước thắng. */
const EXCLUSION_PRIORITY: readonly OutfitSlot[] = ['onePiece', 'outer', 'inner', 'bottom', 'socks', 'shoes', 'hat'];

function validateOutfit(v: unknown, hair: HairLook, ctx: Ctx): OutfitLook {
  const s = rec(v);
  const outfit = emptyOutfit();
  for (const slot of OUTFIT_SLOTS) outfit[slot] = validateGarment(s[slot], slot, ctx);

  // Loại trừ: bộ liền bỏ quần (và slot khác trong excludes).
  for (const slot of EXCLUSION_PRIORITY) {
    const worn = outfit[slot];
    if (!worn) continue;
    const def = getGarment(worn.garmentId);
    if (!def) continue;
    for (const ex of def.excludes) {
      if (outfit[ex]) {
        ctx.warn('slot_conflict', `outfit.${ex}`, `"${def.name}" không mặc cùng món ở slot ${ex}, đã bỏ món đó.`);
        outfit[ex] = null;
      }
    }
  }

  // Che thân: luôn có áo và quần (hoặc bộ liền). Không để nhân vật thiếu đồ.
  if (!outfit.onePiece && !outfit.inner) {
    ctx.warn('missing_required', 'outfit.inner', 'Thiếu áo trong, đã thêm áo phông trơn.');
    outfit.inner = wear('inner-tee');
  }
  if (!outfit.onePiece && !outfit.bottom) {
    ctx.warn('missing_required', 'outfit.bottom', 'Thiếu quần, đã thêm quần âu.');
    outfit.bottom = wear('bottom-trousers');
  }

  // Sơ vin: chỉ áo trong hỗ trợ và khi có quần. Áo ngoài và slot khác luôn thả.
  for (const slot of OUTFIT_SLOTS) {
    const worn = outfit[slot];
    if (!worn || !worn.tucked) continue;
    const def = getGarment(worn.garmentId);
    const ok = slot === 'inner' && !!def?.tuckable && !!outfit.bottom;
    if (!ok) {
      ctx.warn('tuck_not_supported', `outfit.${slot}.tucked`, 'Món này không sơ vin được trong tổ hợp hiện tại, đã chuyển sang thả áo.');
      worn.tucked = false;
    }
  }

  // Mũ và kiểu tóc.
  const hairDef = getHairStyle(hair.style);
  const hatKind = outfit.hat ? getGarment(outfit.hat.garmentId)?.kind : undefined;
  if (outfit.hat && hairDef && !hairDef.hatCompatible && hatKind !== 'party') {
    ctx.warn('slot_conflict', 'outfit.hat', `Kiểu tóc "${hairDef.name}" không đội mũ được, đã bỏ mũ.`);
    outfit.hat = null;
  }
  return outfit;
}

/* ------------------------------------------------------------------ */
/* Phụ kiện                                                            */
/* ------------------------------------------------------------------ */

function validateAccessoryItem(v: unknown, slot: AccessorySlot, ctx: Ctx): WornAccessory | null {
  if (v === null || v === undefined) return null;
  const s = rec(v);
  const path = `accessories.${slot}`;
  const def = typeof s.itemId === 'string' ? getAccessory(s.itemId) : undefined;
  if (!def || def.slot !== slot) {
    ctx.warn(def ? 'wrong_group' : 'unknown_id', `${path}.itemId`, `Phụ kiện "${String(s.itemId)}" không hợp lệ cho vị trí ${slot}, đã bỏ.`);
    return null;
  }
  let material = def.defaultMaterial;
  if (typeof s.material === 'string' && (def.materials as readonly string[]).includes(s.material)) {
    material = s.material as Material;
  } else if (s.material !== undefined) {
    ctx.warn('material_not_allowed', `${path}.material`, `Chất liệu "${String(s.material)}" không hợp lệ cho "${def.name}".`);
  }
  return {
    itemId: def.id,
    color: ctx.color(s.color, GARMENT_PALETTE, def.defaultColor, `${path}.color`),
    material,
    size: ctx.num(s.size, { min: ACCESSORY_SIZE_MIN, max: ACCESSORY_SIZE_MAX }, 1, `${path}.size`),
    side: ctx.oneOf(s.side, def.sides, def.sides[0] ?? 'both', `${path}.side`),
  };
}

function validateRings(v: unknown, ctx: Ctx): WornRing[] {
  const list = limitList(v, MAX_RINGS, 'accessories.rings', 'nhẫn', ctx);
  const taken = new Set<string>();
  const out: WornRing[] = [];
  list.forEach((item, i) => {
    const s = rec(item);
    const path = `accessories.rings[${i}]`;
    const def = typeof s.itemId === 'string' ? getAccessory(s.itemId) : undefined;
    if (!def || def.slot !== 'ring') {
      ctx.warn('unknown_id', `${path}.itemId`, `Nhẫn "${String(s.itemId)}" không có, đã bỏ.`);
      return;
    }
    const hand = ctx.oneOf<Side>(s.hand, SIDES, 'right', `${path}.hand`);
    const finger = ctx.oneOf<RingFinger>(s.finger, RING_FINGERS, 'ring', `${path}.finger`);
    const key = `${hand}:${finger}`;
    if (taken.has(key)) {
      ctx.warn('slot_conflict', path, 'Ngón này đã có nhẫn, đã bỏ nhẫn trùng.');
      return;
    }
    taken.add(key);
    const material: Material =
      typeof s.material === 'string' && (def.materials as readonly string[]).includes(s.material) ? (s.material as Material) : def.defaultMaterial;
    out.push({ itemId: def.id, color: ctx.color(s.color, GARMENT_PALETTE, def.defaultColor, `${path}.color`), material, hand, finger });
  });
  return out;
}

const SHIRT_KINDS: readonly string[] = ['shirt-long', 'shirt-short'];

function validateAccessories(v: unknown, outfit: OutfitLook, ctx: Ctx): AccessoryLook {
  const s = rec(v);
  const out = emptyAccessories();
  for (const slot of ACCESSORY_SLOTS) {
    const base = validateAccessoryItem(s[slot], slot, ctx);
    if (!base) continue;
    const raw = rec(s[slot]);
    if (slot === 'headphones') {
      out.headphones = { ...base, wear: ctx.oneOf(raw.wear, ['on-ears', 'around-neck'] as const, 'on-ears', 'accessories.headphones.wear') };
    } else if (slot === 'phone') {
      out.phone = { ...base, state: ctx.oneOf(raw.state, PHONE_STATES, 'stowed', 'accessories.phone.state') };
    } else {
      out[slot] = base;
    }
  }
  out.rings = validateRings(s.rings, ctx);

  // Xung đột với trang phục.
  const innerDef = outfit.inner ? getGarment(outfit.inner.garmentId) : undefined;
  const hasShirt = !!innerDef && SHIRT_KINDS.includes(innerDef.kind);
  if (out.tie && !hasShirt) {
    ctx.warn('slot_conflict', 'accessories.tie', 'Cà vạt cần áo sơ mi có cổ, đã bỏ cà vạt.');
    out.tie = null;
  }
  if (out.cufflinks && innerDef?.kind !== 'shirt-long') {
    ctx.warn('slot_conflict', 'accessories.cufflinks', 'Khuy măng sét cần sơ mi dài tay, đã bỏ.');
    out.cufflinks = null;
  }
  const hasWaist = !!outfit.bottom || !!outfit.onePiece;
  if (out.belt && !hasWaist) {
    ctx.warn('slot_conflict', 'accessories.belt', 'Thắt lưng cần quần hoặc bộ liền, đã bỏ.');
    out.belt = null;
  }
  if (out.keychain && !hasWaist) {
    ctx.warn('slot_conflict', 'accessories.keychain', 'Móc khoá cần quần hoặc bộ liền để gắn, đã bỏ.');
    out.keychain = null;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Meta và tổng hợp                                                    */
/* ------------------------------------------------------------------ */

function validateMeta(v: unknown, ctx: Ctx): LookMeta {
  const s = rec(v);
  const name = ctx.text(s.name, MAX_NAME_LENGTH, 'meta.name');
  const presetId = typeof s.presetId === 'string' && UID_RE.test(s.presetId) ? s.presetId : null;
  const legacyOutfit =
    typeof s.legacyOutfit === 'string' && (LEGACY_OUTFITS as readonly string[]).includes(s.legacyOutfit) ? s.legacyOutfit : null;
  return { name, presetId, legacyOutfit };
}

/**
 * Kiểm tra và sửa look. Nhận dữ liệu bất kỳ; trường thiếu lấy mặc định, trường sai được sửa kèm cảnh báo.
 * Kết quả luôn là CharacterLook hợp lệ, không chia sẻ tham chiếu với input.
 */
export function validate(input: unknown): ValidationResult {
  const ctx = new Ctx();
  if (!isRec(input)) {
    ctx.warn('invalid_input', '', 'Dữ liệu nhân vật không phải đối tượng JSON, dùng bộ mặc định.');
    return { look: makeDefaultLook(), warnings: ctx.warnings };
  }
  if (input.version !== undefined && input.version !== LOOK_SCHEMA_VERSION) {
    ctx.warn('invalid_input', 'version', `Phiên bản dữ liệu ${String(input.version)} khác ${LOOK_SCHEMA_VERSION}, đã đọc theo phiên bản hiện tại.`);
  }
  const bodyStyle = ctx.oneOf<BodyStyle>(input.bodyStyle, BODY_STYLES, 'realistic', 'bodyStyle');
  const hair = validateHair(input.hair, ctx);
  const outfit = validateOutfit(input.outfit, hair, ctx);
  const look: CharacterLook = {
    version: LOOK_SCHEMA_VERSION,
    meta: validateMeta(input.meta, ctx),
    bodyStyle,
    body: validateBody(input.body, bodyStyle, ctx),
    face: validateFace(input.face, bodyStyle, ctx),
    hair,
    skin: validateSkin(input.skin, ctx),
    tattoos: validateTattoos(input.tattoos, ctx),
    scars: validateScars(input.scars, ctx),
    outfit,
    accessories: validateAccessories(input.accessories, outfit, ctx),
  };
  return { look, warnings: ctx.warnings };
}

/**
 * Đổi kiểu tạo hình. Hình thể đặt về mặc định của kiểu mới (giữ mesh gốc nam/nữ và chế độ đối xứng) vì
 * khoảng giá trị hai kiểu khác nhau; khuôn mặt được kẹp theo giới hạn kiểu mới. Trang phục, tóc, hình xăm,
 * sẹo, phụ kiện giữ nguyên. Trả về bản mới, không sửa input.
 */
export function applyBodyStyle(look: CharacterLook, style: BodyStyle): CharacterLook {
  const body = makeBody(look.body.frame, { symmetric: look.body.symmetric }, style);
  return validate({ ...look, bodyStyle: style, body }).look;
}

/** Tiện ích cho UI: kiểm tra một món có mặc được ở slot không, kèm lý do. */
export function canWear(garmentId: string, slot: OutfitSlot): { ok: boolean; reason: string } {
  const def = getGarment(garmentId);
  if (!def) return { ok: false, reason: 'Món đồ không có trong danh mục.' };
  if (def.group !== slot) return { ok: false, reason: `Món này thuộc nhóm ${def.group}.` };
  return { ok: true, reason: '' };
}

/** Các slot sẽ bị bỏ khi mặc món này (để UI báo trước xung đột). */
export function conflictsOf(garmentId: string): readonly OutfitSlot[] {
  return getGarment(garmentId)?.excludes ?? [];
}
