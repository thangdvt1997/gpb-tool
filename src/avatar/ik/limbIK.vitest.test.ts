import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  LimbIKController,
  createTwoBoneResult,
  solveTwoBone,
  KNEE_LIMITS,
  ELBOW_LIMITS,
  mapLimbBones,
  normalizeBoneName,
  applySeatPose,
  releaseSeatPose,
  reachTo,
  type GroundSampler,
} from './index';

function bone(name: string, x: number, y: number, z: number, parent?: THREE.Object3D): THREE.Bone {
  const b = new THREE.Bone();
  b.name = name;
  b.position.set(x, y, z);
  parent?.add(b);
  return b;
}

/** Dựng người que: chân dài 0,45 + 0,45, tay 0,30 + 0,28, tay thả xuống, gối/khuỷu hơi gập sẵn. */
function buildRig(names = { thigh: 'thigh', calf: 'calf', foot: 'foot', up: 'upperarm', low: 'lowerarm', hand: 'hand' }) {
  const root = new THREE.Group();
  const rb = bone('Root', 0, 0, 0, root);
  const pelvis = bone('pelvis', 0, 0.95, 0, rb);
  for (const [s, sx] of [['l', 0.09], ['r', -0.09]] as const) {
    const th = bone(`${names.thigh}_${s}`, sx, 0, 0, pelvis);
    const ca = bone(`${names.calf}_${s}`, 0, -0.45, 0.02, th);
    bone(`${names.foot}_${s}`, 0, -0.45, -0.02, ca);
  }
  const spine = bone('spine_03', 0, 0.5, 0, pelvis);
  for (const [s, sx] of [['l', 0.2], ['r', -0.2]] as const) {
    const up = bone(`${names.up}_${s}`, sx, 0, 0, spine);
    const lo = bone(`${names.low}_${s}`, 0, -0.3, 0.01, up);
    bone(`${names.hand}_${s}`, 0, -0.28, -0.01, lo);
  }
  root.updateMatrixWorld(true);
  return { root, pelvis };
}

const wp = (o: THREE.Object3D) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const get = (root: THREE.Object3D, n: string) => root.getObjectByName(n) as THREE.Bone;

function finite(root: THREE.Object3D): boolean {
  let ok = true;
  root.traverse((o) => {
    const m = o.matrixWorld.elements;
    for (const e of m) if (!Number.isFinite(e)) ok = false;
  });
  return ok;
}

describe('solveTwoBone', () => {
  const run = (t: THREE.Vector3, pole: THREE.Vector3 | null = V(0, 0, 5), lim = ELBOW_LIMITS) => {
    const out = createTwoBoneResult();
    return solveTwoBone(V(0, 0, 0), V(0, -0.3, 0.01), 0.3, 0.28, t, pole, lim, out);
  };
  it('đạt mục tiêu trong tầm với sai số dưới 1 mm và giữ độ dài đoạn', () => {
    const t = V(0.2, -0.3, 0.2);
    const r = run(t);
    expect(r.reachable).toBe(true);
    expect(r.end.distanceTo(t)).toBeLessThan(1e-3);
    expect(r.mid.length()).toBeCloseTo(0.3, 5);
    expect(r.mid.distanceTo(r.end)).toBeCloseTo(0.28, 5);
  });
  it('ngoài tầm: duỗi thẳng về phía mục tiêu, không NaN', () => {
    const r = run(V(2, 0, 0));
    expect(r.reachable).toBe(false);
    expect(Number.isFinite(r.end.x + r.mid.y)).toBe(true);
    expect(r.end.y).toBeCloseTo(0, 3);
    expect(r.end.x).toBeGreaterThan(0.57);
    expect(r.end.x).toBeLessThanOrEqual(0.58 + 1e-6);
    expect(r.error).toBeGreaterThan(1.4);
  });
  it('pole quyết định phía gập khuỷu', () => {
    const t = V(0, -0.4, 0.2);
    const a = run(t, V(0, 0, 5));
    const b = run(t, V(0, 0, -5));
    expect(a.mid.z).toBeGreaterThan(0);
    expect(b.mid.z).toBeLessThan(0);
    expect(a.end.distanceTo(b.end)).toBeLessThan(1e-6);
  });
  it('pole trùng trục hoặc null vẫn hợp lệ', () => {
    for (const pole of [null, V(0, -3, 0), V(0, 0, 0)]) {
      const r = run(V(0, -0.4, 0), pole);
      expect(Number.isFinite(r.mid.x + r.mid.y + r.mid.z)).toBe(true);
      expect(r.mid.distanceTo(r.end)).toBeCloseTo(0.28, 5);
    }
  });
  it('mục tiêu trùng gốc hoặc quá gần: kẹp theo giới hạn gập, không NaN', () => {
    for (const t of [V(0, 0, 0), V(0, -0.001, 0)]) {
      const r = run(t, V(0, 0, 1), KNEE_LIMITS);
      expect(Number.isFinite(r.end.x + r.end.y + r.end.z + r.mid.x)).toBe(true);
      expect(r.interior).toBeGreaterThanOrEqual(KNEE_LIMITS.minInterior - 1e-6);
      expect(r.reachable).toBe(false);
    }
  });
  it('góc trong luôn trong [min, π] (không ưỡn ngược)', () => {
    for (let i = 0; i < 50; i++) {
      const t = V(Math.sin(i) * 0.7, Math.cos(i * 1.7) * 0.7, Math.sin(i * 3.1) * 0.7);
      const r = run(t, V(0, 0, 1), KNEE_LIMITS);
      expect(r.interior).toBeLessThanOrEqual(Math.PI + 1e-9);
      expect(r.interior).toBeGreaterThanOrEqual(KNEE_LIMITS.minInterior - 1e-6);
    }
  });
  it('mục tiêu NaN giữ tư thế hiện tại', () => {
    const r = run(V(NaN, 0, 0));
    expect(Number.isFinite(r.mid.x + r.mid.y + r.end.z)).toBe(true);
    expect(r.reachable).toBe(false);
  });
});

describe('boneMap', () => {
  it('tìm xương MPFB theo tên chính xác', () => {
    const { root } = buildRig({ thigh: 'thigh', calf: 'calf', foot: 'foot', up: 'upperarm', low: 'lowerarm', hand: 'hand' });
    const m = mapLimbBones(root);
    expect(m.missing).toEqual([]);
    expect(m.limbs.armL?.mid.name).toBe('lowerarm_l');
    expect(m.limbs.legR?.end.name).toBe('foot_r');
    expect(m.pelvis?.name).toBe('pelvis');
  });
  it('dự phòng theo bí danh (mixamo) và theo cấu trúc cha-con', () => {
    expect(normalizeBoneName('mixamorig:LeftUpLeg')).toBe('leftupleg');
    const root = new THREE.Group();
    const hips = bone('mixamorig:Hips', 0, 1, 0, root);
    const ul = bone('mixamorig:LeftUpLeg', 0.1, 0, 0, hips);
    const l = bone('mixamorig:LeftLeg', 0, -0.4, 0, ul);
    bone('mixamorig:LeftFoot', 0, -0.4, 0, l);
    const m = mapLimbBones(root);
    expect(m.limbs.legL?.root.name).toBe('mixamorig:LeftUpLeg');
    expect(m.limbs.legR).toBeUndefined();
    expect(m.missing).toContain('thigh_r');
    expect(m.pelvis?.name).toBe('mixamorig:Hips');
  });
});

describe('LimbIKController', () => {
  it('tay chạm mục tiêu với sai số dưới 1 mm sau khi blend đầy', () => {
    const { root } = buildRig();
    const c = new LimbIKController(root);
    const target = wp(get(root, 'hand_l')).add(V(0.15, 0.35, 0.3));
    const t = c.targets.armL;
    t.active = true;
    t.position.copy(target);
    for (let i = 0; i < 120; i++) c.update(1 / 60);
    expect(wp(get(root, 'hand_l')).distanceTo(target)).toBeLessThan(1e-3);
    expect(c.lastReachable('armL')).toBe(true);
    expect(finite(root)).toBe(true);
  });
  it('hoạt động khi rig có cha xoay và co giãn', () => {
    const { root } = buildRig();
    root.position.set(3, 1, -2);
    root.rotation.y = 1.1;
    root.scale.setScalar(1.3);
    root.updateMatrixWorld(true);
    const c = new LimbIKController(root);
    const target = wp(get(root, 'foot_r')).add(V(0.1, 0.2, 0.25));
    c.targets.legR.active = true;
    c.targets.legR.position.copy(target);
    for (let i = 0; i < 120; i++) c.update(1 / 60);
    expect(wp(get(root, 'foot_r')).distanceTo(target)).toBeLessThan(1e-3);
  });
  it('trọng số 0 giữ nguyên tư thế (từng quaternion không đổi)', () => {
    const { root } = buildRig();
    const before = new Map<string, THREE.Quaternion>();
    root.traverse((o) => before.set(o.uuid, o.quaternion.clone()));
    const c = new LimbIKController(root);
    c.targets.armL.active = true;
    c.targets.armL.weight = 0;
    c.targets.armL.position.set(5, 5, 5);
    for (let i = 0; i < 10; i++) c.update(1 / 60);
    root.traverse((o) => expect(o.quaternion.equals(before.get(o.uuid) as THREE.Quaternion)).toBe(true));
  });
  it('blend mượt tăng dần theo thời gian và về 0 khi mất mục tiêu', () => {
    const { root } = buildRig();
    const c = new LimbIKController(root);
    const rest = wp(get(root, 'hand_r'));
    const target = rest.clone().add(V(-0.1, 0.4, 0.3));
    const t = c.targets.armR;
    t.active = true;
    t.position.copy(target);
    c.update(1 / 60);
    const d1 = wp(get(root, 'hand_r')).distanceTo(rest);
    expect(d1).toBeGreaterThan(0);
    expect(c.weights.armR).toBeGreaterThan(0);
    expect(c.weights.armR).toBeLessThan(0.5);
    let prev = c.weights.armR;
    for (let i = 0; i < 20; i++) {
      c.update(1 / 60);
      expect(c.weights.armR).toBeGreaterThanOrEqual(prev);
      prev = c.weights.armR;
    }
    // mất mục tiêu: không giật về gốc tọa độ, trở lại tư thế gốc
    t.active = false;
    for (let i = 0; i < 300; i++) {
      c.update(1 / 60);
      const h = wp(get(root, 'hand_r'));
      expect(h.length()).toBeGreaterThan(0.3);
    }
    expect(wp(get(root, 'hand_r')).distanceTo(rest)).toBeLessThan(1e-3);
  });
  it('khi animation ghi đè mỗi khung, IK không cộng dồn', () => {
    const { root } = buildRig();
    const c = new LimbIKController(root);
    const up = get(root, 'upperarm_l');
    const lo = get(root, 'lowerarm_l');
    const q0 = up.quaternion.clone();
    const target = wp(get(root, 'hand_l')).add(V(0.2, 0.3, 0.2));
    c.targets.armL.active = true;
    c.targets.armL.position.copy(target);
    let h1 = new THREE.Vector3();
    for (let i = 0; i < 200; i++) {
      up.quaternion.copy(q0); // giả lập animation ghi tư thế gốc
      lo.quaternion.identity();
      c.update(1 / 60);
      h1 = wp(get(root, 'hand_l'));
    }
    expect(h1.distanceTo(target)).toBeLessThan(1e-3);
  });
  it('mục tiêu ngoài tầm: duỗi thẳng, báo không với tới, không NaN', () => {
    const { root } = buildRig();
    const c = new LimbIKController(root);
    const far = V(10, 1, 0);
    c.targets.armL.active = true;
    c.targets.armL.position.copy(far);
    for (let i = 0; i < 120; i++) c.update(1 / 60);
    expect(c.lastReachable('armL')).toBe(false);
    expect(finite(root)).toBe(true);
    const sh = wp(get(root, 'upperarm_l'));
    expect(wp(get(root, 'hand_l')).distanceTo(sh)).toBeCloseTo(0.58, 2);
    expect(c.canReach('armL', far)).toBe(false);
  });
  it('công tắc enabled tắt từng solver', () => {
    const { root } = buildRig();
    const c = new LimbIKController(root);
    const rest = wp(get(root, 'hand_l'));
    c.enabled.armL = false;
    c.targets.armL.active = true;
    c.targets.armL.position.set(0.5, 1.5, 0.3);
    for (let i = 0; i < 60; i++) c.update(1 / 60);
    expect(wp(get(root, 'hand_l')).distanceTo(rest)).toBeLessThan(1e-6);
  });
  it('thiếu xương: bỏ qua chi đó, không ném lỗi', () => {
    const root = new THREE.Group();
    bone('pelvis', 0, 1, 0, root);
    const c = new LimbIKController(root);
    c.targets.armL.active = true;
    c.targets.armL.position.set(1, 1, 1);
    expect(() => c.update(1 / 60)).not.toThrow();
    expect(c.hasLimb('armL')).toBe(false);
  });
  it('dt bất thường (0, âm, NaN, rất lớn) không sinh NaN', () => {
    const { root } = buildRig();
    const c = new LimbIKController(root);
    c.targets.legL.active = true;
    c.targets.legL.position.set(0.1, 0.3, 0.3);
    for (const dt of [0, -1, NaN, 100]) c.update(dt);
    expect(finite(root)).toBe(true);
  });
  it('hướng đầu mút (bàn chân) theo quaternion mục tiêu', () => {
    const { root } = buildRig();
    const c = new LimbIKController(root);
    const t = c.targets.legL;
    t.active = true;
    t.position.copy(wp(get(root, 'foot_l')));
    t.useOrientation = true;
    t.quaternion.setFromAxisAngle(V(1, 0, 0), -0.4);
    for (let i = 0; i < 200; i++) c.update(1 / 60);
    const q = new THREE.Quaternion();
    get(root, 'foot_l').matrixWorld.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    expect(q.angleTo(t.quaternion)).toBeLessThan(0.01);
  });
});

describe('bám sàn', () => {
  // Sàn có bậc: x > 0.05 cao 0,12 m.
  const step: GroundSampler = (x, _z, out) => {
    out.y = x > 0.05 ? 0.12 : 0;
    out.nx = 0;
    out.ny = 1;
    out.nz = 0;
    return true;
  };
  it('sàn phẳng: không thay đổi tư thế', () => {
    const { root, pelvis } = buildRig();
    const c = new LimbIKController(root);
    c.ground = { sampler: (_x, _z, o) => ((o.y = 0), (o.nx = 0), (o.ny = 1), (o.nz = 0), true), maxPelvisDrop: 0.3, maxPelvisRaise: 0.1, maxFootTilt: 0, smoothRate: 30 };
    const f = wp(get(root, 'foot_l'));
    const py = wp(pelvis).y;
    for (let i = 0; i < 60; i++) c.update(1 / 60);
    expect(wp(get(root, 'foot_l')).distanceTo(f)).toBeLessThan(1e-4);
    expect(wp(pelvis).y).toBeCloseTo(py, 4);
  });
  it('một chân lên bậc: bàn chân nâng theo bậc, hông nâng theo chân thấp (không dưới hạn)', () => {
    const { root, pelvis } = buildRig();
    // chân trái ở x=+0.09 (lên bậc 0,12), chân phải x=-0.09 (sàn 0)
    const c = new LimbIKController(root);
    c.ground = { sampler: step, maxPelvisDrop: 0.3, maxPelvisRaise: 0.1, maxFootTilt: 0, smoothRate: 40 };
    const yL0 = wp(get(root, 'foot_l')).y;
    const yR0 = wp(get(root, 'foot_r')).y;
    for (let i = 0; i < 180; i++) c.update(1 / 60);
    expect(wp(get(root, 'foot_l')).y).toBeCloseTo(yL0 + 0.12, 3);
    expect(wp(get(root, 'foot_r')).y).toBeCloseTo(yR0, 3);
    // chân thấp vẫn ở 0 nên hông không đổi (min offset = 0)
    expect(wp(pelvis).y).toBeCloseTo(0.95, 3);
  });
  it('sàn thấp hơn dưới một chân: hạ hông, chân thấp duỗi tới sàn, giới hạn hạ tối đa', () => {
    const { root, pelvis } = buildRig();
    const c = new LimbIKController(root);
    const drop: GroundSampler = (x, _z, out) => ((out.y = x > 0.05 ? -0.2 : -0.2 + 0.0), (out.nx = 0), (out.ny = 1), (out.nz = 0), true);
    const mixed: GroundSampler = (x, z, out) => {
      drop(x, z, out);
      out.y = x > 0.05 ? -0.1 : 0;
      return true;
    };
    c.ground = { sampler: mixed, maxPelvisDrop: 0.05, maxPelvisRaise: 0.1, maxFootTilt: 0, smoothRate: 40 };
    for (let i = 0; i < 180; i++) c.update(1 / 60);
    expect(wp(pelvis).y).toBeCloseTo(0.95 - 0.05, 3);
    expect(finite(root)).toBe(true);
  });
  it('khi animation ghi đè vị trí hông mỗi khung, độ lệch không cộng dồn', () => {
    const { root, pelvis } = buildRig();
    const c = new LimbIKController(root);
    c.ground = { sampler: (x, _z, o) => ((o.y = x > 0.05 ? -0.1 : -0.1), (o.nx = 0), (o.ny = 1), (o.nz = 0), true), maxPelvisDrop: 0.3, maxPelvisRaise: 0.1, maxFootTilt: 0, smoothRate: 60 };
    // sàn cả hai bên thấp hơn gốc 0,1: sampler tại gốc cũng -0,1 nên offset 0; dùng sàn khác tại gốc
    const s: GroundSampler = (x, z, o) => ((o.y = Math.abs(x) < 0.01 ? 0 : -0.1), (o.nx = 0), (o.ny = 1), (o.nz = 0), z === z);
    c.ground.sampler = s;
    for (let i = 0; i < 240; i++) {
      pelvis.position.set(0, 0.95, 0);
      c.update(1 / 60);
    }
    expect(wp(pelvis).y).toBeCloseTo(0.85, 3);
  });
  it('chân đang vung (nhấc cao) bị giảm trọng số, không khóa', () => {
    const { root } = buildRig();
    const c = new LimbIKController(root);
    c.ground = { sampler: step, maxPelvisDrop: 0.3, maxPelvisRaise: 0.1, maxFootTilt: 0, smoothRate: 40 };
    const th = get(root, 'thigh_l');
    th.rotation.x = -1.0; // nhấc chân trái ra trước
    root.updateMatrixWorld(true);
    for (let i = 0; i < 120; i++) c.update(1 / 60);
    expect(c.weights.legL).toBeLessThan(0.2);
  });
});

describe('ngồi và với tay', () => {
  it('ngồi: hông về điểm neo, chân xuống sàn trước ghế, tay lên bàn', () => {
    const { root, pelvis } = buildRig();
    root.position.set(1, 0, 2);
    root.rotation.y = Math.PI; // nhân vật quay mặt về -z như yaw = π
    root.updateMatrixWorld(true);
    const c = new LimbIKController(root);
    const anchor = V(1, 0.45, 2);
    applySeatPose(c, { anchor, yaw: Math.PI, floorY: 0 }, { left: V(0.85, 0.8, 1.6), right: V(1.15, 0.8, 1.6) });
    for (let i = 0; i < 240; i++) c.update(1 / 60);
    expect(wp(pelvis).distanceTo(V(1, 0.55, 2))).toBeLessThan(2e-3);
    const fl = wp(get(root, 'foot_l'));
    expect(fl.y).toBeCloseTo(0.08, 2);
    // yaw = π: hướng nhìn là -z, chân phải ở phía trước (z nhỏ hơn hông)
    expect(fl.z).toBeLessThan(2 - 0.2);
    expect(wp(get(root, 'hand_l')).distanceTo(V(0.85, 0.8, 1.6))).toBeLessThan(1e-3);
    expect(wp(get(root, 'hand_r')).distanceTo(V(1.15, 0.8, 1.6))).toBeLessThan(1e-3);
    // gối gập về phía trước
    const knee = wp(get(root, 'calf_l'));
    expect(knee.z).toBeLessThan(wp(pelvis).z);
    expect(finite(root)).toBe(true);
  });
  it('đứng dậy: releaseSeatPose đưa hông và chi về tư thế gốc', () => {
    const { root, pelvis } = buildRig();
    const c = new LimbIKController(root);
    const p0 = wp(pelvis);
    const f0 = wp(get(root, 'foot_l'));
    applySeatPose(c, { anchor: V(0, 0.45, 1), yaw: 0, floorY: 0 });
    for (let i = 0; i < 120; i++) c.update(1 / 60);
    releaseSeatPose(c);
    for (let i = 0; i < 400; i++) c.update(1 / 60);
    expect(wp(pelvis).distanceTo(p0)).toBeLessThan(1e-3);
    expect(wp(get(root, 'foot_l')).distanceTo(f0)).toBeLessThan(1e-3);
  });
  it('reachTo: trong tầm thì với được, ngoài tầm trả false và tắt mục tiêu', () => {
    const { root } = buildRig();
    const c = new LimbIKController(root);
    const near = wp(get(root, 'upperarm_r')).add(V(0, -0.1, 0.45));
    expect(reachTo(c, 'armR', near)).toBe(true);
    for (let i = 0; i < 120; i++) c.update(1 / 60);
    expect(wp(get(root, 'hand_r')).distanceTo(near)).toBeLessThan(1e-3);
    expect(reachTo(c, 'armR', V(0, 0, 9))).toBe(false);
    expect(c.targets.armR.active).toBe(false);
  });
  it('tay nắm cửa: khuỷu nằm dưới đường vai-tay nhờ pole mặc định', () => {
    const { root } = buildRig();
    const c = new LimbIKController(root);
    const knob = wp(get(root, 'upperarm_l')).add(V(0.1, -0.05, 0.5));
    expect(reachTo(c, 'armL', knob)).toBe(true);
    for (let i = 0; i < 120; i++) c.update(1 / 60);
    const elbow = wp(get(root, 'lowerarm_l'));
    const sh = wp(get(root, 'upperarm_l'));
    const mid = sh.clone().add(knob).multiplyScalar(0.5);
    expect(elbow.y).toBeLessThan(mid.y);
  });
});
