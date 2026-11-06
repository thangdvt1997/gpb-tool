/** Kiểu dáng cơ thể. */
export type BodyType = 'slim' | 'regular' | 'broad';

/** Kiểu tóc (id dùng trong catalog và FallbackAvatar). */
export type HairStyle = 'short' | 'bob' | 'long' | 'bun' | 'spiky' | 'curly' | 'buzz' | 'ponytail';

/** Trang phục (id dùng trong catalog và FallbackAvatar). */
export type Outfit =
  | 'shirt-tie'
  | 'blazer'
  | 'dress'
  | 'casual'
  | 'party-suit'
  | 'ao-dai'
  | 'uniform-karaoke'
  // Thêm 06/11/2026: trang phục công sở (REAL_OFFICE_STYLE mục 6) và trang phục truyền thống.
  | 'polo-office'
  | 'shirt-white'
  | 'shirt-blue'
  | 'vest-navy'
  | 'cardigan-gray'
  | 'trousers-dark'
  | 'skirt-office'
  | 'security-uniform'
  | 'ao-dai-nam'
  | 'ao-dai-nu'
  | 'ao-ba-ba'
  // Thêm cùng ngày: thể thao và dạ hội kín đáo.
  | 'sport-jersey'
  | 'tracksuit'
  | 'evening-gown'
  | 'tuxedo';

/** Giày. */
export type ShoeStyle = 'oxford' | 'heels' | 'sneakers';

/** Phụ kiện. */
export type Accessory =
  | 'glasses'
  | 'watch'
  | 'name-badge'
  | 'lanyard'
  | 'pin-brooch'
  | 'cufflinks'
  | 'scarf'
  | 'bowtie'
  | 'hat-party';

/** Cấu hình ngoại hình của một nhân vật. Chỉ chứa dữ liệu thuần, không chứa mesh. */
export interface Appearance {
  bodyType: BodyType;
  /** Chỉ số tông da, 0 đến 5. */
  skinTone: number;
  hairStyle: HairStyle;
  hairColor: string;
  eyeColor: string;
  outfit: Outfit;
  topColor: string;
  bottomColor: string;
  shoes: ShoeStyle;
  accessories: Accessory[];
}

/**
 * Sáu tông da, từ sáng đến sẫm. Theo AVATAR_SPEC mục 4.1 (S1 đến S6): trầm và ấm hơn bảng cũ
 * (cũ #fde3cc ... #7a4b2c, hơi nhợt dưới đèn văn phòng). Chỉ số 0 đến 5 giữ nguyên nên dữ liệu đã lưu vẫn hợp lệ.
 */
export const SKIN_TONES: readonly string[] = ['#f5d3bc', '#ebbe9c', '#dba27c', '#c4875e', '#9a6341', '#683f27'];

export const BODY_TYPES: readonly BodyType[] = ['slim', 'regular', 'broad'];

export const HAIR_STYLES: readonly HairStyle[] = [
  'short',
  'bob',
  'long',
  'bun',
  'spiky',
  'curly',
  'buzz',
  'ponytail',
];

export const OUTFITS: readonly Outfit[] = [
  'shirt-tie',
  'blazer',
  'dress',
  'casual',
  'party-suit',
  'ao-dai',
  'uniform-karaoke',
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
];

export const SHOE_STYLES: readonly ShoeStyle[] = ['oxford', 'heels', 'sneakers'];

export const ACCESSORIES: readonly Accessory[] = [
  'glasses',
  'watch',
  'name-badge',
  'lanyard',
  'pin-brooch',
  'cufflinks',
  'scarf',
  'bowtie',
  'hat-party',
];

export const DEFAULT_APPEARANCE: Appearance = {
  bodyType: 'regular',
  skinTone: 1,
  hairStyle: 'short',
  hairColor: '#2b1d14',
  eyeColor: '#3b2a1e',
  // Bộ mặc định ngày thường theo REAL_OFFICE_STYLE mục 6: polo + quần tây xám than + giày da.
  outfit: 'polo-office',
  topColor: '#f4f4f2',
  bottomColor: '#22272e',
  shoes: 'oxford',
  accessories: ['name-badge'],
};

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Chọn giá trị hợp lệ trong danh sách; nếu không hợp lệ thì trả về mặc định. */
function pickOneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function pickHex(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value) ? value.toLowerCase() : fallback;
}

function pickSkinTone(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return fallback;
  if (value < 0 || value >= SKIN_TONES.length) return fallback;
  return value;
}

function pickAccessories(value: unknown, fallback: Accessory[]): Accessory[] {
  if (!Array.isArray(value)) return [...fallback];
  const seen = new Set<Accessory>();
  for (const item of value) {
    if (typeof item === 'string' && (ACCESSORIES as readonly string[]).includes(item)) {
      seen.add(item as Accessory);
    }
  }
  return ACCESSORIES.filter((a) => seen.has(a));
}

/**
 * Kiểm tra và làm sạch dữ liệu bất kỳ thành Appearance hợp lệ.
 * Trường sai hoặc thiếu sẽ lấy giá trị trong DEFAULT_APPEARANCE.
 * Mảng phụ kiện được khử trùng lặp và giữ đúng thứ tự trong ACCESSORIES.
 */
export function normalizeAppearance(input: unknown): Appearance {
  const src: Record<string, unknown> = isRecord(input) ? input : {};
  const d = DEFAULT_APPEARANCE;
  return {
    bodyType: pickOneOf(src.bodyType, BODY_TYPES, d.bodyType),
    skinTone: pickSkinTone(src.skinTone, d.skinTone),
    hairStyle: pickOneOf(src.hairStyle, HAIR_STYLES, d.hairStyle),
    hairColor: pickHex(src.hairColor, d.hairColor),
    eyeColor: pickHex(src.eyeColor, d.eyeColor),
    outfit: pickOneOf(src.outfit, OUTFITS, d.outfit),
    topColor: pickHex(src.topColor, d.topColor),
    bottomColor: pickHex(src.bottomColor, d.bottomColor),
    shoes: pickOneOf(src.shoes, SHOE_STYLES, d.shoes),
    accessories: pickAccessories(src.accessories, d.accessories),
  };
}
