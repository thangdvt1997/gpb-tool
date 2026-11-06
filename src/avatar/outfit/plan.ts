/**
 * Từ CharacterLook sang kế hoạch dựng vỏ: món nào dựng, thứ tự lớp, biến thể. Thuần, không phụ thuộc three.
 */
import { getGarment } from '../../fashion/catalog';
import type { CharacterLook, OutfitSlot, WornGarment } from '../../fashion/types';
import type { PieceInput } from './coverage';
import { shellClassOf, type ShellClass } from './shellClass';

export interface PiecePlan extends PieceInput {
  slot: OutfitSlot;
  garmentId: string;
  worn: WornGarment;
}

export interface SkippedPiece {
  slot: OutfitSlot;
  garmentId: string;
  reason: string;
}

export interface OutfitPlan {
  pieces: PiecePlan[];
  skipped: SkippedPiece[];
}

/** Thứ tự dựng slot (chỉ để ổn định kết quả; thứ tự lớp do order quyết định). */
const SLOT_ORDER: readonly OutfitSlot[] = ['socks', 'shoes', 'bottom', 'onePiece', 'inner', 'outer', 'hat'];

/** Thứ tự lớp của áo trong khi sơ vin (nằm dưới quần) hoặc mặc dưới bộ liền. */
export const ORDER_INNER_TUCKED = 25;
export const ORDER_INNER_UNDER_ONEPIECE = 28;

/** Khoá ổn định của vỏ để cache: món + phom + sơ vin + kiểu tạo hình. */
export function pieceCacheKey(garmentId: string, variant: { fit: string; tucked: boolean }, style: string): string {
  return `${style}|${garmentId}|${variant.fit}|${variant.tucked ? 'tuck' : 'free'}`;
}

/**
 * Lập kế hoạch từ look. Món chưa có lớp vỏ (mũ, kind mới) vào danh sách skipped kèm lý do.
 * Áo trong sơ vin chỉ tính khi có quần; áo trong dưới bộ liền được đẩy xuống dưới bộ liền.
 */
export function planOutfit(look: CharacterLook): OutfitPlan {
  const pieces: PiecePlan[] = [];
  const skipped: SkippedPiece[] = [];
  const outfit = look.outfit;
  for (const slot of SLOT_ORDER) {
    const worn = outfit[slot];
    if (!worn) continue;
    const def = getGarment(worn.garmentId);
    if (!def) {
      skipped.push({ slot, garmentId: worn.garmentId, reason: 'Món không có trong danh mục.' });
      continue;
    }
    const spec: ShellClass | undefined = shellClassOf(def);
    if (!spec || !spec.part) {
      skipped.push({ slot, garmentId: worn.garmentId, reason: spec?.note || 'Chưa có lớp vỏ cho loại món này.' });
      continue;
    }
    const tucked = slot === 'inner' && worn.tucked && def.tuckable && !!outfit.bottom;
    let order = spec.order;
    if (slot === 'inner') {
      if (outfit.onePiece) order = ORDER_INNER_UNDER_ONEPIECE;
      else if (tucked) order = ORDER_INNER_TUCKED;
    }
    pieces.push({
      key: slot,
      slot,
      garmentId: worn.garmentId,
      worn,
      spec,
      variant: { fit: worn.fit, tucked },
      order,
    });
  }
  return { pieces, skipped };
}
