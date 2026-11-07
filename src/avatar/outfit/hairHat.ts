/**
 * Quy tắc tóc khi đội mũ: tóc phần đỉnh bị mũ đè nên phải ẩn hoặc nén để không xuyên qua vỏ mũ.
 * Thuần. Bộ vẽ tóc (FallbackHair hiện tại, và tóc MPFB khi có asset) đọc `crownScale` để nén phần đỉnh theo trục đứng
 * và `hideCrown` để ẩn hẳn; phần tóc dưới mép mũ (mai, gáy, tóc dài) giữ nguyên.
 * Lưu ý: rig MPFB hiện chưa dựng tóc (không có mesh tóc), nên mũ MPFB không có gì để né; quy tắc áp cho bộ vẽ tóc sau này.
 */
import { getHairStyle } from '../../fashion/hair';
import { getGarment } from '../../fashion/catalog';
import type { CharacterLook } from '../../fashion/types';

export interface HairUnderHat {
  /** Hệ số nén phần đỉnh theo trục đứng (1 là giữ nguyên, 0 là ẩn). */
  crownScale: number;
  /** Ẩn hẳn phần đỉnh. */
  hideCrown: boolean;
  /** Lý do để hiển thị/ghi log. */
  reason: string;
}

const KEEP: HairUnderHat = { crownScale: 1, hideCrown: false, reason: 'Không đội mũ.' };

export function hairUnderHat(hairStyleId: string, hatKind: string | null): HairUnderHat {
  if (!hatKind) return KEEP;
  const def = getHairStyle(hairStyleId);
  if (!def) return { crownScale: 0.6, hideCrown: false, reason: 'Kiểu tóc lạ: nén phần đỉnh.' };
  if (def.length === 'very-short') return { crownScale: 0, hideCrown: true, reason: 'Tóc rất ngắn nằm gọn dưới mũ: ẩn phần đỉnh.' };
  // Mũ tiệc ôm đỉnh đầu như mọi mũ khác; kiểu tóc không hợp mũ chỉ còn mũ tiệc mới qua được validate: nén mạnh hơn.
  if (!def.hatCompatible) return { crownScale: 0.45, hideCrown: false, reason: 'Tóc phồng/búi bị nén dưới mũ.' };
  return { crownScale: def.length === 'short' ? 0.55 : 0.7, hideCrown: false, reason: 'Nén phần đỉnh dưới mũ, giữ tóc dưới mép mũ.' };
}

/** Theo look: kiểu tóc và mũ đang đội. */
export function hairUnderHatOf(look: CharacterLook): HairUnderHat {
  const hat = look.outfit.hat;
  const kind = hat ? (getGarment(hat.garmentId)?.kind ?? 'unknown') : null;
  return hairUnderHat(look.hair.style, kind);
}
