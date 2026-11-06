/**
 * Chuyển Appearance cũ (src/avatar/appearance.ts, schema server services/auth/appearance.js) sang CharacterLook.
 * Mọi Outfit cũ đều có ánh xạ sang món trong catalog.ts; id cũ lưu ở meta.legacyOutfit để bộ dựng còn
 * dùng được mesh FallbackAvatar khi chưa có mesh mới. Dữ liệu cũ mặc định bodyStyle 'realistic'.
 * lookToAppearance() làm chiều ngược lại để vẫn lưu được lên server (server chỉ nhận schema Appearance).
 */
import {
  normalizeAppearance,
  HAIR_STYLES as LEGACY_HAIR_STYLES,
  type Accessory as LegacyAccessory,
  type Appearance,
  type HairStyle as LegacyHairStyle,
  type Outfit as LegacyOutfit,
  type ShoeStyle as LegacyShoe,
} from '../avatar/appearance';
import { getGarment } from './catalog';
import { emptyAccessories, emptyOutfit, makeBody, makeFace, makeHair, makeSkin, wear, wearAcc } from './defaults';
import { getHairStyle } from './hair';
import { validate } from './rules';
import type {
  AccessoryLook,
  BodyFrame,
  BodyShape,
  CharacterLook,
  HexColor,
  LookWarning,
  OutfitLook,
  OutfitSlot,
  ValidationResult,
  WornGarment,
  ZoneColors,
} from './types';
import { LOOK_SCHEMA_VERSION } from './types';

type TopSlot = 'inner' | 'outer' | 'onePiece';

interface LegacyOutfitMap {
  /** Món nhận topColor. */
  top: { slot: TopSlot; id: string; tucked?: boolean };
  /** Món nhận bottomColor (không có với bộ liền: bottomColor vào vùng leg của bộ liền nếu có). */
  bottom?: string;
  /** Món phụ, giữ màu mặc định hoặc màu ghi rõ. */
  extra?: Partial<Record<OutfitSlot, { id: string; colors?: ZoneColors; tucked?: boolean }>>;
  tie?: string;
  belt?: boolean;
  frame?: BodyFrame;
}

const WHITE_SHIRT: ZoneColors = { body: '#f4f4f2', sleeve: '#f4f4f2', collar: '#f4f4f2', cuff: '#f4f4f2' };
const WHITE_TEE: ZoneColors = { body: '#ffffff', sleeve: '#ffffff', collar: '#ffffff' };

/** Ánh xạ đầy đủ 22 Outfit cũ. */
export const LEGACY_OUTFIT_MAP: Readonly<Record<LegacyOutfit, LegacyOutfitMap>> = {
  'shirt-tie': { top: { slot: 'inner', id: 'inner-shirt-long', tucked: true }, bottom: 'bottom-trousers', tie: 'tie-classic', belt: true },
  blazer: {
    top: { slot: 'outer', id: 'outer-blazer' },
    bottom: 'bottom-trousers',
    extra: { inner: { id: 'inner-shirt-long', colors: WHITE_SHIRT, tucked: true } },
    belt: true,
  },
  dress: { top: { slot: 'onePiece', id: 'onepiece-dress-office' }, frame: 'female' },
  casual: { top: { slot: 'inner', id: 'inner-tee' }, bottom: 'bottom-chinos' },
  'party-suit': {
    top: { slot: 'outer', id: 'outer-blazer-party' },
    bottom: 'bottom-trousers',
    extra: { inner: { id: 'inner-shirt-long', colors: WHITE_SHIRT, tucked: true } },
  },
  'ao-dai': { top: { slot: 'onePiece', id: 'onepiece-ao-dai' } },
  'uniform-karaoke': { top: { slot: 'onePiece', id: 'onepiece-stage-uniform' } },
  'polo-office': { top: { slot: 'inner', id: 'inner-polo-office' }, bottom: 'bottom-trousers', belt: true },
  'shirt-white': { top: { slot: 'inner', id: 'inner-shirt-long', tucked: true }, bottom: 'bottom-trousers', belt: true },
  'shirt-blue': { top: { slot: 'inner', id: 'inner-shirt-long', tucked: true }, bottom: 'bottom-trousers', belt: true },
  'vest-navy': {
    top: { slot: 'outer', id: 'outer-blazer' },
    bottom: 'bottom-trousers',
    extra: { inner: { id: 'inner-shirt-long', colors: WHITE_SHIRT, tucked: true } },
    belt: true,
  },
  'cardigan-gray': {
    top: { slot: 'outer', id: 'outer-cardigan' },
    bottom: 'bottom-trousers',
    extra: { inner: { id: 'inner-tee', colors: WHITE_TEE } },
  },
  'trousers-dark': { top: { slot: 'inner', id: 'inner-shirt-long', tucked: true }, bottom: 'bottom-trousers', belt: true },
  'skirt-office': { top: { slot: 'inner', id: 'inner-shirt-long', tucked: true }, bottom: 'bottom-skirt-office', frame: 'female' },
  'security-uniform': { top: { slot: 'onePiece', id: 'onepiece-security' } },
  'ao-dai-nam': { top: { slot: 'onePiece', id: 'onepiece-ao-dai-nam' } },
  'ao-dai-nu': { top: { slot: 'onePiece', id: 'onepiece-ao-dai-nu' }, frame: 'female' },
  'ao-ba-ba': { top: { slot: 'onePiece', id: 'onepiece-ao-ba-ba' } },
  'sport-jersey': { top: { slot: 'inner', id: 'inner-jersey' }, bottom: 'bottom-shorts', extra: { socks: { id: 'socks-stripe' } } },
  tracksuit: {
    top: { slot: 'outer', id: 'outer-track-jacket' },
    bottom: 'bottom-joggers',
    extra: { inner: { id: 'inner-tee', colors: WHITE_TEE } },
  },
  'evening-gown': { top: { slot: 'onePiece', id: 'onepiece-evening-gown' }, frame: 'female' },
  tuxedo: {
    top: { slot: 'outer', id: 'outer-tuxedo-jacket' },
    bottom: 'bottom-trousers',
    extra: { inner: { id: 'inner-shirt-long', colors: { ...WHITE_SHIRT, body: '#ffffff', sleeve: '#ffffff' }, tucked: true } },
    tie: 'tie-bow',
  },
};

const LEGACY_SHOES: Readonly<Record<LegacyShoe, string>> = {
  oxford: 'shoes-oxford',
  heels: 'shoes-block-heel',
  sneakers: 'shoes-sneaker-low',
};

/** Đổ màu vào các vùng có trên món (bỏ qua vùng món không có). */
function tint(worn: WornGarment, zones: readonly string[], color: HexColor): void {
  const def = getGarment(worn.garmentId);
  if (!def) return;
  for (const z of def.zones) {
    if (zones.includes(z)) worn.colors[z] = color;
  }
}

function bodyFromType(type: Appearance['bodyType'], frame: BodyFrame): BodyShape {
  if (type === 'slim') return makeBody(frame, { weight: -0.4, bodyFat: -0.3 });
  if (type === 'broad') {
    const b = makeBody(frame, { weight: 0.4, muscle: 0.3 });
    b.torso.shoulderWidth = 0.3;
    b.torso.chest = 0.2;
    return b;
  }
  return makeBody(frame);
}

function buildOutfit(a: Appearance, map: LegacyOutfitMap): OutfitLook {
  const outfit = emptyOutfit();
  const top = wear(map.top.id, { tucked: map.top.tucked ?? false });
  tint(top, ['body', 'sleeve', 'hood', 'pocket'], a.topColor);
  if (map.top.slot === 'onePiece') tint(top, ['leg'], a.bottomColor);
  outfit[map.top.slot] = top;

  if (map.bottom) {
    const bottom = wear(map.bottom);
    tint(bottom, ['leg', 'waistband', 'pocket'], a.bottomColor);
    outfit.bottom = bottom;
  }
  if (map.extra) {
    for (const slot of Object.keys(map.extra) as OutfitSlot[]) {
      const e = map.extra[slot];
      if (e) outfit[slot] = wear(e.id, { colors: e.colors, tucked: e.tucked ?? false });
    }
  }
  outfit.shoes = wear(LEGACY_SHOES[a.shoes]);
  if (!outfit.socks) outfit.socks = wear(a.shoes === 'sneakers' ? 'socks-ankle' : 'socks-dress');
  return outfit;
}

function buildAccessories(a: Appearance, map: LegacyOutfitMap, outfit: OutfitLook, notes: LookWarning[]): AccessoryLook {
  const acc = emptyAccessories();
  const has = (x: LegacyAccessory): boolean => a.accessories.includes(x);
  if (has('glasses')) acc.eyewear = wearAcc('eyewear-rect');
  if (has('watch')) acc.watch = wearAcc('watch-metal', { side: 'left' });
  if (has('lanyard')) acc.badge = wearAcc('badge-lanyard');
  else if (has('name-badge')) acc.badge = wearAcc('badge-clip');
  if (has('pin-brooch')) {
    if (acc.badge) {
      notes.push({
        code: 'legacy_mapped',
        path: 'accessories.badge',
        message: 'Ghim cài áo và thẻ dùng chung vị trí ngực; đã giữ thẻ, bỏ ghim.',
      });
    } else {
      acc.badge = wearAcc('badge-pin');
    }
  }
  if (has('cufflinks')) acc.cufflinks = wearAcc('cufflinks-round');
  if (has('scarf')) acc.scarf = wearAcc('scarf-knit');
  if (has('bowtie')) acc.tie = wearAcc('tie-bow');
  else if (map.tie) acc.tie = wearAcc(map.tie);
  if (has('hat-party')) outfit.hat = wear('hat-party');
  if (map.belt) acc.belt = wearAcc('belt-leather');
  return acc;
}

/**
 * Appearance cũ (hoặc dữ liệu bất kỳ, được làm sạch bằng normalizeAppearance) sang CharacterLook hợp lệ.
 * Cảnh báo gồm ghi chú ánh xạ ('legacy_mapped') và cảnh báo của validate().
 */
export function appearanceToLook(input: unknown): ValidationResult {
  const a = normalizeAppearance(input);
  const map = LEGACY_OUTFIT_MAP[a.outfit];
  const notes: LookWarning[] = [];
  const frame: BodyFrame = map.frame ?? 'male';
  const outfit = buildOutfit(a, map);
  const accessories = buildAccessories(a, map, outfit, notes);

  const hairDef = getHairStyle(a.hairStyle);
  const draft: CharacterLook = {
    version: LOOK_SCHEMA_VERSION,
    meta: { name: '', presetId: null, legacyOutfit: a.outfit },
    bodyStyle: 'realistic',
    body: bodyFromType(a.bodyType, frame),
    face: makeFace({ eyeColor: a.eyeColor }),
    hair: makeHair({ style: hairDef ? a.hairStyle : 'short', color: a.hairColor }),
    skin: makeSkin({ tone: a.skinTone }),
    tattoos: [],
    scars: [],
    outfit,
    accessories,
  };
  notes.push({
    code: 'legacy_mapped',
    path: 'meta.legacyOutfit',
    message: `Đã chuyển trang phục cũ "${a.outfit}" sang các món mới; id cũ được giữ trong meta.legacyOutfit.`,
  });
  const result = validate(draft);
  return { look: result.look, warnings: [...notes, ...result.warnings] };
}

/** Nhận diện dữ liệu có dạng Appearance cũ (outfit là chuỗi, không có khối outfit dạng đối tượng). */
export function isLegacyAppearance(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.outfit === 'string' || typeof v.bodyType === 'string' || typeof v.topColor === 'string';
}

/* ------------------------------------------------------------------ */
/* Chiều ngược: CharacterLook sang Appearance                          */
/* ------------------------------------------------------------------ */

const REVERSE_ONE_PIECE: Readonly<Record<string, LegacyOutfit>> = {
  'onepiece-dress-office': 'dress',
  'onepiece-ao-dai': 'ao-dai',
  'onepiece-stage-uniform': 'uniform-karaoke',
  'onepiece-security': 'security-uniform',
  'onepiece-ao-dai-nam': 'ao-dai-nam',
  'onepiece-ao-dai-nu': 'ao-dai-nu',
  'onepiece-ao-ba-ba': 'ao-ba-ba',
  'onepiece-evening-gown': 'evening-gown',
};

function guessLegacyOutfit(look: CharacterLook): LegacyOutfit {
  const o = look.outfit;
  if (o.onePiece) return REVERSE_ONE_PIECE[o.onePiece.garmentId] ?? 'casual';
  const outer = o.outer?.garmentId;
  const inner = o.inner?.garmentId;
  if (outer === 'outer-tuxedo-jacket') return 'tuxedo';
  if (outer === 'outer-blazer-party') return 'party-suit';
  if (outer === 'outer-blazer') return 'blazer';
  if (outer === 'outer-cardigan') return 'cardigan-gray';
  if (outer === 'outer-track-jacket') return 'tracksuit';
  if (o.bottom?.garmentId === 'bottom-skirt-office') return 'skirt-office';
  if (inner === 'inner-polo-office') return 'polo-office';
  if (inner === 'inner-jersey') return 'sport-jersey';
  if (inner === 'inner-shirt-long' || inner === 'inner-shirt-short') return look.accessories.tie ? 'shirt-tie' : 'shirt-white';
  return 'casual';
}

function guessLegacyHair(style: string): LegacyHairStyle {
  if ((LEGACY_HAIR_STYLES as readonly string[]).includes(style)) return style as LegacyHairStyle;
  const def = getHairStyle(style);
  if (!def) return 'short';
  if (style.startsWith('curly')) return 'curly';
  if (def.length === 'very-short') return 'buzz';
  if (def.length === 'medium') return 'bob';
  if (def.length === 'long') return 'long';
  return 'short';
}

/**
 * CharacterLook sang Appearance để lưu qua API hiện tại. Mất chi tiết (hình thể, hình xăm, họa tiết...)
 * vì server chưa có schema mới; nếu look đến từ dữ liệu cũ thì giữ đúng outfit cũ qua meta.legacyOutfit.
 */
export function lookToAppearance(look: CharacterLook): Appearance {
  const o = look.outfit;
  const legacy = look.meta.legacyOutfit;
  // Giữ outfit cũ chỉ khi món chính vẫn đúng như lúc chuyển đổi; người dùng đã thay đồ thì suy ra lại.
  const legacyMap = legacy && legacy in LEGACY_OUTFIT_MAP ? LEGACY_OUTFIT_MAP[legacy as LegacyOutfit] : undefined;
  const outfit: LegacyOutfit =
    legacyMap && o[legacyMap.top.slot]?.garmentId === legacyMap.top.id ? (legacy as LegacyOutfit) : guessLegacyOutfit(look);
  const map = LEGACY_OUTFIT_MAP[outfit];
  const topWorn = o[map.top.slot] ?? o.onePiece ?? o.outer ?? o.inner;
  const bottomWorn = o.bottom ?? o.onePiece;
  const shoeKind = o.shoes ? getGarment(o.shoes.garmentId)?.kind : undefined;
  const accessories: LegacyAccessory[] = [];
  const a = look.accessories;
  if (a.eyewear && a.eyewear.itemId.startsWith('eyewear-') && !a.eyewear.itemId.includes('sun')) accessories.push('glasses');
  if (a.watch) accessories.push('watch');
  if (a.badge?.itemId === 'badge-clip') accessories.push('name-badge');
  if (a.badge?.itemId === 'badge-lanyard') accessories.push('lanyard');
  if (a.badge?.itemId === 'badge-pin') accessories.push('pin-brooch');
  if (a.cufflinks) accessories.push('cufflinks');
  if (a.scarf) accessories.push('scarf');
  if (a.tie?.itemId === 'tie-bow') accessories.push('bowtie');
  if (o.hat?.garmentId === 'hat-party') accessories.push('hat-party');
  const w = look.body.weight;
  return normalizeAppearance({
    bodyType: w < -0.25 ? 'slim' : w > 0.25 ? 'broad' : 'regular',
    skinTone: look.skin.tone,
    hairStyle: guessLegacyHair(look.hair.style),
    hairColor: look.hair.color,
    eyeColor: look.face.eyeColor,
    outfit,
    topColor: topWorn?.colors.body,
    bottomColor: bottomWorn?.colors.leg,
    shoes: shoeKind === 'sneaker' ? 'sneakers' : shoeKind === 'heel' ? 'heels' : 'oxford',
    accessories,
  });
}
