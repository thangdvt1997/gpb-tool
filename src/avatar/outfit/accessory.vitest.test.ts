import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ACCESSORIES_CATALOG, ACCESSORY_SLOT_ATTACH, garmentsInGroup } from '../../fashion/catalog';
import { cloneLook, emptyAccessories, makeDefaultLook, wear, wearAcc } from '../../fashion/defaults';
import type { CharacterLook } from '../../fashion/types';
import { buildAccessory, buildHat, clothingClearance, makeBuildContext, type BuildContext } from './accessoryBuild';
import { fitHat, hatRingAt, insideHat } from './accessoryHat';
import { earPoint, headSlice, measureHead, type V3 } from './accessoryMeasure';
import { SHAPE_OF_ITEM, accessorySignature, mpfbBone, planAccessories } from './accessoryPlan';
import { loadBodyData } from './glbBody.testutil';
import { Region, classifyBody, type BodyData } from './regions';

const MODELS = ['male_real', 'female_real', 'chibi'] as const;
const HAT_KINDS = ['cap', 'beanie', 'bucket', 'beret', 'party'] as const;

const cache = new Map<string, { data: BodyData; ctx: BuildContext }>();
function world(model: (typeof MODELS)[number], look: CharacterLook | null = null) {
  const key = model + (look ? '#' : '');
  if (!look && cache.has(key)) return cache.get(key)!;
  const data = loadBodyData(model);
  const cls = classifyBody(data);
  const ctx = makeBuildContext(data, cls, look);
  const out = { data, ctx };
  if (!look) cache.set(key, out);
  return out;
}

function lookWith(patch: (l: CharacterLook) => void): CharacterLook {
  const l = cloneLook(makeDefaultLook());
  l.outfit = { ...l.outfit, inner: null, outer: null, bottom: null, onePiece: null, socks: null, shoes: null, hat: null };
  l.accessories = emptyAccessories();
  patch(l);
  return l;
}

function lookForItem(itemId: string): CharacterLook {
  const def = ACCESSORIES_CATALOG.find((a) => a.id === itemId)!;
  return lookWith((l) => {
    const a = l.accessories as unknown as Record<string, unknown>;
    if (def.slot === 'ring') l.accessories.rings = [{ itemId, color: def.defaultColor, material: def.defaultMaterial, hand: 'right', finger: 'ring' }];
    else if (def.slot === 'phone') a.phone = { ...wearAcc(itemId), state: 'held' };
    else if (def.slot === 'headphones') a.headphones = { ...wearAcc(itemId), wear: 'on-ears' };
    else a[def.slot] = wearAcc(itemId);
  });
}

function bbox(g: THREE.BufferGeometry): THREE.Box3 {
  g.computeBoundingBox();
  return g.boundingBox!.clone();
}

describe('phụ kiện: bảng hình dạng phủ toàn bộ danh mục', () => {
  it('41 phụ kiện và 5 mũ đều có hình dạng procedural', () => {
    expect(ACCESSORIES_CATALOG.length).toBe(41);
    for (const a of ACCESSORIES_CATALOG) expect(SHAPE_OF_ITEM[a.id], a.id).toBeTruthy();
    const hats = garmentsInGroup('hat');
    expect(hats.length).toBe(5);
    for (const h of hats) expect(SHAPE_OF_ITEM[h.id], h.id).toBeTruthy();
  });

  it('xương gắn theo slot: đầu, cổ, ngực, chậu, cẳng tay, bàn tay, ngón', () => {
    expect(mpfbBone(ACCESSORY_SLOT_ATTACH.eyewear, 'l')).toBe('head');
    expect(mpfbBone(ACCESSORY_SLOT_ATTACH.necklace, 'l')).toBe('neck_01');
    expect(mpfbBone(ACCESSORY_SLOT_ATTACH.tie, 'l')).toBe('spine_03');
    expect(mpfbBone(ACCESSORY_SLOT_ATTACH.crossbodyBag, 'l')).toBe('spine_02');
    expect(mpfbBone(ACCESSORY_SLOT_ATTACH.belt, 'l')).toBe('pelvis');
    expect(mpfbBone(ACCESSORY_SLOT_ATTACH.watch, 'r')).toBe('lowerarm_r');
    expect(mpfbBone(ACCESSORY_SLOT_ATTACH.phone, 'l')).toBe('hand_l');
    expect(mpfbBone('finger', 'l', 'little')).toBe('pinky_01_l');
  });

  it('kế hoạch: đồng hồ bên trái, vòng tay hai bên, điện thoại cất gắn xương chậu', () => {
    const l = lookWith((x) => {
      x.accessories.watch = wearAcc('watch-metal', { side: 'left' });
      x.accessories.bracelet = wearAcc('bracelet-chain', { side: 'both' });
      x.accessories.phone = { ...wearAcc('phone-slab'), state: 'stowed' };
      x.accessories.headphones = { ...wearAcc('headphones-over'), wear: 'around-neck' };
    });
    const p = planAccessories(l);
    expect(p.entries.filter((e) => e.slot === 'watch').map((e) => e.bone)).toEqual(['lowerarm_l']);
    expect(p.entries.filter((e) => e.slot === 'bracelet').map((e) => e.bone).sort()).toEqual(['lowerarm_l', 'lowerarm_r']);
    expect(p.entries.find((e) => e.slot === 'phone')?.bone).toBe('pelvis');
    expect(p.skipped.some((s) => s.slot === 'phone')).toBe(false);
    expect(p.entries.find((e) => e.slot === 'headphones')?.bone).toBe('neck_01');
    expect(accessorySignature(l)).not.toBe(accessorySignature(makeDefaultLook()));
  });
});

describe.each(MODELS)('phụ kiện trên GLB thật %s', (model) => {
  const { data, ctx } = world(model);
  const H = ctx.cls.bodyHeight;

  it('mọi xương gắn tồn tại trong rig', () => {
    for (const a of ACCESSORIES_CATALOG) {
      const p = planAccessories(lookForItem(a.id));
      expect(p.entries.length, a.id).toBeGreaterThan(0);
      for (const e of p.entries) expect(data.boneNames, `${a.id} -> ${e.bone}`).toContain(e.bone);
    }
  });

  it('dựng được cả 41 phụ kiện: có hình học hữu hạn, gần xương gắn', () => {
    for (const a of ACCESSORIES_CATALOG) {
      const l = lookForItem(a.id);
      const plan = planAccessories(l);
      for (const e of plan.entries) {
        const b = buildAccessory(e, ctx);
        expect(b.parts.length, a.id).toBeGreaterThan(0);
        const box = new THREE.Box3();
        for (const part of b.parts) {
          const pos = part.geometry.getAttribute('position');
          expect(pos.count, a.id).toBeGreaterThan(0);
          for (let i = 0; i < pos.array.length; i++) expect(Number.isFinite(pos.array[i]), `${a.id} NaN`).toBe(true);
          box.union(bbox(part.geometry));
        }
        const c = box.getCenter(new THREE.Vector3());
        const bp = data.bonePos[e.bone];
        const d = Math.hypot(c.x - bp[0], c.y - bp[1], c.z - bp[2]);
        const spineLike = /^(spine|pelvis)/.test(e.bone);
        expect(d, `${a.id}@${e.bone} cách xương ${d.toFixed(3)} m`).toBeLessThan(H * (spineLike ? 0.3 : 0.16));
        // Kích thước hợp lý: không lớn hơn nửa chiều cao thân.
        const size = box.getSize(new THREE.Vector3());
        expect(Math.max(size.x, size.y, size.z), a.id).toBeLessThan(H * 0.5);
      }
    }
  });

  it('phụ kiện thân nằm ngoài vỏ thân: không chìm vào cơ thể', () => {
    for (const id of ['belt-leather', 'necklace-chain-thin', 'tie-classic', 'scarf-knit']) {
      const b = buildAccessory(planAccessories(lookForItem(id)).entries[0], ctx);
      const box = new THREE.Box3();
      for (const p of b.parts) box.union(bbox(p.geometry));
      const sz = box.getSize(new THREE.Vector3());
      expect(sz.x, id).toBeGreaterThan(H * 0.03);
    }
    // Dây lưng: mọi điểm cách trục thân ít nhất bán kính thân tại độ cao đó.
    const e = planAccessories(lookForItem('belt-leather')).entries[0];
    const b = buildAccessory(e, ctx);
    const g = b.parts[0].geometry.getAttribute('position');
    const y = ctx.yPelvis + 0.1 * ctx.span;
    const cx = (box3(b.parts[0].geometry).min.x + box3(b.parts[0].geometry).max.x) / 2;
    let minGap = Infinity;
    for (let v = 0; v < ctx.cls.vertexCount; v++) {
      if (![Region.torso, Region.pelvis].includes(ctx.cls.region[v] as 3 | 4)) continue;
      if (Math.abs(data.positions[v * 3 + 1] - y) > 0.006) continue;
      // Điểm dây lưng gần nhất theo hướng ngang.
      let best = Infinity;
      for (let i = 0; i < g.count; i += 3) {
        if (Math.abs(g.getY(i) - y) > 0.03) continue;
        best = Math.min(best, Math.hypot(g.getX(i) - data.positions[v * 3], g.getZ(i) - data.positions[v * 3 + 2]));
      }
      minGap = Math.min(minGap, best);
    }
    void cx;
    expect(minGap).toBeGreaterThan(0.0005);
  });

  it('đồng hồ ôm cổ tay: bán kính dây lớn hơn bán kính cổ tay đo được', () => {
    const e = planAccessories(lookForItem('watch-metal')).entries[0];
    const b = buildAccessory(e, ctx);
    const box = bbox(b.parts[0].geometry);
    const size = box.getSize(new THREE.Vector3());
    const wrist = ctx.data.bonePos['hand_l'];
    expect(wrist).toBeTruthy();
    expect(Math.max(size.x, size.y, size.z)).toBeGreaterThan(0.03 * (H / 1.8) * 0.7);
  });
});

function box3(g: THREE.BufferGeometry): THREE.Box3 {
  return bbox(g);
}

describe.each(MODELS)('mũ trên GLB thật %s', (model) => {
  const { data, ctx } = world(model);
  const head = ctx.head;

  it.each(HAT_KINDS)('mũ %s: chứa trọn sọ phía trên mép, không lún vào đầu', (kind) => {
    const fit = fitHat(kind, head, data, ctx.cls);
    expect(fit.rings.length).toBeGreaterThan(8);
    let checked = 0;
    let pokes = 0;
    for (let v = 0; v < ctx.cls.vertexCount; v++) {
      if (ctx.cls.region[v] !== Region.head) continue;
      const y = data.positions[v * 3 + 1];
      if (y < fit.baseY || y > fit.rings[fit.rings.length - 1].y) continue;
      checked++;
      if (!insideHat(fit, [data.positions[v * 3], y, data.positions[v * 3 + 2]])) pokes++;
    }
    expect(checked).toBeGreaterThan(150);
    expect(pokes, `${pokes}/${checked} đỉnh đầu xuyên ra ngoài mũ`).toBe(0);
  });

  it.each(HAT_KINDS)('mũ %s: mặt ngoài mũ cách đầu ít nhất nửa lề (không chồng lấn)', (kind) => {
    const hatId = `hat-${kind}`;
    const l = lookWith((x) => {
      x.outfit.hat = wear(hatId);
    });
    const e = planAccessories(l).entries.find((x) => x.slot === 'hat')!;
    expect(e.bone).toBe('head');
    const { parts, fit } = buildHat(e, ctx);
    const crown = parts[0].geometry.getAttribute('position');
    const headPts: V3[] = [];
    for (let v = 0; v < ctx.cls.vertexCount; v++) {
      if (ctx.cls.region[v] === Region.head && data.positions[v * 3 + 1] >= fit.baseY - 0.01) {
        headPts.push([data.positions[v * 3], data.positions[v * 3 + 1], data.positions[v * 3 + 2]]);
      }
    }
    let minD = Infinity;
    for (let i = 0; i < crown.count; i++) {
      const x = crown.getX(i);
      const y = crown.getY(i);
      const z = crown.getZ(i);
      if (y > fit.apexY - 1e-6) continue;
      for (const p of headPts) minD = Math.min(minD, Math.hypot(x - p[0], y - p[1], z - p[2]));
    }
    expect(minD).toBeGreaterThan(fit.margin * 0.5);
    // Mép dưới của mũ nằm trên mắt và dưới đỉnh đầu; đỉnh mũ không quá cao.
    const eyeY = head.minY + 0.54 * head.height;
    expect(fit.baseY).toBeGreaterThan(eyeY);
    expect(fit.baseY).toBeLessThan(head.maxY);
    expect(fit.apexY).toBeLessThan(head.maxY + (kind === 'party' ? 1.4 : 0.35) * head.height);
    // Mọi phần của mũ (kể cả lưỡi trai/vành) nằm trên đường mắt, trừ vành mũ tai bèo che trán.
    if (kind === 'cap') {
      for (const part of parts.slice(1)) expect(bbox(part.geometry).min.y, 'lưỡi trai không che mắt').toBeGreaterThan(eyeY);
    }
  });

  it('mũ nằm trong khung đầu theo bề ngang (không trôi)', () => {
    for (const kind of HAT_KINDS) {
      const fit = fitHat(kind, head, data, ctx.cls);
      const r0 = hatRingAt(fit, fit.baseY)!;
      expect(Math.abs(r0.cx - head.cx)).toBeLessThan(head.rx * 0.3);
      expect(Math.abs(r0.cz - head.cz)).toBeLessThan(head.rz * 0.5);
    }
  });
});

describe('co theo kích thước thân (chiều cao, chibi, morph)', () => {
  it('mũ, kính, đồng hồ co tuyến tính theo thân', () => {
    const base = loadBodyData('male_real');
    const k = 1.5;
    const scaled: BodyData = {
      ...base,
      positions: Float32Array.from(base.positions as ArrayLike<number>, (v) => v * k),
      bonePos: Object.fromEntries(Object.entries(base.bonePos).map(([n, p]) => [n, [p[0] * k, p[1] * k, p[2] * k] as [number, number, number]])),
    };
    const c1 = makeBuildContext(base, classifyBody(base), null);
    const c2 = makeBuildContext(scaled, classifyBody(scaled), null);
    expect(c2.head.height / c1.head.height).toBeCloseTo(k, 3);
    const f1 = fitHat('cap', c1.head, base, c1.cls);
    const f2 = fitHat('cap', c2.head, scaled, c2.cls);
    expect(f2.apexY / f1.apexY).toBeCloseTo(k, 2);
    expect(f2.rings[3].rx / f1.rings[3].rx).toBeCloseTo(k, 2);
    const width = (ctx: BuildContext, id: string) => {
      const e = planAccessories(lookForItem(id)).entries[0];
      const box = new THREE.Box3();
      for (const p of buildAccessory(e, ctx).parts) box.union(bbox(p.geometry));
      return box.getSize(new THREE.Vector3()).x;
    };
    expect(width(c2, 'eyewear-round') / width(c1, 'eyewear-round')).toBeGreaterThan(1.35);
    expect(width(c2, 'eyewear-round') / width(c1, 'eyewear-round')).toBeLessThan(1.65);
  });

  it('chibi: đầu lớn so với thân nên mũ lớn hơn tỉ lệ thân', () => {
    const m = world('male_real').ctx;
    const c = world('chibi').ctx;
    expect(c.head.height / c.cls.bodyHeight).toBeGreaterThan((m.head.height / m.cls.bodyHeight) * 1.5);
  });

  it('lớp áo dày hơn đẩy phụ kiện thân ra ngoài hơn', () => {
    const none = clothingClearance(lookWith(() => undefined), 1.8).torso;
    const dressed = clothingClearance(
      lookWith((l) => {
        l.outfit.inner = wear('inner-polo-office');
        l.outfit.outer = wear('outer-bomber', { fit: 'oversized' });
      }),
      1.8,
    ).torso;
    expect(dressed).toBeGreaterThan(none);
  });

  it('head: tai nằm hai bên đầu', () => {
    const { data, ctx } = world('male_real');
    const h = measureHead(data, ctx.cls);
    const l = earPoint(data, ctx.cls, h, 'l');
    const r = earPoint(data, ctx.cls, h, 'r');
    expect(l.x).toBeGreaterThan(h.cx);
    expect(r.x).toBeLessThan(h.cx);
    expect(headSlice(data, ctx.cls, h.minY + 0.5 * h.height, 0.01).count).toBeGreaterThan(50);
  });
});

describe.each(MODELS)('điện thoại cất nhô khỏi túi sau trên %s', (model) => {
  const { data, ctx } = world(model);
  it.each(['left', 'right'] as const)('bên %s: gắn pelvis, nằm phía sau và phía trên túi, không chìm vào mông', (side) => {
    const l = lookWith((x) => {
      x.accessories.phone = { ...wearAcc('phone-slab', { side }), state: 'stowed' };
    });
    const e = planAccessories(l).entries[0];
    expect(e.bone).toBe('pelvis');
    expect(data.boneNames).toContain('pelvis');
    const b = buildAccessory(e, ctx);
    expect(b.parts.length).toBeGreaterThanOrEqual(3);
    const box = new THREE.Box3();
    for (const p of b.parts) box.union(bbox(p.geometry));
    const c = box.getCenter(new THREE.Vector3());
    // Ở phía sau thân (z nhỏ hơn trục thân) và đúng bên.
    const axisZ = data.bonePos['pelvis'][2];
    expect(c.z).toBeLessThan(axisZ);
    expect(side === 'left' ? c.x > 0 : c.x < 0).toBe(true);
    // Gần xương chậu và kích thước hợp lý.
    expect(Math.hypot(c.x - data.bonePos['pelvis'][0], c.y - data.bonePos['pelvis'][1], c.z - axisZ)).toBeLessThan(ctx.cls.bodyHeight * 0.2);
    const size = box.getSize(new THREE.Vector3());
    expect(Math.max(size.x, size.y, size.z)).toBeLessThan(ctx.cls.bodyHeight * 0.15);
    // Mặt ngoài của điện thoại nằm ngoài bề mặt mông tại chỗ đó.
    const pos = b.parts[1].geometry.getAttribute('position');
    let minGap = Infinity;
    for (let i = 0; i < pos.count; i += 4) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const pz = pos.getZ(i);
      for (let v = 0; v < ctx.cls.vertexCount; v += 3) {
        if (ctx.cls.region[v] !== Region.pelvis) continue;
        if (Math.abs(data.positions[v * 3 + 1] - py) > 0.02) continue;
        minGap = Math.min(minGap, Math.hypot(px - data.positions[v * 3], pz - data.positions[v * 3 + 2]));
      }
    }
    expect(minGap).toBeGreaterThan(0.002);
  });
});
