/**
 * Kế hoạch dựng phụ kiện và mũ lên rig MPFB: từ CharacterLook ra danh sách mục (món, hình dạng procedural, xương gắn,
 * bên, màu, chất liệu, cỡ). Thuần, không phụ thuộc three. Bộ dựng hình học ở accessoryBuild.ts.
 *
 * Xương gắn theo ACCESSORY_SLOT_ATTACH của danh mục (tên humanoid) đổi sang tên xương MPFB game_engine:
 * head -> head, neck -> neck_01, upperChest -> spine_03, chest -> spine_02, hips -> pelvis,
 * lowerArm -> lowerarm_l/r, hand -> hand_l/r, finger -> <ngón>_01_l/r.
 */
import { ACCESSORY_SLOT_ATTACH, getAccessory, getGarment, type AccessoryCatalogSlot, type AttachBone } from '../../fashion/catalog';
import type { CharacterLook, HeadphoneWear, Material, PhoneState, RingFinger, Side } from '../../fashion/types';

export type HatKind = 'cap' | 'beanie' | 'bucket' | 'beret' | 'party';

/** Hình dạng procedural. Mỗi id phụ kiện/mũ trong danh mục ánh xạ vào đúng một hình dạng. */
export type ShapeId =
  | 'glasses-round'
  | 'glasses-rect'
  | 'glasses-browline'
  | 'sun-square'
  | 'sun-pilot'
  | 'earring-stud'
  | 'earring-hoop'
  | 'mask-cloth'
  | 'mask-pleated'
  | 'headphones-over'
  | 'headphones-studio'
  | 'necklace-thin'
  | 'necklace-bold'
  | 'necklace-tag'
  | 'tie-classic'
  | 'tie-slim'
  | 'tie-knit'
  | 'tie-bow'
  | 'badge-lanyard'
  | 'badge-clip'
  | 'badge-pin'
  | 'bag-sling'
  | 'bag-messenger'
  | 'backpack-daypack'
  | 'backpack-rolltop'
  | 'watch-metal'
  | 'watch-leather'
  | 'watch-digital'
  | 'bracelet-bead'
  | 'bracelet-chain'
  | 'bracelet-cord'
  | 'ring-band'
  | 'ring-signet'
  | 'phone'
  | 'belt-leather'
  | 'belt-webbing'
  | 'keychain-carabiner'
  | 'keychain-ring'
  | 'cufflinks'
  | 'scarf-knit'
  | 'scarf-light'
  | 'hat-cap'
  | 'hat-beanie'
  | 'hat-bucket'
  | 'hat-beret'
  | 'hat-party';

/** id danh mục -> hình dạng. Phủ toàn bộ 41 phụ kiện và 5 mũ (test đối chiếu danh mục). */
export const SHAPE_OF_ITEM: Readonly<Record<string, ShapeId>> = {
  'eyewear-round': 'glasses-round',
  'eyewear-rect': 'glasses-rect',
  'eyewear-browline': 'glasses-browline',
  'eyewear-sun-square': 'sun-square',
  'eyewear-sun-pilot': 'sun-pilot',
  'earring-stud': 'earring-stud',
  'earring-hoop': 'earring-hoop',
  'mask-cloth': 'mask-cloth',
  'mask-pleated': 'mask-pleated',
  'headphones-over': 'headphones-over',
  'headphones-studio': 'headphones-studio',
  'necklace-chain-thin': 'necklace-thin',
  'necklace-chain-bold': 'necklace-bold',
  'necklace-tag': 'necklace-tag',
  'tie-classic': 'tie-classic',
  'tie-slim': 'tie-slim',
  'tie-knit': 'tie-knit',
  'tie-bow': 'tie-bow',
  'badge-lanyard': 'badge-lanyard',
  'badge-clip': 'badge-clip',
  'badge-pin': 'badge-pin',
  'bag-sling': 'bag-sling',
  'bag-messenger': 'bag-messenger',
  'backpack-daypack': 'backpack-daypack',
  'backpack-rolltop': 'backpack-rolltop',
  'watch-metal': 'watch-metal',
  'watch-leather': 'watch-leather',
  'watch-digital': 'watch-digital',
  'bracelet-bead': 'bracelet-bead',
  'bracelet-chain': 'bracelet-chain',
  'bracelet-cord': 'bracelet-cord',
  'ring-band': 'ring-band',
  'ring-signet': 'ring-signet',
  'phone-slab': 'phone',
  'belt-leather': 'belt-leather',
  'belt-webbing': 'belt-webbing',
  'keychain-carabiner': 'keychain-carabiner',
  'keychain-ring': 'keychain-ring',
  'cufflinks-round': 'cufflinks',
  'scarf-knit': 'scarf-knit',
  'scarf-light': 'scarf-light',
  'hat-cap': 'hat-cap',
  'hat-beanie': 'hat-beanie',
  'hat-bucket': 'hat-bucket',
  'hat-beret': 'hat-beret',
  'hat-party': 'hat-party',
};

/** Tên xương MPFB cho vị trí gắn của danh mục. `side` chỉ dùng cho xương có hai bên. */
export function mpfbBone(attach: AttachBone, side: 'l' | 'r', finger?: RingFinger): string {
  switch (attach) {
    case 'head':
      return 'head';
    case 'neck':
      return 'neck_01';
    case 'upperChest':
      return 'spine_03';
    case 'chest':
      return 'spine_02';
    case 'hips':
      return 'pelvis';
    case 'lowerArm':
      return `lowerarm_${side}`;
    case 'hand':
      return `hand_${side}`;
    case 'finger':
      return `${fingerBoneName(finger ?? 'ring')}_01_${side}`;
  }
}

export function fingerBoneName(f: RingFinger): string {
  return f === 'little' ? 'pinky' : f;
}

/** Một mục phụ kiện cần dựng. */
export interface AccessoryEntry {
  /** Khoá ổn định (slot + bên). */
  key: string;
  slot: AccessoryCatalogSlot | 'hat';
  itemId: string;
  shape: ShapeId;
  /** Xương MPFB mà mesh sẽ làm con. */
  bone: string;
  side: 'l' | 'r' | 'c';
  color: string;
  material: Material;
  size: number;
  /** Chỉ đồng hồ/điện thoại/tai nghe/nhẫn dùng. */
  state?: PhoneState | HeadphoneWear;
  finger?: RingFinger;
  /** Màu các vùng của mũ. */
  hatColors?: Partial<Record<'crown' | 'brim' | 'band' | 'button' | 'trim', string>>;
}

export interface SkippedAccessory {
  slot: string;
  itemId: string;
  reason: string;
}

export interface AccessoryPlan {
  entries: AccessoryEntry[];
  skipped: SkippedAccessory[];
}

const sideCode = (s: Side): 'l' | 'r' => (s === 'left' ? 'l' : 'r');

/** Bên đeo: 'both' khai triển thành hai mục. */
function sidesOf(side: Side | 'both', allowed: readonly (Side | 'both')[]): ('l' | 'r')[] {
  const pick = allowed.includes(side) ? side : (allowed[0] ?? 'both');
  if (pick === 'both') return ['l', 'r'];
  return [sideCode(pick)];
}

export function planAccessories(look: CharacterLook): AccessoryPlan {
  const entries: AccessoryEntry[] = [];
  const skipped: SkippedAccessory[] = [];
  const acc = look.accessories;

  const single = (slot: AccessoryCatalogSlot, w: { itemId: string; color: string; material: Material; size: number; side: Side | 'both' } | null, extra: Partial<AccessoryEntry> = {}): void => {
    if (!w) return;
    const def = getAccessory(w.itemId);
    const shape = SHAPE_OF_ITEM[w.itemId];
    if (!def || !shape) {
      skipped.push({ slot, itemId: w.itemId, reason: def ? 'Chưa có hình dạng procedural cho món này.' : 'Món không có trong danh mục.' });
      return;
    }
    const attach = ACCESSORY_SLOT_ATTACH[slot];
    const twoSided = slot === 'watch' || slot === 'bracelet' || slot === 'earrings' || slot === 'cufflinks' || slot === 'phone';
    const sides: ('l' | 'r' | 'c')[] = twoSided ? sidesOf(w.side, def.sides) : ['c'];
    for (const s of sides) {
      const boneSide = s === 'c' ? 'l' : s;
      let attachBone = attach;
      let state = extra.state;
      if (slot === 'phone') {
        const st = (extra.state ?? 'held') as PhoneState;
        state = st;
        if (st === 'stowed') {
          skipped.push({ slot, itemId: w.itemId, reason: 'Điện thoại đang cất trong túi quần: không vẽ (không có asset túi quần).' });
          continue;
        }
        attachBone = 'hand';
      }
      if (slot === 'headphones') attachBone = (extra.state as HeadphoneWear | undefined) === 'around-neck' ? 'neck' : 'head';
      entries.push({
        key: `${slot}:${s}`,
        slot,
        itemId: w.itemId,
        shape,
        bone: mpfbBone(attachBone, boneSide),
        side: s,
        color: w.color,
        material: w.material,
        size: w.size,
        ...extra,
        state,
      });
    }
  };

  single('eyewear', acc.eyewear);
  single('earrings', acc.earrings);
  single('mask', acc.mask);
  single('headphones', acc.headphones, { state: acc.headphones?.wear ?? 'on-ears' });
  single('necklace', acc.necklace);
  single('tie', acc.tie);
  single('badge', acc.badge);
  single('crossbodyBag', acc.crossbodyBag);
  single('backpack', acc.backpack);
  single('watch', acc.watch);
  single('bracelet', acc.bracelet);
  single('phone', acc.phone, { state: acc.phone?.state ?? 'held' });
  single('belt', acc.belt);
  single('keychain', acc.keychain);
  single('cufflinks', acc.cufflinks);
  single('scarf', acc.scarf);

  acc.rings.forEach((r, i) => {
    const def = getAccessory(r.itemId);
    const shape = SHAPE_OF_ITEM[r.itemId];
    if (!def || !shape) {
      skipped.push({ slot: 'ring', itemId: r.itemId, reason: 'Nhẫn không có trong danh mục.' });
      return;
    }
    const s = sideCode(r.hand);
    entries.push({
      key: `ring:${i}`,
      slot: 'ring',
      itemId: r.itemId,
      shape,
      bone: mpfbBone('finger', s, r.finger),
      side: s,
      color: r.color,
      material: r.material,
      size: 1,
      finger: r.finger,
    });
  });

  const hat = look.outfit.hat;
  if (hat) {
    const def = getGarment(hat.garmentId);
    const shape = SHAPE_OF_ITEM[hat.garmentId];
    if (!def || !shape) {
      skipped.push({ slot: 'hat', itemId: hat.garmentId, reason: def ? 'Chưa có hình dạng mũ.' : 'Mũ không có trong danh mục.' });
    } else {
      const c = hat.colors;
      const main = c.crown ?? '#444444';
      entries.push({
        key: 'hat',
        slot: 'hat',
        itemId: hat.garmentId,
        shape,
        bone: 'head',
        side: 'c',
        color: main,
        material: hat.materials.crown ?? 'cotton',
        size: 1,
        hatColors: { crown: main, brim: c.brim ?? main, band: c.band ?? main, button: c.button ?? main, trim: c.trim ?? main },
      });
    }
  }
  return { entries, skipped };
}

/** Chữ ký phần phụ kiện/mũ ảnh hưởng hình học và màu: đổi thì dựng lại (đủ nhẹ để dựng lại cả màu). */
export function accessorySignature(look: CharacterLook | null): string {
  if (!look) return 'none';
  const p = planAccessories(look);
  return p.entries
    .map((e) => [e.key, e.itemId, e.bone, e.color, e.material, e.size.toFixed(2), e.state ?? '', JSON.stringify(e.hatColors ?? {})].join(':'))
    .join('|');
}

/** Kích thước đối chiếu: độ cao đầu (m) ở cỡ người thật dùng để quy đổi độ dày mũ. */
export const REF_HEAD_HEIGHT = 0.23;
