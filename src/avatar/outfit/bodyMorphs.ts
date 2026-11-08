/**
 * Ánh xạ hình thể trong CharacterLook sang trọng số morph có thật trên mesh thân MPFB (18 morph, 6 morph thân:
 * bodyShouldersV, bodyWaistSlim, bodyHipsWide, bodyBelly, chestMuscle, headFat). Thuần.
 *
 * MpfbAvatar chỉ dùng trường torso và headSize. Ở đây thêm các trường tổng hợp (cân nặng, lượng mỡ, cơ bắp) bằng
 * cách cộng vào cùng các morph đó; MpfbOutfit ghi lại trọng số mỗi khung (sau khi MpfbAvatar ghi) nên thanh
 * trượt tổng hợp tác động thật lên mô hình mà không cần sửa MpfbAvatar.
 *
 * Morph chỉ có một chiều (từ 0 tới 1), nên mỗi thanh trượt chỉ có tác dụng ở nửa trục có morph. Phần còn lại
 * bị vô hiệu trong UI (SliderDef.effective).
 */
import type { CharacterLook } from '../../fashion/types';

export type BodyMorphName =
  | 'bodyShouldersV'
  | 'bodyWaistSlim'
  | 'bodyHipsWide'
  | 'bodyBelly'
  | 'chestMuscle'
  | 'headFat'
  | 'gpb_upperarm_girth'
  | 'gpb_thigh_girth'
  | 'gpb_forearm_girth'
  | 'gpb_calf_girth';

export const BODY_MORPH_NAMES: readonly BodyMorphName[] = [
  'bodyShouldersV',
  'bodyWaistSlim',
  'bodyHipsWide',
  'bodyBelly',
  'chestMuscle',
  'headFat',
  'gpb_upperarm_girth',
  'gpb_thigh_girth',
  'gpb_forearm_girth',
  'gpb_calf_girth',
];

function pos(x: number): number {
  return x > 0 ? x : 0;
}
/** Morph hai chiều: influence âm làm chi gầy đi. */
function c11(x: number): number {
  return x < -1 ? -1 : x > 1 ? 1 : x;
}
function c01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Hệ số cộng gộp của các thanh tổng hợp. */
export const COMPOSITE = {
  muscleToShoulders: 0.35,
  muscleToChest: 0.6,
  weightToBelly: 0.3,
  weightToHips: 0.3,
  weightToWaistSlim: 0.4,
  fatToBelly: 0.5,
  fatToWaistSlim: 0.3,
} as const;

/** Trọng số morph cuối cùng (0 đến 1) từ look. */
export function deriveBodyMorphWeights(look: CharacterLook): Record<BodyMorphName, number> {
  const b = look.body;
  const t = b.torso;
  const k = COMPOSITE;
  return {
    bodyShouldersV: c01(pos(t.shoulderWidth) + k.muscleToShoulders * pos(b.muscle)),
    bodyWaistSlim: c01(pos(-t.waist) + k.weightToWaistSlim * pos(-b.weight) + k.fatToWaistSlim * pos(-b.bodyFat)),
    bodyHipsWide: c01(pos(t.hips) + k.weightToHips * pos(b.weight)),
    bodyBelly: c01(pos(t.belly) + k.fatToBelly * pos(b.bodyFat) + k.weightToBelly * pos(b.weight)),
    chestMuscle: c01(pos(t.chest) + k.muscleToChest * pos(b.muscle)),
    headFat: c01(pos(look.face.structure.headSize)),
    gpb_upperarm_girth: c11((b.arms.left.upperArm + b.arms.right.upperArm) / 2),
    gpb_thigh_girth: c11((b.legs.left.thigh + b.legs.right.thigh) / 2),
    gpb_forearm_girth: c11((b.arms.left.forearm + b.arms.right.forearm) / 2),
    gpb_calf_girth: c11((b.legs.left.calf + b.legs.right.calf) / 2),
  };
}

/** Ghi trọng số vào mảng influence theo từ điển morph; morph không có trong tệp thì bỏ qua. Trả số morph đã ghi. */
export function writeBodyMorphs(
  influences: number[] | undefined,
  dictionary: Readonly<Record<string, number>> | undefined,
  weights: Readonly<Record<BodyMorphName, number>>,
): number {
  if (!influences || !dictionary) return 0;
  let n = 0;
  for (const name of BODY_MORPH_NAMES) {
    const i = dictionary[name];
    if (i === undefined || i < 0 || i >= influences.length) continue;
    influences[i] = weights[name];
    n++;
  }
  return n;
}
