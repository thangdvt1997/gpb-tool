// NPC bảo vệ ở bàn an ninh tầng 7. Hình học tương đương FallbackAvatar (cao khoảng 1,7 m, mặt hướng +z),
// nhưng gộp theo nhóm cử động để chỉ tốn 3 draw call: thân (tĩnh), đầu (gật), tay phải cầm máy quét (đưa lên).
// Tia quét là draw call thứ tư, chỉ vẽ khi đang quét. Đồng phục tối giản: áo khoác tối, mũ kê-pi, huy hiệu ngực.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { UNIT_BOX, UNIT_CYL, UNIT_SPHERE } from '../../env/shared';
import type { EntryColors } from './colors';
import { Batch } from './merge';
import { GATE, type GateFrame } from './placement';
import { rig } from './rig';

/** Độ hạ thân khi ngồi (m): hông từ 0,86 xuống ghế cao khoảng 0,47. */
const SIT_DROP = 0.4;
const SHOULDER_Y = 1.42;
const NECK_Y = 1.52;
const ARM_RAISE = 1.2;
const UP = new THREE.Vector3(0, 1, 0);

/** Đi đều về đích với tốc độ rate (đơn vị mỗi giây). */
function approach(cur: number, target: number, rate: number, dt: number): number {
  const step = rate * dt;
  if (Math.abs(target - cur) <= step) return target;
  return cur + Math.sign(target - cur) * step;
}

const ease = (x: number) => x * x * (3 - 2 * x);

function buildGuard(c: EntryColors) {
  const body = new Batch();
  for (const side of [-1, 1]) {
    body.add(UNIT_CYL, null, [0.1 * side, 0.44, 0], [0.072, 0.84, 0.072], c.uniformDark);
    body.add(UNIT_BOX, null, [0.1 * side, 0.035, 0.03], [0.1, 0.07, 0.24], c.dark);
    body.add(UNIT_BOX, null, [0.2 * side, 1.43, 0], [0.1, 0.022, 0.13], c.uniformDark); // cầu vai
  }
  body.add(UNIT_BOX, null, [0, 0.885, 0], [0.42, 0.05, 0.25], c.dark); // thắt lưng
  body.add(UNIT_BOX, null, [0, 0.885, 0.127], [0.05, 0.034, 0.006], c.gold); // khóa thắt lưng
  body.add(UNIT_BOX, null, [0, 1.16, 0], [0.42, 0.56, 0.24], c.uniform); // áo khoác
  body.add(UNIT_BOX, null, [0, 1.39, 0.121], [0.12, 0.09, 0.004], c.shirt); // cổ áo sơ mi
  body.add(UNIT_BOX, null, [0, 1.31, 0.123], [0.034, 0.15, 0.004], c.uniformDark); // cà vạt
  // Huy hiệu hình khiên trên ngực trái (x dương là bên trái nhân vật), có ngôi sao ở giữa.
  body.add(UNIT_BOX, null, [0.11, 1.32, 0.124], [0.056, 0.066, 0.008], c.gold);
  body.add(UNIT_BOX, null, [0.11, 1.3, 0.124], [0.04, 0.04, 0.008], c.gold, [0, 0, Math.PI / 4]);
  body.add(UNIT_BOX, null, [0.11, 1.322, 0.129], [0.022, 0.022, 0.003], c.uniformDark, [0, 0, Math.PI / 4]);
  body.add(UNIT_BOX, null, [-0.15, 1.36, 0.118], [0.035, 0.07, 0.02], c.dark); // bộ đàm
  body.add(UNIT_CYL, null, [0.25, 1.15, 0], [0.05, 0.56, 0.05], c.uniform); // tay trái thả xuôi
  body.add(UNIT_SPHERE, null, [0.25, 0.84, 0], [0.045, 0.045, 0.045], c.skin);
  body.add(UNIT_CYL, null, [0, 1.49, 0], [0.05, 0.1, 0.05], c.skin); // cổ

  // Đầu, gốc tại cổ (NECK_Y).
  const head = new Batch();
  head.add(UNIT_SPHERE, null, [0, 0.1, 0], [0.1, 0.112, 0.1], c.skin);
  head.add(UNIT_CYL, null, [0, 0.19, -0.005], [0.108, 0.07, 0.108], c.uniform); // thân mũ
  head.add(UNIT_BOX, null, [0, 0.162, 0.085], [0.2, 0.014, 0.1], c.uniformDark); // lưỡi trai
  head.add(UNIT_BOX, null, [0, 0.192, 0.104], [0.03, 0.03, 0.004], c.gold); // phù hiệu mũ
  for (const side of [-1, 1]) {
    head.add(UNIT_SPHERE, null, [0.035 * side, 0.1, 0.092], [0.014, 0.014, 0.01], c.uniformDark);
  }

  // Tay phải, gốc tại vai. Máy quét cầm dọc theo cẳng tay, đầu phát tia ở dưới.
  const arm = new Batch();
  arm.add(UNIT_CYL, null, [0, -0.28, 0], [0.05, 0.56, 0.05], c.uniform);
  arm.add(UNIT_SPHERE, null, [0, -0.6, 0], [0.045, 0.045, 0.045], c.skin);
  arm.add(UNIT_BOX, null, [0, -0.66, 0.05], [0.06, 0.16, 0.035], c.dark);
  arm.add(UNIT_BOX, null, [0, -0.738, 0.05], [0.046, 0.012, 0.03], c.beam);

  return { body: body.build(), head: head.build(), arm: arm.build() };
}

export function Guard({ gate, colors }: { gate: GateFrame; colors: EntryColors }) {
  const res = useMemo(() => {
    const geo = buildGuard(colors);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 });
    const beamGeo = new THREE.CylinderGeometry(0.05, 0.006, 1, 18, 1, true);
    beamGeo.translate(0, 0.5, 0);
    const beamMat = new THREE.MeshBasicMaterial({
      color: colors.beam,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    return { geo, mat, beamGeo, beamMat };
  }, [colors]);
  useEffect(
    () => () => {
      res.geo.body?.dispose();
      res.geo.head?.dispose();
      res.geo.arm?.dispose();
      res.mat.dispose();
      res.beamGeo.dispose();
      res.beamMat.dispose();
    },
    [res],
  );

  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Group>(null);
  const tip = useRef<THREE.Object3D>(null);
  const beam = useRef<THREE.Mesh>(null);
  const cur = useRef({ stand: 0, arm: 0, yaw: rig.guardYaw });
  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), d: new THREE.Vector3() }), []);

  const baseX = gate.x + GATE.guard.x;
  const baseZ = gate.z + GATE.guard.z;

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    const s = cur.current;
    if (rig.snap) {
      s.stand = rig.guardStand;
      s.arm = rig.guardArm;
      s.yaw = rig.guardYaw;
    } else {
      s.stand = approach(s.stand, rig.guardStand, 1 / 0.6, dt);
      s.arm = approach(s.arm, rig.guardArm, 1 / 0.45, dt);
      s.yaw += (rig.guardYaw - s.yaw) * (1 - Math.exp(-dt * 5));
    }
    const g = root.current;
    if (g) {
      const breath = rig.snap ? 0 : Math.sin(t * 2) * 0.003;
      g.position.set(baseX, -(1 - ease(s.stand)) * SIT_DROP + breath, baseZ);
      g.rotation.y = s.yaw;
    }
    if (arm.current) arm.current.rotation.x = -ARM_RAISE * ease(s.arm);
    if (head.current) {
      head.current.rotation.x =
        rig.guardNod > 0 ? Math.sin(rig.guardNod * Math.PI) * 0.32 : rig.snap ? 0 : 0.02 * Math.sin(t * 0.8);
    }

    const b = beam.current;
    if (!b) return;
    if (rig.beam <= 0.001 || !tip.current) {
      b.visible = false;
      return;
    }
    b.visible = true;
    const start = tip.current.getWorldPosition(tmp.a);
    // Đầu tia quét lên xuống qua huy hiệu (biên độ khoảng nửa chiều cao thẻ).
    const sweep = rig.snap ? 0 : Math.sin(t * 7) * 0.032;
    const end = tmp.b.copy(rig.beamTarget).add(tmp.d.set(0, sweep, 0));
    const dir = end.sub(start);
    const len = dir.length();
    if (len < 1e-3) {
      b.visible = false;
      return;
    }
    b.position.copy(start);
    b.quaternion.setFromUnitVectors(UP, dir.multiplyScalar(1 / len));
    b.scale.set(1, len, 1);
    res.beamMat.opacity = rig.beam * (rig.snap ? 0.55 : 0.5 + 0.12 * Math.sin(t * 31));
  });

  return (
    <>
      <group ref={root} position={[baseX, -SIT_DROP, baseZ]} rotation={[0, rig.guardYaw, 0]}>
        {res.geo.body && <mesh geometry={res.geo.body} material={res.mat} receiveShadow />}
        <group ref={head} position={[0, NECK_Y, 0]}>
          {res.geo.head && <mesh geometry={res.geo.head} material={res.mat} />}
        </group>
        <group ref={arm} position={[-0.25, SHOULDER_Y, 0]}>
          {res.geo.arm && <mesh geometry={res.geo.arm} material={res.mat} />}
          <object3D ref={tip} position={[0, -0.75, 0.05]} />
        </group>
      </group>
      <mesh ref={beam} geometry={res.beamGeo} material={res.beamMat} visible={false} frustumCulled={false} renderOrder={2} />
    </>
  );
}
