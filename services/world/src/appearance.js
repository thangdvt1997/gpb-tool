// Kiểm và lọc ngoại hình do client gửi. Whitelist trường; giá trị sai lấy mặc định (khớp
// src/avatar/appearance.ts normalizeAppearance; vitest appearanceSync giữ hai bên đồng bộ).

export const BODY_TYPES = ['slim', 'regular', 'broad'];
export const HAIR_STYLES = ['short', 'bob', 'long', 'bun', 'spiky', 'curly', 'buzz', 'ponytail'];
export const OUTFITS = [
  'shirt-tie', 'blazer', 'dress', 'casual', 'party-suit', 'ao-dai', 'uniform-karaoke', 'polo-office',
  'shirt-white', 'shirt-blue', 'vest-navy', 'cardigan-gray', 'trousers-dark', 'skirt-office',
  'security-uniform', 'ao-dai-nam', 'ao-dai-nu', 'ao-ba-ba', 'sport-jersey', 'tracksuit', 'evening-gown', 'tuxedo',
];
export const SHOE_STYLES = ['oxford', 'heels', 'sneakers'];
export const ACCESSORIES = [
  'glasses', 'watch', 'name-badge', 'lanyard', 'pin-brooch', 'cufflinks', 'scarf', 'bowtie', 'hat-party',
];
export const SKIN_TONE_COUNT = 6;
/** Cỡ tối đa của đối tượng ngoại hình sau JSON.stringify (byte). */
export const MAX_APPEARANCE_BYTES = 600;

export const DEFAULT_APPEARANCE = Object.freeze({
  bodyType: 'regular',
  skinTone: 1,
  hairStyle: 'short',
  hairColor: '#2b1d14',
  eyeColor: '#3b2a1e',
  outfit: 'polo-office',
  topColor: '#f4f4f2',
  bottomColor: '#22272e',
  shoes: 'oxford',
  accessories: ['name-badge'],
});

const HEX = /^#[0-9a-fA-F]{6}$/;
const one = (v, list, d) => (typeof v === 'string' && list.includes(v) ? v : d);
const hex = (v, d) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : d);

/**
 * Trả ngoại hình chuẩn hóa, hoặc null nếu đầu vào không phải đối tượng thuần / quá lớn.
 * Trường lạ bị bỏ; mảng phụ kiện khử trùng lặp, đúng thứ tự whitelist.
 */
export function sanitizeAppearance(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  let size;
  try {
    size = Buffer.byteLength(JSON.stringify(input));
  } catch {
    return null;
  }
  if (size > MAX_APPEARANCE_BYTES) return null;
  const d = DEFAULT_APPEARANCE;
  const has = new Set(Array.isArray(input.accessories) ? input.accessories.filter((a) => typeof a === 'string') : []);
  return {
    bodyType: one(input.bodyType, BODY_TYPES, d.bodyType),
    skinTone: Number.isInteger(input.skinTone) && input.skinTone >= 0 && input.skinTone < SKIN_TONE_COUNT ? input.skinTone : d.skinTone,
    hairStyle: one(input.hairStyle, HAIR_STYLES, d.hairStyle),
    hairColor: hex(input.hairColor, d.hairColor),
    eyeColor: hex(input.eyeColor, d.eyeColor),
    outfit: one(input.outfit, OUTFITS, d.outfit),
    topColor: hex(input.topColor, d.topColor),
    bottomColor: hex(input.bottomColor, d.bottomColor),
    shoes: one(input.shoes, SHOE_STYLES, d.shoes),
    accessories: Array.isArray(input.accessories) ? ACCESSORIES.filter((a) => has.has(a)) : [...d.accessories],
  };
}
