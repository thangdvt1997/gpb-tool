/**
 * Thanh chỉnh hình thể: ánh xạ slider sang trường CharacterLook.body và morph có thật trên mesh MPFB.
 * Giới hạn lấy từ BODY_LIMITS_BY_STYLE (khác nhau cho realistic và chibi). Chỉ liệt kê thanh có tác dụng thật:
 * - 'scale': đổi chiều cao (scale đồng đều trong MpfbAvatar, chiều cao đích kẹp theo kiểu).
 * - 'morph': ghi thẳng vào một morph thân (chỉ có một chiều).
 * - 'composite': cộng vào các morph thân (cân nặng, lượng mỡ, cơ bắp), xem avatar/outfit/bodyMorphs.ts.
 * - 'bone': đổi tỷ lệ xương trên skeleton MPFB (dài tay, dài chân, dài cổ, cong lưng), xem avatar/boneShape.ts.
 *   Chỉ hiện khi rig hỗ trợ (modelSupportsBoneShape / rigSupportsBoneShape).
 * Trường chưa có morph hay xương tương ứng (bắp tay, đùi, bàn tay/chân, tỉ lệ đầu thân) nằm trong UNSUPPORTED_SHAPE để
 * UI hiển thị rõ lý do thay vì làm thanh giả.
 */
import { BODY_LIMITS_BY_STYLE, FACE_STRUCTURE_LIMITS_BY_STYLE, validate, type Range } from '../fashion/rules';
import { cloneLook } from '../fashion/defaults';
import { modelSupportsBoneShape } from '../avatar/boneShape';
import type { BodyFrame, BodyStyle, CharacterLook } from '../fashion/types';

export type SliderSupport = 'scale' | 'morph' | 'composite' | 'bone';
export type SliderGroup = 'overall' | 'torso' | 'head' | 'limbs';

export interface SliderDef {
  id: string;
  label: string;
  group: SliderGroup;
  support: SliderSupport;
  unit: string;
  step: number;
  /** Giới hạn dữ liệu theo kiểu tạo hình (khoảng được lưu). */
  range(style: BodyStyle, frame: BodyFrame): Range;
  /** Khoảng thực sự có tác dụng lên mô hình (nhỏ hơn hoặc bằng range). */
  effective(style: BodyStyle, frame: BodyFrame): Range;
  get(look: CharacterLook): number;
  /** Ghi giá trị (đã kẹp) vào bản sao của look. */
  write(look: CharacterLook, value: number): void;
}

function clamp(v: number, r: Range): number {
  return v < r.min ? r.min : v > r.max ? r.max : v;
}

/** Nửa trục dương/âm của một khoảng. */
function positiveHalf(r: Range): Range {
  return { min: Math.max(0, r.min), max: Math.max(0, r.max) };
}
function negativeHalf(r: Range): Range {
  return { min: Math.min(0, r.min), max: Math.min(0, r.max) };
}

type TorsoKey = 'shoulderWidth' | 'waist' | 'hips' | 'belly' | 'chest';

function torsoSlider(key: TorsoKey, label: string, half: 'pos' | 'neg'): SliderDef {
  const range = (s: BodyStyle): Range => BODY_LIMITS_BY_STYLE[s].torso[key];
  return {
    id: key,
    label,
    group: 'torso',
    support: 'morph',
    unit: '',
    step: 0.01,
    range,
    effective: (s) => (half === 'pos' ? positiveHalf(range(s)) : negativeHalf(range(s))),
    get: (l) => l.body.torso[key],
    write: (l, v) => {
      l.body.torso[key] = v;
    },
  };
}

type BodyKey = 'weight' | 'bodyFat' | 'muscle';

function bodySlider(key: BodyKey, label: string, half: 'both' | 'pos'): SliderDef {
  const range = (s: BodyStyle): Range => BODY_LIMITS_BY_STYLE[s][key];
  return {
    id: key,
    label,
    group: 'overall',
    support: 'composite',
    unit: '',
    step: 0.01,
    range,
    effective: (s) => (half === 'pos' ? positiveHalf(range(s)) : range(s)),
    get: (l) => l.body[key],
    write: (l, v) => {
      l.body[key] = v;
    },
  };
}

function boneSlider(id: string, label: string, range: (s: BodyStyle) => Range, get: SliderDef['get'], write: SliderDef['write']): SliderDef {
  return { id, label, group: 'limbs', support: 'bone', unit: '', step: 0.01, range, effective: range, get, write };
}

/** Các thanh hình thể bằng xương. Tay/chân ghi cả hai bên (đối xứng). */
export const BONE_SLIDERS: readonly SliderDef[] = [
  boneSlider('armLength', 'Chiều dài tay', (s) => BODY_LIMITS_BY_STYLE[s].arm.length, (l) => l.body.arms.left.length, (l, v) => {
    l.body.arms.left.length = v;
    l.body.arms.right.length = v;
  }),
  boneSlider('legLength', 'Chiều dài chân', (s) => BODY_LIMITS_BY_STYLE[s].leg.length, (l) => l.body.legs.left.length, (l, v) => {
    l.body.legs.left.length = v;
    l.body.legs.right.length = v;
  }),
  boneSlider('neckLength', 'Chiều dài cổ', (s) => BODY_LIMITS_BY_STYLE[s].torso.neckLength, (l) => l.body.torso.neckLength, (l, v) => {
    l.body.torso.neckLength = v;
  }),
  boneSlider('back', 'Độ cong lưng (gù / ưỡn)', (s) => BODY_LIMITS_BY_STYLE[s].torso.back, (l) => l.body.torso.back, (l, v) => {
    l.body.torso.back = v;
  }),
];

/** Các thanh có tác dụng thật. */
export const SHAPE_SLIDERS: readonly SliderDef[] = [
  {
    id: 'heightCm',
    label: 'Chiều cao',
    group: 'overall',
    support: 'scale',
    unit: 'cm',
    step: 1,
    range: (s, f) => BODY_LIMITS_BY_STYLE[s].heightCm[f],
    effective: (s, f) => BODY_LIMITS_BY_STYLE[s].heightCm[f],
    get: (l) => l.body.heightCm,
    write: (l, v) => {
      l.body.heightCm = Math.round(v);
    },
  },
  bodySlider('weight', 'Cân nặng biểu kiến', 'both'),
  bodySlider('bodyFat', 'Lượng mỡ', 'both'),
  bodySlider('muscle', 'Cơ bắp', 'pos'),
  torsoSlider('shoulderWidth', 'Độ rộng vai', 'pos'),
  torsoSlider('chest', 'Ngực', 'pos'),
  torsoSlider('waist', 'Eo (thon)', 'neg'),
  torsoSlider('belly', 'Bụng', 'pos'),
  torsoSlider('hips', 'Hông', 'pos'),
  {
    id: 'headSize',
    label: 'Đầu (độ đầy)',
    group: 'head',
    support: 'morph',
    unit: '',
    step: 0.01,
    range: (s) => FACE_STRUCTURE_LIMITS_BY_STYLE[s].headSize,
    effective: (s) => positiveHalf(FACE_STRUCTURE_LIMITS_BY_STYLE[s].headSize),
    get: (l) => l.face.structure.headSize,
    write: (l, v) => {
      l.face.structure.headSize = v;
    },
  },
  ...BONE_SLIDERS,
];

/** Trường hình thể có trong dữ liệu nhưng chưa có morph/xương nối tới mô hình. */
export const UNSUPPORTED_SHAPE: readonly { id: string; label: string; reason: string }[] = [
  { id: 'arms', label: 'Tay (bắp tay, cẳng tay, bàn tay)', reason: 'Chưa có morph tay; chiều dài tay đã chỉnh được bằng xương.' },
  { id: 'legs', label: 'Chân (đùi, bắp chân, bàn chân)', reason: 'Chưa có morph chân; chiều dài chân đã chỉnh được bằng xương.' },
  { id: 'headsTall', label: 'Số đầu trên chiều cao', reason: 'Là số suy ra, mô hình chỉ có hai tỉ lệ cố định (người thật, chibi).' },
];

/** Thanh có dùng được với mô hình này không: thanh xương chỉ hiện khi rig hỗ trợ. */
export function sliderAvailable(d: SliderDef, model: string): boolean {
  return d.support !== 'bone' || modelSupportsBoneShape(model);
}

export function getSlider(id: string): SliderDef | undefined {
  return SHAPE_SLIDERS.find((s) => s.id === id);
}

/** Gán giá trị slider vào bản sao look, kẹp theo khoảng có tác dụng. Id lạ trả về nguyên look. */
export function setSliderValue(look: CharacterLook, id: string, value: number): CharacterLook {
  const def = getSlider(id);
  if (!def || !Number.isFinite(value)) return look;
  const next = cloneLook(look);
  def.write(next, clamp(value, def.effective(look.bodyStyle, look.body.frame)));
  return next;
}

/** Đặt lại mọi thanh về giá trị mặc định của kiểu (chiều cao mặc định, còn lại 0). */
export function resetSliders(look: CharacterLook, defaultHeightCm: number): CharacterLook {
  const next = cloneLook(look);
  for (const s of SHAPE_SLIDERS) s.write(next, s.id === 'heightCm' ? defaultHeightCm : 0);
  return next;
}

function mapFraction(value: number, from: Range, to: Range): number {
  const span = from.max - from.min;
  const p = span > 0 ? (value - from.min) / span : 0.5;
  return to.min + Math.min(1, Math.max(0, p)) * (to.max - to.min);
}

/**
 * Đổi kiểu tạo hình giữ tỉ lệ hợp lý: chiều cao và số đầu giữ nguyên vị trí tương đối trong khoảng của kiểu cũ,
 * các trọng số morph -1..1 giữ nguyên rồi bị kẹp theo giới hạn kiểu mới. Trang phục, tóc, hình xăm, phụ kiện giữ nguyên.
 * validate() kẹp lại toàn bộ (kể cả mặt) và trả look hợp lệ.
 */
export function convertBodyStyle(look: CharacterLook, style: BodyStyle): CharacterLook {
  if (look.bodyStyle === style) return look;
  const from = BODY_LIMITS_BY_STYLE[look.bodyStyle];
  const to = BODY_LIMITS_BY_STYLE[style];
  const frame = look.body.frame;
  const body = {
    ...look.body,
    heightCm: Math.round(mapFraction(look.body.heightCm, from.heightCm[frame], to.heightCm[frame])),
    headsTall: Math.round(mapFraction(look.body.headsTall, from.headsTall, to.headsTall) * 10) / 10,
  };
  return validate({ ...look, bodyStyle: style, body }).look;
}

/** Mesh gốc nam/nữ: đổi và kẹp chiều cao theo khoảng của mesh mới (giữ vị trí tương đối). */
export function convertFrame(look: CharacterLook, frame: BodyFrame): CharacterLook {
  if (look.body.frame === frame) return look;
  const lim = BODY_LIMITS_BY_STYLE[look.bodyStyle].heightCm;
  const heightCm = Math.round(mapFraction(look.body.heightCm, lim[look.body.frame], lim[frame]));
  return validate({ ...look, body: { ...look.body, frame, heightCm } }).look;
}
