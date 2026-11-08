import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadRig } from './ik/rigLoader.testutil';
import { makeDefaultLook } from '../fashion/defaults';
import { validate } from '../fashion/rules';
import { setSliderValue } from '../wardrobe/shapeSliders';
import { deriveBodyMorphWeights } from './outfit/bodyMorphs';
import {
  BONE_SHAPE_LIMITS,
  IDENTITY_BONE_SHAPE,
  REST_SPANS,
  applyBoneShape,
  boneShapeOf,
  footDrop,
  heightDelta,
  isIdentityBoneShape,
  measureRestSpans,
} from './boneShape';

const FILES = ['male_real', 'female_real', 'chibi'] as const;
const NAMES = ['gpb_upperarm_girth', 'gpb_thigh_girth'] as const;
const rigs = {} as Record<(typeof FILES)[number], THREE.Object3D>;

function body(root: THREE.Object3D): THREE.SkinnedMesh {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isSkinnedMesh && m.morphTargetDictionary && 'bodyBelly' in m.morphTargetDictionary) found = m;
  });
  if (!found) throw new Error('không thấy mesh thân');
  return found;
}

beforeAll(async () => {
  for (const f of FILES) rigs[f] = await loadRig(f);
});

describe('morph bắp tay và đùi trên 3 GLB thật', () => {
  for (const f of FILES) {
    describe(f, () => {
      it('có morph tên đúng, 18 morph cũ giữ nguyên thứ tự', () => {
        const dict = body(rigs[f]).morphTargetDictionary as Record<string, number>;
        for (const n of NAMES) expect(dict[n]).toBeGreaterThanOrEqual(18);
        expect(dict.eyeBlink_L).toBe(0);
        expect(dict.chestMuscle).toBe(17);
        expect(Object.keys(dict).length).toBe(20);
      });

      it('chỉ dịch đỉnh gần xương tương ứng, đỉnh xa xương không đổi', () => {
        const mesh = body(rigs[f]);
        const geo = mesh.geometry;
        const dict = mesh.morphTargetDictionary as Record<string, number>;
        const skinIndex = geo.getAttribute('skinIndex');
        const skinWeight = geo.getAttribute('skinWeight');
        const bones = mesh.skeleton.bones.map((b) => b.name);
        const groups: Record<(typeof NAMES)[number], string[]> = {
          gpb_upperarm_girth: ['upperarm_l', 'upperarm_r'],
          gpb_thigh_girth: ['thigh_l', 'thigh_r'],
        };
        for (const n of NAMES) {
          const attr = geo.morphAttributes.position[dict[n]];
          const own = new Set(groups[n].map((b) => bones.indexOf(b)));
          let moved = 0;
          let maxMove = 0;
          for (let v = 0; v < attr.count; v++) {
            const len = Math.hypot(attr.getX(v), attr.getY(v), attr.getZ(v));
            let w = 0;
            for (let k = 0; k < 4; k++) if (own.has(skinIndex.getComponent(v, k))) w += skinWeight.getComponent(v, k);
            if (len > 0) {
              moved++;
              maxMove = Math.max(maxMove, len);
              expect(w).toBeGreaterThan(0.01);
            }
          }
          expect(moved).toBeGreaterThan(300);
          expect(moved).toBeLessThan(attr.count * 0.12);
          // Dịch tối đa khoảng 1-2 cm ở mesh cao ~1,8 m (tỉ lệ theo chiều cao mesh).
          expect(maxMove).toBeGreaterThan(0.002);
          expect(maxMove).toBeLessThan(0.03 * (REST_SPANS[f].native / 1.8));
        }
      });

      it('influence 1 làm chi nở ra, -1 làm chi nhỏ lại (khoảng cách tới trục xương)', () => {
        const mesh = body(rigs[f]);
        const dict = mesh.morphTargetDictionary as Record<string, number>;
        const infl = mesh.morphTargetInfluences as number[];
        const attr = mesh.geometry.morphAttributes.position[dict.gpb_upperarm_girth];
        const pos = mesh.geometry.getAttribute('position');
        let best = 0;
        let bestLen = 0;
        for (let v = 0; v < attr.count; v++) {
          const l = Math.hypot(attr.getX(v), attr.getY(v), attr.getZ(v));
          if (l > bestLen) { bestLen = l; best = v; }
        }
        // Đỉnh dịch ra xa trục chi: delta cùng hướng pháp tuyến ngang (dương), tức dot(delta, normal) > 0.
        const nrm = mesh.geometry.getAttribute('normal');
        const dot = attr.getX(best) * nrm.getX(best) + attr.getY(best) * nrm.getY(best) + attr.getZ(best) * nrm.getZ(best);
        expect(dot).toBeGreaterThan(0);
        expect(pos.count).toBe(attr.count);
        for (const n of NAMES) expect(infl[dict[n]]).toBe(0);
      });

      it('đỉnh mặt, thân trên, bàn tay không đổi khi bật hai morph', () => {
        const mesh = body(rigs[f]);
        const dict = mesh.morphTargetDictionary as Record<string, number>;
        const pos = mesh.geometry.getAttribute('position');
        let ymax = -Infinity;
        for (let v = 0; v < pos.count; v++) ymax = Math.max(ymax, pos.getY(v));
        for (const n of NAMES) {
          const attr = mesh.geometry.morphAttributes.position[dict[n]];
          for (let v = 0; v < pos.count; v++) {
            if (pos.getY(v) > ymax * 0.93) expect(Math.hypot(attr.getX(v), attr.getY(v), attr.getZ(v))).toBe(0);
          }
        }
      });
    });
  }
});

describe('trọng số morph từ hồ sơ', () => {
  it('thanh bắp tay và đùi ghi hai bên, trọng số morph hai chiều', () => {
    let l = makeDefaultLook();
    l = setSliderValue(l, 'upperArm', 0.8);
    l = setSliderValue(l, 'thigh', -0.6);
    expect(l.body.arms.left.upperArm).toBeCloseTo(0.8);
    expect(l.body.arms.right.upperArm).toBeCloseTo(0.8);
    expect(l.body.legs.right.thigh).toBeCloseTo(-0.6);
    const w = deriveBodyMorphWeights(l);
    expect(w.gpb_upperarm_girth).toBeCloseTo(0.8);
    expect(w.gpb_thigh_girth).toBeCloseTo(-0.6);
  });

  it('hồ sơ cũ không có bắp tay, đùi, bàn tay, bàn chân: hợp lệ và hình thể bằng xương là đơn vị', () => {
    const old = JSON.parse(JSON.stringify(makeDefaultLook()));
    for (const side of ['left', 'right']) {
      delete old.body.arms[side].upperArm;
      delete old.body.arms[side].hand;
      delete old.body.legs[side].thigh;
      delete old.body.legs[side].foot;
    }
    const { look } = validate(old);
    expect(look.body.arms.left.upperArm).toBe(0);
    expect(deriveBodyMorphWeights(look).gpb_thigh_girth).toBe(0);
    expect(isIdentityBoneShape(boneShapeOf(look))).toBe(true);
    expect(isIdentityBoneShape(boneShapeOf(null))).toBe(true);
  });
});

describe('cỡ bàn tay, bàn chân bằng xương', () => {
  it('boneShapeOf kẹp trong +-25% và xử lý giá trị hỏng', () => {
    let l = makeDefaultLook();
    l = setSliderValue(l, 'handSize', 0.5);
    l = setSliderValue(l, 'footSize', -0.5);
    const s = boneShapeOf(l);
    expect(s.handL).toBeCloseTo(1.25);
    expect(s.handR).toBeCloseTo(1.25);
    expect(s.footL).toBeCloseTo(0.75);
    const bad = JSON.parse(JSON.stringify(l));
    bad.body.arms.left.hand = 99;
    bad.body.legs.left.foot = Number.NaN;
    const b = boneShapeOf(bad);
    expect(b.handL).toBe(BONE_SHAPE_LIMITS.extremity.max);
    expect(b.footL).toBe(1);
  });

  for (const f of FILES) {
    it(`${f}: scale xương hand/foot đổi đúng, đáy bàn chân khớp footDrop, bàn chân về cỡ cũ khi đặt lại`, () => {
      const r = rigs[f];
      applyBoneShape(r, IDENTITY_BONE_SHAPE);
      r.updateMatrixWorld(true);
      const sole = (): number => {
        const mesh = body(r);
        const v = new THREE.Vector3();
        let m = Infinity;
        const n = mesh.geometry.getAttribute('position').count;
        for (let i = 0; i < n; i++) {
          mesh.getVertexPosition(i, v);
          v.applyMatrix4(mesh.matrixWorld);
          m = Math.min(m, v.y);
        }
        return m;
      };
      expect(measureRestSpans(r, REST_SPANS[f].native).ankle).toBeCloseTo(REST_SPANS[f].ankle, 5);
      const base = sole();
      const s = { ...IDENTITY_BONE_SHAPE, handL: 1.25, handR: 1.25, footL: 1.25, footR: 1.25 };
      applyBoneShape(r, s);
      r.updateMatrixWorld(true);
      const hand = r.getObjectByName('hand_l') as THREE.Object3D;
      const foot = r.getObjectByName('foot_r') as THREE.Object3D;
      expect(hand.scale.x).toBeCloseTo(1.25, 5);
      expect(hand.scale.y).toBeCloseTo(1.25, 5);
      expect(foot.scale.length() / Math.sqrt(3)).toBeCloseTo(1.25, 1);
      const drop = footDrop(REST_SPANS[f], s);
      expect(drop).toBeCloseTo(0.25 * REST_SPANS[f].ankle, 6);
      expect(heightDelta(REST_SPANS[f], s)).toBe(0);
      // Đáy bàn chân thật xuống thêm đúng drop (sai số do cổ chân không nằm đúng mặt đáy).
      expect(base - sole()).toBeGreaterThan(drop * 0.4);
      expect(base - sole()).toBeLessThan(drop * 1.6);
      applyBoneShape(r, IDENTITY_BONE_SHAPE);
      r.updateMatrixWorld(true);
      expect(sole()).toBeCloseTo(base, 5);
      // Bàn chân nhỏ lại: đáy lên, footDrop âm.
      expect(footDrop(REST_SPANS[f], { ...IDENTITY_BONE_SHAPE, footL: 0.75, footR: 0.75 })).toBeLessThan(0);
    });
  }
});

describe('mặt sàn: chân chạm sàn với cả 3 GLB và hình thể cực trị', () => {
  const SHAPES: Record<string, Partial<typeof IDENTITY_BONE_SHAPE>> = {
    'mặc định': {},
    'chân dài +15%': { legL: 1.15, legR: 1.15 },
    'chân ngắn -15%': { legL: 0.85, legR: 0.85 },
    'bàn chân to': { footL: 1.25, footR: 1.25 },
    'bàn chân nhỏ': { footL: 0.75, footR: 0.75 },
    'chân dài và bàn chân to': { legL: 1.15, legR: 1.15, footL: 1.25, footR: 1.25 },
    'lệch bên': { legL: 1.1, legR: 0.9, footL: 1.2, footR: 0.8 },
  };
  for (const f of FILES) {
    it(`${f}: rig.minY là đáy thật (gần 0, không bị hộp bao morph kéo xuống -0,13)`, async () => {
      const { buildRig } = await import('./MpfbAvatar');
      const rig = buildRig({ scene: rigs[f] } as never);
      expect(Math.abs(rig.minY)).toBeLessThan(0.01);
    });
    for (const [name, o] of Object.entries(SHAPES)) {
      it(`${f}, ${name}: đáy bàn chân khớp mặt sàn tính từ footDrop (sai số < 1,5 cm)`, async () => {
        const { buildRig } = await import('./MpfbAvatar');
        const rig = buildRig({ scene: rigs[f] } as never);
        const s = { ...IDENTITY_BONE_SHAPE, ...o };
        applyBoneShape(rigs[f], s);
        rigs[f].updateMatrixWorld(true);
        const mesh = body(rigs[f]);
        const v = new THREE.Vector3();
        let low = Infinity;
        const n = mesh.geometry.getAttribute('position').count;
        for (let i = 0; i < n; i++) {
          mesh.getVertexPosition(i, v);
          v.applyMatrix4(mesh.matrixWorld);
          low = Math.min(low, v.y);
        }
        const floor = rig.minY - footDrop(REST_SPANS[f], s);
        // Đơn vị mesh; hiển thị nhân khoảng 0,83 đến 1, nên 0,015 mesh ~ 1,5 cm.
        expect(Math.abs(low - floor)).toBeLessThan(0.015);
        applyBoneShape(rigs[f], IDENTITY_BONE_SHAPE);
      });
    }
  }
});

describe('chiều cao hiển thị khớp heightCm (tư thế nghỉ, hình thể mặc định)', () => {
  const CASES: [(typeof FILES)[number], 'realistic' | 'chibi', 'male' | 'female', number][] = [
    ['male_real', 'realistic', 'male', 170],
    ['male_real', 'realistic', 'male', 190],
    ['female_real', 'realistic', 'female', 160],
    ['female_real', 'realistic', 'female', 175],
    ['chibi', 'chibi', 'male', 110],
    ['chibi', 'chibi', 'male', 85],
    ['chibi', 'chibi', 'male', 130],
  ];
  for (const [f, style, frame, cm] of CASES) {
    it(`${f} ${cm} cm: đỉnh cao nhất - đáy thấp nhất trên màn hình = ${cm} cm +-1`, async () => {
      const { buildRig, targetHeightM } = await import('./MpfbAvatar');
      const rig = buildRig({ scene: rigs[f] } as never);
      applyBoneShape(rigs[f], IDENTITY_BONE_SHAPE);
      rigs[f].updateMatrixWorld(true);
      const heightM = targetHeightM(style, frame, cm);
      const scale = heightM / rig.nativeHeight;
      const groundY = -rig.minY * scale;
      const mesh = body(rigs[f]);
      const v = new THREE.Vector3();
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < mesh.geometry.getAttribute('position').count; i++) {
        mesh.getVertexPosition(i, v);
        v.applyMatrix4(mesh.matrixWorld);
        lo = Math.min(lo, v.y);
        hi = Math.max(hi, v.y);
      }
      expect(Math.abs(lo * scale + groundY)).toBeLessThan(0.01);
      expect(Math.abs((hi - lo) * scale - heightM)).toBeLessThan(0.01);
    });
  }
});
