/**
 * Mô hình dữ liệu nhân vật và thời trang (promy_update/fashion.txt mục 2, 3, 4, 5, 9;
 * phần cơ thể và khuôn mặt theo promy_update/user.txt: mặc định người trưởng thành tỷ lệ thật,
 * chibi là lựa chọn riêng qua CharacterLook.bodyStyle).
 * Chỉ chứa dữ liệu thuần, không chứa mesh, material hay React. Mọi id tham chiếu tới
 * danh mục trong catalog.ts, hair.ts, face.ts, tattoos.ts, scars.ts.
 * Màu luôn ở dạng '#rrggbb' chữ thường.
 */

/** Phiên bản schema CharacterLook. Tăng khi đổi cấu trúc, kèm bước nâng cấp trong rules.ts. */
export const LOOK_SCHEMA_VERSION = 1 as const;

export type HexColor = string;
export type Side = 'left' | 'right';

/* ------------------------------------------------------------------ */
/* Cơ thể (fashion.txt mục 2, cập nhật theo promy_update/user.txt)     */
/* ------------------------------------------------------------------ */
/*
 * Mặc định là người trưởng thành tỷ lệ thật (khoảng 7,5 đầu); chibi là lựa chọn riêng (BodyStyle).
 * Các trường hình thể là TRỌNG SỐ MORPH chuẩn hoá -1 đến 1 (0 = mesh gốc), không phải hệ số scale mesh.
 * Bộ dựng ánh xạ mỗi trọng số sang blendshape/morph target tương ứng của mesh người (cần asset, xem báo cáo).
 * Riêng chiều cao (cm) và chiều dài chi tác động lên độ dài xương; skeleton, skinning, điểm gắn phụ kiện
 * và collider phải cập nhật theo. Giới hạn giải phẫu nằm trong BODY_LIMITS (rules.ts).
 */

/**
 * Kiểu tạo hình. 'realistic' (mặc định): người trưởng thành tỷ lệ thật, khoảng 7,5 đầu.
 * 'chibi': lựa chọn riêng, đầu lớn và thân ngắn (khoảng 2,5 đến 4 đầu). Cả hai dùng chung trường BodyShape,
 * chỉ khác khoảng giá trị (BODY_LIMITS_BY_STYLE trong rules.ts) và mesh gốc. Trang phục, hình xăm,
 * phụ kiện, bộ mẫu dùng được cho cả hai; bộ dựng chọn biến thể mesh trang phục theo bodyStyle.
 */
export type BodyStyle = 'realistic' | 'chibi';
export const BODY_STYLES: readonly BodyStyle[] = ['realistic', 'chibi'];

/** Mesh gốc. Quyết định chiều cao mặc định (realistic: nam 170 cm, nữ 160 cm) và bộ morph dùng. */
export type BodyFrame = 'male' | 'female';
export const BODY_FRAMES: readonly BodyFrame[] = ['male', 'female'];

/** Một tay. Trọng số morph -1 đến 1. */
export interface ArmShape {
  /** Độ đầy bắp tay. */
  upperArm: number;
  /** Độ đầy cẳng tay. */
  forearm: number;
  /** Chiều dài tay (đổi độ dài xương, biên độ nhỏ). */
  length: number;
  /** Kích thước bàn tay. */
  hand: number;
}

/** Một chân. Trọng số morph -1 đến 1. */
export interface LegShape {
  thigh: number;
  calf: number;
  /** Chiều dài chân (đổi độ dài xương, biên độ nhỏ). */
  length: number;
  /** Kích thước bàn chân. */
  foot: number;
}

export interface Paired<T> {
  left: T;
  right: T;
}

export interface TorsoShape {
  shoulderWidth: number;
  neckLength: number;
  chest: number;
  waist: number;
  belly: number;
  back: number;
  hips: number;
}

export interface BodyShape {
  frame: BodyFrame;
  /** Chiều cao, cm. */
  heightCm: number;
  /** Số đầu trên chiều cao. realistic: 7 đến 8, mặc định 7,5. chibi: 2,5 đến 4, mặc định 3. */
  headsTall: number;
  /** Cân nặng biểu kiến, -1 đến 1. */
  weight: number;
  /** Lượng mỡ, -1 đến 1. */
  bodyFat: number;
  /** Độ phát triển cơ bắp, -1 đến 1. */
  muscle: number;
  torso: TorsoShape;
  /** true: chỉnh một bên, bên phải chép theo bên trái. false: chỉnh từng bên. */
  symmetric: boolean;
  arms: Paired<ArmShape>;
  legs: Paired<LegShape>;
}

/* ------------------------------------------------------------------ */
/* Khuôn mặt, tóc, da                                                  */
/* ------------------------------------------------------------------ */

/** Cấu trúc mặt, trọng số morph -1 đến 1 cộng dồn lên mẫu mặt đã chọn. */
export interface FaceStructure {
  headSize: number;
  forehead: number;
  cheekbones: number;
  cheeks: number;
  jaw: number;
  chin: number;
  ears: number;
  eyeSpacing: number;
  eyeSize: number;
  noseBridge: number;
  noseWidth: number;
  lipFullness: number;
}

export interface FaceLook {
  /** Mẫu khuôn mặt nền (face.ts FACE_SHAPES). */
  shape: string;
  eyes: string;
  brows: string;
  nose: string;
  mouth: string;
  ears: string;
  structure: FaceStructure;
  eyeColor: HexColor;
  facialHair: string;
  /** Màu râu; null thì dùng màu tóc. */
  facialHairColor: HexColor | null;
  expression: string;
}

export interface HairHighlight {
  color: HexColor;
  /** Mức phủ highlight, 0 đến 1. */
  amount: number;
}

export interface HairLook {
  style: string;
  color: HexColor;
  highlight: HairHighlight | null;
}

/** Nốt ruồi, một điểm nhỏ trên da. */
export interface MoleMark {
  uid: string;
  region: SkinRegion;
  side: Side;
  u: number;
  v: number;
  /** Hệ số kích thước 0.5 đến 1.5. */
  size: number;
}

export interface SkinLook {
  /** Chỉ số tông da 0 đến 5, khớp SKIN_TONES trong src/avatar/appearance.ts. */
  tone: number;
  /** Sắc độ không đồng đều nhẹ, 0 đến 1. */
  unevenness: number;
  /** Tàn nhang, 0 đến 1. */
  freckles: number;
  /** Vết rạn, 0 đến 0.6 (mức tự nhiên). */
  stretchMarks: number;
  moles: MoleMark[];
}

/* ------------------------------------------------------------------ */
/* Hình xăm và sẹo (mục 3)                                             */
/* ------------------------------------------------------------------ */

/** Vùng gắn hình xăm/sẹo. Vùng có hai bên dùng thêm trường side. */
export type SkinRegion =
  | 'face'
  | 'neck'
  | 'chest'
  | 'abdomen'
  | 'back'
  | 'upperArm'
  | 'forearm'
  | 'hand'
  | 'thigh'
  | 'calf'
  | 'foot';

/** Vị trí trên vùng, toạ độ UV cục bộ 0 đến 1. */
export interface RegionPlacement {
  region: SkinRegion;
  /** Bên trái/phải với vùng có hai bên; với vùng giữa (cổ, ngực, bụng, lưng) bỏ qua nhưng vẫn lưu. */
  side: Side;
  /** true: dựng thêm bản đối xứng ở bên kia. */
  mirrored: boolean;
  u: number;
  v: number;
  /** Góc xoay, độ, -180 đến 180. */
  rotation: number;
}

export interface TattooLayer extends RegionPlacement {
  /** id lớp, duy nhất trong look. */
  uid: string;
  templateId: string;
  /** Hệ số kích thước. */
  scale: number;
  color: HexColor;
  /** Độ đậm mực, 0 đến 1. */
  opacity: number;
  /** Chữ cho mẫu loại text; mẫu khác bỏ qua. */
  text: string;
  visible: boolean;
}

export interface ScarLayer extends RegionPlacement {
  uid: string;
  styleId: string;
  /** Hệ số chiều dài. */
  length: number;
  color: HexColor;
  /** Mức nổi nhẹ, 0 đến 0.3 (chỉ normal map nhẹ, không biến dạng mesh). */
  relief: number;
  visible: boolean;
}

/* ------------------------------------------------------------------ */
/* Trang phục (mục 4)                                                  */
/* ------------------------------------------------------------------ */

/** Slot trang phục, trùng tên nhóm trong danh mục. */
export type OutfitSlot = 'inner' | 'outer' | 'bottom' | 'onePiece' | 'socks' | 'shoes' | 'hat';

export const OUTFIT_SLOTS: readonly OutfitSlot[] = ['inner', 'outer', 'bottom', 'onePiece', 'socks', 'shoes', 'hat'];

export type Fit = 'regular' | 'slim' | 'oversized';
export const FITS: readonly Fit[] = ['regular', 'slim', 'oversized'];

export type Material =
  | 'cotton'
  | 'knit'
  | 'denim'
  | 'woven'
  | 'twill'
  | 'nylon'
  | 'fleece'
  | 'silk'
  | 'leather'
  | 'suede'
  | 'canvas'
  | 'rubber'
  | 'metal'
  | 'plastic';

export const MATERIALS: readonly Material[] = [
  'cotton',
  'knit',
  'denim',
  'woven',
  'twill',
  'nylon',
  'fleece',
  'silk',
  'leather',
  'suede',
  'canvas',
  'rubber',
  'metal',
  'plastic',
];

/** Vùng màu/chất liệu trên một món đồ. */
export type GarmentZone =
  | 'body'
  | 'sleeve'
  | 'collar'
  | 'cuff'
  | 'trim'
  | 'placket'
  | 'pocket'
  | 'hood'
  | 'lining'
  | 'button'
  | 'zipper'
  | 'waistband'
  | 'leg'
  | 'hem'
  | 'upper'
  | 'toe'
  | 'sole'
  | 'lace'
  | 'crown'
  | 'brim'
  | 'band';

/** Họa tiết procedural đặt trên một vùng của món đồ. */
export interface GarmentPattern {
  patternId: string;
  zone: GarmentZone;
  color: HexColor;
  /** Hệ số tỷ lệ họa tiết. */
  scale: number;
  /** Góc xoay, độ. */
  rotation: number;
  /** Lệch vị trí trên vùng, -1 đến 1. */
  offsetX: number;
  offsetY: number;
  /** Chữ cho họa tiết loại text; họa tiết khác để chuỗi rỗng. */
  text: string;
}

export type ZoneColors = Partial<Record<GarmentZone, HexColor>>;
export type ZoneMaterials = Partial<Record<GarmentZone, Material>>;

export interface WornGarment {
  garmentId: string;
  colors: ZoneColors;
  materials: ZoneMaterials;
  patterns: GarmentPattern[];
  fit: Fit;
  /** Sơ vin. Chỉ có hiệu lực với món tuckable khi có quần. */
  tucked: boolean;
}

export type OutfitLook = Record<OutfitSlot, WornGarment | null>;

/* ------------------------------------------------------------------ */
/* Phụ kiện (mục 5)                                                    */
/* ------------------------------------------------------------------ */

/** Slot phụ kiện; mỗi slot gắn vào một xương/bộ phận cố định (xem ACCESSORY_SLOT_ATTACH trong catalog.ts). */
export type AccessorySlot =
  | 'eyewear'
  | 'earrings'
  | 'mask'
  | 'headphones'
  | 'necklace'
  | 'tie'
  | 'badge'
  | 'crossbodyBag'
  | 'backpack'
  | 'watch'
  | 'bracelet'
  | 'phone'
  | 'belt'
  | 'keychain'
  | 'cufflinks'
  | 'scarf';

export const ACCESSORY_SLOTS: readonly AccessorySlot[] = [
  'eyewear',
  'earrings',
  'mask',
  'headphones',
  'necklace',
  'tie',
  'badge',
  'crossbodyBag',
  'backpack',
  'watch',
  'bracelet',
  'phone',
  'belt',
  'keychain',
  'cufflinks',
  'scarf',
];

export interface WornAccessory {
  itemId: string;
  color: HexColor;
  material: Material;
  /** Hệ số kích thước, giới hạn 0.85 đến 1.15. */
  size: number;
  /** Bên đeo cho đồng hồ, vòng tay, khuyên tai một bên. */
  side: Side | 'both';
}

export type PhoneState = 'stowed' | 'held' | 'using';
export const PHONE_STATES: readonly PhoneState[] = ['stowed', 'held', 'using'];

export interface WornPhone extends WornAccessory {
  state: PhoneState;
}

export type HeadphoneWear = 'on-ears' | 'around-neck';

export interface WornHeadphones extends WornAccessory {
  wear: HeadphoneWear;
}

export type RingHand = Side;
export type RingFinger = 'index' | 'middle' | 'ring' | 'little';

export interface WornRing {
  itemId: string;
  color: HexColor;
  material: Material;
  hand: RingHand;
  finger: RingFinger;
}

/**
 * Phụ kiện. Mũ nằm ở OutfitLook.hat (một chỗ duy nhất cho mũ, tránh xung đột hai mũ).
 * Kim loại chi tiết (khóa thắt lưng, móc, khoen) chọn qua material 'metal' của từng phụ kiện.
 */
export interface AccessoryLook {
  eyewear: WornAccessory | null;
  earrings: WornAccessory | null;
  mask: WornAccessory | null;
  headphones: WornHeadphones | null;
  necklace: WornAccessory | null;
  tie: WornAccessory | null;
  badge: WornAccessory | null;
  crossbodyBag: WornAccessory | null;
  backpack: WornAccessory | null;
  watch: WornAccessory | null;
  bracelet: WornAccessory | null;
  phone: WornPhone | null;
  belt: WornAccessory | null;
  keychain: WornAccessory | null;
  cufflinks: WornAccessory | null;
  scarf: WornAccessory | null;
  rings: WornRing[];
}

/* ------------------------------------------------------------------ */
/* Tổng hợp                                                            */
/* ------------------------------------------------------------------ */

export interface LookMeta {
  /** Tên bộ phối do người dùng đặt (tối đa 40 ký tự). */
  name: string;
  /** id bộ mẫu gốc nếu tạo từ preset. */
  presetId: string | null;
  /**
   * id trang phục cũ (Outfit trong src/avatar/appearance.ts) khi look được chuyển từ Appearance.
   * Bộ dựng có thể dùng mesh cũ của FallbackAvatar nếu chưa có mesh mới cho các món đã ánh xạ.
   */
  legacyOutfit: string | null;
}

export interface CharacterLook {
  version: typeof LOOK_SCHEMA_VERSION;
  meta: LookMeta;
  /** Kiểu tạo hình; mặc định 'realistic'. */
  bodyStyle: BodyStyle;
  body: BodyShape;
  face: FaceLook;
  hair: HairLook;
  skin: SkinLook;
  tattoos: TattooLayer[];
  scars: ScarLayer[];
  outfit: OutfitLook;
  accessories: AccessoryLook;
}

/** Bộ phối đã lưu cục bộ. */
export interface OutfitSet {
  id: string;
  name: string;
  /** Thời điểm lưu, ms kể từ epoch. */
  savedAt: number;
  look: CharacterLook;
}

export type WarningCode =
  | 'invalid_input'
  | 'clamped'
  | 'unknown_id'
  | 'wrong_group'
  | 'fit_not_allowed'
  | 'tuck_not_supported'
  | 'color_snapped'
  | 'material_not_allowed'
  | 'zone_not_allowed'
  | 'slot_conflict'
  | 'too_many_layers'
  | 'duplicate_uid'
  | 'missing_required'
  | 'region_not_allowed'
  | 'text_trimmed'
  | 'legacy_mapped';

export interface LookWarning {
  code: WarningCode;
  /** Đường dẫn trường, ví dụ 'outfit.bottom' hoặc 'tattoos[3].color'. */
  path: string;
  /** Thông điệp tiếng Việt. */
  message: string;
}

export interface ValidationResult {
  look: CharacterLook;
  warnings: LookWarning[];
}
