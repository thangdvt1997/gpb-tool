import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LimbIKController, FingerGrip, applySeatPose, deskHandPoints, gripAt, releaseSeatPose, GRIP_PROFILES } from './index';
import { loadRig } from './rigLoader.testutil';

const FILES = ['male_real', 'female_real', 'chibi'] as const;
const SCALES: Record<string, number> = { male_real: 1, female_real: 1, chibi: 1.4 };
const wp = (o: THREE.Object3D) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);

function finite(root: THREE.Object3D): boolean {
  let ok = true;
  root.traverse((o) => {
    if (o.matrixWorld.elements.some((x) => !Number.isFinite(x))) ok = false;
  });
  return ok;
}

async function fresh(name: string) {
  const s = await loadRig(name);
  const h = new THREE.Group();
  h.scale.setScalar(SCALES[name]);
  h.add(s);
  h.updateMatrixWorld(true);
  return { s, h };
}

describe.each(FILES)('ngồi và cầm trên rig thật %s', (name) => {
  it('ngồi: hông khớp mặt ngồi, mắt cá chạm sàn, tay lên bàn, không NaN; đứng dậy trả về', async () => {
    const { h } = await fresh(name);
    const k = SCALES[name];
    const ctrl = new LimbIKController(h);
    // Hình học ghế tuyệt đối (mặt ghế 0,46 m, bàn 0,74 m); rig quay mặt +Z nên yaw = 0.
    const anchor = new THREE.Vector3(0.3, 0.46, -0.2);
    const yaw = 0;
    const above = 0.1;
    const ankleH = 0.08;
    const desk = deskHandPoints(anchor, yaw, 0.74, 0.3 * Math.min(1, k), 0.15);
    console.log(`[${name}] chân dài ${ctrl.limbLength('legL').toFixed(3)} m, tay dài ${ctrl.limbLength('armL').toFixed(3)} m`);
    const apply = () => applySeatPose(ctrl, { anchor, yaw, floorY: 0, pelvisAboveSeat: above, ankleHeight: ankleH }, desk);
    for (let i = 0; i < 180; i++) {
      apply();
      ctrl.update(1 / 60);
    }
    h.updateMatrixWorld(true);
    expect(finite(h)).toBe(true);
    const pel = wp(ctrl.bones.pelvis!);
    console.log(`[${name}] hông lệch ${(pel.distanceTo(anchor.clone().setY(anchor.y + above)) * 100).toFixed(2)} cm`);
    expect(pel.distanceTo(anchor.clone().setY(anchor.y + above))).toBeLessThan(0.01);
    for (const id of ['legL', 'legR'] as const) {
      const foot = wp(ctrl.chain(id)!.bones.end);
      console.log(`[${name}] ${id} mắt cá y=${(foot.y * 100).toFixed(2)} cm, sai số IK ${(ctrl.lastError(id) * 1000).toFixed(2)} mm`);
      // Rig chân quá ngắn so với ghế (chibi): chân duỗi hết cỡ hướng về sàn, chỉ cần hữu hạn và không chui xuống sàn.
      if (ctrl.lastReachable(id)) expect(Math.abs(foot.y - ankleH)).toBeLessThan(0.02);
      else expect(foot.y).toBeGreaterThan(0);
      // Chân đặt phía trước hông theo hướng nhìn.
      const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      expect(foot.clone().sub(pel).setY(0).dot(fwd)).toBeGreaterThan(0.05);
    }
    for (const [id, p] of [['armL', desk.left], ['armR', desk.right]] as const) {
      const err = wp(ctrl.chain(id)!.bones.end).distanceTo(p!);
      console.log(`[${name}] ${id} tay-bàn ${(err * 1000).toFixed(2)} mm, với tới=${ctrl.targets[id].active}`);
      if (ctrl.targets[id].active) expect(err).toBeLessThan(0.01);
    }
    releaseSeatPose(ctrl);
    const rest = wp(ctrl.chain('legL')!.bones.end);
    for (let i = 0; i < 180; i++) ctrl.update(1 / 60);
    h.updateMatrixWorld(true);
    expect(ctrl.pelvisWeight).toBeLessThan(0.01);
    expect(wp(ctrl.chain('legL')!.bones.end).distanceTo(rest)).toBeGreaterThan(0.05);
    expect(finite(h)).toBe(true);
  });

  it('cầm cốc: cổ tay tới socket, ngón khép lại gần bàn tay, nhả thì về tư thế gốc', async () => {
    const { h } = await fresh(name);
    const k = SCALES[name];
    const ctrl = new LimbIKController(h);
    const handBone = ctrl.chain('armR')!.bones.end;
    const fingers = new FingerGrip(handBone);
    expect(fingers.fingerCount).toBe(5);
    h.updateMatrixWorld(true);
    const tips = () => {
      const out: THREE.Object3D[] = [];
      handBone.traverse((o) => {
        if (/_03_r$/.test(o.name)) out.push(o);
      });
      return out;
    };
    const spread = () => {
      handBone.updateWorldMatrix(true, true);
      const hp = wp(handBone);
      return tips().reduce((s, t) => s + wp(t).distanceTo(hp), 0);
    };
    const open = spread();
    const restQ = new Map<THREE.Object3D, string>();
    handBone.traverse((o) => restQ.set(o, o.quaternion.toArray().join(',')));

    const shoulder = ctrl.limbRootPosition('armR', new THREE.Vector3())!.clone();
    const socket = shoulder.clone().add(new THREE.Vector3(-0.1, -0.5, 0.45).multiplyScalar(ctrl.limbLength('armR')));
    expect(ctrl.canReach('armR', socket)).toBe(true);
    let ok = false;
    for (let i = 0; i < 120; i++) {
      ok = gripAt(ctrl, fingers, 'R', socket, 'cup');
      ctrl.update(1 / 60);
      fingers.update(1 / 60);
      h.updateMatrixWorld(true);
    }
    expect(ok).toBe(true);
    const wrist = wp(handBone);
    const expectOff = GRIP_PROFILES.cup.palmOffset;
    const d = wrist.distanceTo(socket);
    console.log(`[${name}] cổ tay cách socket ${(d * 100).toFixed(2)} cm (palmOffset ${expectOff * 100} cm); ngón: ${(open * 100).toFixed(1)} -> ${(spread() * 100).toFixed(1)} cm`);
    expect(Math.abs(d - expectOff)).toBeLessThan(0.01);
    expect(spread()).toBeLessThan(open * 0.9);
    expect(fingers.closed).toBeGreaterThan(0.95);
    expect(finite(h)).toBe(true);

    // Socket ngoài tầm: tay tắt, ngón nhả.
    const far = shoulder.clone().add(new THREE.Vector3(0, 0, 3));
    expect(gripAt(ctrl, fingers, 'R', far, 'phone')).toBe(false);
    for (let i = 0; i < 240; i++) {
      ctrl.update(1 / 60);
      fingers.update(1 / 60);
    }
    expect(fingers.closed).toBe(0);
    handBone.traverse((o) => {
      const a = o.quaternion.toArray();
      const b = restQ.get(o)!.split(',').map(Number);
      if (/_0\d_r$/.test(o.name)) a.forEach((x, i) => expect(Math.abs(x - b[i]), o.name).toBeLessThan(1e-6));
    });
  });
});
