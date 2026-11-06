/**
 * Sáu bộ phối mẫu (fashion.txt mục 6). Mỗi bộ là một CharacterLook hoàn chỉnh, chỉ dùng id trong
 * catalog.ts, hair.ts, face.ts, tattoos.ts; màu nằm trong palette.ts. Cơ thể theo người thật (user.txt).
 * Người dùng chọn nhanh rồi chỉnh tiếp: luôn lấy bản sao qua getPresetLook().
 */
import {
  cloneLook,
  emptyAccessories,
  emptyOutfit,
  makeBody,
  makeFace,
  makeHair,
  makeSkin,
  wear,
  wearAcc,
} from './defaults';
import { applyBodyStyle } from './rules';
import type { BodyStyle, CharacterLook, HeadphoneWear, SkinRegion, Side, TattooLayer, WornHeadphones, WornPhone, PhoneState } from './types';
import { LOOK_SCHEMA_VERSION } from './types';

export interface PresetDef {
  id: string;
  name: string;
  description: string;
  look: CharacterLook;
}

function tattoo(
  uid: string,
  templateId: string,
  region: SkinRegion,
  side: Side,
  extra: Partial<Omit<TattooLayer, 'uid' | 'templateId' | 'region' | 'side'>> = {},
): TattooLayer {
  return {
    uid,
    templateId,
    region,
    side,
    mirrored: false,
    u: 0.5,
    v: 0.5,
    rotation: 0,
    scale: 1,
    color: '#1a1c20',
    opacity: 0.9,
    text: '',
    visible: true,
    ...extra,
  };
}

function headphones(itemId: string, wearMode: HeadphoneWear, color?: string): WornHeadphones {
  return { ...wearAcc(itemId, color ? { color } : {}), wear: wearMode };
}

function phone(state: PhoneState, color?: string): WornPhone {
  return { ...wearAcc('phone-slab', color ? { color } : {}), state };
}

function look(presetId: string, name: string, parts: Omit<CharacterLook, 'version' | 'meta' | 'bodyStyle'>): CharacterLook {
  return { version: LOOK_SCHEMA_VERSION, meta: { name, presetId, legacyOutfit: null }, bodyStyle: 'realistic', ...parts };
}

const officeCool = look('office-cool', 'Office Cool', {
  body: makeBody('male'),
  face: makeFace({ expression: 'confident', brows: 'straight' }),
  hair: makeHair({ style: 'side-part', color: '#1b1410' }),
  skin: makeSkin({ tone: 1 }),
  tattoos: [],
  scars: [],
  outfit: {
    ...emptyOutfit(),
    inner: wear('inner-shirt-long', {
      colors: { body: '#ffffff', sleeve: '#ffffff', collar: '#ffffff', cuff: '#ffffff' },
      fit: 'slim',
      tucked: true,
    }),
    bottom: wear('bottom-trousers', { colors: { leg: '#22272e', waistband: '#22272e', pocket: '#22272e' }, fit: 'slim' }),
    socks: wear('socks-ankle', { colors: { body: '#ffffff' } }),
    shoes: wear('shoes-sneaker-low'),
  },
  accessories: {
    ...emptyAccessories(),
    eyewear: wearAcc('eyewear-rect'),
    watch: wearAcc('watch-metal', { side: 'left' }),
    belt: wearAcc('belt-leather'),
  },
});

const boyPho = look('boy-pho', 'Boy Phố', {
  body: makeBody('male', { muscle: 0.2 }),
  face: makeFace({ expression: 'confident', eyes: 'upturned', facialHair: 'stubble' }),
  hair: makeHair({ style: 'undercut', color: '#111111', highlight: { color: '#e7d7b4', amount: 0.25 } }),
  skin: makeSkin({ tone: 2 }),
  tattoos: [
    tattoo('t1', 'tt-orn-wave', 'forearm', 'right', { scale: 1.1 }),
    tattoo('t2', 'tt-line-mountain', 'upperArm', 'left', { rotation: -10, color: '#33373d' }),
    tattoo('t3', 'tt-sym-star', 'hand', 'right', { scale: 0.5 }),
  ],
  scars: [],
  outfit: {
    ...emptyOutfit(),
    inner: wear('inner-tee', {
      colors: { body: '#ffffff', sleeve: '#ffffff', collar: '#ffffff' },
      fit: 'oversized',
      patterns: [
        { patternId: 'pt-text', zone: 'body', color: '#1f2328', scale: 1, rotation: 0, offsetX: 0, offsetY: 0.2, text: 'PHỐ' },
      ],
    }),
    outer: wear('outer-bomber', { fit: 'oversized' }),
    bottom: wear('bottom-cargo', { fit: 'oversized' }),
    socks: wear('socks-crew'),
    shoes: wear('shoes-sneaker-high'),
  },
  accessories: {
    ...emptyAccessories(),
    necklace: wearAcc('necklace-chain-bold'),
    earrings: wearAcc('earring-stud', { side: 'left' }),
    bracelet: wearAcc('bracelet-bead', { side: 'right' }),
  },
});

const techDeveloper = look('tech-developer', 'Tech Developer', {
  body: makeBody('male', { weight: 0.1 }),
  face: makeFace({ expression: 'focused', eyes: 'monolid' }),
  hair: makeHair({ style: 'textured-crop', color: '#2b1d14' }),
  skin: makeSkin({ tone: 1 }),
  tattoos: [],
  scars: [],
  outfit: {
    ...emptyOutfit(),
    inner: wear('inner-hoodie', { colors: { body: '#33373d', sleeve: '#33373d', hood: '#33373d', cuff: '#33373d', pocket: '#33373d', trim: '#f4f4f2' } }),
    bottom: wear('bottom-jeans', { fit: 'slim' }),
    socks: wear('socks-ankle'),
    shoes: wear('shoes-runner'),
  },
  accessories: {
    ...emptyAccessories(),
    eyewear: wearAcc('eyewear-round'),
    headphones: headphones('headphones-over', 'around-neck'),
    badge: wearAcc('badge-lanyard'),
    phone: phone('stowed'),
    backpack: wearAcc('backpack-daypack'),
  },
});

const youngBoss = look('young-boss', 'Young Boss', {
  body: makeBody('male', { torso: { shoulderWidth: 0.2, neckLength: 0, chest: 0.1, waist: -0.1, belly: -0.1, back: 0, hips: 0 } }),
  face: makeFace({ expression: 'serious', shape: 'square' }),
  hair: makeHair({ style: 'slick-back', color: '#1b1410' }),
  skin: makeSkin({ tone: 2 }),
  tattoos: [],
  scars: [],
  outfit: {
    ...emptyOutfit(),
    inner: wear('inner-tee', { colors: { body: '#ffffff', sleeve: '#ffffff', collar: '#ffffff' }, fit: 'slim', tucked: true }),
    outer: wear('outer-blazer', {
      colors: { body: '#1f2328', sleeve: '#1f2328', collar: '#1f2328', pocket: '#1f2328', lining: '#4a4f57', button: '#17191d' },
      fit: 'slim',
    }),
    bottom: wear('bottom-trousers', { colors: { leg: '#1f2328', waistband: '#1f2328', pocket: '#1f2328' }, fit: 'slim' }),
    socks: wear('socks-dress', { colors: { body: '#1f2328' } }),
    shoes: wear('shoes-loafer'),
  },
  accessories: {
    ...emptyAccessories(),
    watch: wearAcc('watch-leather', { side: 'left' }),
    belt: wearAcc('belt-leather'),
  },
});

const streetMinimal = look('street-minimal', 'Street Minimal', {
  body: makeBody('male', { weight: -0.15 }),
  face: makeFace({ expression: 'neutral', brows: 'thick' }),
  hair: makeHair({ style: 'buzz', color: '#111111' }),
  skin: makeSkin({ tone: 3 }),
  tattoos: [tattoo('t1', 'tt-geo-band', 'forearm', 'left', { color: '#1a1c20', opacity: 1 })],
  scars: [],
  outfit: {
    ...emptyOutfit(),
    inner: wear('inner-tee-long', { colors: { body: '#1f2328', sleeve: '#1f2328', collar: '#1f2328', cuff: '#1f2328' } }),
    outer: wear('outer-coach-jacket', { colors: { body: '#4a4f57', sleeve: '#4a4f57', collar: '#4a4f57', button: '#aeb8c4' } }),
    bottom: wear('bottom-jeans', {
      colors: { leg: '#33373d', waistband: '#33373d', pocket: '#33373d', trim: '#4a4f57', button: '#aeb8c4' },
      fit: 'slim',
    }),
    socks: wear('socks-ankle'),
    shoes: wear('shoes-boots-chelsea'),
  },
  accessories: {
    ...emptyAccessories(),
    necklace: wearAcc('necklace-chain-thin'),
    earrings: wearAcc('earring-hoop', { side: 'right' }),
    bracelet: wearAcc('bracelet-chain', { side: 'right' }),
    keychain: wearAcc('keychain-carabiner'),
    belt: wearAcc('belt-webbing', { color: '#1f2328' }),
    rings: [{ itemId: 'ring-band', color: '#aeb8c4', material: 'metal', hand: 'right', finger: 'index' }],
  },
});

const creativeOffice = look('creative-office', 'Creative Office', {
  body: makeBody('female'),
  face: makeFace({ expression: 'smile', eyes: 'double-lid', mouth: 'full', shape: 'heart' }),
  hair: makeHair({ style: 'long-wavy', color: '#3b2a1f', highlight: { color: '#9c6b3c', amount: 0.3 } }),
  skin: makeSkin({ tone: 1, freckles: 0.2 }),
  tattoos: [tattoo('t1', 'tt-line-leaf', 'forearm', 'left', { scale: 0.7, color: '#2f5e57' })],
  scars: [],
  outfit: {
    ...emptyOutfit(),
    inner: wear('inner-shirt-camp', {
      patterns: [{ patternId: 'pt-leaf', zone: 'body', color: '#2f7f7a', scale: 1.2, rotation: 15, offsetX: 0, offsetY: 0, text: '' }],
    }),
    bottom: wear('bottom-wide', { colors: { leg: '#e9dcc4', waistband: '#e9dcc4' } }),
    socks: wear('socks-stripe', { colors: { body: '#ffffff', band: '#ef8a3c' } }),
    shoes: wear('shoes-sneaker-low', {
      colors: { upper: '#ef8a3c', toe: '#ef8a3c', lace: '#ffffff', sole: '#f4f4f2', trim: '#2e3a4f' },
      materials: { upper: 'suede', toe: 'suede' },
    }),
  },
  accessories: {
    ...emptyAccessories(),
    eyewear: wearAcc('eyewear-browline'),
    crossbodyBag: wearAcc('bag-messenger'),
    watch: wearAcc('watch-leather', { side: 'left' }),
    earrings: wearAcc('earring-hoop', { side: 'both', color: '#c9a85a' }),
  },
});

export const PRESETS: readonly PresetDef[] = [
  { id: 'office-cool', name: 'Office Cool', description: 'Sơ mi sáng, quần âu, sneaker trắng, kính và đồng hồ.', look: officeCool },
  { id: 'boy-pho', name: 'Boy Phố', description: 'Áo phông oversized, bomber, cargo, sneaker, dây chuyền và hình xăm.', look: boyPho },
  { id: 'tech-developer', name: 'Tech Developer', description: 'Hoodie, jeans, tai nghe, kính và thẻ nhân viên.', look: techDeveloper },
  { id: 'young-boss', name: 'Young Boss', description: 'Blazer, áo thun trơn, quần tối màu, loafer và đồng hồ.', look: youngBoss },
  { id: 'street-minimal', name: 'Street Minimal', description: 'Đen và xám, ít họa tiết, phụ kiện kim loại.', look: streetMinimal },
  { id: 'creative-office', name: 'Creative Office', description: 'Áo họa tiết, quần rộng, sneaker màu và túi đeo chéo.', look: creativeOffice },
];

/**
 * Bản sao look của preset để người dùng chỉnh tiếp; undefined nếu id không có.
 * Bộ mẫu viết cho 'realistic'; truyền style 'chibi' để dùng cùng trang phục trên thân chibi
 * (hình thể đặt về mặc định chibi, giữ mesh gốc nam/nữ).
 */
export function getPresetLook(id: string, style: BodyStyle = 'realistic'): CharacterLook | undefined {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return undefined;
  return style === p.look.bodyStyle ? cloneLook(p.look) : applyBodyStyle(p.look, style);
}
