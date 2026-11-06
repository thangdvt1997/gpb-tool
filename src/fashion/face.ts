/**
 * Lựa chọn khuôn mặt người thật (fashion.txt mục 2, user.txt mục 1 và 2). Không có dạng hoạt hình.
 * Mỗi mẫu là một tổ hợp morph nền trên mesh mặt; FaceStructure (types.ts) cộng dồn trọng số tinh chỉnh.
 */

export interface FaceOption {
  id: string;
  name: string;
}

export const FACE_SHAPES: readonly FaceOption[] = [
  { id: 'oval', name: 'Mặt trái xoan' },
  { id: 'round', name: 'Mặt tròn' },
  { id: 'square', name: 'Mặt vuông' },
  { id: 'oblong', name: 'Mặt dài' },
  { id: 'heart', name: 'Mặt trái tim' },
  { id: 'diamond', name: 'Mặt kim cương' },
];

export const EYE_SHAPES: readonly FaceOption[] = [
  { id: 'almond', name: 'Mắt hạnh nhân' },
  { id: 'monolid', name: 'Mắt một mí' },
  { id: 'double-lid', name: 'Mắt hai mí' },
  { id: 'hooded', name: 'Mí sụp nhẹ' },
  { id: 'round', name: 'Mắt tròn' },
  { id: 'upturned', name: 'Đuôi mắt xếch nhẹ' },
  { id: 'downturned', name: 'Đuôi mắt cụp nhẹ' },
];

export const BROW_SHAPES: readonly FaceOption[] = [
  { id: 'straight', name: 'Lông mày ngang' },
  { id: 'soft-arch', name: 'Cong nhẹ' },
  { id: 'high-arch', name: 'Cong cao' },
  { id: 'thick', name: 'Rậm' },
  { id: 'thin', name: 'Mảnh' },
  { id: 'angled', name: 'Xếch góc' },
];

export const NOSE_SHAPES: readonly FaceOption[] = [
  { id: 'straight', name: 'Mũi thẳng' },
  { id: 'button', name: 'Mũi nhỏ gọn' },
  { id: 'wide', name: 'Cánh mũi rộng' },
  { id: 'aquiline', name: 'Sống mũi gồ nhẹ' },
  { id: 'flat-bridge', name: 'Sống mũi thấp' },
  { id: 'upturned', name: 'Đầu mũi hếch nhẹ' },
];

export const MOUTH_SHAPES: readonly FaceOption[] = [
  { id: 'medium', name: 'Môi vừa' },
  { id: 'thin', name: 'Môi mỏng' },
  { id: 'full', name: 'Môi dày' },
  { id: 'wide', name: 'Miệng rộng' },
  { id: 'bow', name: 'Môi cánh cung' },
];

export const EAR_SHAPES: readonly FaceOption[] = [
  { id: 'standard', name: 'Tai chuẩn' },
  { id: 'small', name: 'Tai nhỏ' },
  { id: 'large', name: 'Tai lớn' },
  { id: 'attached-lobe', name: 'Dái tai liền' },
  { id: 'protruding', name: 'Tai vểnh nhẹ' },
];

export const FACIAL_HAIR: readonly FaceOption[] = [
  { id: 'none', name: 'Không râu' },
  { id: 'stubble', name: 'Râu lún phún' },
  { id: 'mustache', name: 'Ria mép' },
  { id: 'goatee', name: 'Râu cằm' },
  { id: 'short-beard', name: 'Râu quai nón ngắn' },
  { id: 'full-beard', name: 'Râu quai nón đầy' },
];

/** Biểu cảm mặc định khi đứng yên. Animation có thể ghi đè tạm thời. */
export const EXPRESSIONS: readonly FaceOption[] = [
  { id: 'neutral', name: 'Bình thản' },
  { id: 'slight-smile', name: 'Cười mỉm' },
  { id: 'smile', name: 'Cười' },
  { id: 'confident', name: 'Tự tin' },
  { id: 'focused', name: 'Tập trung' },
  { id: 'serious', name: 'Nghiêm túc' },
];

export const FACE_DEFAULTS = {
  shape: 'oval',
  eyes: 'almond',
  brows: 'soft-arch',
  nose: 'straight',
  mouth: 'medium',
  ears: 'standard',
  facialHair: 'none',
  expression: 'slight-smile',
} as const;

export function hasOption(list: readonly FaceOption[], id: unknown): id is string {
  return typeof id === 'string' && list.some((o) => o.id === id);
}
