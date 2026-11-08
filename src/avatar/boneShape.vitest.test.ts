import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { cameraHeightsFor } from '../scene/controls/eyeHeight';
import { makeDefaultLook } from '../fashion/defaults';
import { BODY_LIMITS_BY_STYLE, validate } from '../fashion/rules';
import { setSliderValue } from '../wardrobe/shapeSliders';
import {
  BONE_SHAPE_LIMITS,
  IDENTITY_BONE_SHAPE,
  REST_SPANS,
  applyBoneShape,
  boneShapeOf,
  footDrop,
  heightDelta,
  measureRestSpans,
  rigSupportsBoneShape,
  shapedHeightM,
  type BoneShape,
} from './boneShape';
import { buildRig, createPoseWork, applyMpfbPose } from './MpfbAvatar';
import { computePose } from './animation';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadRig } from './ik/rigLoader.testutil';

const FILES = ['male_real', 'female_real', 'chibi'] as const;
type File = (typeof FILES)[number];
const rigs = {} as Record<File, THREE.Object3D>;

function bodyMesh(root: THREE.Object3D): THREE.SkinnedMesh {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isSkinnedMesh && m.morphTargetDictionary && 'bodyBelly' in m.morphTargetDictionary) found = m;
  });
  if (!found) throw new Error('không thấy mesh thân');
  return found;
}
function nativeHeight(root: THREE.Object3D): number {
  // Như buildRig: bỏ morph gpb_* (chúng chỉ nở ngang chi) để số đo nghỉ giữ nguyên.
  const m = bodyMesh(root);
  const g = m.geometry;
  const dict = m.morphTargetDictionary as Record<string, number>;
  const all = g.morphAttributes.position;
  g.morphAttributes.position = Object.entries(dict).filter(([n]) => !n.startsWith('gpb_')).map(([, i]) => all[i]);
  g.boundingBox = null;
  g.computeBoundingBox();
  const bb = g.boundingBox as unknown as THREE.Box3;
  const h = bb.max.y - bb.min.y;
  g.morphAttributes.position = all;
  g.boundingBox = null;
  return h;
}
const pos = (root: THREE.Object3D, name: string): THREE.Vector3 => {
  root.updateMatrixWorld(true);
  return (root.getObjectByName(name) as THREE.Object3D).getWorldPosition(new THREE.Vector3());
};
const shape = (o: Partial<BoneShape>): BoneShape => ({ ...IDENTITY_BONE_SHAPE, ...o });

beforeAll(async () => {
  for (const f of FILES) {
    rigs[f] = await loadRig(f);
    // Lần gọi đầu phải ở tư thế nghỉ (ghi cache hướng giãn và hướng nghỉ cột sống).
    applyBoneShape(rigs[f], IDENTITY_BONE_SHAPE);
  }
});

describe('boneShape trên 3 GLB thật', () => {
  for (const f of FILES) {
    describe(f, () => {
      it('rig có đủ xương để hỗ trợ', () => {
        const names: string[] = [];
        rigs[f].traverse((o) => names.push(o.name));
        expect(rigSupportsBoneShape(names)).toBe(true);
        expect(rigSupportsBoneShape(['hand_l'])).toBe(false);
      });

      it('bảng REST_SPANS khớp số đo từ GLB', () => {
        const m = measureRestSpans(rigs[f], nativeHeight(rigs[f]));
        for (const k of ['native', 'legSpan', 'neckSpan'] as const) expect(m[k]).toBeCloseTo(REST_SPANS[f][k], 5);
      });

      it('chân dài hơn: bàn chân thấp xuống đúng footDrop, đầu cao lên đúng heightDelta, bàn chân không bị kéo giãn', () => {
        const r = rigs[f];
        applyBoneShape(r, IDENTITY_BONE_SHAPE);
        const foot0 = pos(r, 'foot_l').y;
        const head0 = pos(r, 'head').y;
        const toe0 = pos(r, 'ball_l').distanceTo(pos(r, 'foot_l'));
        const s = shape({ legL: 1.15, legR: 1.15 });
        applyBoneShape(r, s);
        const drop = footDrop(REST_SPANS[f], s);
        expect(drop).toBeGreaterThan(0.02);
        expect(foot0 - pos(r, 'foot_l').y).toBeCloseTo(drop, 2);
        // Hông giữ nguyên, nên đầu không đổi so với hông; chiều cao so với sàn tăng đúng heightDelta (= drop khi cổ giữ nguyên).
        expect(pos(r, 'head').y).toBeCloseTo(head0, 3);
        expect(heightDelta(REST_SPANS[f], s)).toBeCloseTo(drop, 6);
        // Bù ngược gần đúng (hướng giãn không trùng trục xương): bàn chân lệch tối đa 3% khi chân dài +15%.
        expect(Math.abs(pos(r, 'ball_l').distanceTo(pos(r, 'foot_l')) / toe0 - 1)).toBeLessThan(0.03);
        applyBoneShape(r, IDENTITY_BONE_SHAPE);
        expect(pos(r, 'foot_l').y).toBeCloseTo(foot0, 5);
      });

      it('chân ngắn: bàn chân lên, footDrop âm', () => {
        const r = rigs[f];
        applyBoneShape(r, IDENTITY_BONE_SHAPE);
        const foot0 = pos(r, 'foot_r').y;
        const s = shape({ legL: 0.85, legR: 0.85 });
        applyBoneShape(r, s);
        expect(footDrop(REST_SPANS[f], s)).toBeLessThan(-0.02);
        expect(pos(r, 'foot_r').y - foot0).toBeCloseTo(-footDrop(REST_SPANS[f], s), 2);
        applyBoneShape(r, IDENTITY_BONE_SHAPE);
      });

      it('tay dài hơn (tư thế thả như khi hiển thị): tay xa vai hơn đúng hệ số, bàn tay giữ cỡ, tay kia không đổi', () => {
        const rig = buildRig({ scene: rigs[f] } as unknown as GLTF);
        const work = createPoseWork();
        const measure = (side: 'l' | 'r'): [number, number] => {
          applyMpfbPose(rig, computePose('idle', 0), work);
          rig.root.updateMatrixWorld(true);
          return [pos(rig.root, `upperarm_${side}`).distanceTo(pos(rig.root, `hand_${side}`)), pos(rig.root, `hand_${side}`).distanceTo(pos(rig.root, `middle_01_${side}`))];
        };
        applyBoneShape(rig.root, IDENTITY_BONE_SHAPE);
        const [reachR0, palmR0] = measure('r');
        const [reachL0] = measure('l');
        applyBoneShape(rig.root, shape({ armR: 1.15 }));
        const [reachR, palmR] = measure('r');
        expect(reachR / reachR0).toBeGreaterThan(1.13);
        expect(reachR / reachR0).toBeLessThan(1.17);
        expect(Math.abs(palmR / palmR0 - 1)).toBeLessThan(0.03);
        expect(measure('l')[0]).toBeCloseTo(reachL0, 5);
        applyBoneShape(rig.root, IDENTITY_BONE_SHAPE);
      });

      it('cổ dài hơn nâng đầu; đầu giữ cỡ (bù ngược gần đúng)', () => {
        const r = rigs[f];
        applyBoneShape(r, IDENTITY_BONE_SHAPE);
        const head0 = pos(r, 'head').y;
        const s = shape({ neck: 1.25 });
        applyBoneShape(r, s);
        expect(pos(r, 'head').y - head0).toBeGreaterThan(0.002);
        const ws = new THREE.Vector3();
        (r.getObjectByName('head') as THREE.Object3D).matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), ws);
        const ws0 = new THREE.Vector3();
        applyBoneShape(r, IDENTITY_BONE_SHAPE);
        r.updateMatrixWorld(true);
        (r.getObjectByName('head') as THREE.Object3D).matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), ws0);
        expect(Math.abs(ws.y / ws0.y - 1)).toBeLessThan(0.03);
      });

      it('lưng: gù đẩy đầu ra trước (+Z), ưỡn kéo ra sau, về 0 thì trả đúng chỗ; biên độ nhỏ', () => {
        const r = rigs[f];
        applyBoneShape(r, IDENTITY_BONE_SHAPE);
        const h0 = pos(r, 'head');
        applyBoneShape(r, shape({ backRad: BONE_SHAPE_LIMITS.backRad }));
        const hHunch = pos(r, 'head');
        applyBoneShape(r, shape({ backRad: -BONE_SHAPE_LIMITS.backRad }));
        const hArch = pos(r, 'head');
        expect(hHunch.z).toBeGreaterThan(h0.z + 0.005);
        expect(hArch.z).toBeLessThan(h0.z - 0.005);
        expect(hHunch.distanceTo(h0)).toBeLessThan(0.25 * REST_SPANS[f].native);
        applyBoneShape(r, IDENTITY_BONE_SHAPE);
        expect(pos(r, 'head').distanceTo(h0)).toBeLessThan(1e-5);
      });

      it('vỏ trang phục và phụ kiện dùng chung skeleton nên bám theo: đỉnh vỏ trùng đỉnh thân sau khi đổi xương', () => {
        const r = rigs[f];
        const body = bodyMesh(r);
        // Giống MpfbOutfit: vỏ bind vào skeleton và bindMatrix của thân.
        const shell = new THREE.SkinnedMesh(body.geometry, new THREE.MeshBasicMaterial());
        shell.bindMode = body.bindMode;
        shell.bind(body.skeleton, body.bindMatrix);
        expect(shell.skeleton).toBe(body.skeleton);
        const hat = new THREE.Object3D();
        (r.getObjectByName('head') as THREE.Object3D).add(hat);
        applyBoneShape(r, shape({ legL: 1.12, legR: 1.12, armL: 1.1, armR: 1.1, neck: 1.2, backRad: 0.15 }));
        r.updateMatrixWorld(true);
        body.skeleton.update();
        const a = new THREE.Vector3();
        const b = new THREE.Vector3();
        const n = body.geometry.getAttribute('position').count;
        let moved = 0;
        let worst = 0;
        for (let i = 0; i < n; i += 97) {
          body.getVertexPosition(i, a);
          shell.getVertexPosition(i, b);
          worst = Math.max(worst, a.distanceTo(b));
          const rest = new THREE.Vector3().fromBufferAttribute(body.geometry.getAttribute('position'), i);
          if (a.distanceTo(rest) > 0.01) moved++;
        }
        expect(worst).toBeLessThan(1e-6);
        expect(moved).toBeGreaterThan(10);
        // Phụ kiện gắn xương đầu: đi theo đầu, không bị co giãn do cổ.
        const hs = new THREE.Vector3();
        hat.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), hs);
        // Bù ngược gần đúng: đầu/phụ kiện lệch cỡ tối đa 3% khi cổ +20%.
        for (const v of [hs.x, hs.y, hs.z]) expect(Math.abs(v - 1)).toBeLessThan(0.03);
        hat.removeFromParent();
        applyBoneShape(r, IDENTITY_BONE_SHAPE);
      });

      it('không có NaN và vẫn bị bó trong giới hạn khi cực đoan', () => {
        const r = rigs[f];
        applyBoneShape(r, shape({ legL: 1.15, legR: 0.85, armL: 0.85, armR: 1.15, neck: 0.7, backRad: -0.2 }));
        r.updateMatrixWorld(true);
        r.traverse((o) => {
          for (const e of o.matrixWorld.elements) expect(Number.isFinite(e)).toBe(true);
        });
        applyBoneShape(r, IDENTITY_BONE_SHAPE);
      });
    });
  }
});

describe('boneShapeOf: look -> hệ số, giới hạn an toàn', () => {
  it('look mặc định và null là đơn vị', () => {
    expect(boneShapeOf(null)).toEqual(IDENTITY_BONE_SHAPE);
    expect(boneShapeOf(makeDefaultLook())).toEqual(IDENTITY_BONE_SHAPE);
  });

  it('tối đa của khoảng dữ liệu vẫn nằm trong giới hạn an toàn, cả hai kiểu', () => {
    for (const style of ['realistic', 'chibi'] as const) {
      let l = makeDefaultLook();
      l = { ...l, bodyStyle: style };
      const lim = BODY_LIMITS_BY_STYLE[style];
      for (const [id, r] of [['armLength', lim.arm.length], ['legLength', lim.leg.length], ['neckLength', lim.torso.neckLength], ['back', lim.torso.back]] as const) {
        for (const v of [r.min, r.max]) {
          const s = boneShapeOf(setSliderValue(l, id, v));
          for (const k of ['armL', 'armR', 'legL', 'legR'] as const) {
            expect(s[k]).toBeGreaterThanOrEqual(BONE_SHAPE_LIMITS.limb.min);
            expect(s[k]).toBeLessThanOrEqual(BONE_SHAPE_LIMITS.limb.max);
          }
          expect(s.neck).toBeGreaterThanOrEqual(BONE_SHAPE_LIMITS.neck.min);
          expect(s.neck).toBeLessThanOrEqual(BONE_SHAPE_LIMITS.neck.max);
          expect(Math.abs(s.backRad)).toBeLessThanOrEqual(BONE_SHAPE_LIMITS.backRad + 1e-9);
        }
      }
    }
  });

  it('thanh trượt ghi vào look và đọc lại ra hệ số tương ứng, đối xứng hai bên', () => {
    let l = makeDefaultLook();
    l = setSliderValue(l, 'legLength', 0.5);
    l = setSliderValue(l, 'armLength', -0.5);
    const s = boneShapeOf(l);
    expect(s.legL).toBeCloseTo(1.15, 6);
    expect(s.legR).toBeCloseTo(1.15, 6);
    expect(s.armL).toBeCloseTo(0.85, 6);
    expect(s.armR).toBeCloseTo(0.85, 6);
  });

  it('look cũ thiếu các trường tay/chân/cổ/lưng được migrate về 0 (hệ số đơn vị), dữ liệu hỏng không làm NaN', () => {
    const old = JSON.parse(JSON.stringify(makeDefaultLook())) as Record<string, any>;
    delete old.body.torso.neckLength;
    delete old.body.torso.back;
    delete old.body.arms;
    delete old.body.legs;
    const v = validate(old).look;
    expect(v.body.torso.back).toBe(0);
    expect(v.body.arms.left.length).toBe(0);
    expect(v.body.legs.right.length).toBe(0);
    expect(boneShapeOf(v)).toEqual(IDENTITY_BONE_SHAPE);
    old.body.torso.back = Number.NaN;
    old.body.legs = { left: { length: 'x' } };
    const w = validate(old).look;
    const s = boneShapeOf(w);
    for (const k of Object.keys(s) as (keyof BoneShape)[]) expect(Number.isFinite(s[k])).toBe(true);
    // Hỏng ở tầng boneShapeOf (không qua validate) cũng không sinh NaN.
    const bad = makeDefaultLook();
    (bad.body.torso as { back: number }).back = Number.NaN;
    expect(Number.isFinite(boneShapeOf(bad).backRad)).toBe(true);
  });
});

describe('tầm mắt camera và mặt sàn theo chiều dài chân mới', () => {
  it('chân dài hơn nâng tầm mắt; chân ngắn hạ; cổ cũng đổi', () => {
    for (const f of FILES) {
      const base = 1.7;
      const sp = REST_SPANS[f];
      const same = shapedHeightM(base, sp, IDENTITY_BONE_SHAPE);
      expect(same).toBeCloseTo(base, 9);
      const tall = shapedHeightM(base, sp, shape({ legL: 1.15, legR: 1.15 }));
      const short = shapedHeightM(base, sp, shape({ legL: 0.85, legR: 0.85 }));
      expect(tall).toBeGreaterThan(base);
      expect(short).toBeLessThan(base);
      expect(cameraHeightsFor(tall).eyeStand).toBeGreaterThan(cameraHeightsFor(base).eyeStand);
      expect(cameraHeightsFor(short).eyeStand).toBeLessThan(cameraHeightsFor(base).eyeStand);
      expect(shapedHeightM(base, sp, shape({ neck: 1.25 }))).toBeGreaterThan(base);
    }
  });

  it('mặt sàn: đáy chân thấp nhất sau khi đổi = minY - footDrop (chân lệch bên lấy chân dài hơn)', () => {
    const sp = REST_SPANS.male_real;
    expect(footDrop(sp, shape({ legL: 1.1, legR: 1.0 }))).toBeCloseTo(0.1 * sp.legSpan, 9);
    expect(footDrop(sp, shape({ legL: 0.9, legR: 0.95 }))).toBeCloseTo(-0.05 * sp.legSpan, 9);
  });
});
