// Chuẩn hoá ngoại hình nhân vật (ONBOARDING_API mục 2.2, AVATAR_SPEC mục 7.1). Module này không phụ thuộc DB.
//
// Nguồn chuẩn: src/avatar/appearance.ts (kiểu Appearance, DEFAULT_APPEARANCE, SKIN_TONES, HAIR_STYLES, OUTFITS,
// SHOE_STYLES, ACCESSORIES, BODY_TYPES) và src/avatar/catalog.ts (danh sách id hiển thị). Các mảng id dưới đây
// sao từ appearance.ts và đã đối chiếu với catalog.ts. Đổi danh sách bên frontend thì phải sửa lại ở đây.
//
// Quy tắc (giống normalizeAppearance bản TS):
// - Trường sai, thiếu hoặc không đúng kiểu được thay bằng giá trị trong DEFAULT_APPEARANCE. Không báo lỗi.
// - Khóa lạ (kể cả role, department, id, tenant_id, email, v) bị bỏ qua. Kết quả chỉ chứa đúng các trường dưới đây.
// - Phụ kiện: id lạ bị bỏ, trùng lặp được gộp, giữ thứ tự trong ACCESSORIES để chuỗi JSON (và ETag) ổn định.
// - Chỉ khi input không phải đối tượng JSON (null, mảng, chuỗi, số) thì ném AppearanceError với thông điệp tiếng Việt.

// Kiểu dáng cơ thể: BodyType.
export const BODY_TYPES = Object.freeze(['slim', 'regular', 'broad']);
// Kiểu tóc: HairStyle.
export const HAIR_STYLES = Object.freeze(['short', 'bob', 'long', 'bun', 'spiky', 'curly', 'buzz', 'ponytail']);
// Trang phục: Outfit.
export const OUTFITS = Object.freeze([
  'shirt-tie',
  'blazer',
  'dress',
  'casual',
  'party-suit',
  'ao-dai',
  'uniform-karaoke',
  // Thêm 06/11/2026, khớp OUTFITS trong appearance.ts. Chỉ thêm cuối danh sách, id cũ giữ nguyên.
  'polo-office',
  'shirt-white',
  'shirt-blue',
  'vest-navy',
  'cardigan-gray',
  'trousers-dark',
  'skirt-office',
  'security-uniform',
  'ao-dai-nam',
  'ao-dai-nu',
  'ao-ba-ba',
  'sport-jersey',
  'tracksuit',
  'evening-gown',
  'tuxedo',
]);
// Giày: ShoeStyle.
export const SHOE_STYLES = Object.freeze(['oxford', 'heels', 'sneakers']);
// Phụ kiện: Accessory.
export const ACCESSORIES = Object.freeze([
  'glasses',
  'watch',
  'name-badge',
  'lanyard',
  'pin-brooch',
  'cufflinks',
  'scarf',
  'bowtie',
  'hat-party',
]);

// Số tông da: SKIN_TONES có 6 phần tử, chỉ số hợp lệ 0 đến 5.
export const SKIN_TONE_COUNT = 6;

// Giá trị mặc định, khớp DEFAULT_APPEARANCE trong appearance.ts.
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
  accessories: Object.freeze(['name-badge']),
});

// Các khóa của Appearance, dùng để nhận diện dữ liệu đã lưu có đúng schema hiện tại hay không.
const APPEARANCE_KEYS = Object.freeze(Object.keys(DEFAULT_APPEARANCE));
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export class AppearanceError extends Error {
  constructor(message, { path = '', code = 'invalid_input' } = {}) {
    super(message);
    this.path = path;
    this.code = code;
  }
}

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

// Chọn giá trị hợp lệ trong danh sách; không hợp lệ thì trả về mặc định.
function pickOneOf(value, allowed, fallback) {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

// Số nguyên trong khoảng 0 đến SKIN_TONE_COUNT - 1; ngoài khoảng thì trả về mặc định.
function pickSkinTone(value, fallback) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return fallback;
  if (value < 0 || value >= SKIN_TONE_COUNT) return fallback;
  return value;
}

// Màu #RRGGBB, đưa về chữ thường; sai dạng thì trả về mặc định.
function pickHex(value, fallback) {
  return typeof value === 'string' && HEX_RE.test(value) ? value.toLowerCase() : fallback;
}

function pickAccessories(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  const seen = new Set();
  for (const item of value) {
    if (typeof item === 'string' && ACCESSORIES.includes(item)) seen.add(item);
  }
  return ACCESSORIES.filter((a) => seen.has(a));
}

// Kiểm tra và làm sạch dữ liệu do client gửi thành Appearance đầy đủ, luôn hợp lệ.
// Ném AppearanceError khi input không phải đối tượng JSON.
export function normalizeAppearance(input) {
  if (!isPlainObject(input)) {
    throw new AppearanceError('Dữ liệu ngoại hình phải là một đối tượng JSON.');
  }
  const d = DEFAULT_APPEARANCE;
  // Thứ tự khóa cố định để chuỗi JSON (và ETag) ổn định.
  return {
    bodyType: pickOneOf(input.bodyType, BODY_TYPES, d.bodyType),
    skinTone: pickSkinTone(input.skinTone, d.skinTone),
    hairStyle: pickOneOf(input.hairStyle, HAIR_STYLES, d.hairStyle),
    hairColor: pickHex(input.hairColor, d.hairColor),
    eyeColor: pickHex(input.eyeColor, d.eyeColor),
    outfit: pickOneOf(input.outfit, OUTFITS, d.outfit),
    topColor: pickHex(input.topColor, d.topColor),
    bottomColor: pickHex(input.bottomColor, d.bottomColor),
    shoes: pickOneOf(input.shoes, SHOE_STYLES, d.shoes),
    accessories: pickAccessories(input.accessories, d.accessories),
  };
}

// Đọc appearance đã lưu trong DB. Chuỗi hỏng hoặc không có trường nào của schema hiện tại (dữ liệu cũ) thì trả null,
// coi như chưa có ngoại hình. Không làm lỗi request.
export function readAppearance(text) {
  if (typeof text !== 'string') return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed) || !APPEARANCE_KEYS.some((k) => Object.prototype.hasOwnProperty.call(parsed, k))) {
    return null;
  }
  return normalizeAppearance(parsed);
}
